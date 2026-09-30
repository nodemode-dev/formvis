"""Inpainting on this computer (1.53.2): LaMa (big-lama, ONNX, Apache-2.0) on any computer's CPU, for Generative Fill
and Expand with no prompt, ComfyUI or fal. The fill area is padded to a square by repeating its edges (so padding
cannot bleed into the fill), scaled to LaMa's 512 x 512, filled, scaled back; only the masked area is taken from LaMa,
the rest kept exactly. The mask is grown a few pixels first, as LaMa is trained to fill a little past the edge."""

import io
import threading

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageFilter
from starlette.concurrency import run_in_threadpool

from . import model_manager
from .paths import providers

MODEL = "lama-inpaint"
FILE = "lama_fp32.onnx"
SIZE = 512
_session = None
_lock = threading.Lock()


def _run(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    global _session
    with _lock:
        if _session is None:
            import onnxruntime as ort
            _session = ort.InferenceSession(str(model_manager.model_file(FILE)), providers=providers())
        return _session.run(None, {"image": image, "mask": mask})[0]


def inpaint(image: Image.Image, mask: Image.Image, run=_run) -> Image.Image:
    """`image` with the white of `mask` filled by LaMa; the rest of the picture unchanged."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    grow = max(3, round(max(width, height) / SIZE * 4)) | 1
    hole = mask.convert("L").resize(rgb.size).point(lambda v: 255 if v > 127 else 0).filter(ImageFilter.MaxFilter(grow))
    side = max(width, height)
    pixels = np.pad(np.asarray(rgb), ((0, side - height), (0, side - width), (0, 0)), mode="edge")
    holes = np.pad(np.asarray(hole), ((0, side - height), (0, side - width)), mode="constant")
    small = np.asarray(Image.fromarray(pixels).resize((SIZE, SIZE), Image.Resampling.LANCZOS), np.float32) / 255.0
    small_hole = (np.asarray(Image.fromarray(holes).resize((SIZE, SIZE), Image.Resampling.NEAREST)) > 127).astype(np.float32)
    out = run(small.transpose(2, 0, 1)[None], small_hole[None, None])[0].transpose(1, 2, 0)
    filled = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize((side, side), Image.Resampling.LANCZOS).crop((0, 0, width, height))
    return Image.composite(filled, rgb, hole)


router = APIRouter(prefix="/api/inpaint", tags=["inpaint"])


@router.post("/local")
async def inpaint_local(image: UploadFile = File(...), mask: UploadFile = File(...)) -> Response:
    if not model_manager.ready(MODEL):
        raise HTTPException(409, "Download LaMa first: Preferences > Plugins > Local models.")
    try:
        picture, hole = Image.open(io.BytesIO(await image.read())), Image.open(io.BytesIO(await mask.read()))
        picture.load(); hole.load()
    except Exception:
        raise HTTPException(400, "The picture or its mask could not be read")
    result = await run_in_threadpool(inpaint, picture, hole)
    out = io.BytesIO()
    result.save(out, "PNG")
    return Response(out.getvalue(), media_type="image/png")
