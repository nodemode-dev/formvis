from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.services import generative

router = APIRouter(tags=["generative"])
MAX_BYTES = 60 * 1024 * 1024


class KeyBody(BaseModel):
    key: str


@router.get("/status")
def status() -> dict:
    return generative.status()


@router.put("/key")
def save_key(body: KeyBody) -> dict:
    try:
        return generative.save_key(body.key)
    except generative.GenerativeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@router.delete("/key")
def forget_key() -> dict:
    return generative.forget_key()


@router.post("/fill")
async def fill(image: UploadFile = File(...), mask: UploadFile = File(...), prompt: str = Form(""), seed: int | None = Form(None)) -> Response:
    image_bytes, mask_bytes = await image.read(MAX_BYTES + 1), await mask.read(MAX_BYTES + 1)
    if len(image_bytes) > MAX_BYTES or len(mask_bytes) > MAX_BYTES:
        raise HTTPException(413, "The area is too large to send for Generative Fill.")
    try:
        png = await run_in_threadpool(generative.fill, image_bytes, mask_bytes, prompt, seed)
    except generative.GenerativeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return Response(png, media_type="image/png")


@router.post("/generate")
async def generate(prompt: str = Form(""), width: int = Form(1024), height: int = Form(1024), seed: int | None = Form(None)) -> Response:
    """Generate Image (1.51.2): a picture from a prompt alone through fal, as PNG."""
    try:
        png = await run_in_threadpool(generative.generate, prompt, width, height, seed)
    except generative.GenerativeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return Response(png, media_type="image/png")


@router.post("/upscale")
async def upscale(image: UploadFile = File(...), scale: int = Form(2)) -> Response:
    image_bytes = await image.read(MAX_BYTES + 1)
    if len(image_bytes) > MAX_BYTES:
        raise HTTPException(413, "The image is too large to send for upscaling.")
    try:
        png = await run_in_threadpool(generative.upscale, image_bytes, scale)
    except generative.GenerativeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return Response(png, media_type="image/png")
