"""Relight's light split (1.75.0): a photo taken apart into albedo (the colour of its surfaces), shading (the light that
fell on them) and a residual (shine), so Relight can remove the old light and shade with new lights. Two engines:
marigold, Marigold IID Lighting and Marigold Normals v1.1 (CreativeML Open RAIL++-M, optional downloads, run with
PyTorch and diffusers from requirements_relight.txt); classic, formvis's own split on what the base install carries
(SAM 2.1 regions on ONNX Runtime, Apache-2.0, and an edge-keeping shading estimate)."""
import hashlib
import importlib.util
import io
import json
import threading
from collections import OrderedDict

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from starlette.concurrency import run_in_threadpool

from . import model_manager

IID = "marigold-iid-lighting"
NRM = "marigold-normals"
FOLDERS = {IID: "marigold-iid-lighting-v1-1", NRM: "marigold-normals-v1-1"}
STEPS = 4
WORKING = 768
KEEP = 2

_lock = threading.Lock()
_cache: "OrderedDict[str, tuple]" = OrderedDict()


def runtime_ready() -> bool:
    try:
        return all(importlib.util.find_spec(m) is not None for m in ("torch", "diffusers", "transformers"))
    except (ImportError, ValueError):
        return False


def models_ready() -> bool:
    return model_manager.ready(IID) and model_manager.ready(NRM)


def marigold_ready() -> bool:
    return runtime_ready() and models_ready()


def _lin(rgb: np.ndarray) -> np.ndarray:
    x = rgb.astype(np.float32) / 255.0
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).astype(np.float32)


def _lum(lin: np.ndarray) -> np.ndarray:
    return (0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]).astype(np.float32)


def _box(a: np.ndarray, r: int) -> np.ndarray:
    return cv2.blur(a.astype(np.float32), (2 * r + 1, 2 * r + 1), borderType=cv2.BORDER_REFLECT)


def _guided(guide: np.ndarray, src: np.ndarray, r: int, eps: float) -> np.ndarray:
    mi, mp = _box(guide, r), _box(src, r)
    a = (_box(guide * src, r) - mi * mp) / (_box(guide * guide, r) - mi * mi + eps)
    b = mp - a * mi
    return _box(a, r) * guide + _box(b, r)


def _run_once(kind: str, picture: Image.Image) -> np.ndarray:
    import gc

    import torch
    from diffusers import MarigoldIntrinsicsPipeline, MarigoldNormalsPipeline

    folder = model_manager.model_file(FOLDERS[kind] + "/model_index.json").parent
    cls = MarigoldIntrinsicsPipeline if kind == IID else MarigoldNormalsPipeline
    pipe = cls.from_pretrained(str(folder), variant="fp16", torch_dtype=torch.bfloat16)
    w, h = picture.size
    k = min(1.0, WORKING / max(w, h))
    small = picture.resize((max(8, round(w * k / 8) * 8), max(8, round(h * k / 8) * 8)), Image.Resampling.LANCZOS)
    try:
        with torch.inference_mode():
            pred = _as_array(pipe(small, num_inference_steps=STEPS, processing_resolution=0).prediction)
        return np.stack([cv2.resize(p, (w, h), interpolation=cv2.INTER_CUBIC) for p in pred.reshape(-1, small.size[1], small.size[0], 3)])
    finally:
        del pipe
        gc.collect()


def _as_array(pred) -> np.ndarray:
    if hasattr(pred, "detach"):
        pred = pred.detach().float().cpu().numpy()
    return np.asarray(pred, np.float32)


