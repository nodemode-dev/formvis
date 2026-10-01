"""Colour for a black-and-white picture (1.54.9, Neural Filters, DEV_PLAN 23.2): DDColor-tiny (ICCV 2023, Apache-2.0)
as ONNX on any computer's CPU through ONNX Runtime. DDColor's own recipe: the picture's L of Lab, as an RGB made of L
alone, scaled to 512 by 512 in 0 to 1 (NCHW); the model answers the a and b channels, which are scaled back to the
picture's size and joined to the picture's own L, so luminance is never touched. The export is edgetools' (fp16
weights, float32 in and out), pinned to its revision and SHA-256."""
import io
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from starlette.concurrency import run_in_threadpool

from . import model_manager
from .paths import session as onnx_session

MODEL = "ddcolor-tiny"
FILE = "ddcolor-tiny/ddcolor-tiny-fp16.onnx"
SIZE = 512


def _run(x: np.ndarray) -> np.ndarray:
    from . import sessions
    session = sessions.get("ddcolor", lambda: onnx_session(model_manager.model_file(FILE)))
    name = session.get_inputs()[0].name
    return session.run(None, {name: x})[0]


def colorize(picture: Image.Image) -> Image.Image:
    import cv2
    rgb = np.asarray(picture.convert("RGB"))
    height, width = rgb.shape[:2]
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    l_only = np.stack([lab[..., 0], np.full_like(lab[..., 0], 128), np.full_like(lab[..., 0], 128)], axis=-1)
    grey_rgb = cv2.cvtColor(l_only, cv2.COLOR_LAB2RGB)
    x = cv2.resize(grey_rgb, (SIZE, SIZE), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    ab = _run(x.transpose(2, 0, 1)[None])[0].transpose(1, 2, 0).astype(np.float32)
    ab = cv2.resize(ab, (width, height), interpolation=cv2.INTER_LINEAR)
    out_lab = np.concatenate([lab[..., :1].astype(np.float32) * (100.0 / 255.0), ab], axis=-1)
    out = cv2.cvtColor(np.clip(out_lab, [0, -127, -127], [100, 127, 127]).astype(np.float32), cv2.COLOR_LAB2RGB)
    return Image.fromarray(np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8), "RGB")


router = APIRouter(prefix="/api/colorize", tags=["colorize"])


@router.post("/local")
async def colorize_local(image: UploadFile = File(...)) -> Response:
    if not model_manager.ready(MODEL):
        raise HTTPException(409, "Download DDColor first: Preferences > Plugins > Local models.")
    try:
        picture = Image.open(io.BytesIO(await image.read()))
        picture.load()
    except Exception:
        raise HTTPException(400, "The picture could not be read")
    result = await run_in_threadpool(colorize, picture)
    out = io.BytesIO()
    result.save(out, "PNG")
    return Response(out.getvalue(), media_type="image/png")
