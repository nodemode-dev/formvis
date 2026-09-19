import re
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.core import config
from app.services import imaging

router = APIRouter(tags=["io"])
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|sonny)$", re.IGNORECASE)


@router.post("/decode")
def decode(file: UploadFile = File(...)) -> Response:
    data = file.file.read()
    try:
        png, width, height = imaging.decode_to_png(data, file.filename or "")
    except imaging.DecodeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    return Response(png, media_type="image/png", headers={"X-Width": str(width), "X-Height": str(height)})


@router.post("/export")
def export(file: UploadFile = File(...), name: str = Form(...)) -> dict:
    clean = Path(name).name.strip()
    if not EXPORT_NAME.match(clean) or clean.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid export file name.")
    folder = config.exports_dir()
    stem, suffix = Path(clean).stem, Path(clean).suffix
    target, n = folder / clean, 2
    while target.exists():
        target = folder / f"{stem} {n}{suffix}"
        n += 1
    target.write_bytes(file.file.read())
    return {"path": str(target)}
