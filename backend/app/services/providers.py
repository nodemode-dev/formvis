"""More generation providers beside fal (1.58.4, the parity plan's L7): OpenAI, Google, Black Forest Labs and
Ideogram, each with its own key kept in the system's password store (through secrets.py, a private file where there
is none), or taken from its usual environment variable. Generate Image works with all four; Generative Fill with
OpenAI (images/edits, the mask's transparent area filled) and Black Forest Labs (FLUX.1 Fill [pro], the mask's white
area filled). Each request is the provider's documented one:

  OpenAI: POST {base}/v1/images/generations, Bearer key, JSON {model, prompt, size, n}; the image as b64_json.
  Google: POST {base}/v1beta/models/{model}:generateContent, x-goog-api-key, the response modality IMAGE and the
          aspect ratio asked; the image as inline base64 data.
  Black Forest Labs: POST {base}/v1/flux-pro-1.1 (fill: /v1/flux-pro-1.0-fill), x-key, JSON; then the polling_url
          it answers with, polled until Ready; the image at result.sample.
  Ideogram: POST {base}/v1/ideogram-v3/generate, Api-Key, multipart {prompt, aspect_ratio}; the image at data[0].url.

The base of each can be moved with FORMVIS_<PROVIDER>_BASE (stand-in servers in the tests), as fal's with
FORMVIS_FAL_BASE. Keys are never sent back to the window."""
from __future__ import annotations

import base64
import io
import json
import os
import time
import urllib.error
import urllib.request
import uuid

from PIL import Image

from app.core import config
from app.services import secrets
from app.services.generative import GenerativeError

PROVIDERS: dict[str, dict] = {
    "openai": {"name": "OpenAI", "model": "gpt-image-1", "base": "https://api.openai.com", "env": ("OPENAI_API_KEY",), "fill": True},
    "google": {"name": "Google", "model": "gemini-2.5-flash-image", "base": "https://generativelanguage.googleapis.com", "env": ("GEMINI_API_KEY", "GOOGLE_API_KEY"), "fill": False},
    "bfl": {"name": "Black Forest Labs", "model": "flux-pro-1.1", "base": "https://api.bfl.ai", "env": ("BFL_API_KEY",), "fill": True},
    "ideogram": {"name": "Ideogram", "model": "ideogram-v3", "base": "https://api.ideogram.ai", "env": ("IDEOGRAM_API_KEY",), "fill": False},
}


def _spec(pid: str) -> dict:
    if pid not in PROVIDERS:
        raise GenerativeError(f"No provider called {pid}.", 404)
    return PROVIDERS[pid]


def _base(pid: str) -> str:
    return os.environ.get(f"FORMVIS_{pid.upper()}_BASE", PROVIDERS[pid]["base"]).rstrip("/")


def _file() -> dict:
    try:
        return json.loads((config.data_dir() / "providers.json").read_text())
    except (OSError, ValueError):
        return {}


