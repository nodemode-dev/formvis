"""Where local generation keeps its files, in formvis's own data and models folders (formcut's paths and
model_manager stand here), and ONNX Runtime's execution providers, best first."""

import os
from pathlib import Path

from app.core import config

DATA_DIR: Path = config.data_dir()


def _models() -> Path:
    raw = os.environ.get("FORMVIS_MODELS_DIR")
    path = Path(raw).expanduser().resolve() if raw else DATA_DIR / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


MODELS_DIR: Path = _models()
ROOT = MODELS_DIR
PROVIDERS = ("CoreMLExecutionProvider", "DmlExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider")


def providers() -> list[str]:
    import onnxruntime as ort
    available = ort.get_available_providers()
    return [name for name in PROVIDERS if name in available] or ["CPUExecutionProvider"]
