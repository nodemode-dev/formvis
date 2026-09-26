"""Click-to-select (the Object Selection tool): Meta's SAM 2.1 (Apache-2.0; github.com/facebookresearch/sam2, installed
from commit 2b90b9f) with the tiny checkpoint, on torch. An image is encoded once under a key the caller chooses (a layer
and its revision) and the embedding kept; each click then runs only the prompt decoder. Measured on one CPU core: encoding
3.4 s and 925 MB at peak, a click 0.11 s. Optional, like the background model: without torch and sam2 the engine says so.
"""

from __future__ import annotations

import hashlib
import io
import threading
import urllib.request
from collections import OrderedDict
from pathlib import Path

from PIL import Image

from app.core import config

CHECKPOINT = "sam2.1_hiera_tiny.pt"
CHECKPOINT_URL = "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt"
CHECKPOINT_SHA256 = "7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69"
MODEL_CONFIG = "configs/sam2.1/sam2.1_hiera_t.yaml"
KEEP = 4  # embeddings kept (about 4 MB each), newest last

_lock = threading.Lock()
_predictor = None
_device: str | None = None
_embeddings: OrderedDict[str, dict] = OrderedDict()


class SegmentError(Exception):
    pass


def model_dir() -> Path:
    """Where the checkpoint is kept: SONNY_MODELS_DIR if set (so tests and several data folders share one download),
    else Models/sam2 in the data folder."""
    import os

    raw = os.environ.get("SONNY_MODELS_DIR")
    path = (Path(raw).expanduser() if raw else config.data_dir() / "Models") / "sam2"
    path.mkdir(parents=True, exist_ok=True)
    return path


def available() -> bool:
    try:
        import sam2  # noqa: F401
        import torch  # noqa: F401

        return True
    except Exception:
        return False


def torch_device() -> tuple[str, str]:
    """The torch device for the engine's compute choice (services/compute.py), and why: CUDA where torch has it, Apple's
    MPS for Metal, else the CPU; a chosen device that is not there falls back to the CPU and says so."""
    import torch

    from app.services import compute

    pref = compute.current().get("preference", "auto")
    cuda, mps = torch.cuda.is_available(), bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
    if pref in ("auto", "cuda") and cuda:
        return "cuda", "CUDA"
    if pref in ("auto", "metal") and mps:
        return "mps", "Metal (MPS)"
    if pref in ("cuda", "metal"):
        return "cpu", f"{'CUDA' if pref == 'cuda' else 'Metal'} is chosen, but torch here cannot use it, so the CPU"
    return "cpu", "CPU"


def ensure_checkpoint() -> Path:
    """The SAM 2.1 tiny checkpoint, downloaded from Meta once and refused unless its SHA-256 matches."""
    path = model_dir() / CHECKPOINT
    if path.exists() and _sha256(path) == CHECKPOINT_SHA256:
        return path
    part = path.with_suffix(".part")
    try:
        with urllib.request.urlopen(CHECKPOINT_URL, timeout=60) as r, open(part, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    except Exception as exc:
        part.unlink(missing_ok=True)
        raise SegmentError(f"Could not download the SAM 2.1 model: {exc}") from exc
    if _sha256(part) != CHECKPOINT_SHA256:
        part.unlink(missing_ok=True)
        raise SegmentError("The downloaded SAM 2.1 model did not match its published checksum, so it was not used.")
    part.replace(path)
    return path


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def _get_predictor():
    global _predictor, _device
    device, _ = torch_device()
    if _predictor is None or _device != device:
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        _predictor = SAM2ImagePredictor(build_sam2(MODEL_CONFIG, str(ensure_checkpoint()), device=device))
        _device = device
        _embeddings.clear()
    return _predictor


def clear() -> None:
    """Drop the model and every embedding (the compute device changed)."""
    global _predictor, _device
    with _lock:
        _predictor, _device = None, None
        _embeddings.clear()


def has(key: str) -> bool:
    return key in _embeddings


def encode(key: str, data: bytes) -> tuple[int, int]:
    """Encodes the image under `key` (a layer and its revision); returns its size."""
    if not available():
        raise SegmentError("Click-to-select needs the engine's AI extras (./sonny install-ml).")
    import numpy as np
    import torch

    try:
        with Image.open(io.BytesIO(data)) as im:
            rgb = np.array(im.convert("RGB"))
    except Exception as exc:
        raise SegmentError(f"The image could not be read: {exc}") from exc
    with _lock:
        pred = _get_predictor()
        with torch.inference_mode():
            pred.set_image(rgb)
        _embeddings[key] = {"features": pred._features, "orig_hw": pred._orig_hw, "size": (rgb.shape[1], rgb.shape[0])}
        _embeddings.move_to_end(key)
        while len(_embeddings) > KEEP:
            _embeddings.popitem(last=False)
    return rgb.shape[1], rgb.shape[0]


def select(key: str, points: list[tuple[float, float, int]]) -> bytes:
    """The object at the clicked points of the image encoded under `key`, as a grey PNG mask: each point (x, y, 1) is on
    the object and (x, y, 0) not on it; of SAM's three proposals the one it scores highest."""
    import numpy as np
    import torch

    if not points:
        raise SegmentError("Click on the object to select.")
    with _lock:
        entry = _embeddings.get(key)
        if entry is None:
            raise KeyError(key)
        _embeddings.move_to_end(key)
        pred = _get_predictor()
        pred._features, pred._orig_hw, pred._is_image_set = entry["features"], entry["orig_hw"], True
        coords = np.array([[x, y] for x, y, _ in points], dtype=np.float32)
        labels = np.array([1 if on else 0 for _, _, on in points], dtype=np.int32)
        with torch.inference_mode():
            masks, scores, _ = pred.predict(point_coords=coords, point_labels=labels, multimask_output=len(points) == 1)
    mask = masks[int(np.argmax(scores))] > 0
    out = io.BytesIO()
    Image.fromarray((mask * 255).astype("uint8"), "L").save(out, "PNG")
    return out.getvalue()