def _marigold(rgb: np.ndarray) -> tuple:
    picture = Image.fromarray(rgb)
    iid = _run_once(IID, picture)
    nrm = _run_once(NRM, picture).reshape(rgb.shape[0], rgb.shape[1], 3)
    albedo_m, shading_m, residual = iid[0], iid[1], iid[2]
    lin = _lin(rgb)
    size = max(rgb.shape[:2])
    luma = _lum(lin) + 1e-3
    log_y = np.log(luma)
    grey = np.exp(_guided(log_y, np.log(np.clip(shading_m.mean(-1), 1e-3, None)), max(2, size // 300), 0.01))
    tint = np.clip(shading_m / np.clip(shading_m.mean(-1, keepdims=True), 1e-3, None), 0.5, 2.0)
    shading = np.clip(grey, 0.03, None)[..., None] * tint
    detail = np.clip(luma / np.exp(_guided(log_y, log_y, max(2, size // 250), 0.02)), 0.6, 1.6)
    from_model = np.clip(albedo_m * detail[..., None], 0, 1)
    from_photo = np.clip((lin - residual) / np.maximum(shading, 0.02), 0, 1)
    from_photo = np.stack([_guided(log_y, from_photo[..., c], max(1, size // 600), 0.002) for c in range(3)], -1).clip(0, 1)
    level = cv2.GaussianBlur(_lum(from_photo), (0, 0), size / 60) / np.maximum(cv2.GaussianBlur(_lum(from_model), (0, 0), size / 60), 1e-3)
    from_model = np.clip(from_model * np.clip(level, 0.5, 2.0)[..., None], 0, 1)
    trust = np.clip((shading.mean(-1, keepdims=True) - 0.012) / 0.05, 0, 1)
    trust = trust * trust * (3 - 2 * trust)
    albedo = from_photo * trust + from_model * (1 - trust)
    normals = np.stack([nrm[..., 0], -nrm[..., 1], nrm[..., 2]], -1)
    return albedo.astype(np.float32), shading.astype(np.float32), np.clip(residual, 0, 1).astype(np.float32), normals.astype(np.float32)


def _sam_regions(rgb: np.ndarray, key: str) -> np.ndarray | None:
    from app.services import segment

    if not segment.available():
        return None
    h, w = rgb.shape[:2]
    out = io.BytesIO()
    Image.fromarray(rgb).save(out, "PNG")
    try:
        segment.encode(key, out.getvalue())
    except Exception:
        return None
    labels = np.full((h, w), -1, np.int32)
    area = np.full((h, w), np.inf, np.float32)
    cols, rows, n = 6, 8, 0
    for j in range(rows):
        for i in range(cols):
            x, y = (i + 0.5) * w / cols, (j + 0.5) * h / rows
            try:
                with Image.open(io.BytesIO(segment.select(key, [(x, y, 1)]))) as m:
                    mask = np.asarray(m.convert("L")) > 127
            except Exception:
                continue
            mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
            size = float(mask.sum())
            if size < 0.01 * h * w:
                continue
            take = mask & (size < area)
            labels[take] = n
            area[take] = size
            n += 1
    if n == 0:
        return None
    if (labels < 0).any():
        _, nearest = cv2.distanceTransformWithLabels((labels < 0).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        seeds = np.zeros(nearest.max() + 1, np.int32)
        seeds[nearest[labels >= 0]] = labels[labels >= 0]
        labels = np.where(labels < 0, seeds[nearest], labels)
    return labels


def _chroma_regions(lin: np.ndarray) -> np.ndarray:
    chroma = lin / (lin.sum(-1, keepdims=True) + 1e-3)
    feat = (cv2.GaussianBlur(chroma, (0, 0), 2)[..., :2] * 12).reshape(-1, 2).astype(np.float32)
    _, _, centres = cv2.kmeans(feat[::7], 6, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1e-3), 2, cv2.KMEANS_PP_CENTERS)
    return ((feat[:, None, :] - centres[None]) ** 2).sum(-1).argmin(1).reshape(lin.shape[:2]).astype(np.int32)


def _classic(rgb: np.ndarray, key: str) -> tuple:
    lin = _lin(rgb)
    size = max(rgb.shape[:2])
    log_y = np.log(_lum(lin) + 1e-3)
    r = max(2, size // 120)
    smooth = _guided(log_y, log_y, r, 0.02)
    smooth = _guided(smooth, smooth, r, 0.02)
    labels = _sam_regions(rgb, key)
    if labels is None:
        labels = _chroma_regions(lin)
    lit = np.zeros_like(smooth)
    for label in np.unique(labels):
        mask = labels == label
        if mask.sum() < 32:
            lit[mask] = smooth[mask].max()
            continue
        lit[mask] = np.percentile(smooth[mask], 92)
    lit = _guided(log_y, lit, max(2, size // 200), 0.05)
    shading = np.exp(np.clip(smooth - lit, np.log(0.04), 0.15)).astype(np.float32)
    shading3 = np.repeat(shading[..., None], 3, -1)
    albedo = np.clip(lin / shading3, 0, 1)
    return albedo.astype(np.float32), shading3, np.zeros_like(lin), None


def _split(data: bytes, rgb: np.ndarray, engine: str) -> tuple:
    key = hashlib.sha1(data).hexdigest() + engine
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
        result = _marigold(rgb) if engine == "marigold" else _classic(rgb, "relight-" + key)
        _cache[key] = result
        while len(_cache) > KEEP:
            _cache.popitem(last=False)
        return result


def _srgb8(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, 1)
    return (np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055) * 255 + 0.5).astype(np.uint8)


def _fit(a: np.ndarray, w: int, h: int, cubic: bool = False) -> np.ndarray:
    if a.shape[1] == w and a.shape[0] == h:
        return a
    return cv2.resize(a, (w, h), interpolation=cv2.INTER_CUBIC if cubic else cv2.INTER_LINEAR)


def pack(result: tuple, engine: str, w: int, h: int) -> bytes:
    albedo, shading, residual, normals = result
    parts = [_srgb8(_fit(albedo, w, h, True)).tobytes(), _fit(shading, w, h).astype("<f2").tobytes(), _fit(residual, w, h).astype("<f2").tobytes()]
    if normals is not None:
        n = _fit(normals, w, h)
        n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
        parts.append(n.astype("<f2").tobytes())
    head = json.dumps({"engine": engine, "width": w, "height": h, "normals": normals is not None}).encode()
    return len(head).to_bytes(4, "little") + head + b"".join(parts)


router = APIRouter(prefix="/api/relight", tags=["relight"])


@router.get("/engines")
def engines() -> dict:
    from app.services import segment

    return {"marigold": marigold_ready(), "marigoldModels": models_ready(), "marigoldRuntime": runtime_ready(), "classic": True, "regions": "sam" if segment.available() else "colour",
            "license": "CreativeML Open RAIL++-M", "downloadGB": 5.2}


@router.post("/split")
async def split(image: UploadFile = File(...), engine: str = "auto", width: int = 0, height: int = 0) -> Response:
    if engine not in ("auto", "marigold", "classic"):
        raise HTTPException(400, "engine is auto, marigold or classic")
    use = "marigold" if engine in ("auto", "marigold") and marigold_ready() else "classic"
    if engine == "marigold" and use != "marigold":
        raise HTTPException(409, "Marigold is not installed: download its models from Relight, and install requirements_relight.txt in the engine.")
    data = await image.read()
    try:
        with Image.open(io.BytesIO(data)) as picture:
            rgb = np.asarray(picture.convert("RGB"))
    except Exception:
        raise HTTPException(400, "The picture could not be read")
    w, h = (width, height) if 0 < width <= 16384 and 0 < height <= 16384 else (rgb.shape[1], rgb.shape[0])
    result = await run_in_threadpool(_split, data, rgb, use)
    body = await run_in_threadpool(pack, result, use, w, h)
    return Response(body, media_type="application/octet-stream")
