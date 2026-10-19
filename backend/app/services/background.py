import importlib.util
import io
import os
from functools import lru_cache

from PIL import Image

from app.core import config


class BackgroundError(Exception):
    pass


class Unavailable(BackgroundError):
    pass


def _has(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ValueError, AttributeError):
        return False


def model_name() -> str:
    return os.environ.get("FORMVIS_REMBG_MODEL", "u2net")


def available() -> dict:
    ml = _has("onnxruntime")   # 1.53.4: rembg when installed, else U^2-Net on ONNX Runtime directly (nothing to install)
    lite = _has("cv2")
    return {"ml": ml, "lite": lite, "default": "ml" if ml else ("lite" if lite else None), "model": model_name()}


@lru_cache(maxsize=2)
def _session(model: str, providers: tuple[str, ...] = ()):
    from rembg import new_session

    # The engine's compute device (services/compute.py); an older rembg without the providers argument uses its default.
    try:
        return new_session(model, providers=list(providers)) if providers else new_session(model)
    except TypeError:
        return new_session(model)


def clear_sessions() -> None:
    """Drop the cached model sessions (the compute device changed)."""
    _session.cache_clear()


def _u2net_onnx(image: Image.Image) -> Image.Image:
    """rembg's U^2-Net steps, run directly (1.53.4): 320 x 320 (Lanczos), scaled by the maximum, ImageNet-normalized;
    the output min-max normalized and resized back (Lanczos). The model comes through the model manager, pinned."""
    import time

    import numpy as np
    import onnxruntime as ort

    from app.localgen import jobs, model_manager
    from app.localgen.paths import providers, session as onnx_session
    from app.localgen import sessions

    def load():
        if not model_manager.ready("u2net-onnx"):
            job = model_manager.start_download("u2net-onnx")
            while jobs.status(job["job_id"])["status"] not in ("done", "error", "failed", "cancelled"):
                time.sleep(0.25)
            if not model_manager.ready("u2net-onnx"):
                raise BackgroundError("The background model (U2-Net, about 176 MB) could not be downloaded: check the connection.")
        return onnx_session(model_manager.model_file("u2net.onnx"))
    session = sessions.get("u2net", load)
    im = np.array(image.convert("RGB").resize((320, 320), Image.Resampling.LANCZOS)).astype(np.float64)
    im = im / max(np.max(im), 1e-6)
    x = np.stack([(im[:, :, c] - m) / d for c, (m, d) in enumerate(zip((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)))])[None].astype(np.float32)
    pred = session.run(None, {session.get_inputs()[0].name: x})[0][:, 0, :, :]
    pred = np.squeeze((pred - pred.min()) / max(pred.max() - pred.min(), 1e-6))
    return Image.fromarray((pred.clip(0, 1) * 255).astype("uint8"), mode="L").resize(image.size, Image.Resampling.LANCZOS)


def _ml(image: Image.Image) -> Image.Image:
    if not _has("rembg"):
        return _u2net_onnx(image)
    from rembg import remove

    from app.services import compute

    mask = remove(image.convert("RGB"), session=_session(model_name(), tuple(compute.current()["providers"])), only_mask=True)
    if isinstance(mask, (bytes, bytearray)):
        mask = Image.open(io.BytesIO(bytes(mask)))
    return mask.convert("L")


