"""Depth from one picture (1.54.8, Neural Filters, DEV_PLAN 23.2): Depth Anything V2 Small as ONNX, on any computer's
CPU through ONNX Runtime. The Small checkpoint is Apache-2.0 (Base, Large and Giant are CC-BY-NC and are not used);
the ONNX export is onnx-community's, pinned to its revision and SHA-256. The picture is scaled to the model's 518 by
518 (ImageNet-normalised, NCHW), the relative inverse depth comes back, is scaled to the picture's size and written
as an 8-bit PNG with near bright and far dark, which the window's Depth Blur reads."""
import io
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from starlette.concurrency import run_in_threadpool

from . import model_manager
from .paths import session as onnx_session

MODEL = "depth-anything-v2-small"
FILE = "depth-anything-v2-small/model.onnx"
SIZE = 518
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def _run(x: np.ndarray) -> np.ndarray:
    from . import sessions
    session = sessions.get("depth", lambda: onnx_session(model_manager.model_file(FILE)))
    name = session.get_inputs()[0].name
    return session.run(None, {name: x})[0]


def depth_map(picture: Image.Image) -> Image.Image:
    rgb = picture.convert("RGB")
    width, height = rgb.size
    small = np.asarray(rgb.resize((SIZE, SIZE), Image.Resampling.BICUBIC), np.float32) / 255.0
    x = ((small - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    out = _run(x)
    d = np.asarray(out).reshape(SIZE, SIZE).astype(np.float32)
    lo, hi = float(d.min()), float(d.max())
    norm = (d - lo) / (hi - lo) if hi > lo else np.zeros_like(d)
    img = Image.fromarray(np.clip(norm * 255 + 0.5, 0, 255).astype(np.uint8), "L")
    return img.resize((width, height), Image.Resampling.BICUBIC)


router = APIRouter(prefix="/api/depth", tags=["depth"])


@router.post("/local")
async def depth_local(image: UploadFile = File(...)) -> Response:
    if not model_manager.ready(MODEL):
        raise HTTPException(409, "Download Depth Anything first: Preferences > Plugins > Local models.")
    try:
        picture = Image.open(io.BytesIO(await image.read()))
        picture.load()
    except Exception:
        raise HTTPException(400, "The picture could not be read")
    result = await run_in_threadpool(depth_map, picture)
    out = io.BytesIO()
    result.save(out, "PNG")
    return Response(out.getvalue(), media_type="image/png")
