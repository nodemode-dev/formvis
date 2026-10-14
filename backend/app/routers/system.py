import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.core import config
from app.services import background, compute, imaging, segment

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/version")
def version() -> dict:
    return {"name": config.APP_NAME, "version": config.VERSION}


def _select_object() -> dict:
    """Click-to-select (SAM 2.1): available when torch and sam2 are installed, and the torch device it would use."""
    if not segment.available():
        return {"available": False, "model": "SAM 2.1 tiny"}
    if segment.backend() == "onnx":   # 1.53.4: nothing to install; the model is fetched on first use
        from app.localgen import model_manager
        return {"available": True, "model": "SAM 2.1 tiny", "device": "onnx", "reason": "ONNX Runtime" if model_manager.ready("sam2-onnx") else "ONNX Runtime; the model (about 155 MB) downloads on first use"}
    device, reason = segment.torch_device()
    return {"available": True, "model": "SAM 2.1 tiny", "device": device, "reason": reason}


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
    }


_FONT_TYPES = {".ttf": "font/ttf", ".otf": "font/otf", ".ttc": "font/collection", ".woff": "font/woff", ".woff2": "font/woff2"}


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
    path = _fc_match(name, bool(bold), bool(italic))
    if path is not None:
        # fc-match always answers with its fallback font; keep the answer only when it is this family's file.
        stem = "".join(ch for ch in path.stem.lower() if ch.isalnum())
        if "".join(ch for ch in name.lower() if ch.isalnum()) not in stem and not name.lower() in _fc_family(path).lower():
            path = None
    if path is None:
        path = _scan_font(name, bool(bold), bool(italic))
    if path is None or path.suffix.lower() not in _FONT_TYPES or not path.is_file():
        raise HTTPException(status_code=404, detail=f"No font file found for {name}.")
    try:
        data = path.read_bytes()
    except OSError as err:
        raise HTTPException(status_code=404, detail=f"No font file found for {name}.") from err
    return Response(content=data, media_type=_FONT_TYPES[path.suffix.lower()])


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
