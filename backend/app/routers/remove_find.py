"""Remove's People and Distractions (1.57.4, the parity plan's M1): masks of what to remove, proposed by models already
on this computer. People: each face YuNet finds becomes a box around the person below it, which SAM2 turns into the
person's mask; the largest person is kept as the subject when their face is at least 2.5 times the next one's (or,
alone, fills at least 0.5% of the picture), and the others are removed. Distractions: U2-Net's salient objects other
than the largest (the subject), with the people other than the subject. The window fills the mask with LaMa as one step."""
import hashlib
import io

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from starlette.concurrency import run_in_threadpool

from app.localgen import face, model_manager
from app.services import background, segment

router = APIRouter(prefix="/api/remove", tags=["remove"])


def _person_boxes(faces: list[dict], w: int, h: int) -> tuple[list[tuple[float, float, float, float]], int | None]:
    """A box around each person from their face, and the index of the subject's face if one stands out."""
    boxes = []
    for f in faces:
        x, y, fw, fh = f["box"]
        boxes.append((max(0.0, x - 1.3 * fw), max(0.0, y - 0.5 * fh), min(float(w), x + 2.3 * fw), min(float(h), y + 7.5 * fh)))
    subject = None
    if faces:
        areas = [f["box"][2] * f["box"][3] for f in faces]
        big = max(range(len(faces)), key=lambda i: areas[i])
        rest = max([a for i, a in enumerate(areas) if i != big], default=0.0)
        if (rest > 0 and areas[big] >= 2.5 * rest) or (rest == 0 and areas[big] >= 0.005 * w * h):
            subject = big
    return boxes, subject


def _people(data: bytes, rgb: Image.Image, keep_subject: bool) -> np.ndarray:
    w, h = rgb.size
    faces = face.find_faces(rgb)
    boxes, subject = _person_boxes(faces, w, h)
    out = np.zeros((h, w), bool)
    if not boxes:
        return out
    key = "remove-" + hashlib.sha256(data).hexdigest()[:24]
    if not segment.has(key):
        segment.encode(key, data)
    for i, b in enumerate(boxes):
        if keep_subject and i == subject:
            continue
        m = np.asarray(Image.open(io.BytesIO(segment.select(key, [], b))).convert("L").resize((w, h))) > 127
        out |= m
    return out


def _distractions(data: bytes, rgb: Image.Image) -> np.ndarray:
    from scipy import ndimage
    w, h = rgb.size
    sal = np.asarray(background._u2net_onnx(rgb).convert("L").resize((w, h))) > 127
    labels, n = ndimage.label(sal)
    out = np.zeros((h, w), bool)
    if n > 1:
        sizes = ndimage.sum(sal, labels, range(1, n + 1))
        main = int(np.argmax(sizes)) + 1
        for i, s in enumerate(sizes, start=1):
            if i != main and s >= 0.0005 * w * h:
                out |= labels == i
    return out | _people(data, rgb, keep_subject=True)


def find(data: bytes, kind: str) -> bytes:
    rgb = Image.open(io.BytesIO(data)).convert("RGB")
    m = _people(data, rgb, keep_subject=True) if kind == "people" else _distractions(data, rgb)
    if m.any():
        from scipy import ndimage
        m = ndimage.binary_dilation(m, iterations=max(2, round(min(rgb.size) / 200)))
    buf = io.BytesIO()
    Image.fromarray((m * 255).astype(np.uint8), "L").save(buf, "PNG")
    return buf.getvalue()


@router.post("/find")
async def find_route(image: UploadFile = File(...), kind: str = Form("people")) -> Response:
    if kind not in ("people", "distractions"):
        raise HTTPException(422, "kind is people or distractions")
    if not model_manager.ready(face.MODEL):
        raise HTTPException(409, "Finding people needs the face finder (YuNet, 232 KB, MIT): Preferences > Plugins > Local models.")
    if not segment.available():
        raise HTTPException(409, "Finding people needs Segment Anything 2: Preferences > Plugins > Local models.")
    data = await image.read()
    try:
        mask = await run_in_threadpool(find, data, kind)
    except Exception as exc:
        raise HTTPException(500, f"Finding {kind} failed: {exc}") from exc
    return Response(mask, media_type="image/png")
