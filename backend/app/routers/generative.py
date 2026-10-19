from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.services import generative, providers

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
async def fill(image: UploadFile = File(...), mask: UploadFile = File(...), prompt: str = Form(""), provider: str = Form("fal"), seed: int | None = Form(None)) -> Response:
    image_bytes, mask_bytes = await image.read(MAX_BYTES + 1), await mask.read(MAX_BYTES + 1)
    if len(image_bytes) > MAX_BYTES or len(mask_bytes) > MAX_BYTES:
        raise HTTPException(413, "The area is too large to send for Generative Fill.")
    try:
        if provider == "fal":
            png = await run_in_threadpool(generative.fill, image_bytes, mask_bytes, prompt, seed)
        else:
            png = await run_in_threadpool(providers.fill, provider, image_bytes, mask_bytes, prompt)   # 1.58.4
    except generative.GenerativeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return Response(png, media_type="image/png")


@router.post("/generate")
async def generate(prompt: str = Form(""), width: int = Form(1024), height: int = Form(1024), provider: str = Form("fal"), seed: int | None = Form(None)) -> Response:
    """Generate Image (1.51.2): a picture from a prompt alone, as PNG; by fal or (1.58.4) another provider. `seed` is used by fal only."""
    try:
        if provider == "fal":
            png = await run_in_threadpool(generative.generate, prompt, width, height, seed)
        else:
            png = await run_in_threadpool(providers.generate, provider, prompt, width, height)
    except generative.GenerativeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    return Response(png, media_type="image/png")


@router.get("/providers")
def providers_status() -> list[dict]:
    """The providers beside fal (1.58.4, L7): which have keys (never the keys)."""
    return providers.status()


@router.put("/providers/{pid}/key")
def provider_key(pid: str, body: KeyBody) -> list[dict]:
    try:
        return providers.save_key(pid, body.key)
    except generative.GenerativeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@router.delete("/providers/{pid}/key")
def provider_forget(pid: str) -> list[dict]:
    try:
        return providers.forget_key(pid)
    except generative.GenerativeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


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
