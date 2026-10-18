"""Relight's light split (1.75.0): a photo taken apart into albedo (the colour of its surfaces), shading (the light that
fell on them) and a residual (shine), so Relight can remove the old light and shade with new lights. Two engines:
marigold, Marigold IID Lighting and Marigold Normals v1.1 (CreativeML Open RAIL++-M, optional downloads, run with
PyTorch and diffusers from requirements_relight.txt); classic (1.76.0, "keep the subject"), formvis's own split that
never replaces a pixel's detail: the albedo is the photo divided by a smooth shading field estimated per material
(MediaPipe selfie multiclass parts and YuNet faces, as formlit 0.45.3 masks people, both Apache-2.0 or MIT), so every
pore, eye and edge of the original survives and only the light changes."""
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
KEEP_SIDE = 1024
PARTS = "selfie-multiclass"
PARTS_FILE = "selfie-multiclass/model.onnx"

_lock = threading.Lock()
_parts_session = None
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


def _blur(a: np.ndarray, sigma: float) -> np.ndarray:
    return cv2.GaussianBlur(a.astype(np.float32), (0, 0), max(0.5, float(sigma)))


def _faces(rgb: np.ndarray) -> list[dict]:
    if not model_manager.ready("yunet-face"):
        return []
    from .face import find_faces

    try:
        return find_faces(Image.fromarray(rgb))
    except Exception:
        return []


