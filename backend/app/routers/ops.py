import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.services import background, segment

router = APIRouter(tags=["ops"])


@router.post("/remove-background")
def remove_background(file: UploadFile = File(...), method: str = Form("auto"), matting: str = Form("")) -> Response:
    data = file.file.read()
    try:
        png, used = background.remove(data, method, matting)
    except background.Unavailable as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except background.BackgroundError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(content=png, media_type="image/png", headers={"X-Method": used})


@router.get("/matting-models")
def matting_models() -> dict:
    return background.matting_models()


@router.post("/objects")
def find_objects(file: UploadFile = File(...)) -> dict:
    try:
        return background.objects(file.file.read())
    except background.Unavailable as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except background.BackgroundError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/select-object")
def select_object(key: str = Form(...), points: str = Form(...), box: str | None = Form(None), file: UploadFile | None = File(None)) -> Response:
    """Click-to-select with SAM 2.1: the image is sent once per key (a layer and its revision) and encoded; clicks send the
    key and points ([x, y, 1] on the object, [x, y, 0] not on it). A key the engine no longer holds answers 409, and the
    client sends the image again."""
    if not segment.available():
        raise HTTPException(status_code=501, detail="Click-to-select needs the engine's AI extras (./formvis install-ml).")
    try:
        raw = json.loads(points)
        pts = [(float(p[0]), float(p[1]), 1 if int(p[2]) else 0) for p in raw][:32]
        rect = tuple(float(v) for v in json.loads(box))[:4] if box else None   # a box: x0, y0, x1, y1
        if rect is not None and (len(rect) != 4 or rect[2] <= rect[0] or rect[3] <= rect[1]):
            raise ValueError('box')
        if not pts and rect is None:
            raise ValueError('nothing')
    except Exception as exc:
        raise HTTPException(status_code=422, detail="The points could not be read.") from exc
    try:
        if file is not None:
            segment.encode(key, file.file.read())
        elif not segment.has(key):
            raise HTTPException(status_code=409, detail="encode")
        png = segment.select(key, pts, rect)
    except KeyError as exc:
        raise HTTPException(status_code=409, detail="encode") from exc
    except segment.SegmentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(png, media_type="image/png")
