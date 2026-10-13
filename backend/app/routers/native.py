from fastapi import APIRouter

from app.services import native

router = APIRouter(prefix="/api/native", tags=["native"])


@router.get("/status")
def native_status() -> dict:
    return native.status()
