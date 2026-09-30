import io
import re
from pathlib import Path

import numpy as np
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
    from app.services import contained
    raw = file.file.read()
    img = contained.decode_exr(raw) if contained.is_exr(raw) else cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise HTTPException(status_code=415, detail="The picture could not be read at its depth." if not contained.is_exr(raw) else "The OpenEXR file could not be read; a malformed file is refused outside the engine.")
    if img.dtype in (np.float32, np.float64):   # 32 bits (1.53.9): Radiance HDR, OpenEXR and float TIFF, linear light
        img = img.astype(np.float32)
        if img.ndim == 2:
            img = np.stack([img, img, img], axis=2)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB) if img.shape[2] == 3 else cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
        if img.shape[2] == 3:
            img = np.dstack([img, np.ones(img.shape[:2], np.float32)])
        h, w = img.shape[:2]
        if w > 30000 or h > 30000 or w * h > config.MAX_PIXELS:
            raise HTTPException(status_code=413, detail="The picture is larger than formvis edits in one piece.")
        return Response(np.ascontiguousarray(img).astype("<f4").tobytes(), media_type="application/octet-stream", headers={"X-Width": str(w), "X-Height": str(h), "X-Depth": "32"})
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
    if format not in ("png", "tiff", "hdr", "exr", "tiff32"):
        raise HTTPException(status_code=422, detail="Deep export is 16-bit PNG or TIFF, or 32-bit Radiance HDR, OpenEXR or TIFF.")
    raw = file.file.read()
    wide = format in ("hdr", "exr", "tiff32")   # 32 bits (1.53.9): float, linear light
    if width <= 0 or height <= 0 or len(raw) != width * height * (16 if wide else 8):
        raise HTTPException(status_code=422, detail="The pixels do not match the size given.")
    img = np.frombuffer(raw, "<f4" if wide else "<u2").reshape(height, width, 4)
    if format == "hdr":   # Radiance holds no alpha
        ok, out = cv2.imencode(".hdr", cv2.cvtColor(np.ascontiguousarray(img[..., :3]), cv2.COLOR_RGB2BGR))
    elif format == "exr":
        from app.services import contained
        data = contained.encode_exr(cv2.cvtColor(np.ascontiguousarray(img), cv2.COLOR_RGBA2BGRA))
        if data is None:
            raise HTTPException(status_code=500, detail="The OpenEXR file could not be written.")
        return Response(data, media_type="image/x-exr")
    else:
        ok, out = cv2.imencode({"png": ".png", "tiff": ".tif", "tiff32": ".tif"}[format], cv2.cvtColor(np.ascontiguousarray(img), cv2.COLOR_RGBA2BGRA))
    if not ok:
        raise HTTPException(status_code=500, detail="The 16-bit file could not be written.")
    return Response(out.tobytes(), media_type={"png": "image/png", "hdr": "image/vnd.radiance", "exr": "image/x-exr"}.get(format, "image/tiff"))


@router.post("/decode-cmyk")
def decode_cmyk(file: UploadFile = File(...)) -> Response:
    """A CMYK picture's ink (1.54.0, the parity plan's H1): C, M, Y, K and alpha, a byte each, then the embedded
    profile's bytes (X-Profile-Bytes long, 0 when none). 204 when the file is not CMYK, so the usual decode goes on."""
    from PIL import Image, UnidentifiedImageError
    data = file.file.read()
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.mode != "CMYK":
                return Response(status_code=204)
            w, h = img.size
            if w > 30000 or h > 30000 or w * h > config.MAX_PIXELS:
                raise HTTPException(status_code=413, detail="The picture is larger than formvis edits in one piece.")
            icc = img.info.get("icc_profile") or b""
            ink = np.asarray(img).reshape(h * w, 4)
    except (UnidentifiedImageError, OSError, ValueError):
        return Response(status_code=204)
    px = np.concatenate([ink, np.full((h * w, 1), 255, np.uint8)], axis=1).astype(np.uint8).tobytes()
    return Response(px + icc, media_type="application/octet-stream", headers={"X-Width": str(w), "X-Height": str(h), "X-Profile-Bytes": str(len(icc))})


@router.post("/encode-cmyk")
def encode_cmyk(file: UploadFile = File(...), width: int = Form(...), height: int = Form(...), format: str = Form("tiff"), quality: int = Form(90), dpi: int = Form(72), icc: UploadFile | None = File(default=None)) -> Response:
    """A CMYK TIFF or JPEG from C, M, Y, K and alpha bytes (1.54.0): alpha lays the ink over paper, the profile embedded."""
    from PIL import Image
    if format not in ("tiff", "jpg"):
        raise HTTPException(status_code=422, detail="CMYK export is TIFF or JPEG.")
    raw = file.file.read()
    if width <= 0 or height <= 0 or len(raw) != width * height * 5:
        raise HTTPException(status_code=422, detail="The pixels do not match the size given.")
    px = np.frombuffer(raw, np.uint8).reshape(height, width, 5).astype(np.float32)
    ink = np.clip(px[..., :4] * (px[..., 4:5] / 255.0) + 0.5, 0, 255).astype(np.uint8)
    img = Image.fromarray(ink, "CMYK")
    out = io.BytesIO()
    extra = {"icc_profile": icc.file.read()} if icc else {}
    if format == "jpg":
        img.save(out, "JPEG", quality=max(1, min(100, quality)), dpi=(dpi, dpi), **extra)
    else:
        img.save(out, "TIFF", compression="tiff_deflate", dpi=(dpi, dpi), **extra)
    return Response(out.getvalue(), media_type="image/jpeg" if format == "jpg" else "image/tiff")


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
