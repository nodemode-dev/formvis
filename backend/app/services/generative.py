"""Generative Fill and Upscale through fal. FLUX.1 Fill [pro] fills the masked area from a prompt; with no prompt,
FLUX.1 Erase [pro] removes what the mask covers; Real-ESRGAN upscales 2 or 4 times. The fal key comes from FAL_KEY (or FAL_API_KEY) in the environment, or from a
settings file in the formvis data folder that only this user can read; it is never sent back to the app. Requests go
to fal's synchronous endpoint with the image and mask inline as PNG data URIs, so nothing is uploaded elsewhere first.
"""

from __future__ import annotations

import base64
import io
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

from app.core import config
from app.services import secrets

FILL_MODEL = "fal-ai/flux-pro/v1/fill"
ERASE_MODEL = "fal-ai/flux-pro/v1/erase"
UPSCALE_MODEL = "fal-ai/esrgan"
#: Generate Image (1.51.2): a picture from a prompt alone.
IMAGE_MODEL = "fal-ai/flux-pro/v1.1"


class GenerativeError(Exception):
    """A failure to report to the app, with the HTTP status to report it under."""

    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


def _settings_path() -> Path:
    return config.data_dir() / "generative.json"


def _base_url() -> str:
    return os.environ.get("FORMVIS_FAL_BASE", "https://fal.run").rstrip("/")


def _key() -> tuple[str | None, str | None]:
    """The key to use and where it came from: the environment first, then saved settings."""
    for name in ("FAL_KEY", "FAL_API_KEY"):
        value = os.environ.get(name, "").strip()
        if value:
            return value, "environment"
    value = secrets.get("fal", _file_key, _file_clear)   # the password store, or the file (1.52.5)
    return (value, "settings") if value else (None, None)


def _key_state() -> tuple[str | None, str | None, str]:
    """For status: the key only when it is at hand without the password store, where it came from, its last four."""
    for name in ("FAL_KEY", "FAL_API_KEY"):
        value = os.environ.get(name, "").strip()
        if value:
            return value, "environment", value[-4:] if len(value) >= 8 else ""
    has, last4, value = secrets.summary("fal", _file_key)
    return value, "settings" if has else None, last4


def _file_key() -> str | None:
    try:
        return str(json.loads(_settings_path().read_text()).get("falKey", "")).strip() or None
    except (OSError, ValueError, AttributeError):
        return None


