import json
import platform
import re
import shutil
import struct
import subprocess
import zlib
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core import config, runtime
from app.services import background, compute, imaging, metrics, segment, spell

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


class RevealBody(BaseModel):
    path: str


@router.post("/reveal")
def reveal(body: RevealBody) -> dict:
    """Reveal in the file manager (33.2): select a file in the system's file manager. 404 when the path does not exist."""
    import sys
    target = Path(body.path).expanduser()
    if not target.exists():
        raise HTTPException(status_code=404, detail="That path does not exist.")
    target = target.resolve()
    if sys.platform == "darwin":
        subprocess.Popen(["open", "-R", str(target)])
    elif sys.platform.startswith("win"):
        subprocess.Popen(["explorer", f"/select,{target}"])
    else:
        shown = False
        if shutil.which("dbus-send"):
            try:
                proc = subprocess.Popen(["dbus-send", "--session", "--dest=org.freedesktop.FileManager1", "--type=method_call", "/org/freedesktop/FileManager1", "org.freedesktop.FileManager1.ShowItems", f"array:string:{target.as_uri()}", "string:"])
                try:
                    shown = proc.wait(timeout=3) == 0
                except subprocess.TimeoutExpired:
                    shown = True
            except OSError:
                shown = False
        if not shown:
            opener = shutil.which("xdg-open")
            if not opener:
                raise HTTPException(status_code=501, detail="No file manager could be started here.")
            subprocess.Popen([opener, str(target if target.is_dir() else target.parent)])
    return {"ok": True}


_LINK_IMAGE_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".tif", ".tiff", ".dpx", ".qoi", ".tga", ".ico", ".pgm", ".ppm",
    ".pam", ".heic", ".psd", ".dng", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2", ".pef", ".srw",
}


_LINK_MAX_BYTES = 1024 * 1024 * 1024


def _link_target(path: str, base: str) -> Path:
    """The file a link names. A path is absolute, or relative to `base` (the document's folder) and then it may not leave
    that folder. Network shares (UNC paths) are refused. The image suffix is checked on the file a link resolves to, so a
    link named like a picture that points at something else is refused."""
    if not path or "\x00" in path or "\x00" in base:
        raise HTTPException(status_code=400, detail="That is not a file path.")
    if path.startswith(("\\\\", "//")) or base.startswith(("\\\\", "//")):
        raise HTTPException(status_code=400, detail="Files on a network share are not read through a link.")
    given = Path(path).expanduser()
    if given.is_absolute():
        target = given
    else:
        if not base:
            raise HTTPException(status_code=400, detail="A link must be an absolute path, or relative to the document's folder.")
        root = Path(base).expanduser()
        if not root.is_absolute():
            raise HTTPException(status_code=400, detail="The document's folder must be an absolute path.")
        root = root.resolve()
        target = (root / given).resolve()
        if root != target and root not in target.parents:
            raise HTTPException(status_code=400, detail="A relative link may not leave the document's folder.")
    try:
        return target.resolve()
    except (OSError, RuntimeError):
        raise HTTPException(status_code=400, detail="That path could not be resolved.")


@router.get("/file")
def linked_file(path: str, base: str = "") -> Response:
    """Linked smart object file (33.2): the bytes of an existing image file on disk, for the desktop app to re-read a link
    from its real path. 400 for a path that is not an image file by suffix (checked on the resolved file), a network share,
    or a relative path that leaves `base`; 404 when it does not exist as a regular file; 413 above 1 GB."""
    import mimetypes
    target = _link_target(path, base)
    if target.suffix.lower() not in _LINK_IMAGE_SUFFIXES:
        raise HTTPException(status_code=400, detail="That is not an image file.")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="That file does not exist.")
    if target.stat().st_size > _LINK_MAX_BYTES:
        raise HTTPException(status_code=413, detail="That file is too large to link.")
    media = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    from email.utils import formatdate
    return Response(content=target.read_bytes(), media_type=media, headers={"Last-Modified": formatdate(target.stat().st_mtime, usegmt=True)})


@router.get("/version")
def version() -> dict:
    return {"name": config.APP_NAME, "version": config.VERSION}


