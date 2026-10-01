"""Style Transfer (1.55.1, Neural Filters, DEV_PLAN 23.2): five preset styles from the ONNX model zoo's fast neural
style models (Johnson et al.; the zoo's files are BSD-3-Clause), each pinned to its SHA-256, on any computer's CPU.
The zoo exports a fixed 224 by 224 input, but the networks are fully convolutional, so the graph's input and output
dims are made dynamic in memory when the session is built (the file on disk stays the pinned original). The picture
goes in as RGB floats 0 to 255 (NCHW) and comes back the same way, clipped; the window mixes it by Amount."""
import io
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from starlette.concurrency import run_in_threadpool

from . import model_manager

MODEL = "fast-style"
STYLES = {"candy": "Candy", "mosaic": "Mosaic", "rain-princess": "Rain Princess", "udnie": "Udnie", "pointilism": "Pointilism"}
MAX_SIDE = 1024


def _session(style: str):
    import onnx
    from . import sessions
    from .paths import session as onnx_session

    def build():
        m = onnx.load(str(model_manager.model_file(f"fast-style/{style}-9.onnx")))
        for t in list(m.graph.input) + list(m.graph.output):
            dims = t.type.tensor_type.shape.dim
            if len(dims) == 4:
                dims[2].dim_param = "height"
                dims[3].dim_param = "width"
        del m.graph.value_info[:]
        return onnx_session(m.SerializeToString())

    return sessions.get(f"style-{style}", build)


def stylize(picture: Image.Image, style: str) -> Image.Image:
    rgb = picture.convert("RGB")
    width, height = rgb.size
    work = rgb.copy()
    work.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    x = np.asarray(work, np.float32).transpose(2, 0, 1)[None]
    session = _session(style)
    y = session.run(None, {session.get_inputs()[0].name: x})[0][0].transpose(1, 2, 0)
    out = Image.fromarray(np.clip(y + 0.5, 0, 255).astype(np.uint8), "RGB")
    return out if out.size == (width, height) else out.resize((width, height), Image.Resampling.LANCZOS)


router = APIRouter(prefix="/api/style", tags=["style"])


@router.post("/local")
async def style_local(image: UploadFile = File(...), style: str = Form("mosaic")) -> Response:
    if style not in STYLES:
        raise HTTPException(422, "Unknown style.")
    if not model_manager.ready(MODEL):
        raise HTTPException(409, "Download the style models first: Preferences > Plugins > Local models.")
    try:
        picture = Image.open(io.BytesIO(await image.read()))
        picture.load()
    except Exception:
        raise HTTPException(400, "The picture could not be read")
    result = await run_in_threadpool(stylize, picture, style)
    out = io.BytesIO()
    result.save(out, "PNG")
    return Response(out.getvalue(), media_type="image/png")
