import io
import json
import re
import zipfile

from app.core import config

REFERENCE = "com.reference.project"
SONNY = "com.nodemode.sonny"
SUPPORTED = {REFERENCE: range(1, 8), SONNY: range(1, 2)}
SAFE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$")


class ProjectError(Exception):
    pass


def safe_name(name: str) -> bool:
    return bool(SAFE.match(name or "")) and ".." not in name


def validate(manifest: dict, files: set[str]) -> None:
    if not isinstance(manifest, dict):
        raise ProjectError("The manifest is not a JSON object.")
    fmt, version = manifest.get("format"), manifest.get("version")
    if fmt not in SUPPORTED:
        raise ProjectError("This is not a sonny or the reference app project.")
    if not isinstance(version, int) or version not in SUPPORTED[fmt]:
        raise ProjectError(f"This project uses format version {version}, which this build cannot read.")
    width, height = manifest.get("width"), manifest.get("height")
    if not (isinstance(width, int) and isinstance(height, int) and 1 <= width <= config.MAX_SIDE and 1 <= height <= config.MAX_SIDE):
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
        for key in ("imageFile", "maskFile"):
            name = record.get(key)
            if name is None:
                continue
            if not isinstance(name, str) or not safe_name(name):
                raise ProjectError("An asset path is unsafe.")
            if name not in files:
                raise ProjectError(f"The image {name} is missing from the project.")
        if record.get("isGroup") and record.get("imageFile"):
            raise ProjectError("A folder cannot carry an image.")
    for record in layers:
        parent = record.get("parentID")
        if parent is not None and not (parent in records and records[parent].get("isGroup")):
            raise ProjectError("A layer points at a missing folder.")
        source = record.get("maskSourceID")
        if source is not None and (source not in records or source == record["id"] or records[source].get("isGroup")):
            raise ProjectError("A clipping link is invalid.")
    for record in layers:
        current, steps = record.get("parentID"), 0
        while current is not None:
            steps += 1
            if steps > config.MAX_DEPTH:
                raise ProjectError("Folders nest too deeply or form a cycle.")
            current = records[current].get("parentID")
        current, steps = record.get("maskSourceID"), 0
        while current is not None:
            steps += 1
            if steps > config.MAX_CLIP_CHAIN:
                raise ProjectError("Clipping links form a cycle.")
            current = records[current].get("maskSourceID")
    active = manifest.get("activeLayerID")
    if active is not None and active not in records:
        raise ProjectError("The active layer does not exist.")


def _collect(entries: list[tuple[str, int, callable]]) -> tuple[dict, dict[str, bytes], str]:
    manifest_entry, prefix = None, ""
    for path, size, read in entries:
        parts = path.replace("\\", "/").strip("/").split("/")
        if parts[-1] == "manifest.json" and len(parts) <= 2 and "__MACOSX" not in parts:
            manifest_entry, prefix = (path, size, read), ("/".join(parts[:-1]) + "/" if len(parts) == 2 else "")
            break
    if manifest_entry is None:
        raise ProjectError("manifest.json was not found in the project.")
    if manifest_entry[1] > config.MAX_MANIFEST_BYTES:
        raise ProjectError("The manifest is too large.")
    try:
        manifest = json.loads(manifest_entry[2]())
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ProjectError("The manifest is damaged.") from exc
    assets: dict[str, bytes] = {}
    for path, size, read in entries:
        clean = path.replace("\\", "/").strip("/")
        if not clean.startswith(prefix + "images/"):
            continue
        name = clean[len(prefix) + len("images/"):]
        if "/" in name or not safe_name(name):
            continue
        if size > config.MAX_ASSET_BYTES:
            raise ProjectError("An image in the project is larger than 512 MiB.")
        assets[name] = read()
    return manifest, assets, prefix.rstrip("/")


def read_zip(data: bytes) -> tuple[dict, dict[str, bytes]]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ProjectError("The file is not a sonny or the reference app package.") from exc
    with archive:
        infos = [info for info in archive.infolist() if not info.is_dir()]
        entries = [(info.filename, info.file_size, (lambda info=info: archive.read(info))) for info in infos]
        manifest, assets, _ = _collect(entries)
    return manifest, assets


def read_folder(files: list[tuple[str, bytes]]) -> tuple[dict, dict[str, bytes], str]:
    entries = [(path, len(data), (lambda data=data: data)) for path, data in files]
    return _collect(entries)


def write_zip(manifest: dict, assets: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2), compress_type=zipfile.ZIP_DEFLATED)
        for name, data in assets.items():
            archive.writestr(f"images/{name}", data)
    return out.getvalue()