def _select_object() -> dict:
    """Click-to-select (SAM 2.1): available when torch and sam2 are installed, and the torch device it would use."""
    if not segment.available():
        return {"available": False, "model": "SAM 2.1 tiny"}
    if segment.backend() == "onnx":   # 1.53.4: nothing to install; the model is fetched on first use
        from app.localgen import model_manager
        from app.localgen.paths import providers
        first = providers()[0]
        device = {"CUDAExecutionProvider": "cuda", "CoreMLExecutionProvider": "mps", "DmlExecutionProvider": "dml"}.get(first, "cpu")
        how = f"ONNX Runtime ({first.removesuffix('ExecutionProvider')})"
        return {"available": True, "model": "SAM 2.1 tiny", "device": device, "reason": how if model_manager.ready("sam2-onnx") else f"{how}; the model (about 155 MB) downloads on first use"}
    device, reason = segment.torch_device()
    return {"available": True, "model": "SAM 2.1 tiny", "device": device, "reason": reason}


@router.get("/helpers")
def helpers_held() -> dict:
    """The ONNX helper sessions formvis holds in memory now (depth, segmentation, background and the like)."""
    from app.localgen import sessions
    return {"held": sessions.held()}


@router.post("/helpers/free")
def helpers_free() -> dict:
    """Frees every ONNX helper session formvis holds; the next use loads its model again."""
    from app.localgen import sessions
    freed = sessions.held()
    sessions.release_all()
    import gc
    gc.collect()
    return {"freed": freed, "held": sessions.held()}


@router.get("/capabilities")
def capabilities() -> dict:
    return {
        "name": config.APP_NAME,
        "version": config.VERSION,
        "desktop": config.is_desktop(),
        "decode": imaging.decoders(),
        "removeBackground": background.available(),
        "selectObject": _select_object(),
        "pixelBudget": config.MAX_PIXELS, "memory": config.total_memory(),   # the largest document, from this computer's memory (1.53.4)
        "compute": compute.current(),
        "dataDir": str(config.data_dir()),
        "dataDirSource": config.data_dir_source(),
        "switches": runtime.switches(),
        "logFile": str(runtime.log_path(config.data_dir())),
        "runtime": {"python": platform.python_version(), "system": f"{platform.system()} {platform.release()}".strip(), "machine": platform.machine()},
    }


@router.get("/metrics")
def process_metrics() -> dict:
    """The engine process's memory as the operating system counts it, and the computer's."""
    return metrics.process_memory()


@router.get("/log")
def engine_log(lines: int = 200) -> dict:
    """The end of the engine's log file (Logs/formvis-engine.log in the data folder)."""
    data = config.data_dir()
    return {"path": str(runtime.log_path(data)), "text": runtime.log_tail(data, lines)}


_FONT_TYPES = {".ttf": "font/ttf", ".otf": "font/otf", ".ttc": "font/collection", ".woff": "font/woff", ".woff2": "font/woff2"}


def _user_font_folder() -> Path:
    """The fonts subfolder of the data folder, made on first ask: fonts placed there are listed and served."""
    folder = config.data_dir() / "fonts"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _read_at(handle, offset: int, size: int) -> bytes:
    handle.seek(offset)
    return handle.read(size)


def _name_table(handle) -> bytes | None:
    """The name table of a TrueType, OpenType, collection (first font) or WOFF file, read without loading the whole file;
    None for WOFF2, which is compressed as one block, and for anything unreadable."""
    kind, base = _read_at(handle, 0, 4), 0
    if kind == b"ttcf":
        base = struct.unpack(">I", _read_at(handle, 12, 4))[0]
        kind = _read_at(handle, base, 4)
    if kind == b"wOFF":
        for i in range(min(struct.unpack(">H", _read_at(handle, 12, 2))[0], 64)):
            tag, offset, packed, size, _ = struct.unpack(">4sIIII", _read_at(handle, 44 + 20 * i, 20))
            if tag == b"name" and packed <= 1_000_000:
                raw = _read_at(handle, offset, packed)
                return zlib.decompressobj().decompress(raw, 4_000_000) if packed < size else raw
        return None
    if kind in (b"\x00\x01\x00\x00", b"OTTO", b"true"):
        for i in range(min(struct.unpack(">H", _read_at(handle, base + 4, 2))[0], 64)):
            tag, _sum, offset, size = struct.unpack(">4sIII", _read_at(handle, base + 12 + 16 * i, 16))
            if tag == b"name" and size <= 1_000_000:
                return _read_at(handle, offset, size)
    return None


def _names(table: bytes) -> dict[int, str]:
    """A name table's strings by name id, the English Windows record preferred, else the first record of the id."""
    found: dict[int, tuple[bool, str]] = {}
    _format, count, strings = struct.unpack(">HHH", table[:6])
    for i in range(min(count, 512)):
        platform_id, _encoding, language, name_id, size, offset = struct.unpack(">6H", table[6 + 12 * i:18 + 12 * i])
        english = platform_id == 3 and language == 0x409
        if name_id in found and (found[name_id][0] or not english):
            continue
        found[name_id] = (english, table[strings + offset:strings + offset + size].decode("utf-16-be" if platform_id in (0, 3) else "mac_roman", "ignore"))
    return {key: value[1] for key, value in found.items()}


