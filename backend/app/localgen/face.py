"""Faces for Face-Aware Liquify (1.56.7, the parity plan's M3): YuNet (OpenCV Zoo, MIT, Shiqi Yu), a 232 KB face
detector run by OpenCV's own `FaceDetectorYN`, finds each face's box and five landmarks (the two eyes, the nose tip
and the two mouth corners). The model comes from OpenCV's Hugging Face page pinned to its revision and SHA-256 through
the model manager. The answer names the eyes and mouth corners by the side of the picture they are on."""
import io
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image
from starlette.concurrency import run_in_threadpool

from . import model_manager

MODEL = "yunet-face"
FILE = "yunet-face/face_detection_yunet_2023mar.onnx"
MAX_SIDE = 2048


def find_faces(picture: Image.Image) -> list[dict]:
    import cv2
    rgb = picture.convert("RGB")
    w, h = rgb.size
    k = min(1.0, MAX_SIDE / max(w, h))
    small = rgb if k == 1.0 else rgb.resize((max(1, round(w * k)), max(1, round(h * k))), Image.Resampling.LANCZOS)
    sw, sh = small.size
    det = cv2.FaceDetectorYN.create(str(model_manager.model_file(FILE)), "", (sw, sh), 0.75, 0.3, 50)
    _, found = det.detect(cv2.cvtColor(np.asarray(small), cv2.COLOR_RGB2BGR))
    faces = []
    for f in (found if found is not None else []):
        v = [float(x) / k for x in f[:14]]
        eyes = sorted([(v[4], v[5]), (v[6], v[7])]); mouth = sorted([(v[10], v[11]), (v[12], v[13])])
        faces.append({"box": [v[0], v[1], v[2], v[3]], "eyeLeft": eyes[0], "eyeRight": eyes[1], "nose": (v[8], v[9]),
                      "mouthLeft": mouth[0], "mouthRight": mouth[1], "score": float(f[14])})
    faces.sort(key=lambda d: -d["box"][2] * d["box"][3])
    return faces


router = APIRouter(prefix="/api/face", tags=["face"])


@router.post("/landmarks")
async def landmarks(image: UploadFile = File(...)) -> dict:
    if not model_manager.ready(MODEL):
        raise HTTPException(409, "Download the face finder first: Preferences > Plugins > Local models (YuNet, 232 KB, MIT).")
    try:
        picture = Image.open(io.BytesIO(await image.read()))
        picture.load()
    except Exception:
        raise HTTPException(400, "The picture could not be read")
    return {"faces": await run_in_threadpool(find_faces, picture)}
