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


DETAIL_SIZE = 770


def _normalised(picture: Image.Image, side: int = SIZE) -> np.ndarray:
    rgb = picture.convert("RGB")
    small = np.asarray(rgb.resize((side, side), Image.Resampling.BICUBIC), np.float32) / 255.0
    x = ((small - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    d = np.asarray(_run(x)).reshape(side, side).astype(np.float32)
    lo, hi = float(d.min()), float(d.max())
    return (d - lo) / (hi - lo) if hi > lo else np.zeros_like(d)


def depth_map(picture: Image.Image) -> Image.Image:
    width, height = picture.size
    img = Image.fromarray(np.clip(_normalised(picture) * 255 + 0.5, 0, 255).astype(np.uint8), "L")
    return img.resize((width, height), Image.Resampling.BICUBIC)


def encode16(values: np.ndarray) -> bytes:
    """Depth 0..1 as a 16-bit grey PNG, near bright (65535) and far dark (0)."""
    out = io.BytesIO()
    Image.fromarray(np.clip(values * 65535.0 + 0.5, 0, 65535).astype("<u2")).save(out, "PNG")
    return out.getvalue()


def depth_values(picture: Image.Image, width: int, height: int, side: int = SIZE) -> np.ndarray:
    field = Image.fromarray(_normalised(picture, side), "F").resize((width, height), Image.Resampling.BICUBIC)
    return np.clip(np.asarray(field, np.float32), 0.0, 1.0)


router = APIRouter(prefix="/api/depth", tags=["depth"])


@router.post("/local")
async def depth_local(image: UploadFile = File(...), fmt: str = "png", width: int = 0, height: int = 0, quality: str = "standard") -> Response:
    if not model_manager.ready(MODEL):
        raise HTTPException(409, "Download Depth Anything first: Preferences > Plugins > Local models.")
    if quality not in ("standard", "detail"):
        raise HTTPException(400, "quality is standard or detail")
    side = DETAIL_SIZE if quality == "detail" else SIZE
    try:
        picture = Image.open(io.BytesIO(await image.read()))
        picture.load()
    except Exception:
        raise HTTPException(400, "The picture could not be read")
    if fmt == "f32":
        w, h = (width, height) if 0 < width <= 16384 and 0 < height <= 16384 else picture.size
        try:
            values = await run_in_threadpool(depth_values, picture, w, h, side)
        except Exception:
            if side == SIZE:
                raise
            raise HTTPException(422, "This depth model file does not accept the detail size; use standard.")
        return Response(values.astype("<f4").tobytes(), media_type="application/octet-stream", headers={"X-Depth-Width": str(w), "X-Depth-Height": str(h)})
    if fmt == "png16":
        w, h = (width, height) if 0 < width <= 16384 and 0 < height <= 16384 else picture.size
        try:
            values = await run_in_threadpool(depth_values, picture, w, h, side)
        except Exception:
            if side == SIZE:
                raise
            raise HTTPException(422, "This depth model file does not accept the detail size; use standard.")
        return Response(encode16(values), media_type="image/png")
    result = await run_in_threadpool(depth_map, picture)
    out = io.BytesIO()
    result.save(out, "PNG")
    return Response(out.getvalue(), media_type="image/png")
