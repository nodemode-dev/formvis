import re
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.core import config
from app.services import imaging

router = APIRouter(tags=["io"])
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|fmv|formvis|webp|tif|tiff|pdf|avif)$", re.IGNORECASE)


@router.post("/encode")
def encode(file: UploadFile = File(...), format: str = Form(...), quality: int = Form(90), dpi: int = Form(72), icc: UploadFile | None = File(default=None)) -> Response:
    try:
        data = imaging.encode(file.file.read(), format.lower(), quality, dpi, icc.file.read() if icc else None)
    except imaging.DecodeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    return Response(data, media_type=imaging.ENCODINGS[format.lower()])


@router.post("/pages")
def image_pages(file: UploadFile = File(...)) -> dict:
    """A TIFF's pages (1.53.4): so every page can be opened, not only the first."""
    try:
        return {"pages": imaging.pages(file.file.read(), file.filename or "")}
    except imaging.DecodeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc


@router.post("/decode-deep")
def decode_deep(file: UploadFile = File(...)) -> Response:
    """A picture's pixels at their own depth (1.53.6, the parity plan's H1): RGBA, 16 bits a channel, little-endian,
    with X-Depth saying whether the file held 16 bits or 8 (widened). OpenCV reads 16-bit PNG and TIFF, which Pillow
    narrows to 8."""
    import cv2
    import numpy as np
    data = np.frombuffer(file.file.read(), np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise HTTPException(status_code=415, detail="The picture could not be read at its depth.")
    depth = 16 if img.dtype == np.uint16 else 8
    img = img.astype(np.uint16) * (257 if depth == 8 else 1)
    if img.ndim == 2:
        img = np.stack([img, img, img], axis=2)
    if img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB); img = np.dstack([img, np.full(img.shape[:2], 65535, np.uint16)])
    else:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
    h, w = img.shape[:2]
    if w > 30000 or h > 30000 or w * h > config.MAX_PIXELS:
        raise HTTPException(status_code=413, detail="The picture is larger than formvis edits in one piece.")
    return Response(np.ascontiguousarray(img).astype("<u2").tobytes(), media_type="application/octet-stream", headers={"X-Width": str(w), "X-Height": str(h), "X-Depth": str(depth)})


@router.post("/encode-deep")
def encode_deep(file: UploadFile = File(...), width: int = Form(...), height: int = Form(...), format: str = Form("png")) -> Response:
    """A 16-bit PNG or TIFF from RGBA, 16 bits a channel, little-endian (1.53.6, H1)."""
    import cv2
    import numpy as np
    if format not in ("png", "tiff"):
        raise HTTPException(status_code=422, detail="16-bit export is PNG or TIFF.")
    raw = file.file.read()
    if width <= 0 or height <= 0 or len(raw) != width * height * 8:
        raise HTTPException(status_code=422, detail="The pixels do not match the size given.")
    img = np.frombuffer(raw, "<u2").reshape(height, width, 4)
    ok, out = cv2.imencode(".png" if format == "png" else ".tif", cv2.cvtColor(img, cv2.COLOR_RGBA2BGRA))
    if not ok:
        raise HTTPException(status_code=500, detail="The 16-bit file could not be written.")
    return Response(out.tobytes(), media_type="image/png" if format == "png" else "image/tiff")


@router.post("/decode")
def decode(file: UploadFile = File(...), page: int = Form(0)) -> Response:
    data = file.file.read()
    try:
        png, width, height = imaging.decode_to_png(data, file.filename or "", page)
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
