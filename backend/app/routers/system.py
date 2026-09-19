from fastapi import APIRouter

from app.core import config
from app.services import background, imaging

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/version")
def version() -> dict:
    return {"name": config.APP_NAME, "version": config.VERSION}


@router.get("/capabilities")
def capabilities() -> dict:
    return {
        "name": config.APP_NAME,
        "version": config.VERSION,
        "desktop": config.is_desktop(),
        "decode": imaging.decoders(),
        "removeBackground": background.available(),
        "dataDir": str(config.data_dir()),
    }
