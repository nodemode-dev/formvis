from app.core import legacy
import io
import json
import re
import zipfile

from app.core import config

FORMVIS = "com.nodemode.formvis"
# NodeMode canvasor's projects: the same manifest and images/ layout as formvis's own (bottom-to-top layers, each
# transform an origin and a displayed size), under their own id. Version 1 is the one seen; later versions are rejected.
CANVASOR = "com.nodemode.canvasor"
SUPPORTED = {FORMVIS: range(1, 2), legacy.FORMAT: range(1, 2), CANVASOR: range(1, 2)}   # the former identifier is read (core/legacy.py)
SAFE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,199}")
# .comp projects, opened so their owners can move their work to formvis (the owner's decision of 2026-09-25; export stays
# out). They share formvis's manifest and images/ layout and name themselves with a reverse-DNS id ending in ".project"
# at versions 1 to 7. They are recognised by that shape and then held to the full validation below, not by matching a
# particular label.
COMP_LABEL = re.compile(r"^[a-z0-9]+(\.[a-z0-9-]+)+\.project$")
COMP_VERSIONS = range(1, 8)


def is_comp(manifest: dict) -> bool:
    fmt, version = manifest.get("format"), manifest.get("version")
    return isinstance(fmt, str) and bool(COMP_LABEL.match(fmt)) and isinstance(version, int) and version in COMP_VERSIONS


class ProjectError(Exception):
    """Raised when a project cannot be read or fails validation; the message is shown to the person."""


def safe_name(name: str) -> bool:
    return bool(SAFE.fullmatch(name or "")) and ".." not in (name or "")


def validate(manifest: dict, files: set[str]) -> None:
    """Check a manifest against the format's limits and the set of image names that came with it."""
    if not isinstance(manifest, dict):
        raise ProjectError("The manifest is not a JSON object.")
    fmt, version = manifest.get("format"), manifest.get("version")
    if not is_comp(manifest):
        if fmt not in SUPPORTED:
            raise ProjectError("This is not a formvis, canvasor or .comp project.")
    allowed = COMP_VERSIONS if is_comp(manifest) else SUPPORTED[fmt]
    if type(version) is not int or version not in allowed:
        raise ProjectError(f"This project uses format version {version}, which this build cannot read.")
    size = (manifest.get("width"), manifest.get("height"))
    if not all(type(side) is int and 1 <= side <= config.MAX_SIDE for side in size):
        raise ProjectError("The canvas size is invalid.")
    layers = manifest.get("layers")
    if not isinstance(layers, list) or len(layers) > config.MAX_LAYERS:
        raise ProjectError("The layer list is invalid.")
    records: dict[str, dict] = {}
    for record in layers:
        if not isinstance(record, dict):
            raise ProjectError("A layer record is invalid.")
        layer_id = record.get("id")
        if not isinstance(layer_id, str) or not layer_id or layer_id in records:
            raise ProjectError("A layer id is missing or repeated.")
        records[layer_id] = record
        for key in ("imageFile", "maskFile", "smartSourceFile"):
            file_name = record.get(key)
            if file_name is None:
                continue
            if not isinstance(file_name, str) or not safe_name(file_name):
                raise ProjectError("An asset path is unsafe.")
            if file_name not in files:
                raise ProjectError(f"The image {file_name} is missing from the project.")
        if record.get("isGroup") and record.get("imageFile") is not None:
            raise ProjectError("A folder cannot carry an image.")
    groups = {key for key, record in records.items() if record.get("isGroup")}
    for key, record in records.items():
        parent = record.get("parentID")
        if parent is not None and (not isinstance(parent, str) or parent not in groups):
            raise ProjectError("A layer points at a missing folder.")
        source = record.get("maskSourceID")
        if source is not None and (not isinstance(source, str) or source not in records
                                   or source == key or source in groups):
            raise ProjectError("A clipping link is invalid.")
    for start in records:
        node, steps = start, 0
        while records[node].get("parentID") is not None:
            node = records[node]["parentID"]
            steps += 1
            if steps > config.MAX_DEPTH:
                raise ProjectError("Folders nest too deeply or form a cycle.")
    for start in records:
        node, steps = start, 0
        while records[node].get("maskSourceID") is not None:
            node = records[node]["maskSourceID"]
            steps += 1
            if steps > config.MAX_CLIP_CHAIN:
                raise ProjectError("Clipping links form a cycle.")
    active = manifest.get("activeLayerID")
    if active is not None and (not isinstance(active, str) or active not in records):
        raise ProjectError("The active layer does not exist.")


def _collect(entries: list[tuple[str, int, callable]]) -> tuple[dict, dict[str, bytes], str]:
    """Find the manifest and the safe images among archive or folder entries (path, size, reader)."""
    listing = [(path.replace("\\", "/"), size, reader) for path, size, reader in entries]
    found = None
    root = ""
    for path, size, reader in listing:
        parts = path.split("/")
        if "__MACOSX" in parts or parts[-1] != "manifest.json" or len(parts) > 2:
            continue
        found = (size, reader)
        root = parts[0] if len(parts) == 2 else ""
        break
    if found is None:
        raise ProjectError("manifest.json was not found in the project.")
    size, reader = found
    if size > config.MAX_MANIFEST_BYTES:
        raise ProjectError("The manifest is too large.")
    try:
        manifest = json.loads(reader().decode("utf-8"))
    except ValueError as exc:
        raise ProjectError("The manifest is damaged.") from exc
    prefix = f"{root}/images/" if root else "images/"
    assets: dict[str, bytes] = {}
    for path, size, reader in listing:
        if not path.startswith(prefix):
            continue
        name = path[len(prefix):]
        if "/" in name or not safe_name(name):
            continue
        if size > config.MAX_ASSET_BYTES:
            raise ProjectError("An image in the project is larger than 512 MiB.")
        assets[name] = reader()
    return manifest, assets, root


def read_zip(data: bytes) -> tuple[dict, dict[str, bytes]]:
    """Read a packaged project from the bytes of a zip."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ProjectError("The file is not a formvis, canvasor or .comp package.") from exc
    try:
        infos = [info for info in archive.infolist() if not info.is_dir()]
        manifest, assets, _root = _collect([(info.filename, info.file_size, lambda info=info: archive.read(info)) for info in infos])
    finally:
        archive.close()
    return manifest, assets


def read_folder(files: list[tuple[str, bytes]]) -> tuple[dict, dict[str, bytes], str]:
    """Read a project from a dropped folder's files (path and bytes); the root folder's name comes last."""
    return _collect([(path, len(blob), lambda blob=blob: blob) for path, blob in files])


def write_zip(manifest: dict, assets: dict[str, bytes], root: str = "") -> bytes:
    """The project as a zip: manifest.json and images/. With `root`, everything sits inside that one folder."""
    prefix = f"{root}/" if root else ""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(f"{prefix}manifest.json", json.dumps(manifest, indent=2), compress_type=zipfile.ZIP_DEFLATED)
        for name, blob in assets.items():
            archive.writestr(f"{prefix}images/{name}", blob, compress_type=zipfile.ZIP_STORED)
    return buffer.getvalue()