_USER_FONTS: dict[str, tuple[tuple[int, int], dict]] = {}


def _user_font_entry(path: Path, folder: Path) -> dict:
    """One user font as the window lists it: family, style and PostScript name from the file's name table (the file name
    stands in where the table cannot be read, as for WOFF2), the style flags and the route that serves the file."""
    stat = path.stat()
    stamp, cached = (stat.st_mtime_ns, stat.st_size), _USER_FONTS.get(str(path))
    if cached and cached[0] == stamp:
        return cached[1]
    try:
        with path.open("rb") as handle:
            table = _name_table(handle)
        names = _names(table) if table else {}
    except (OSError, struct.error, zlib.error, ValueError):
        names = {}
    family = (names.get(16) or names.get(1) or re.sub(r"[-_]+", " ", path.stem)).strip()
    style = (names.get(17) or names.get(2) or "Regular").strip()
    rel = path.relative_to(folder).as_posix()
    entry = {"file": rel, "family": family, "style": style, "postscript": (names.get(6) or path.stem).strip(),
             "bold": bool(re.search(r"bold|black|heavy", style, re.I)), "italic": bool(re.search(r"italic|oblique", style, re.I)),
             "size": stat.st_size, "url": "/api/fonts/user/" + quote(rel)}
    _USER_FONTS[str(path)] = (stamp, entry)
    return entry


def _user_fonts() -> list[dict]:
    """The font files under the data folder's fonts subfolder (up to 1000), links out of the folder skipped."""
    folder = _user_font_folder()
    root, found = folder.resolve(), []
    for path in sorted(folder.rglob("*")):
        if len(found) >= 1000:
            break
        if path.suffix.lower() in _FONT_TYPES and path.is_file() and root in path.resolve().parents:
            found.append(_user_font_entry(path, folder))
    return found


def _user_font(family: str, bold: bool, italic: bool) -> Path | None:
    """The user font file for a family (or PostScript name) and style, the closest style when there is no exact one."""
    key = family.casefold()
    own = [e for e in _user_fonts() if e["family"].casefold() == key or e["postscript"].casefold() == key]
    if not own:
        return None
    best = min(own, key=lambda e: (e["bold"] != bold) + (e["italic"] != italic))
    return _user_font_folder() / best["file"]


@router.get("/fonts/user")
def user_fonts() -> dict:
    """The fonts in the data folder's fonts subfolder: each file's family, style and PostScript name, and the route that
    serves it, so the window lists them, joins them to its font set and resolves a PSD's PostScript name to one."""
    return {"folder": str(_user_font_folder()), "fonts": _user_fonts()}


