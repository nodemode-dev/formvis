from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.services import background

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
