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
    """Where the checkpoint is kept: FORMVIS_MODELS_DIR if set (so tests and several data folders share one download),
    else Models/sam2 in the data folder."""
    import os

    from app.localgen import paths

    raw = os.environ.get("FORMVIS_MODELS_DIR") or paths.saved_folder()
    path = (Path(raw).expanduser() if raw else config.data_dir() / "Models") / "sam2"
    path.mkdir(parents=True, exist_ok=True)
    return path


def torch_available() -> bool:
    """Whether torch and sam2 are installed: found without importing them (1.50.3), so the capability report answers at
    once; importing torch took seconds on a cold engine, and a caller's short timeout read that as unavailable."""
    import importlib.util

    try:
        return importlib.util.find_spec("sam2") is not None and importlib.util.find_spec("torch") is not None
    except (ImportError, ValueError):
        return False


def onnx_available() -> bool:
    """1.53.4: SAM 2.1 on ONNX Runtime, part of the base install, its model fetched on first use (nothing to install)."""
    import importlib.util

    try:
        return importlib.util.find_spec("onnxruntime") is not None
    except (ImportError, ValueError):
        return False


def available() -> bool:
    return torch_available() or onnx_available()


def backend() -> str:
    """torch when installed (it can use the GPU), else ONNX Runtime."""
    return "torch" if torch_available() else "onnx"


# SAM 2.1 on ONNX Runtime (1.53.4): the image processor's steps (1024 x 1024, 0 to 1, ImageNet mean and deviation).
_MEAN = (0.485, 0.456, 0.406)
_STD = (0.229, 0.224, 0.225)


def _onnx_sessions():
    from app.localgen import jobs, model_manager
    from app.localgen.paths import providers, session as onnx_session
    import onnxruntime as ort
    import time

    from app.localgen import sessions

    def load():
        if not model_manager.ready("sam2-onnx"):   # fetched on first use, pinned to its checksums
            job = model_manager.start_download("sam2-onnx")
            while True:
                state = jobs.status(job["job_id"])
                if state["status"] in ("done", "error", "failed", "cancelled"):
                    break
                time.sleep(0.25)
            if not model_manager.ready("sam2-onnx"):
                raise SegmentError(f"The selection model (SAM 2.1, about 155 MB) could not be downloaded: {state.get('error') or state.get('message') or 'check the connection'}.")
        folder = "sam2.1-hiera-tiny/"
        return (onnx_session(model_manager.model_file(folder + "vision_encoder.onnx")),
                onnx_session(model_manager.model_file(folder + "prompt_encoder_mask_decoder.onnx")))
    return sessions.get("sam2", load)   # held with the other local models, at most two at a time


def _onnx_encode(rgb):
    import numpy as np
    enc, _ = _onnx_sessions()
    im = np.asarray(Image.fromarray(rgb).resize((1024, 1024), Image.Resampling.BILINEAR), np.float32) / 255.0
    im = (im - np.array(_MEAN, np.float32)) / np.array(_STD, np.float32)
    outs = enc.run(None, {"pixel_values": im.transpose(2, 0, 1)[None].astype(np.float32)})
    return {f"image_embeddings.{i}": outs[i] for i in range(3)}


def _onnx_select(entry, points, box):
    import cv2
    import numpy as np
    _, dec = _onnx_sessions()
    w, h = entry["size"]
    sx, sy = 1024.0 / w, 1024.0 / h
    pts = [[x * sx, y * sy] for x, y, _ in points] or [[0.0, 0.0]]
    labels = [1 if on else 0 for _, _, on in points] or [-1]   # -1: no point (a box alone)
    boxes = np.array([[[box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy]]], np.float32) if box is not None else np.zeros((1, 0, 4), np.float32)
    feeds = {"input_points": np.array([[pts]], np.float32), "input_labels": np.array([[labels]], np.int64), "input_boxes": boxes, **entry["onnx"]}
    iou, masks, _ = dec.run(None, feeds)
    best = masks[0, 0, int(np.argmax(iou[0, 0]))]
    return cv2.resize(best.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR) > 0


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
        raise SegmentError("Click-to-select needs ONNX Runtime in the engine (reinstall with ./formvis install).")
    import numpy as np

    try:
        with Image.open(io.BytesIO(data)) as im:
            rgb = np.array(im.convert("RGB"))
    except Exception as exc:
        raise SegmentError(f"The image could not be read: {exc}") from exc
    with _lock:
        if backend() == "onnx":
            _embeddings[key] = {"onnx": _onnx_encode(rgb), "size": (rgb.shape[1], rgb.shape[0])}
        else:
            import torch
            pred = _get_predictor()
            with torch.inference_mode():
                pred.set_image(rgb)
            _embeddings[key] = {"features": pred._features, "orig_hw": pred._orig_hw, "size": (rgb.shape[1], rgb.shape[0])}
        _embeddings.move_to_end(key)
        while len(_embeddings) > KEEP:
            _embeddings.popitem(last=False)
    return rgb.shape[1], rgb.shape[0]


def select(key: str, points: list[tuple[float, float, int]], box: tuple[float, float, float, float] | None = None) -> bytes:
    """The object at the clicked points of the image encoded under `key`, and within `box` (x0, y0, x1, y1) when given, as a
    grey PNG mask: each point (x, y, 1) is on the object and (x, y, 0) not on it; of SAM's proposals the one it scores highest."""
    import numpy as np

    if not points and box is None:   # a box alone will do (Object Selection's box mode)
        raise SegmentError("Click on the object to select, or drag a box round it.")
    with _lock:
        entry = _embeddings.get(key)
        if entry is None:
            raise KeyError(key)
        _embeddings.move_to_end(key)
        if "onnx" in entry:
            mask = _onnx_select(entry, points, box)
            out = io.BytesIO()
            Image.fromarray((mask * 255).astype("uint8"), "L").save(out, "PNG")
            return out.getvalue()
        import torch
        pred = _get_predictor()
        pred._features, pred._orig_hw, pred._is_image_set = entry["features"], entry["orig_hw"], True
        # Points, a box (Object Selection's box mode, 1.49.10), or both, as SAM takes them.
        coords = np.array([[x, y] for x, y, _ in points], dtype=np.float32) if points else None
        labels = np.array([1 if on else 0 for _, _, on in points], dtype=np.int32) if points else None
        rect = np.array(box, dtype=np.float32) if box is not None else None
        with torch.inference_mode():
            masks, scores, _ = pred.predict(point_coords=coords, point_labels=labels, box=rect, multimask_output=len(points) == 1 and rect is None)
    mask = masks[int(np.argmax(scores))] > 0
    out = io.BytesIO()
    Image.fromarray((mask * 255).astype("uint8"), "L").save(out, "PNG")
    return out.getvalue()
