"""Where local generation keeps its files, in formvis's own data and models folders (formcut's paths and
model_manager stand here), and ONNX Runtime's execution providers, best first."""

import os
from pathlib import Path

from app.core import config

DATA_DIR: Path = config.data_dir()


FOLDER_FILE: Path = DATA_DIR / "models_folder.txt"


def saved_folder() -> str:
    """The helper model folder chosen in Preferences (used at the next engine start); empty when none was chosen."""
    try:
        return FOLDER_FILE.read_text().strip()
    except OSError:
        return ""


def _models() -> Path:
    raw = os.environ.get("FORMVIS_MODELS_DIR") or saved_folder()
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


def session(path) -> "object":
    """An ONNX Runtime session for a local model (1.53.4): the best providers, and the CPU memory arena off. With it on,
    SAM 2.1 and U^2-Net held 2,575 MB after three runs each; off, 687 MB (a peak of 1,314 MB), for a little speed.
    `path` may also be the model's bytes (1.55.1), for a graph patched in memory."""
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.enable_cpu_mem_arena = False
    return ort.InferenceSession(path if isinstance(path, (bytes, bytearray)) else str(path), options, providers=providers())
