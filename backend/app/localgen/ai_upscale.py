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
    global _session
    with _lock:
        if _session is None:
            import onnxruntime as ort

            from .paths import providers

            _session = ort.InferenceSession(str(MODELS_ROOT / FILE), providers=providers())
        return _session.run(None, {"input": batch})[0]


def upscale_rgb(
    rgb: np.ndarray,
    run: Callable[[np.ndarray], np.ndarray] = _run_model,
    tile: int = TILE,
    margin: int = MARGIN,
    cancelled: Callable[[], bool] = lambda: False,
    report: Callable[[float], None] = lambda fraction: None,
) -> np.ndarray:
    """An H x W x 3 uint8 picture, four times larger, built tile by tile (report hears the share done)."""
    height, width = rgb.shape[:2]
    tiles, done = ((height + tile - 1) // tile) * ((width + tile - 1) // tile), 0
    out = np.zeros((height * SCALE, width * SCALE, 3), np.uint8)
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
            keep = result[(top - y0) * SCALE : (bottom - y0) * SCALE, (left - x0) * SCALE : (right - x0) * SCALE]
            out[top * SCALE : bottom * SCALE, left * SCALE : right * SCALE] = (np.clip(keep, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
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






# formvis (1.53.1): Image > Upscale on this computer, a background job with progress and Cancel.
import io  # noqa: E402

from fastapi import APIRouter, File, Form, HTTPException, UploadFile  # noqa: E402

from . import jobs, model_manager  # noqa: E402
from .media import ingest_path  # noqa: E402

router = APIRouter(prefix="/api/upscale", tags=["upscale"])


@router.post("/local", status_code=202)
async def upscale_local(file: UploadFile = File(...), factor: float = Form(4.0)) -> dict:
    """The picture enlarged `factor` times (2 or 4) by Real-ESRGAN on this computer, its alpha kept."""
    if not model_manager.ready(MODEL):
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

        out = upscale_image(picture, factor, _run_model, cancelled=cancelled, report=lambda f: report(0.95 * f, "Upscaling on this computer"))
        STAGING.mkdir(parents=True, exist_ok=True)
        staged = STAGING / f"upscaled-{job_id}.png"
        out.save(staged)
        try:
            item = ingest_path(staged, f"Upscaled {factor:g}x", extra={"provider": "Real-ESRGAN x4plus (this computer)"})
        finally:
            staged.unlink(missing_ok=True)
        return {"media": [item], "kind": "image", "notes": []}

    return jobs.submit("upscale", operation)