def _file_put(pid: str, key: str | None) -> None:
    data = _file()
    if key is None:
        data.pop(pid, None)
    else:
        data[pid] = key
    path = config.data_dir() / "providers.json"
    if not data:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        return
    temp = path.with_suffix(".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f)
    os.replace(temp, path)
    os.chmod(path, 0o600)


def _key(pid: str) -> tuple[str | None, str | None]:
    for name in PROVIDERS[pid]["env"]:
        value = os.environ.get(name, "").strip()
        if value:
            return value, "environment"
    value = secrets.get(f"provider-{pid}", lambda: _file().get(pid), lambda: _file_put(pid, None))
    return (value, "settings") if value else (None, None)


#: Keys a service refused, as (provider, digest of the key); a different key is not in it, so a new key lifts the flag.
_refused: dict[tuple[str, str], float] = {}


def _print(pid: str) -> tuple[str, str] | None:
    import hashlib
    key = _key(pid)[0]
    return (pid, hashlib.sha256(key.encode()).hexdigest()) if key else None


def status() -> list[dict]:
    rows = []
    for pid, s in PROVIDERS.items():
        key, source = _key(pid)
        rows.append({"id": pid, "name": s["name"], "model": s["model"], "fill": s["fill"], "configured": source is not None, "source": source, "last4": key[-4:] if key and len(key) >= 8 else "", "refused": _print(pid) in _refused, "refusedAt": _refused.get(_print(pid), 0)})
    return rows


def save_key(pid: str, key: str) -> list[dict]:
    _spec(pid)
    key = key.strip()
    if not key or len(key) > 1024 or any(c.isspace() for c in key):
        raise GenerativeError(f"That does not look like a {PROVIDERS[pid]['name']} API key.", 400)
    secrets.put(f"provider-{pid}", key, lambda k: _file_put(pid, k), lambda: _file_put(pid, None))
    return status()


def forget_key(pid: str) -> list[dict]:
    _spec(pid)
    secrets.delete(f"provider-{pid}", lambda: _file_put(pid, None))
    return status()


def _request(pid: str, url: str, data: bytes | None, headers: dict, method: str = "POST") -> bytes:
    name = PROVIDERS[pid]["name"]
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            _refused.pop(_print(pid), None)
            return r.read()
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            body = json.loads(exc.read())
            detail = str(body.get("error", {}).get("message") if isinstance(body.get("error"), dict) else body.get("detail") or body.get("error") or "")
        except Exception:  # noqa: BLE001 - the body is optional detail only
            pass
        if exc.code in (401, 403):
            p = _print(pid)
            if p:
                _refused[p] = time.time()
            raise GenerativeError(f"{name} rejected the API key. Change it in Generate Image.", 401) from exc
        if exc.code == 402:
            raise GenerativeError(f"{name} needs credit on this account before it can generate.", 402) from exc
        raise GenerativeError(f"{name} could not generate ({exc.code}){': ' + detail if detail else ''}.", 502) from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise GenerativeError(f"Could not reach {name}: {getattr(exc, 'reason', exc)}.", 502) from exc


def _json(pid: str, url: str, body: dict, headers: dict) -> dict:
    return json.loads(_request(pid, url, json.dumps(body).encode(), {**headers, "Content-Type": "application/json", "Accept": "application/json"}))


def _multipart(fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    out = io.BytesIO()
    for k, v in fields.items():
        out.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    for k, (fname, data, ctype) in files.items():
        out.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fname}\"\r\nContent-Type: {ctype}\r\n\r\n".encode())
        out.write(data)
        out.write(b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


def _png(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as im:
        out = io.BytesIO()
        im.convert("RGBA").save(out, "PNG")
        return out.getvalue()


def _ratio(w: int, h: int, choices: list[str], sep: str) -> str:
    want = w / max(1, h)
    return min(choices, key=lambda c: abs(float(c.split(sep)[0]) / float(c.split(sep)[1]) - want))


def _bfl(pid: str, path: str, body: dict, key: str) -> bytes:
    first = _json(pid, f"{_base(pid)}{path}", body, {"x-key": key})
    polling = first.get("polling_url")
    if not polling:
        raise GenerativeError("Black Forest Labs did not answer with a request to follow.", 502)
    end = time.monotonic() + 180
    while time.monotonic() < end:
        state = json.loads(_request(pid, polling, None, {"x-key": key, "Accept": "application/json"}, "GET"))
        st = str(state.get("status", ""))
        if st == "Ready":
            return _png(_request(pid, state["result"]["sample"], None, {}, "GET"))
        if st in ("Error", "Failed", "Content Moderated", "Request Moderated"):
            raise GenerativeError(f"Black Forest Labs could not generate: {st}.", 502)
        time.sleep(0.5)
    raise GenerativeError("Black Forest Labs took too long to answer.", 504)


def generate(pid: str, prompt: str, width: int, height: int) -> bytes:
    """A picture from `prompt` by provider `pid`, as PNG, near the proportions of `width` by `height`."""
    spec = _spec(pid)
    key, _ = _key(pid)
    if not key:
        raise GenerativeError(f"Add a {spec['name']} API key to generate with it.", 428)
    prompt = prompt.strip()[:4000]
    if not prompt:
        raise GenerativeError("Describe the image to generate.", 400)
    if pid == "openai":
        size = "1536x1024" if width > height * 1.2 else "1024x1536" if height > width * 1.2 else "1024x1024"
        r = _json(pid, f"{_base(pid)}/v1/images/generations", {"model": spec["model"], "prompt": prompt, "size": size, "n": 1}, {"Authorization": f"Bearer {key}"})
        return _png(base64.b64decode(r["data"][0]["b64_json"]))
    if pid == "google":
        ar = _ratio(width, height, ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], ":")
        body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": ar}}}
        r = _json(pid, f"{_base(pid)}/v1beta/models/{spec['model']}:generateContent", body, {"x-goog-api-key": key})
        for part in (r.get("candidates") or [{}])[0].get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return _png(base64.b64decode(inline["data"]))
        raise GenerativeError("Google answered without an image (the prompt may have been declined).", 502)
    if pid == "bfl":
        k = max(1.0, max(width, height) / 1440.0)
        w, h = (max(256, min(1440, int(round(width / k / 32)) * 32)), max(256, min(1440, int(round(height / k / 32)) * 32)))
        return _bfl(pid, "/v1/flux-pro-1.1", {"prompt": prompt, "width": w, "height": h}, key)
    ar = _ratio(width, height, ["1x1", "16x9", "9x16", "4x3", "3x4", "3x2", "2x3", "16x10", "10x16"], "x")
    body, ctype = _multipart({"prompt": prompt, "aspect_ratio": ar}, {})
    r = json.loads(_request(pid, f"{_base(pid)}/v1/ideogram-v3/generate", body, {"Api-Key": key, "Content-Type": ctype, "Accept": "application/json"}))
    return _png(_request(pid, r["data"][0]["url"], None, {}, "GET"))


def fill(pid: str, image_png: bytes, mask_png: bytes, prompt: str) -> bytes:
    """Generative Fill by provider `pid` (OpenAI or Black Forest Labs): the mask's white area filled from `prompt`."""
    spec = _spec(pid)
    if not spec["fill"]:
        raise GenerativeError(f"{spec['name']} does not fill a masked area here; choose fal, OpenAI or Black Forest Labs.", 400)
    key, _ = _key(pid)
    if not key:
        raise GenerativeError(f"Add a {spec['name']} API key to fill with it.", 428)
    if pid == "openai":
        with Image.open(io.BytesIO(mask_png)) as m:
            mask = m.convert("L")
            rgba = Image.new("RGBA", mask.size, (0, 0, 0, 255))
            rgba.putalpha(mask.point(lambda v: 255 - v))   # OpenAI fills where the mask is transparent
            buf = io.BytesIO(); rgba.save(buf, "PNG")
        body, ctype = _multipart({"model": spec["model"], "prompt": prompt.strip() or "Fill the area so it continues the picture.", "n": "1"}, {"image": ("image.png", image_png, "image/png"), "mask": ("mask.png", buf.getvalue(), "image/png")})
        r = json.loads(_request(pid, f"{_base(pid)}/v1/images/edits", body, {"Authorization": f"Bearer {key}", "Content-Type": ctype, "Accept": "application/json"}))
        return _png(base64.b64decode(r["data"][0]["b64_json"]))
    b64 = lambda d: base64.b64encode(d).decode("ascii")
    return _bfl(pid, "/v1/flux-pro-1.0-fill", {"image": b64(image_png), "mask": b64(mask_png), "prompt": prompt.strip()}, key)
