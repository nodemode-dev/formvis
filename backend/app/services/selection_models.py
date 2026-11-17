"""Which model Select Subject and Object Selection run: the recommended one (BiRefNet, SAM 2.1 base-plus) once it is
downloaded, else the small one they always had (U2-Net, SAM 2.1 tiny), which still downloads itself on first use. The
person can keep the small one; the choice is kept in the data folder."""

from __future__ import annotations

import json
import logging
import os
from typing import Literal

from app.core import config
from app.localgen import model_manager

logger = logging.getLogger(__name__)

Kind = Literal["subject", "object"]
Choice = Literal["recommended", "small"]

KINDS: dict[str, dict[str, str]] = {
    "subject": {"recommended": "birefnet-swin-t", "small": "u2net-onnx", "label": "Select Subject"},
    "object": {"recommended": "sam2-base-plus-onnx", "small": "sam2-onnx", "label": "Object Selection"},
}
RECOMMENDED_FROM_BYTES = 12 * 1024 ** 3
_unusable: dict[str, str] = {}


def defaults() -> dict[str, str]:
    """Recommended by default on a computer with 12 GB of memory or more (BiRefNet peaks at about 4.3 GB on a 45 MP
    picture); small below that, or when the memory cannot be read. The person can choose either way."""
    choice = "recommended" if config.total_memory() >= RECOMMENDED_FROM_BYTES else "small"
    return {kind: choice for kind in KINDS}


def _file():
    return config.data_dir() / "selection_models.json"


def preferences() -> dict[str, str]:
    base = defaults()
    try:
        saved = json.loads(_file().read_text(encoding="utf-8"))
    except FileNotFoundError:
        return base
    except (OSError, ValueError) as exc:
        logger.warning("selection_models.json could not be read, using the defaults: %s", exc)
        return base
    if not isinstance(saved, dict):
        logger.warning("selection_models.json does not hold an object, using the defaults")
        return base
    return {k: saved.get(k) if saved.get(k) in ("recommended", "small") else v for k, v in base.items()}


def set_preference(kind: str, choice: str) -> dict[str, str]:
    """The choice saved through a temporary file and os.replace, so a crash mid-write never leaves half a file."""
    if kind not in KINDS or choice not in ("recommended", "small"):
        raise ValueError("kind is subject or object, and choice is recommended or small")
    prefs = {**preferences(), kind: choice}
    target = _file()
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(prefs), encoding="utf-8")
    os.replace(temporary, target)
    return prefs


def mark_unusable(model: str, reason: str) -> None:
    """A recommended model that failed to load: the small one runs instead until the engine restarts, logged once, so a
    broken file is not loaded again on every click."""
    if model not in _unusable:
        logger.warning("%s could not be used, the small model runs instead until the engine restarts: %s", model, reason)
    _unusable[model] = reason


def active(kind: str) -> str:
    """The model id the action runs now: the recommended one when it is chosen, downloaded and loads, else the small one."""
    spec = KINDS[kind]
    best = spec["recommended"]
    if preferences()[kind] == "recommended" and best not in _unusable and model_manager.ready(best):
        return best
    return spec["small"]


def _option(model: str, role: str) -> dict:
    spec = model_manager.MODELS[model]
    return {"id": model, "role": role, "name": spec["name"], "size": spec.get("size"), "license": spec["license"], "ready": model_manager.ready(model)}


def report() -> dict:
    prefs = preferences()
    return {kind: {"label": spec["label"], "choice": prefs[kind], "active": active(kind), "unusable": _unusable.get(spec["recommended"]),
                   "options": [_option(spec["recommended"], "recommended"), _option(spec["small"], "small")]}
            for kind, spec in KINDS.items()}