@router.get("/fonts/user/{rel:path}")
def user_font_file(rel: str) -> Response:
    """One font file from the data folder's fonts subfolder, so the browser build can load it with FontFace. Only a font
    extension inside that folder is served."""
    root = _user_font_folder().resolve()
    target = (root / rel).resolve() if "\0" not in rel else root
    if root not in target.parents or target.suffix.lower() not in _FONT_TYPES or not target.is_file():
        raise HTTPException(status_code=404, detail="No such font.")
    return FileResponse(target, media_type=_FONT_TYPES[target.suffix.lower()], headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


def _font_folders() -> list[Path]:
    home = Path.home()
    return [Path(p) for p in ("/usr/share/fonts", "/usr/local/share/fonts", "/Library/Fonts", "C:\\Windows\\Fonts")] + [home / ".fonts", home / ".local/share/fonts", home / "Library/Fonts"]


def _fc_match(family: str, bold: bool, italic: bool) -> Path | None:
    """The file fontconfig picks for a family and style, or None where fc-match is missing or finds nothing."""
    exe = shutil.which("fc-match")
    if not exe:
        return None
    pattern = family + (":weight=bold" if bold else "") + (":slant=italic" if italic else "")
    try:
        out = subprocess.run([exe, "-f", "%{file}", pattern], capture_output=True, text=True, timeout=5, check=False).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    return Path(out) if out else None


def _scan_font(family: str, bold: bool, italic: bool) -> Path | None:
    """A file in the usual font folders whose name holds the family, preferring one that matches the style."""
    key = "".join(ch for ch in family.lower() if ch.isalnum())
    found: list[tuple[int, Path]] = []
    for folder in _font_folders():
        if not folder.is_dir():
            continue
        for path in folder.rglob("*"):
            if path.suffix.lower() not in _FONT_TYPES:
                continue
            name = "".join(ch for ch in path.stem.lower() if ch.isalnum())
            if key and key in name:
                found.append((abs(("bold" in name) - bold) + abs(("italic" in name or "oblique" in name) - italic), path))
                if len(found) > 200:
                    break
    return min(found, key=lambda f: (f[0], len(f[1].name)))[1] if found else None


@router.get("/fonts/file")
def font_file(family: str, bold: int = 0, italic: int = 0) -> Response:
    """A font file's bytes for the family and style (DEV_PLAN 32.6b), so the window can register a face with OpenType
    features turned on. Only files with a font extension are read, and only ones fontconfig or the font folders offer."""
    name = family.strip()
    if not name or len(name) > 120 or any(ch in name for ch in "\n\r\0"):
        raise HTTPException(status_code=400, detail="A font family is needed.")
    mine = _user_font(name, bool(bold), bool(italic))
    if mine is not None and mine.is_file():
        return Response(content=mine.read_bytes(), media_type=_FONT_TYPES[mine.suffix.lower()])
    path = _fc_match(name, bool(bold), bool(italic))
    if path is not None:
        # fc-match always answers with its fallback font; keep the answer only when it is this family's file.
        stem = "".join(ch for ch in path.stem.lower() if ch.isalnum())
        if "".join(ch for ch in name.lower() if ch.isalnum()) not in stem and not name.lower() in _fc_family(path).lower():
            path = None
    if path is None:
        path = _scan_font(name, bool(bold), bool(italic))
    if path is None or path.suffix.lower() not in _FONT_TYPES or not path.is_file():
        # A family not installed here is an answer, not a fault: 204 keeps the browser from logging a failed load (1.72.5).
        return Response(status_code=204, headers={"X-Formvis-Font": "missing"})
    try:
        data = path.read_bytes()
    except OSError as err:
        raise HTTPException(status_code=404, detail=f"No font file found for {name}.") from err
    return Response(content=data, media_type=_FONT_TYPES[path.suffix.lower()])


class SpellBody(BaseModel):
    words: list[str]
    lang: str = "en"


@router.post("/spell/check")
def spell_check(body: SpellBody) -> dict[str, list[dict[str, object]]]:
    """The words the language does not know, each with up to 6 suggestions (DEV_PLAN 32.7 part c, Check Spelling)."""
    if len(body.words) > 20000 or any(len(w) > 80 for w in body.words):
        raise HTTPException(status_code=400, detail="Too many words, or a word that is too long.")
    return {"unknown": spell.check(body.words, body.lang[:12])}


def _fc_family(path: Path) -> str:
    """The family names fontconfig lists for a file, or an empty string."""
    exe = shutil.which("fc-scan")
    if not exe:
        return ""
    try:
        return subprocess.run([exe, "-f", "%{family}", str(path)], capture_output=True, text=True, timeout=5, check=False).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


class ComputeChoice(BaseModel):
    device: str


@router.get("/compute")
def compute_device() -> dict:
    """The engine's compute device (Phase 18.6): what ONNX Runtime offers, what is chosen and used, and why."""
    return compute.current()


@router.post("/compute")
def set_compute_device(choice: ComputeChoice) -> dict:
    try:
        return compute.set_preference(choice.device)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


_SKIN_VARS = ("--bg-primary", "--bg-secondary", "--bg-tertiary", "--bg-node", "--border-color", "--border-light", "--text-primary", "--text-secondary", "--text-muted", "--canvas-bg", "--grid-color", "--node-shadow")
_SKIN_VALUE = re.compile(r"^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9a-fA-F.,%\s/]{3,60}\)|[0-9a-z#(),.%\s-]{1,80})$")


_SKIN_CSS_BANNED = ("url(", "image-set(", "image(", "element(", "paint(", "cross-fade(", "expression(", "javascript:", "behavior", "-moz-binding", "<", "\\", "src:")


def _skin_css(text: str) -> str:
    """The free CSS of a skin, linted: no network (url, @import, @font-face), no script, no escapes; only @media; braces balanced."""
    if len(text) > 16_000:
        raise ValueError("css is larger than 16 KB")
    plain = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    low = plain.lower()
    for bad in _SKIN_CSS_BANNED:
        if bad in low:
            raise ValueError(f"css may not use {bad.strip('(:') or bad}")
    for at in re.findall(r"@([a-z-]+)", low):
        if at != "media":
            raise ValueError(f"css may not use @{at}")
    depth = 0
    for ch in plain:
        depth += (ch == "{") - (ch == "}")
        if depth < 0:
            break
    if depth != 0 or plain.count("{") != plain.count("}"):
        raise ValueError("css braces do not match")
    return plain.strip()


def _read_skin(path: Path) -> dict:
    """One skin file: a name, light or dark, colour values for the window's tokens and optional free CSS (a "css" text, or a .css file of the same name); anything else is refused with why."""
    if path.stat().st_size > 20_000:
        raise ValueError("larger than 20 KB")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("vars"), dict):
        raise ValueError("needs a \"vars\" object of token colours")
    css = data.get("css", "")
    sibling = path.with_suffix(".css")
    if not css and sibling.is_file():
        if sibling.stat().st_size > 16_000:
            raise ValueError("css is larger than 16 KB")
        css = sibling.read_text(encoding="utf-8")
    if not isinstance(css, str):
        raise ValueError("css must be text")
    css = _skin_css(css) if css else ""
    values = {}
    for key, value in data["vars"].items():
        if key not in _SKIN_VARS:
            raise ValueError(f"{key} is not a skin token")
        if not isinstance(value, str) or not _SKIN_VALUE.match(value.strip()) or "url(" in value or ";" in value:
            raise ValueError(f"{key} is not a colour")
        values[key] = value.strip()
    if not values:
        raise ValueError("sets no tokens")
    return {"id": re.sub(r"[^a-z0-9-]+", "-", path.stem.lower()).strip("-") or "skin", "label": str(data.get("name") or path.stem)[:40], "light": data.get("light") is True, "version": str(data.get("version", ""))[:20], "author": str(data.get("author", ""))[:60], "vars": values, "css": css}