def _file_write(key: str) -> None:
    path = _settings_path()
    temp = path.with_suffix(".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump({"falKey": key}, f)
    os.replace(temp, path)
    os.chmod(path, 0o600)


def _file_clear() -> None:
    try:
        _settings_path().unlink()
    except FileNotFoundError:
        pass


#: Set when the service refused the key in use, with the time it did; a new key or Clear lifts it.
_refused: dict[str, float] = {}


def _print(key: str) -> str:
    import hashlib
    return hashlib.sha256(key.encode()).hexdigest()


def status() -> dict:
    key, source, last4 = _key_state()
    return {"configured": source is not None, "source": source, "last4": last4, "refused": bool(key and _print(key) in _refused), "refusedAt": _refused.get(_print(key), 0) if key else 0, "store": secrets.where()["store"], "fillModel": FILL_MODEL, "eraseModel": ERASE_MODEL, "upscaleModel": UPSCALE_MODEL}


def save_key(key: str) -> dict:
    key = key.strip()
    if not key or len(key) > 512 or any(c.isspace() for c in key):
        raise GenerativeError("That does not look like a fal API key.", 400)
    secrets.put("fal", key, _file_write, _file_clear)
    return status()


def forget_key() -> dict:
    secrets.delete("fal", _file_clear)
    return status()


def _data_uri(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


def _size(data: bytes) -> tuple[int, int]:
    try:
        with Image.open(io.BytesIO(data)) as im:
            return im.size
    except Exception as exc:  # noqa: BLE001 - any decode failure is a bad upload
        raise GenerativeError("The image or mask could not be read.", 400) from exc


def _post(model: str, body: dict, key: str) -> dict:
    request = urllib.request.Request(
        f"{_base_url()}/{model}", data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            _refused.pop(_print(key), None)
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail: object = ""
        try:
            detail = json.loads(exc.read()).get("detail", "")
        except Exception:  # noqa: BLE001 - the body is optional detail only
            pass
        if isinstance(detail, list):
            detail = "; ".join(str(d.get("msg", d)) if isinstance(d, dict) else str(d) for d in detail)
        if exc.code in (401, 403):
            _refused[_print(key)] = time.time()
            raise GenerativeError("fal rejected the API key. Change it in Generative Fill.", 401) from exc
        if exc.code == 402:
            raise GenerativeError("fal needs credit on this account before it can generate.", 402) from exc
        suffix = f": {detail}" if detail else ""
        raise GenerativeError(f"fal could not generate ({exc.code}){suffix}.", 502) from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise GenerativeError(f"Could not reach fal: {getattr(exc, 'reason', exc)}.", 502) from exc


def _download(url: str) -> bytes:
    if url.startswith("data:"):
        return base64.b64decode(url.split(",", 1)[1])
    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            return response.read()
    except (urllib.error.URLError, OSError) as exc:
        raise GenerativeError(f"Could not download the result from fal: {getattr(exc, 'reason', exc)}.", 502) from exc


def fill(image_png: bytes, mask_png: bytes, prompt: str, seed: int | None = None) -> bytes:
    """The filled image as PNG, the same size as `image_png`'s result. White in the mask marks what to fill. `seed` fixes a fill that has a prompt."""
    key, _ = _key()
    if not key:
        raise GenerativeError("Add a fal API key to use Generative Fill.", 428)
    if _size(image_png) != _size(mask_png):
        raise GenerativeError("The image and mask must be the same size.", 400)
    prompt = prompt.strip()
    if prompt:
        body = {"prompt": prompt[:2000], "image_url": _data_uri(image_png), "mask_url": _data_uri(mask_png),
                "num_images": 1, "output_format": "png", "sync_mode": True, "safety_tolerance": "2"}
        if seed is not None and seed >= 0:
            body["seed"] = int(seed) & 0x7FFFFFFF
        result = _post(FILL_MODEL, body, key)
    else:
        result = _post(ERASE_MODEL, {"image_url": _data_uri(image_png), "mask_url": _data_uri(mask_png)}, key)
    return _result_png(result)


def generation_size(width: int, height: int) -> tuple[int, int]:
    """The size to ask fal for: the document's shape, its longer side at most 1440 and its shorter at least 256, both
    multiples of 32 (the result is scaled to the document afterwards)."""
    w, h = max(1, int(width)), max(1, int(height))
    k = min(1.0, 1440 / max(w, h))
    w, h = w * k, h * k
    if min(w, h) < 256:
        k = 256 / min(w, h)
        w, h = min(1440, w * k), min(1440, h * k)
    return max(256, round(w / 32) * 32), max(256, round(h / 32) * 32)


def generate(prompt: str, width: int, height: int, seed: int | None = None) -> bytes:
    """A picture from `prompt` alone with FLUX1.1 [pro], as PNG, at generation_size(width, height); `seed` fixes the result."""
    key, _ = _key()
    if not key:
        raise GenerativeError("Add a fal API key to generate an image.", 428)
    prompt = prompt.strip()
    if not prompt:
        raise GenerativeError("Describe the image to generate.", 400)
    w, h = generation_size(width, height)
    body = {"prompt": prompt[:2000], "image_size": {"width": w, "height": h}, "num_images": 1, "output_format": "png", "sync_mode": True, "safety_tolerance": "2"}
    if seed is not None and seed >= 0:
        body["seed"] = int(seed) & 0x7FFFFFFF
    return _result_png(_post(IMAGE_MODEL, body, key))


def upscale(image_png: bytes, scale: int) -> bytes:
    """`image_png` upscaled `scale` (2 or 4) times with Real-ESRGAN, as PNG."""
    key, _ = _key()
    if not key:
        raise GenerativeError("Add a fal API key to upscale.", 428)
    if scale not in (2, 4):
        raise GenerativeError("Upscale by 2 or 4.", 400)
    _size(image_png)
    body = {"image_url": _data_uri(image_png), "scale": scale, "model": "RealESRGAN_x4plus", "output_format": "png"}
    return _result_png(_post(UPSCALE_MODEL, body, key))


def _result_png(result: dict) -> bytes:
    """The first image in a fal result (an `images` list or a single `image`), as PNG."""
    images = result.get("images") or ([result["image"]] if isinstance(result.get("image"), dict) else [])
    if not images or not isinstance(images[0], dict) or not images[0].get("url"):
        raise GenerativeError("fal returned no image.", 502)
    if any(result.get("has_nsfw_concepts") or []):
        raise GenerativeError("fal withheld the result under its safety filter. Try another prompt.", 422)
    raw = _download(str(images[0]["url"]))
    try:
        with Image.open(io.BytesIO(raw)) as im:
            out = io.BytesIO()
            im.convert("RGBA").save(out, "PNG")
            return out.getvalue()
    except Exception as exc:  # noqa: BLE001 - any decode failure is a bad result
        raise GenerativeError("fal returned an image formvis could not read.", 502) from exc
