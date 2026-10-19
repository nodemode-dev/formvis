"""Real-ESRGAN x4 upscaling, run on this machine with ONNX Runtime.

The model (Real-ESRGAN x4plus, BSD-3-Clause) takes RGB in 0 to 1 at any size and
returns it four times larger. A whole frame at once would need memory in
proportion to its area, so it runs in tiles: each tile is read with a margin of
context around it, and only the tile's own part of the result is kept, so the
seams fall inside context the model saw on both sides. Alpha, which the model
does not carry, is scaled with Lanczos. A factor below four is the x4 result
scaled down with Lanczos, which keeps the recovered detail.
"""

from __future__ import annotations

import shutil
import subprocess
import threading
from collections.abc import Callable
from pathlib import Path

import numpy as np
from PIL import Image

from .paths import MODELS_DIR as MODELS_ROOT

MODEL = "ai-upscale"
FILE = "realesrgan-x4plus.onnx"
SCALE = 4
TILE = 256  # source pixels per tile side
MARGIN = 16  # context read around each tile and discarded from its result

_session = None
_lock = threading.Lock()


def _run_model(batch: np.ndarray) -> np.ndarray:
    import onnxruntime as ort

    from . import sessions
    from .paths import providers, session as onnx_session
    session = sessions.get("esrgan", lambda: onnx_session(MODELS_ROOT / FILE))
    with _lock:
        return session.run(None, {"input": batch})[0]


