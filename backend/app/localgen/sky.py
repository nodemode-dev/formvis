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


def quick_sky(picture: Image.Image) -> Image.Image:
    """The quick method, no model: blue or pale smooth areas that reach the top of the picture, grown over cloud by the
    sky's own colour spread, with the soft edge of a small blur. Plain colour and texture statistics (OpenCV), made for
    clear and overcast skies; the model does better with sunsets, heavy cloud and trees against the sky."""
    import cv2
    rgb = np.asarray(picture.convert("RGB"))
    h0, w0 = rgb.shape[:2]
    scale = min(1.0, 448 / max(h0, w0))
    small = cv2.resize(rgb, (max(8, round(w0 * scale)), max(8, round(h0 * scale))), interpolation=cv2.INTER_AREA) if scale < 1 else rgb
    h, w = small.shape[:2]
    lab = cv2.cvtColor(small, cv2.COLOR_RGB2LAB).astype(np.float32)
    hsv = cv2.cvtColor(small, cv2.COLOR_RGB2HSV).astype(np.float32)
    side = 2 * max(2, round(min(h, w) / 60)) + 1
    light = lab[..., 0]
    mean = cv2.blur(light, (side, side))
    texture = np.sqrt(np.maximum(cv2.blur(light * light, (side, side)) - mean * mean, 0))
    blue = (hsv[..., 0] > 85) & (hsv[..., 0] < 135) & (hsv[..., 1] > 40) & (hsv[..., 2] > 70)
    pale = (hsv[..., 1] < 45) & (hsv[..., 2] > 170)
    skyish = (blue | pale).astype(np.uint8)
    seed = skyish & (texture < 7)

    def touching_top(mask: np.ndarray) -> np.ndarray:
        count, labels, stats, centre = cv2.connectedComponentsWithStats(mask, connectivity=8)
        keep = np.zeros(count, bool)
        for i in range(1, count):
            top, area = stats[i, cv2.CC_STAT_TOP], stats[i, cv2.CC_STAT_AREA]
            keep[i] = area > 0.004 * h * w and (top < 0.1 * h or (area > 0.03 * h * w and centre[i][1] < 0.5 * h))
        return keep[labels]

    sky = touching_top(seed)
    if sky.sum() < 0.004 * h * w:
        return Image.new("L", picture.size, 0)
    pixels = lab[sky]
    centre = pixels.mean(0)
    spread = np.cov(pixels.T) + np.eye(3) * 4.0
    diff = (lab - centre).reshape(-1, 3)
    far = np.einsum("ij,jk,ik->i", diff, np.linalg.inv(spread), diff).reshape(h, w)
    grown = ((far < 36) & (skyish > 0) & (texture < 36)).astype(np.uint8)
    sky = touching_top(np.maximum(grown, sky.astype(np.uint8)))
    sky = cv2.morphologyEx(sky.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    soft = cv2.GaussianBlur(sky.astype(np.float32) * 255, (0, 0), max(0.8, side / 5))
    return Image.fromarray(soft.astype(np.uint8), "L").resize(picture.size, Image.Resampling.BILINEAR)


router = APIRouter(prefix="/api/sky", tags=["sky"])


@router.post("/mask")
async def mask(image: UploadFile = File(...), quick: bool = False) -> Response:
    """The sky as a soft mask: the model's, or with `quick` the quick method, which needs no model."""
    if not quick and not model_manager.ready(MODEL):
        raise HTTPException(409, "Select > Sky needs the sky model (176 MB, MIT): Preferences > Plugins > Local models.")
    try:
        picture = Image.open(io.BytesIO(await image.read()))
        picture.load()
    except Exception:
        raise HTTPException(400, "The picture could not be read")
    m = await run_in_threadpool(quick_sky if quick else sky_mask, picture)
    buf = io.BytesIO()
    m.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png")