def _materials(rgb: np.ndarray, lin: np.ndarray) -> tuple[np.ndarray, int]:
    h, w = rgb.shape[:2]
    if model_manager.ready(PARTS):
        global _parts_session
        try:
            if _parts_session is None:
                import onnxruntime as ort

                _parts_session = ort.InferenceSession(str(model_manager.model_file(PARTS_FILE)), providers=["CPUExecutionProvider"])
            x = cv2.resize(rgb, (256, 256), interpolation=cv2.INTER_AREA).astype(np.float32)[None] / 255
            lg = _parts_session.run(None, {_parts_session.get_inputs()[0].name: x})[0][0]
            e = np.exp(lg - lg.max(-1, keepdims=True))
            p = cv2.resize((e / e.sum(-1, keepdims=True)).astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
            p = np.stack([p[..., 0], p[..., 1], p[..., 2] + p[..., 3], p[..., 4] + p[..., 5]], -1)
            guide = np.sqrt(np.clip(_lum(lin), 0, 1)).astype(np.float32)
            p = np.stack([_guided(guide, p[..., c], max(2, max(h, w) // 150), 1e-3) for c in range(4)], -1).clip(0, 1)
            return p / (p.sum(-1, keepdims=True) + 1e-5), 2
        except Exception:
            pass
    chroma = lin / (lin.sum(-1, keepdims=True) + 1e-3)
    feat = (_blur(chroma, 2)[..., :2] * 12).reshape(-1, 2).astype(np.float32)
    _, _, centres = cv2.kmeans(feat[::7], 5, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1e-3), 2, cv2.KMEANS_PP_CENTERS)
    labels = ((feat[:, None, :] - centres[None]) ** 2).sum(-1).argmin(1).reshape(h, w)
    p = np.stack([_blur((labels == c).astype(np.float32), max(h, w) / 400) for c in range(5)], -1)
    return p / (p.sum(-1, keepdims=True) + 1e-5), -1


def _features(rgb: np.ndarray, faces: list[dict], skin: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    feat = np.zeros((h, w), np.float32)
    astar = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[..., 1].astype(np.float32) - 128
    for f in faces:
        fw = f["box"][2]
        for ex, ey in (f["eyeLeft"], f["eyeRight"]):
            feat = np.maximum(feat, np.clip(1.4 - np.hypot((xx - ex) / (fw * 0.16), (yy - ey + fw * 0.05) / (fw * 0.13)), 0, 1))
        mx, my = (f["mouthLeft"][0] + f["mouthRight"][0]) / 2, (f["mouthLeft"][1] + f["mouthRight"][1]) / 2
        mouth = np.clip(1.4 - np.hypot((xx - mx) / (fw * 0.26), (yy - my) / (fw * 0.12)), 0, 1)
        plain = (skin > 0.7) & (mouth == 0)
        ref = float(np.median(astar[plain])) if plain.any() else 10.0
        feat = np.maximum(feat, mouth * np.clip((astar - ref - 3) / 6, 0, 1))
    return np.clip(feat, 0, 1)


def _shading(rgb: np.ndarray, lin: np.ndarray, faces: list[dict], mats: np.ndarray, skin: int) -> np.ndarray:
    h, w = rgb.shape[:2]
    s = max(h, w)
    log_y = np.log(_lum(lin) + 2e-3).astype(np.float32)
    fw = max([f["box"][2] for f in faces], default=s / 6)
    feat = _features(rgb, faces, mats[..., skin] if skin >= 0 else np.zeros((h, w), np.float32))
    kc = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(fw / 12) | 1,) * 2)
    ko = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(fw / 18) | 1,) * 2)
    total = np.zeros((h, w), np.float32)
    weight = np.zeros((h, w), np.float32)
    for k in range(mats.shape[-1]):
        g = np.clip(mats[..., k], 0, 1)
        if g.sum() < 50:
            continue
        sigma = fw / 5 if (k == skin or skin < 0) and faces else s / 45
        wgt = np.clip(g * g * (1 - feat if k == skin or skin < 0 else 1), 0, 1)
        fill = _blur(log_y * wgt, fw / 12) / (_blur(wgt, fw / 12) + 1e-5)
        hard = (wgt > 0.5).astype(np.float32)
        plain = (log_y * hard + fill * (1 - hard)).astype(np.float32)
        base = cv2.morphologyEx(cv2.morphologyEx(plain, cv2.MORPH_CLOSE, kc), cv2.MORPH_OPEN, ko)
        small = cv2.resize(base, (max(1, w // 2), max(1, h // 2)), interpolation=cv2.INTER_AREA)
        for _ in range(4):
            small = cv2.bilateralFilter(small, -1, 0.35, sigma / 2)
        est = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
        est = _guided(plain, est, max(2, int(fw / 8)), 0.01)
        gap = base - est
        est = est + _blur(np.sign(gap) * np.maximum(np.abs(gap) - 0.2, 0), 1.5)
        core = g > 0.6
        level = float(np.percentile(est[core], 96)) if core.sum() > 100 else float(est.max())
        total += g * (est - level)
        weight += g
    shade = _blur(total / (weight + 1e-5), s / 400)
    return np.exp(np.clip(shade, np.log(0.02), np.log(1.25))).astype(np.float32)


def _normals(rgb: np.ndarray, faces: list[dict], mats: np.ndarray, skin: int) -> np.ndarray | None:
    from . import depth

    h, w = rgb.shape[:2]
    s = max(h, w)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx, ny, nz = np.zeros((h, w), np.float32), np.zeros((h, w), np.float32), np.ones((h, w), np.float32)
    if model_manager.ready("depth-anything-v2-small"):
        d = _blur(depth.depth_values(Image.fromarray(rgb), w, h), 2) * 0.7 * s
        gy, gx = np.gradient(d)
        keep = cv2.erode((np.hypot(gx, gy) < 1.2).astype(np.float32), np.ones((5, 5), np.uint8))
        r = max([f["box"][2] for f in faces], default=s / 26) / 5
        ws = _blur(keep, r) + 1e-4
        gx, gy = _blur(gx * keep, r) / ws, _blur(gy * keep, r) / ws
        n = np.sqrt(gx * gx + gy * gy + 1)
        nx, ny, nz = -gx / n, -gy / n, 1 / n
    elif not faces:
        return None
    head = mats[..., 1] + mats[..., skin] if skin >= 0 else np.ones((h, w), np.float32)
    for f in faces:
        x, y, fw, fh = f["box"]
        u, v = (xx - x - fw / 2) / (fw * 0.62), (yy - y - fh * 0.42) / (fh * 0.78)
        q = np.clip(1 - u * u - v * v, 0, 1)
        t = np.clip(q / 0.6, 0, 1)
        wgt = _blur(t * t * (3 - 2 * t) * np.clip(head, 0, 1), fw / 6)
        nx, ny = nx * (1 - wgt) + u * 0.9 * wgt, ny * (1 - wgt) + v * 0.9 * wgt
        nz = nz * (1 - wgt) + np.sqrt(np.clip(1 - 0.81 * (u * u + v * v), 0.02, 1)) * wgt
    return np.stack([nx, ny, nz], -1).astype(np.float32)


def _classic(rgb: np.ndarray) -> tuple:
    full = _lin(rgb)
    h, w = rgb.shape[:2]
    k = min(1.0, KEEP_SIDE / max(h, w))
    small = rgb if k == 1.0 else cv2.resize(rgb, (max(1, round(w * k)), max(1, round(h * k))), interpolation=cv2.INTER_AREA)
    lin = _lin(small)
    faces = [{**f, "box": [v * k for v in f["box"]], **{n: (f[n][0] * k, f[n][1] * k) for n in ("eyeLeft", "eyeRight", "nose", "mouthLeft", "mouthRight")}} for f in _faces(rgb)]
    mats, skin = _materials(small, lin)
    shading = _shading(small, lin, faces, mats, skin)
    normals = _normals(small, faces, mats, skin)
    if k != 1.0:
        shading = np.exp(_guided(np.log(_lum(full) + 2e-3).astype(np.float32), np.log(_fit(shading, w, h)), 2, 0.01)).clip(0.02, 1.25)
    shading3 = np.repeat(shading[..., None].astype(np.float32), 3, -1)
    albedo = np.clip(full / shading3, 0, 1)
    dark = np.clip((0.45 - shading) / 0.35, 0, 1)[..., None]
    la = np.log(albedo + 2e-3)
    clean = np.exp(np.stack([_guided(la[..., c], la[..., c], 3, 1e-2) for c in range(3)], -1)) - 2e-3
    grey = _lum(clean)[..., None]
    calm = grey * (_blur(clean, 3) / (_lum(_blur(clean, 3))[..., None] + 1e-4))
    albedo = np.clip(albedo * (1 - dark) + (clean * (1 - dark) + calm * dark) * dark, 0, 1).astype(np.float32)
    residual = (full - albedo * shading3).astype(np.float32)
    return albedo, shading3, residual, normals


def _split(data: bytes, rgb: np.ndarray, engine: str) -> tuple:
    key = hashlib.sha1(data).hexdigest() + engine + str(model_manager.ready(PARTS)) + str(model_manager.ready("yunet-face"))
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
        result = _marigold(rgb) if engine == "marigold" else _classic(rgb)
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
    return {"marigold": marigold_ready(), "marigoldModels": models_ready(), "marigoldRuntime": runtime_ready(), "classic": True,
            "regions": "parts" if model_manager.ready(PARTS) else "colour", "faces": model_manager.ready("yunet-face"),
            "license": "CreativeML Open RAIL++-M", "downloadGB": 5.2}


@router.post("/split")
async def split(image: UploadFile = File(...), engine: str = "auto", width: int = 0, height: int = 0) -> Response:
    if engine not in ("auto", "marigold", "classic"):
        raise HTTPException(400, "engine is auto, marigold or classic")
    use = "marigold" if engine == "marigold" and marigold_ready() else "classic"
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