def upscale_rgb(
    rgb: np.ndarray,
    run: Callable[[np.ndarray], np.ndarray] = _run_model,
    tile: int = TILE,
    margin: int = MARGIN,
    cancelled: Callable[[], bool] = lambda: False,
    report: Callable[[float], None] = lambda fraction: None,
    scale: int = SCALE,
) -> np.ndarray:
    """An H x W x 3 uint8 picture, `scale` (four) times larger, built tile by tile (report hears the share done)."""
    height, width = rgb.shape[:2]
    tiles, done = ((height + tile - 1) // tile) * ((width + tile - 1) // tile), 0
    out = np.zeros((height * scale, width * scale, 3), np.uint8)
    source = rgb.astype(np.float32) / 255.0
    for top in range(0, height, tile):
        for left in range(0, width, tile):
            if cancelled():
                raise InterruptedError("Cancelled")
            bottom, right = min(height, top + tile), min(width, left + tile)
            y0, x0 = max(0, top - margin), max(0, left - margin)
            y1, x1 = min(height, bottom + margin), min(width, right + margin)
            batch = source[y0:y1, x0:x1].transpose(2, 0, 1)[None]
            result = run(np.ascontiguousarray(batch))[0].transpose(1, 2, 0)
            keep = result[(top - y0) * scale : (bottom - y0) * scale, (left - x0) * scale : (right - x0) * scale]
            out[top * scale : bottom * scale, left * scale : right * scale] = (np.clip(keep, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
            done += 1
            report(done / tiles)
    return out


def upscale_image(image: Image.Image, factor: float, run: Callable[[np.ndarray], np.ndarray] = _run_model, **tiles) -> Image.Image:
    rgb = Image.fromarray(upscale_rgb(np.asarray(image.convert("RGB")), run, **tiles))
    target = (max(1, round(image.width * factor)), max(1, round(image.height * factor)))
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        alpha = image.convert("RGBA").getchannel("A").resize(rgb.size, Image.Resampling.LANCZOS)
        rgb = Image.merge("RGBA", (*rgb.split(), alpha))
    return rgb if rgb.size == target else rgb.resize(target, Image.Resampling.LANCZOS)


CHOSEN_DIR = MODELS_ROOT / "upscalers"
CHOSEN_EXT = (".onnx", ".pth", ".pt", ".safetensors")
PROBE = 32


def chosen_path(name: str) -> Path:
    """A model file in the upscalers folder by its bare name; anything with a folder part is refused."""
    if not name or Path(name).name != name or name.startswith("."):
        raise ValueError("Choose a model file from the upscalers folder.")
    path = CHOSEN_DIR / name
    if not path.is_file():
        raise ValueError(f"{name} is not in the upscalers folder.")
    return path


def probe_chosen(name: str) -> tuple[Callable[[np.ndarray], np.ndarray], int]:
    """The runner and the enlargement factor of a chosen ESRGAN-family ONNX file, found by running a small tile once.
    Raises ValueError with the reason when the file cannot be run here."""
    path = chosen_path(name)
    if path.suffix.lower() != ".onnx":
        raise ValueError(f"{name} is a PyTorch weights file and this engine runs ONNX models only: convert it to .onnx (any ESRGAN-family model exports with its usual 'input' of shape 1, 3, H, W) and put that file in the upscalers folder.")
    from .paths import session as onnx_session
    from . import sessions
    try:
        session = sessions.get(f"esrgan:{name}:{path.stat().st_mtime_ns}", lambda: onnx_session(path))
        entry = session.get_inputs()[0]
    except Exception as err:
        raise ValueError(f"{name} could not be loaded as an ONNX model ({str(err).splitlines()[0][:160] if str(err) else 'unreadable'}).")
    shape = list(entry.shape)
    if len(shape) != 4 or shape[1] != 3:
        raise ValueError(f"{name} does not take a picture as 1 x 3 x H x W, so it is not an ESRGAN-family upscaler this engine can run.")
    if any(isinstance(d, int) for d in shape[2:]):
        raise ValueError(f"{name} accepts one fixed picture size; this engine needs a model that takes any size.")

    def run(batch: np.ndarray) -> np.ndarray:
        with _lock:
            return session.run(None, {entry.name: batch})[0]

    try:
        out = run(np.zeros((1, 3, PROBE, PROBE), np.float32))
    except Exception as err:
        raise ValueError(f"{name} did not run on a test picture ({str(err).splitlines()[0][:160] if str(err) else 'error'}).")
    if out.ndim != 4 or out.shape[1] != 3 or out.shape[2] % PROBE or out.shape[2] != out.shape[3]:
        raise ValueError(f"{name} does not return a picture of 3 channels at a whole multiple of the input size.")
    return run, int(out.shape[2] // PROBE)


# formvis (1.53.1): Image > Upscale on this computer, a background job with progress and Cancel.
import io  # noqa: E402

from fastapi import APIRouter, File, Form, HTTPException, UploadFile  # noqa: E402

from . import jobs, model_manager  # noqa: E402
from .media import ingest_path  # noqa: E402

router = APIRouter(prefix="/api/upscale", tags=["upscale"])


@router.get("/models")
def upscale_models() -> dict:
    """The model files the person put in the upscalers folder, each with whether this engine can run it and, when not, why."""
    found = []
    if CHOSEN_DIR.is_dir():
        for path in sorted(CHOSEN_DIR.iterdir(), key=lambda p: p.name.lower()):
            if not path.is_file() or path.suffix.lower() not in CHOSEN_EXT or path.name.startswith("."):
                continue
            note = ""
            if path.suffix.lower() != ".onnx":
                note = "A PyTorch weights file: convert it to .onnx to use it here."
            found.append({"file": path.name, "loadable": not note, "note": note})
    return {"folder": str(CHOSEN_DIR), "models": found}


@router.post("/local", status_code=202)
async def upscale_local(file: UploadFile = File(...), factor: float = Form(4.0), model: str = Form("")) -> dict:
    """The picture enlarged `factor` times (2 or 4) by Real-ESRGAN, or by the ESRGAN-family file `model` from the upscalers folder, on this computer, its alpha kept."""
    run, scale, label = _run_model, SCALE, "Real-ESRGAN x4plus (this computer)"
    if model:
        try:
            run, scale = probe_chosen(model)
        except ValueError as err:
            raise HTTPException(422, str(err))
        label = f"{model} (this computer)"
    elif not model_manager.ready(MODEL):
        raise HTTPException(409, "Download the Real-ESRGAN model first: Preferences > Plugins > Local models.")
    factor = 2.0 if float(factor) <= 2 else 4.0
    data = await file.read()
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.load()
            picture = probe.copy()
    except Exception:
        raise HTTPException(400, "That picture could not be read")

    def operation(job_id, report, cancelled):
        from .generate import STAGING

        out = upscale_image(picture, factor, run, scale=scale, cancelled=cancelled, report=lambda f: report(0.95 * f, "Upscaling on this computer"))
        STAGING.mkdir(parents=True, exist_ok=True)
        staged = STAGING / f"upscaled-{job_id}.png"
        out.save(staged)
        try:
            item = ingest_path(staged, f"Upscaled {factor:g}x", extra={"provider": label})
        finally:
            staged.unlink(missing_ok=True)
        return {"media": [item], "kind": "image", "notes": []}

    return jobs.submit("upscale", operation)
