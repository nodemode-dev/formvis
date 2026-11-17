"""Which model Select Subject and Object Selection run: the recommended one (BiRefNet, SAM 2.1 base-plus) once it is
downloaded, else the small one they always had (U2-Net, SAM 2.1 tiny), which still downloads itself on first use. The
person can keep the small one; the choice is kept in the data folder."""

from __future__ import annotations

import json
import logging
from typing import Literal

from app.core import config
from app.localgen import model_manager

logger = logging.getLogger(__name__)

Kind = Literal["subject", "object"]
Choice = Literal["recommended", "small"]

KINDS: dict[str, dict[str, str]] = {
    "subject": {"recommended": "birefnet-general", "small": "u2net-onnx", "label": "Select Subject"},
    "object": {"recommended": "sam2-base-plus-onnx", "small": "sam2-onnx", "label": "Object Selection"},
}
DEFAULTS: dict[str, str] = {"subject": "recommended", "object": "recommended"}


def _file():
    return config.data_dir() / "selection_models.json"


def preferences() -> dict[str, str]:
    try:
        saved = json.loads(_file().read_text(encoding="utf-8"))
    except FileNotFoundError:
        return dict(DEFAULTS)
    except (OSError, ValueError) as exc:
        logger.warning("selection_models.json could not be read, using the defaults: %s", exc)
        return dict(DEFAULTS)
    return {k: saved.get(k) if saved.get(k) in ("recommended", "small") else v for k, v in DEFAULTS.items()}


def set_preference(kind: str, choice: str) -> dict[str, str]:
    if kind not in KINDS or choice not in ("recommended", "small"):
        raise ValueError("kind is subject or object, and choice is recommended or small")
    prefs = {**preferences(), kind: choice}
    _file().write_text(json.dumps(prefs), encoding="utf-8")
    return prefs


def active(kind: str) -> str:
    """The model id the action runs now: the recommended one when it is chosen and downloaded, else the small one."""
    spec = KINDS[kind]
    if preferences()[kind] == "recommended" and model_manager.ready(spec["recommended"]):
        return spec["recommended"]
    return spec["small"]


def _option(model: str, role: str) -> dict:
    spec = model_manager.MODELS[model]
    return {"id": model, "role": role, "name": spec["name"], "size": spec.get("size"), "license": spec["license"], "ready": model_manager.ready(model)}


def report() -> dict:
    prefs = preferences()
    return {kind: {"label": spec["label"], "choice": prefs[kind], "active": active(kind),
                   "options": [_option(spec["recommended"], "recommended"), _option(spec["small"], "small")]}
            for kind, spec in KINDS.items()}
