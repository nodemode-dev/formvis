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
THUMBNAIL, MAX_THUMBNAIL = "thumbnail.png", 4 * 1024 * 1024
QUICKLOOK = ("QuickLook/Thumbnail.png", "QuickLook/Preview.png")
# .comp projects, opened so their owners can move their work to formvis (the owner's decision of 2026-09-25; export stays
# out). They share formvis's manifest and images/ layout and name themselves with a reverse-DNS id ending in ".project"
# at versions 1 to 7. They are recognised by that shape and then held to the full validation below, not by matching a
# particular label.
COMP_LABEL = re.compile(r"^[a-z0-9]+(\.[a-z0-9-]+)+\.project$")
# Versions 8 to 15 (its published format notes): folder opacity and guides (8), Gaussian Blur, Motion Blur and Add Noise
# adjustments (9), text colour and face runs (10, 11), 16-bit PNG layers (12), OpenEXR layers named <id>.exr (13), and
# shape style fields (14, 15) that sit beside an ordinary raster. The page maps what it can and keeps the pixels.
COMP_VERSIONS = range(1, 16)
GIANT_SIDE = 300_000


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
    comp_shaped = isinstance(fmt, str) and bool(COMP_LABEL.match(fmt)) and fmt not in SUPPORTED
    if not comp_shaped and fmt not in SUPPORTED:
        raise ProjectError("This is not a formvis, canvasor or .comp project.")
    allowed = COMP_VERSIONS if comp_shaped else SUPPORTED[fmt]
    if type(version) is not int or version not in allowed:
        raise ProjectError(f"This project uses format version {version}, which this build cannot read.")
    size = (manifest.get("width"), manifest.get("height"))
    kept = manifest.get("layers")
    tiles = isinstance(kept, list) and any(isinstance(r, dict) and isinstance(r.get("tiled"), dict) for r in kept)
    if not all(type(side) is int and 1 <= side <= (GIANT_SIDE if tiles else config.MAX_SIDE) for side in size):
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
    if is_comp(manifest):
        _comp_hdr_layers(manifest, assets)
    return manifest, assets, root


def _comp_hdr_layers(manifest: dict, assets: dict[str, bytes]) -> None:
    """A .comp version 13 layer may be OpenEXR (extended sRGB half floats, white is 1, premultiplied). The page reads
    PNG, so each one becomes an 8-bit PNG clipped to white, as the writing app itself shows and edits it, and the record
    points at that; the layer is marked so the open can say its brighter-than-white values were clipped. An EXR that
    cannot be decoded is left as it is, and the missing-image check that follows refuses the project."""
    from PIL import Image
    import numpy as np
    from app.services import contained
    layers = manifest.get("layers") if isinstance(manifest.get("layers"), list) else []
    for record in layers:
        name = record.get("imageFile") if isinstance(record, dict) else None
        if not isinstance(name, str) or not name.lower().endswith(".exr") or name not in assets:
            continue
        img = contained.decode_exr(assets[name])
        if img is None or img.ndim not in (2, 3):
            continue
        img = np.nan_to_num(img.astype(np.float32), nan=0.0, posinf=1.0, neginf=0.0)
        if img.ndim == 2:
            img = np.stack([img, img, img], axis=-1)
        rgb, alpha = img[..., 2::-1][..., :3], (img[..., 3] if img.shape[-1] >= 4 else np.ones(img.shape[:2], np.float32))
        alpha = np.clip(alpha, 0.0, 1.0)
        straight = np.where(alpha[..., None] > 0, rgb / np.maximum(alpha[..., None], 1e-6), 0.0)
        over = bool((straight > 1.0).any())
        rgba = np.concatenate([np.clip(straight, 0.0, 1.0), alpha[..., None]], axis=-1)
        out = io.BytesIO()
        Image.fromarray(np.round(rgba * 255).astype(np.uint8), "RGBA").save(out, "PNG")
        png = name[:-4] + ".png"
        if png in assets:
            png = name[:-4] + ".hdr.png"
        assets[png] = out.getvalue()
        del assets[name]
        record["imageFile"] = png
        if over:
            record["hdrClipped"] = True


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


def read_thumbnail(data: bytes) -> bytes | None:
    """The thumbnail a project carries (1.87.0), or None for one saved before thumbnails or not a project at all."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for info in archive.infolist():
                parts = info.filename.replace("\\", "/").split("/")
                if parts[-1] == THUMBNAIL and len(parts) <= 2 and "__MACOSX" not in parts and info.file_size <= MAX_THUMBNAIL:
                    return archive.read(info)
    except (zipfile.BadZipFile, OSError):
        return None
    return None


def stand_in_thumbnail(data: bytes) -> bytes | None:
    """For a project saved before thumbnails (1.87.1): its bottom picture layer, at most 512 px, as a PNG; None when it
    has no picture layer or cannot be read."""
    try:
        from PIL import Image
        manifest, assets = read_zip(data)
        for layer in manifest.get("layers", []):
            name = layer.get("imageFile") if isinstance(layer, dict) else None
            if isinstance(name, str) and name in assets:
                with Image.open(io.BytesIO(assets[name])) as im:
                    im.thumbnail((512, 512))
                    out = io.BytesIO()
                    im.save(out, "PNG")
                    return out.getvalue()
    except Exception:
        return None
    return None


def read_folder(files: list[tuple[str, bytes]]) -> tuple[dict, dict[str, bytes], str]:
    """Read a project from a dropped folder's files (path and bytes); the root folder's name comes last."""
    return _collect([(path, len(blob), lambda blob=blob: blob) for path, blob in files])


def write_zip(manifest: dict, assets: dict[str, bytes], root: str = "", thumbnail: bytes = b"") -> bytes:
    """The project as a zip: manifest.json and images/. With `root`, everything sits inside that one folder. A
    `thumbnail` (a small PNG of the whole picture, 1.87.0) goes beside the manifest for Home and the file lists; readers
    that do not know it skip it."""
    prefix = f"{root}/" if root else ""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(f"{prefix}manifest.json", json.dumps(manifest, indent=2), compress_type=zipfile.ZIP_DEFLATED)
        if thumbnail[:8] == b"\x89PNG\r\n\x1a\n":
            archive.writestr(f"{prefix}{THUMBNAIL}", thumbnail, compress_type=zipfile.ZIP_STORED)
            for quick in QUICKLOOK:   # where the system's file preview looks inside a package
                archive.writestr(f"{prefix}{quick}", thumbnail, compress_type=zipfile.ZIP_STORED)
        for name, blob in assets.items():
            archive.writestr(f"{prefix}images/{name}", blob, compress_type=zipfile.ZIP_STORED)
    return buffer.getvalue()