@router.get("/skins")
def skins() -> dict:
    """The window skins in the data folder's skins folder (Reload skins): each loaded one, and each file refused with why."""
    folder = config.data_dir() / "skins"
    folder.mkdir(parents=True, exist_ok=True)
    loaded, errors = [], []
    for path in sorted(folder.glob("*.json"))[:50]:
        try:
            loaded.append(_read_skin(path))
        except (OSError, ValueError) as err:
            errors.append({"file": path.name, "error": str(err)})
    return {"folder": str(folder), "skins": loaded, "errors": errors}


_STALE_PICTURE_SECONDS = 24 * 3600
_STALE_PART_SECONDS = 3600


def _tally(folder: Path) -> tuple[int, int]:
    files = size = 0
    if folder.is_dir():
        for item in folder.rglob("*"):
            try:
                if item.is_file() and not item.is_symlink():
                    files += 1
                    size += item.stat().st_size
            except OSError:
                continue
    return files, size


def _unreferenced() -> list[Path]:
    """Files nothing points at: generated pictures left in the staging folder for a day, and half-finished model
    downloads left for an hour."""
    import time

    from app.localgen import media, model_manager

    now = time.time()
    found: list[Path] = []
    if media.LIBRARY.is_dir():
        found += [p for p in media.LIBRARY.iterdir() if p.is_file() and now - p.stat().st_mtime > _STALE_PICTURE_SECONDS]
    root = model_manager.ROOT
    if root.is_dir():
        for p in root.rglob("*"):
            if p.is_file() and p.suffix in (".download", ".part") and now - p.stat().st_mtime > _STALE_PART_SECONDS:
                found.append(p)
    return found


@router.get("/localfiles/stats")
def local_files_stats() -> dict:
    """What formvis keeps on this computer (Settings > Local files): each folder with its path, file count and size, and
    how much of it nothing refers to."""
    from app.localgen import model_manager

    data = config.data_dir()
    places = [
        ("library", "Library (projects)", config.projects_dir()),
        ("models", "Helper models", model_manager.ROOT),
        ("exports", "Exports", config.exports_dir()),
        ("generated", "Generated pictures", data / "generated"),
        ("logs", "Logs", data / "Logs"),
        ("plugins", "Plugins", data / "plugins"),
    ]
    folders = []
    for key, label, path in places:
        files, size = _tally(path)
        folders.append({"id": key, "label": label, "path": str(path), "files": files, "bytes": size})
    stale = _unreferenced()
    return {"dataDir": str(data), "folders": folders, "unreferenced": {"files": len(stale), "bytes": sum(p.stat().st_size for p in stale)}}


@router.post("/localfiles/clean")
def local_files_clean() -> dict:
    """Removes the unreferenced files (stale generated pictures and half-finished model downloads); what went."""
    files = size = 0
    for p in _unreferenced():
        try:
            n = p.stat().st_size
            p.unlink()
            files += 1
            size += n
        except OSError:
            continue
    return {"removed": files, "bytes": size}
