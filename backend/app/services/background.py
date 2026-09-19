import importlib.util
import io
import os
from functools import lru_cache

from PIL import Image

from app.core import config


class BackgroundError(Exception):
    pass


class Unavailable(BackgroundError):
    pass


def _has(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ValueError):
        return False


def model_name() -> str:
    return os.environ.get("SONNY_REMBG_MODEL", "u2net")


def available() -> dict:
    ml = _has("rembg") and _has("onnxruntime")
    lite = _has("cv2")
    return {"ml": ml, "lite": lite, "default": "ml" if ml else ("lite" if lite else None), "model": model_name()}


@lru_cache(maxsize=2)
def _session(model: str):
    from rembg import new_session

    return new_session(model)


def _ml(image: Image.Image) -> Image.Image:
    from rembg import remove

    mask = remove(image.convert("RGB"), session=_session(model_name()), only_mask=True)
    if not isinstance(mask, Image.Image):
        mask = Image.open(io.BytesIO(mask))
    return mask.convert("L")


def _lite(image: Image.Image) -> Image.Image:
    import cv2
    import numpy as np

    rgb = np.asarray(image.convert("RGB"))
    height, width = rgb.shape[:2]
    scale = min(1.0, 800.0 / max(width, height))
    small = cv2.resize(rgb, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA) if scale < 1 else rgb
    sh, sw = small.shape[:2]
    mx, my = max(1, round(sw * 0.04)), max(1, round(sh * 0.04))
    rect = (mx, my, max(1, sw - 2 * mx), max(1, sh - 2 * my))
    mask = np.zeros((sh, sw), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(small, cv2.COLOR_RGB2BGR), mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    if scale < 1:
        fg = cv2.resize(fg, (width, height), interpolation=cv2.INTER_LINEAR)
    fg = cv2.GaussianBlur(fg, (0, 0), sigmaX=max(0.8, 1.2 / scale))
    return Image.fromarray(fg)


def remove(data: bytes, method: str = "auto") -> tuple[bytes, str]:
    caps = available()
    chosen = caps["default"] if method == "auto" else method
    if chosen not in ("ml", "lite") or not caps.get(chosen):
        raise Unavailable("This background engine is not installed. Run ./sonny install-ml for the ML engine; the lightweight engine ships with the base install.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            source = image.convert("RGBA")
    except Exception as exc:
        raise BackgroundError("The image could not be read.") from exc
    width, height = source.size
    if width * height > config.MAX_PIXELS:
        raise BackgroundError("The image exceeds the 100-megapixel limit.")
    mask = _ml(source) if chosen == "ml" else _lite(source)
    if mask.size != source.size:
        mask = mask.resize(source.size, Image.Resampling.BILINEAR)
    out = io.BytesIO()
    mask.save(out, format="PNG")
    return out.getvalue(), chosen
