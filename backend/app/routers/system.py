from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core import config
from app.services import background, compute, imaging, segment

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/version")
def version() -> dict:
    return {"name": config.APP_NAME, "version": config.VERSION}


def _select_object() -> dict:
    """Click-to-select (SAM 2.1): available when torch and sam2 are installed, and the torch device it would use."""
    if not segment.available():
        return {"available": False, "model": "SAM 2.1 tiny"}
    if segment.backend() == "onnx":   # 1.53.4: nothing to install; the model is fetched on first use
        from app.localgen import model_manager
        return {"available": True, "model": "SAM 2.1 tiny", "device": "onnx", "reason": "ONNX Runtime" if model_manager.ready("sam2-onnx") else "ONNX Runtime; the model (about 155 MB) downloads on first use"}
    device, reason = segment.torch_device()
    return {"available": True, "model": "SAM 2.1 tiny", "device": device, "reason": reason}


@router.get("/capabilities")
def capabilities() -> dict:
    return {
        "name": config.APP_NAME,
        "version": config.VERSION,
        "desktop": config.is_desktop(),
        "decode": imaging.decoders(),
        "removeBackground": background.available(),
        "selectObject": _select_object(),
        "pixelBudget": config.MAX_PIXELS, "memory": config.total_memory(),   # the largest document, from this computer's memory (1.53.4)
        "compute": compute.current(),
        "dataDir": str(config.data_dir()),
    }


class ComputeChoice(BaseModel):
    device: str


@router.get("/compute")
def compute_device() -> dict:
    """The engine's compute device (Phase 18.6): what ONNX Runtime offers, what is chosen and used, and why."""
    return compute.current()


@router.post("/compute")
def set_compute_device(choice: ComputeChoice) -> dict:
    try:
        return compute.set_preference(choice.device)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
