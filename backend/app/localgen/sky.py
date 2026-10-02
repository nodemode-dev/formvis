"""Select > Sky (1.57.6, the parity plan's L5): a U-2-Net sky segmenter by xiongzhu666 (MIT, 2021; its README does not
say what it was trained on), from the Hugging Face copy the VGGT project uses, pinned to its revision and SHA-256
through the model manager; 176 MB, about a second a picture on the CPU. The picture goes in at 320 by 320 with
ImageNet's normalisation; the answer, stretched to 0 to 255, comes back at the picture's size as a soft mask."""
import io

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from starlette.concurrency import run_in_threadpool

from . import model_manager

MODEL = "skyseg"
FILE = "skyseg/skyseg.onnx"
SIZE = 320
_session = None


def sky_mask(picture: Image.Image) -> Image.Image:
    global _session
    import onnxruntime as ort
    if _session is None:
        _session = ort.InferenceSession(str(model_manager.model_file(FILE)), providers=["CPUExecutionProvider"])
    rgb = picture.convert("RGB")
    x = np.asarray(rgb.resize((SIZE, SIZE), Image.Resampling.BILINEAR), np.float32) / 255.0
    x = ((x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)).transpose(2, 0, 1)[None]
    inp, out = _session.get_inputs()[0].name, _session.get_outputs()[0].name
    r = np.asarray(_session.run([out], {inp: x.astype(np.float32)})[0], np.float32).squeeze()
    r = (r - r.min()) / max(1e-6, float(r.max() - r.min()))
    return Image.fromarray((r * 255).astype(np.uint8), "L").resize(rgb.size, Image.Resampling.BILINEAR)


router = APIRouter(prefix="/api/sky", tags=["sky"])


@router.post("/mask")
async def mask(image: UploadFile = File(...)) -> Response:
    if not model_manager.ready(MODEL):
        raise HTTPException(409, "Select > Sky needs the sky model (176 MB, MIT): Preferences > Plugins > Local models.")
    try:
        picture = Image.open(io.BytesIO(await image.read()))
        picture.load()
    except Exception:
        raise HTTPException(400, "The picture could not be read")
    m = await run_in_threadpool(sky_mask, picture)
    buf = io.BytesIO()
    m.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png")