def _lite(image: Image.Image) -> Image.Image:
    import cv2
    import numpy as np

    rgb = np.array(image.convert("RGB"))
    full_h, full_w = rgb.shape[:2]
    shrink = max(1.0, max(full_h, full_w) / 800)
    if shrink > 1.0:
        small = cv2.resize(rgb, (max(1, round(full_w / shrink)), max(1, round(full_h / shrink))), interpolation=cv2.INTER_AREA)
    else:
        small = rgb
    h, w = small.shape[:2]
    dx = max(1, int(w * 0.04))
    dy = max(1, int(h * 0.04))
    box = (dx, dy, max(1, w - 2 * dx), max(1, h - 2 * dy))
    labels = np.zeros((h, w), np.uint8)
    cv2.grabCut(small, labels, box, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 5, cv2.GC_INIT_WITH_RECT)
    soft = np.where((labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    if shrink > 1.0:
        soft = cv2.resize(soft, (full_w, full_h), interpolation=cv2.INTER_LINEAR)
    soft = cv2.GaussianBlur(soft, (0, 0), max(0.8, 1.2 / shrink))
    return Image.fromarray(soft, "L")


def matting_dir():
    from app.localgen.paths import MODELS_DIR

    return MODELS_DIR / "matting"


def matting_models() -> dict:
    """The ONNX files the person put in the matting folder, each with whether this engine can run it and, when not, why."""
    folder, found = matting_dir(), []
    if folder.is_dir():
        for path in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
            if not path.is_file() or path.name.startswith(".") or path.suffix.lower() not in (".onnx", ".pth", ".pt", ".safetensors", ".ckpt"):
                continue
            note = "" if path.suffix.lower() == ".onnx" else "Not an ONNX file: convert the model to .onnx to use it here."
            found.append({"file": path.name, "loadable": not note, "note": note})
    return {"folder": str(folder), "models": found}


def _matting_session(name: str):
    from pathlib import Path

    from app.localgen import sessions
    from app.localgen.paths import session as onnx_session

    if not name or Path(name).name != name or name.startswith("."):
        raise BackgroundError("Choose a model file from the matting folder.")
    path = matting_dir() / name
    if not path.is_file():
        raise BackgroundError(f"{name} is not in the matting folder.")
    if path.suffix.lower() != ".onnx":
        raise BackgroundError(f"{name} is not an ONNX file; this engine runs ONNX models only. Convert it to .onnx and put that file in the matting folder.")
    try:
        session = sessions.get(f"matting:{name}:{path.stat().st_mtime_ns}", lambda: onnx_session(path))
        entry = session.get_inputs()[0]
    except Exception as err:
        raise BackgroundError(f"{name} could not be loaded as an ONNX model ({str(err).splitlines()[0][:160] if str(err) else 'unreadable'}).") from err
    shape = list(entry.shape)
    if len(shape) != 4 or shape[1] != 3:
        raise BackgroundError(f"{name} does not take a picture as 1 x 3 x H x W, so it is not a matting model this engine can run.")
    return session, entry.name, shape


def _file_matte(image: Image.Image, name: str) -> Image.Image:
    """A chosen matting model (BiRefNet, RMBG and the like exported to ONNX): the picture at the model's own size
    (1024 when it takes any), ImageNet-normalised, and the first output read as the subject's matte."""
    import numpy as np

    session, input_name, shape = _matting_session(name)
    h, w = (int(d) if isinstance(d, int) else 1024 for d in shape[2:])
    x = np.asarray(image.convert("RGB").resize((w, h), Image.Resampling.BICUBIC), np.float32) / 255.0
    x = ((x - np.array((0.485, 0.456, 0.406), np.float32)) / np.array((0.229, 0.224, 0.225), np.float32)).transpose(2, 0, 1)[None].astype(np.float32)
    try:
        out = np.asarray(session.run(None, {input_name: x})[0], np.float32)
    except Exception as err:
        raise BackgroundError(f"{name} did not run on this picture ({str(err).splitlines()[0][:160] if str(err) else 'error'}).") from err
    out = np.squeeze(out)
    if out.ndim != 2 or not np.isfinite(out).all():
        raise BackgroundError(f"{name} does not return a single-channel matte, so it is not a matting model this engine can use.")
    if out.min() < 0.0 or out.max() > 1.0:
        out = 1.0 / (1.0 + np.exp(-np.clip(out, -30.0, 30.0)))
    return Image.fromarray((out * 255.0 + 0.5).astype("uint8"), "L").resize(image.size, Image.Resampling.BICUBIC)


def remove(data: bytes, method: str = "auto", matting: str = "") -> tuple[bytes, str]:
    report = available()
    engine = "file" if matting else (report["default"] if method == "auto" else method)
    if engine not in ("ml", "lite", "file") or (engine != "file" and not report[engine]):
        raise Unavailable("This background engine is not installed. The engine needs ONNX Runtime (./formvis install); the lightweight engine ships with the base install.")
    try:
        with Image.open(io.BytesIO(data)) as source:
            image = source.convert("RGBA")
    except Exception as exc:
        raise BackgroundError("The image could not be read.") from exc
    width, height = image.size
    if width * height > config.MAX_PIXELS:
        raise BackgroundError(f"The image exceeds the {config.MAX_PIXELS // 1_000_000}-megapixel limit.")
    mask = _file_matte(image, matting) if engine == "file" else _ml(image) if engine == "ml" else _lite(image)
    if mask.size != (width, height):
        mask = mask.resize((width, height), Image.Resampling.BILINEAR)
    buffer = io.BytesIO()
    mask.save(buffer, format="PNG")
    return buffer.getvalue(), engine


def objects(data: bytes, limit: int = 24) -> dict:
    """Layer > Mask All Objects (1.64.9): U^2-Net's salient regions as separate objects, largest first, each a soft mask
    cropped to its box at a working scale (the longer side at most 1024); every soft edge goes to the nearest object."""
    import base64

    import cv2
    import numpy as np

    if not available()["ml"]:
        raise Unavailable("Mask All Objects needs the engine's ONNX Runtime (./formvis install).")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            rgb = image.convert("RGB")
    except Exception as exc:
        raise BackgroundError("The image could not be read.") from exc
    w, h = rgb.size
    if w * h > config.MAX_PIXELS:
        raise BackgroundError(f"The image exceeds the {config.MAX_PIXELS // 1_000_000}-megapixel limit.")
    k = min(1.0, 1024 / max(w, h))
    sw, sh = max(1, round(w * k)), max(1, round(h * k))
    sal = np.asarray(_u2net_onnx(rgb.resize((sw, sh), Image.Resampling.LANCZOS) if k < 1 else rgb), dtype=np.uint8)
    fg = (sal > 127).astype(np.uint8)
    n, cc, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    floor = max(16.0, 0.0005 * sw * sh)
    keep = sorted((i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= floor), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:limit]
    found = []
    if keep:
        _, near = cv2.distanceTransformWithLabels(1 - fg, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        owner = np.concatenate([np.zeros(1, np.int32), cc[fg == 1].astype(np.int32)])
        nearest = owner[near]
        for i in keep:
            m = np.where((nearest == i) & (sal >= 8), sal, 0).astype(np.uint8)
            ys, xs = np.nonzero(m)
            x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
            buf = io.BytesIO()
            Image.fromarray(m[y0:y1, x0:x1], "L").save(buf, format="PNG")
            found.append({"box": [x0, y0, x1 - x0, y1 - y0], "mask": base64.b64encode(buf.getvalue()).decode("ascii")})
    return {"width": sw, "height": sh, "objects": found}
