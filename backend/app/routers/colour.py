"""Colour management routes (1.53.5, H2): profiles, adding one, and colour lookup tables."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.services import colour

router = APIRouter(tags=["colour"])


class LutRequest(BaseModel):
    source: dict | None = None
    dest: dict | None = None
    proof: dict | None = None
    intent: str = "relative"
    bpc: bool = True
    proofIntent: str = "relative"
    gamut: bool = False


@router.get("/profiles")
def list_profiles() -> dict:
    return {"profiles": colour.profiles(), "folder": str(colour.profile_dirs()[0])}


@router.post("/profiles")
def add_profile(file: UploadFile = File(...)) -> dict:
    try:
        return colour.add(file.file.read(colour.MAX_BYTES + 1), file.filename or "profile.icc")
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/describe")
def describe_profile(file: UploadFile = File(...)) -> dict:
    try:
        return colour.describe(file.file.read(colour.MAX_BYTES + 1))
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/lut")
def build_lut(req: LutRequest) -> Response:
    try:
        data = colour.lut(req.source, req.dest, req.proof, req.intent, req.bpc, req.proofIntent, req.gamut)
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    n_in, n_out, grid = colour.lut_shape(req.source, req.dest)
    return Response(data, media_type="application/octet-stream", headers={"X-Grid": str(grid), "X-In": str(n_in), "X-Out": str(n_out), "X-Gamut": "1" if req.gamut and req.proof else "0"})


@router.post("/convert-deep")
def convert_deep(file: UploadFile = File(...), mode: str = Form(...), width: int = Form(...), height: int = Form(...), source: str = Form(""), dest: str = Form(""),
                 intent: str = Form("relative"), bpc: bool = Form(True), dither: bool = Form(False), bits: int = Form(16), preserve_black: bool = Form(True)) -> Response:
    """Convert to Profile and mode changes at 16 bits (DEV_PLAN 28.2): float32 channels in, float32 channels out, through
    LittleCMS in double precision and rounded once; `source` and `dest` are base64 ICC text or `id:` followed by a listed id."""
    ref = lambda text: None if not text else {"id": text[3:]} if text.startswith("id:") else {"icc": text}
    try:
        data, space = colour.convert_deep(file.file.read(), width, height, mode, ref(source), ref(dest), intent, bpc, dither, bits, preserve_black)
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(data, media_type="application/octet-stream", headers={"X-Space": space})


class InfoRequest(BaseModel):
    profile: dict | None = None


@router.post("/profile-info")
def profile_info(req: InfoRequest) -> dict:
    try:
        return colour.profile_info(req.profile)
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/convert-ink")
def convert_ink(file: UploadFile = File(...), width: int = Form(...), height: int = Form(...), source: str = Form(...), dest: str = Form(...), intent: str = Form("relative"), preserve_black: bool = Form(True)) -> Response:
    """Convert to Profile in a CMYK document (1.57.9): 8-bit inks (0 no ink, 255 full) from the `source` CMYK profile to
    the `dest` one (both base64 ICC), through LittleCMS by Pillow's ImageCms, with the rendering intent asked. With
    `preserve_black` (the default), pixels inked with black alone stay black alone, their black moved to the value
    of the same lightness under `dest`, as LittleCMS's black-preserving intents do (Pillow reaches only the four
    standard intents, so this is done here); colorimetric conversion would make them four-colour black."""
    import base64
    import io as _io
    import numpy as np
    from PIL import Image, ImageCms
    raw = file.file.read()
    if width <= 0 or height <= 0 or len(raw) != width * height * 4:
        raise HTTPException(status_code=422, detail="The inks do not match the size given.")
    intents = {"perceptual": 0, "relative": 1, "saturation": 2, "absolute": 3}
    try:
        src = ImageCms.ImageCmsProfile(_io.BytesIO(base64.b64decode(source)))
        dst = ImageCms.ImageCmsProfile(_io.BytesIO(base64.b64decode(dest)))
        out = np.frombuffer(ImageCms.profileToProfile(Image.frombytes("CMYK", (width, height), raw), src, dst, renderingIntent=intents.get(intent, 1), outputMode="CMYK").tobytes(), np.uint8).reshape(-1, 4).copy()
        if preserve_black:
            lab = ImageCms.createProfile("LAB")
            ramp = Image.frombytes("CMYK", (256, 1), bytes(np.stack([np.zeros(256), np.zeros(256), np.zeros(256), np.arange(256)], 1).astype(np.uint8).tobytes()))
            light = lambda prof: np.frombuffer(ImageCms.applyTransform(ramp, ImageCms.buildTransform(prof, lab, "CMYK", "LAB")).tobytes(), np.uint8).reshape(-1, 3)[:, 0].astype(np.float64)
            ls, ld = light(src), light(dst)
            order = np.argsort(ld)
            k_of = np.clip(np.round(np.interp(ls, ld[order], np.arange(256)[order])), 0, 255).astype(np.uint8)
            ink = np.frombuffer(raw, np.uint8).reshape(-1, 4)
            only_k = (ink[:, 0] == 0) & (ink[:, 1] == 0) & (ink[:, 2] == 0)
            out[only_k] = 0
            out[only_k, 3] = k_of[ink[only_k, 3]]
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"The inks could not be converted: {exc}") from exc
    return Response(out.tobytes(), media_type="application/octet-stream")


class MatrixRequest(BaseModel):
    source: dict | None = None
    dest: dict | None = None


@router.post("/linear-matrix")
def build_linear_matrix(req: MatrixRequest) -> dict:
    """Convert to Profile at 32 bits (1.57.3): the 3 by 3 matrix between two RGB matrix profiles in linear light."""
    try:
        return {"matrix": colour.linear_matrix(req.source, req.dest)}
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class CmykLutRequest(BaseModel):
    profile: dict
    bpc: bool = True


@router.post("/cmyk-lut")
def build_cmyk_lut(req: CmykLutRequest) -> Response:
    try:
        data = colour.cmyk_lut(req.profile, req.bpc)
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(data, media_type="application/octet-stream", headers={"X-Grid": str(colour.GRID4)})


class RgbCmykLutRequest(BaseModel):
    profile: dict
    source: dict | None = None
    intent: str = "relative"
    bpc: bool = True


@router.post("/rgb-cmyk-lut")
def build_rgb_cmyk_lut(req: RgbCmykLutRequest) -> Response:
    try:
        data = colour.rgb_cmyk_lut(req.profile, req.source, req.intent, req.bpc)
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(data, media_type="application/octet-stream", headers={"X-Grid": str(colour.GRID)})


@router.post("/convert-pixels")
def convert_pixels(file: UploadFile = File(...), width: int = Form(...), height: int = Form(...), to: str = Form(...),
                   profile: str = Form(...), source: str = Form(""), intent: str = Form("relative"), bpc: bool = Form(True)) -> Response:
    try:
        data = colour.convert_pixels(file.file.read(), width, height, to, {"icc": profile}, {"icc": source} if source else None, intent, bpc)
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(data, media_type="application/octet-stream")


@router.get("/default-cmyk")
def default_cmyk() -> dict:
    return {"profile": colour.default_cmyk()}


@router.get("/profiles/{pid}")
def profile_bytes(pid: str) -> Response:
    try:
        return Response(colour._find(pid), media_type="application/vnd.iccprofile")
    except colour.ColourError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
