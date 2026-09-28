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
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

from app.core import config

FILL_MODEL = "fal-ai/flux-pro/v1/fill"
ERASE_MODEL = "fal-ai/flux-pro/v1/erase"
UPSCALE_MODEL = "fal-ai/esrgan"


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
    try:
        value = str(json.loads(_settings_path().read_text()).get("falKey", "")).strip()
        if value:
            return value, "settings"
    except (OSError, ValueError, AttributeError):
        pass
    return None, None


def status() -> dict:
    _, source = _key()
    return {"configured": source is not None, "source": source, "fillModel": FILL_MODEL, "eraseModel": ERASE_MODEL, "upscaleModel": UPSCALE_MODEL}


def save_key(key: str) -> dict:
    key = key.strip()
    if not key or len(key) > 512 or any(c.isspace() for c in key):
        raise GenerativeError("That does not look like a fal API key.", 400)
    path = _settings_path()
    temp = path.with_suffix(".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump({"falKey": key}, f)
    os.replace(temp, path)
    os.chmod(path, 0o600)
    return status()


def forget_key() -> dict:
    try:
        _settings_path().unlink()
    except FileNotFoundError:
        pass
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


def fill(image_png: bytes, mask_png: bytes, prompt: str) -> bytes:
    """The filled image as PNG, the same size as `image_png`'s result. White in the mask marks what to fill."""
    key, _ = _key()
    if not key:
        raise GenerativeError("Add a fal API key to use Generative Fill.", 428)
    if _size(image_png) != _size(mask_png):
        raise GenerativeError("The image and mask must be the same size.", 400)
    prompt = prompt.strip()
    if prompt:
        body = {"prompt": prompt[:2000], "image_url": _data_uri(image_png), "mask_url": _data_uri(mask_png),
                "num_images": 1, "output_format": "png", "sync_mode": True, "safety_tolerance": "2"}
        result = _post(FILL_MODEL, body, key)
    else:
        result = _post(ERASE_MODEL, {"image_url": _data_uri(image_png), "mask_url": _data_uri(mask_png)}, key)
    return _result_png(result)


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
