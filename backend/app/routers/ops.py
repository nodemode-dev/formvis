import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.services import background, segment

router = APIRouter(tags=["ops"])


@router.post("/remove-background")
def remove_background(file: UploadFile = File(...), method: str = Form("auto")) -> Response:
    data = file.file.read()
    try:
        mask, used = background.remove(data, method)
    except background.Unavailable as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except background.BackgroundError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(mask, media_type="image/png", headers={"X-Method": used})


@router.post("/select-object")
def select_object(key: str = Form(...), points: str = Form(...), file: UploadFile | None = File(None)) -> Response:
    """Click-to-select with SAM 2.1: the image is sent once per key (a layer and its revision) and encoded; clicks send the
    key and points ([x, y, 1] on the object, [x, y, 0] not on it). A key the engine no longer holds answers 409, and the
    client sends the image again."""
    if not segment.available():
        raise HTTPException(status_code=501, detail="Click-to-select needs the engine's AI extras (./sonny install-ml).")
    try:
        raw = json.loads(points)
        pts = [(float(p[0]), float(p[1]), 1 if int(p[2]) else 0) for p in raw][:32]
    except Exception as exc:
        raise HTTPException(status_code=422, detail="The points could not be read.") from exc
    try:
        if file is not None:
            segment.encode(key, file.file.read())
        elif not segment.has(key):
            raise HTTPException(status_code=409, detail="encode")
        png = segment.select(key, pts)
    except KeyError as exc:
        raise HTTPException(status_code=409, detail="encode") from exc
    except segment.SegmentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(png, media_type="image/png")
