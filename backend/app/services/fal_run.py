"""Curated fal models: the catalogue in app/data/fal_models.json is the only list of endpoints formvis may call. A run
validates the person's inputs against the model's own schema, sends the images to the schema's image keys, submits to
fal's queue, polls until the job is done and returns the result images (and masks) as PNG.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import time
from functools import lru_cache
from pathlib import Path

import httpx
from PIL import Image

from app.services import generative
from app.services.generative import GenerativeError

CATALOGUE = Path(__file__).resolve().parent.parent / "data" / "fal_models.json"
POLL_LIMIT = 600
IMAGE_KEY = re.compile(r"^(?:[a-z0-9_]*image|[a-z0-9_]*mask)_urls?$")
MAX_IMAGE_BYTES = 60 * 1024 * 1024


def _queue_base() -> str:
    return os.environ.get("FORMVIS_FAL_QUEUE_BASE", "https://queue.fal.run").rstrip("/")


def _poll_seconds() -> float:
    try:
        return max(0.01, float(os.environ.get("FORMVIS_FAL_POLL", "1")))
    except ValueError:
        return 1.0


@lru_cache(maxsize=1)
def _catalogue() -> dict:
    return json.loads(CATALOGUE.read_text(encoding="utf-8"))


def models() -> list[dict]:
    return _catalogue()["models"]


def find(model_id: str) -> dict | None:
    for entry in models():
        if entry["id"] == model_id:
            return entry
    return None


def listing() -> dict:
    key, _ = generative._key()
    keep = ("id", "label", "role", "row", "category", "pricing", "license", "inputs")
    return {"ready": bool(key), "models": [{k: m.get(k) for k in keep} for m in models()]}


def is_image_key(spec: dict) -> bool:
    return bool(IMAGE_KEY.match(spec["key"])) and spec.get("type") in ("string", "array")


def _bad(key: str, why: str) -> GenerativeError:
    return GenerativeError(f"Input '{key}' {why}.", 422)


def _check_value(spec: dict, value: object) -> object:
    key, kind = spec["key"], spec.get("type")
    if kind == "string":
        if not isinstance(value, str):
            raise _bad(key, "must be text")
        if spec.get("maxLength") and len(value) > spec["maxLength"]:
            raise _bad(key, f"is longer than {spec['maxLength']} characters")
    elif kind == "integer":
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        if isinstance(value, bool) or not isinstance(value, int):
            raise _bad(key, "must be a whole number")
    elif kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise _bad(key, "must be a number")
    elif kind == "boolean":
        if not isinstance(value, bool):
            raise _bad(key, "must be true or false")
    elif kind == "array":
        if not isinstance(value, list):
            raise _bad(key, "must be a list")
        if spec.get("maxItems") and len(value) > spec["maxItems"]:
            raise _bad(key, f"has more than {spec['maxItems']} items")
    elif kind == "object":
        if not isinstance(value, (dict, str)):
            raise _bad(key, "must be an object or a preset name")
    if spec.get("enum") is not None and value not in spec["enum"]:
        raise _bad(key, f"must be one of {', '.join(str(e) for e in spec['enum'])}")
    if kind in ("integer", "number"):
        if spec.get("min") is not None and value < spec["min"]:
            raise _bad(key, f"must be at least {spec['min']}")
        if spec.get("max") is not None and value > spec["max"]:
            raise _bad(key, f"must be at most {spec['max']}")
    return value


def _image_uri(key: str, value: object) -> str:
    if not isinstance(value, str) or not value.startswith("data:image/") or "," not in value:
        raise _bad(key, "must be an image data URI")
    if len(value) > MAX_IMAGE_BYTES * 4 // 3:
        raise GenerativeError(f"Image '{key}' is too large to send.", 413)
    return value


def build_body(entry: dict, inputs: dict, images: dict) -> dict:
    specs = {s["key"]: s for s in entry["inputs"]}
    body: dict = {}
    for key, value in (inputs or {}).items():
        spec = specs.get(key)
        if spec is None or is_image_key(spec) or value is None:
            continue
        body[key] = _check_value(spec, value)
    for key, value in (images or {}).items():
        spec = specs.get(key)
        if spec is None or not is_image_key(spec):
            raise _bad(key, "is not an image input of this model")
        many = spec.get("type") == "array"
        items = value if isinstance(value, list) else [value]
        if not items:
            continue
        if not many and len(items) > 1:
            raise _bad(key, "takes one image")
        uris = [_image_uri(key, item) for item in items]
        if many and spec.get("maxItems") and len(uris) > spec["maxItems"]:
            raise _bad(key, f"has more than {spec['maxItems']} images")
        body[key] = uris if many else uris[0]
    for spec in entry["inputs"]:
        if spec.get("required") and spec["key"] not in body:
            raise _bad(spec["key"], "is required")
    return body


def _fail(response: httpx.Response, key: str) -> GenerativeError:
    detail: object = ""
    try:
        detail = response.json().get("detail", "")
    except Exception:  # noqa: BLE001 - the body is optional detail only
        pass
    if isinstance(detail, list):
        detail = "; ".join(str(d.get("msg", d)) if isinstance(d, dict) else str(d) for d in detail)
    code = response.status_code
    if code in (401, 403):
        generative._refused[generative._print(key)] = time.time()
        return GenerativeError("fal rejected the API key. Change it in Generative Fill.", 401)
    if code == 402:
        return GenerativeError("fal needs credit on this account before it can generate.", 402)
    suffix = f": {detail}" if detail else ""
    return GenerativeError(f"fal could not run the model ({code}){suffix}.", 502)


def _png(raw: bytes) -> dict:
    try:
        with Image.open(io.BytesIO(raw)) as im:
            out = io.BytesIO()
            rgba = im.convert("RGBA")
            rgba.save(out, "PNG")
            return {"png": base64.b64encode(out.getvalue()).decode("ascii"), "width": rgba.width, "height": rgba.height}
    except Exception as exc:  # noqa: BLE001 - any decode failure is a bad result
        raise GenerativeError("fal returned an image formvis could not read.", 502) from exc


def _fetch(client: httpx.Client, url: str) -> bytes:
    if url.startswith("data:"):
        try:
            return base64.b64decode(url.split(",", 1)[1])
        except Exception as exc:  # noqa: BLE001
            raise GenerativeError("fal returned an image formvis could not read.", 502) from exc
    try:
        response = client.get(url, timeout=120)
        response.raise_for_status()
        return response.content
    except httpx.HTTPError as exc:
        raise GenerativeError(f"Could not download the result from fal: {exc}.", 502) from exc


def _pictures(result: dict, field: str) -> list[dict]:
    found = result.get(field)
    if isinstance(found, dict):
        found = [found]
    return [p for p in (found or []) if isinstance(p, dict) and p.get("url")]


def _collect(client: httpx.Client, result: dict, role: str) -> dict:
    if any(result.get("has_nsfw_concepts") or []):
        raise GenerativeError("fal withheld the result under its safety filter. Try another prompt.", 422)
    pictures = _pictures(result, "images") or _pictures(result, "image")
    masks = _pictures(result, "masks") + _pictures(result, "mask")
    if not pictures and not masks:
        raise GenerativeError("fal returned no image.", 502)
    seed = result.get("seed")
    return {"images": [_png(_fetch(client, str(p["url"]))) for p in pictures],
            "masks": [_png(_fetch(client, str(p["url"]))) for p in masks],
            "seed": seed if isinstance(seed, int) and not isinstance(seed, bool) else None}


def _result(client: httpx.Client, submitted: dict, endpoint: str, headers: dict) -> dict:
    request_id = submitted.get("request_id")
    status_url = submitted.get("status_url") or f"{_queue_base()}/{endpoint}/requests/{request_id}/status"
    status_url += "&logs=1" if "?" in status_url else "?logs=1"
    plain = submitted.get("status_url") or ""
    derived = plain[:-len("/status")] if plain.endswith("/status") else ""
    candidates = [derived, submitted.get("response_url") or "", f"{_queue_base()}/{endpoint}/requests/{request_id}"]
    deadline = time.monotonic() + POLL_LIMIT
    while time.monotonic() < deadline:
        time.sleep(_poll_seconds())
        try:
            status = client.get(status_url, headers=headers, timeout=60)
        except httpx.HTTPError:
            continue
        if status.status_code in (401, 402, 403):
            raise _fail(status, headers["Authorization"][4:])
        if status.status_code != 200:
            continue
        data = status.json()
        state = data.get("status")
        if state == "FAILED" or data.get("error"):
            raise GenerativeError(f"fal could not run the model: {data.get('error') or 'the job failed'}.", 502)
        if state != "COMPLETED":
            continue
        last: httpx.Response | None = None
        for url in (u for u in candidates if u):
            try:
                last = client.get(url, headers={"Authorization": headers["Authorization"]}, timeout=120)
            except httpx.HTTPError:
                continue
            if last.status_code == 200:
                return last.json()
            if last.status_code == 422:
                break
        raise _fail(last, headers["Authorization"][4:]) if last is not None else GenerativeError("Could not fetch the result from fal.", 502)
    raise GenerativeError("fal did not finish within 10 minutes.", 502)


def run(model_id: str, inputs: dict, images: dict) -> dict:
    entry = find(model_id)
    if entry is None:
        raise GenerativeError("That model is not in the formvis catalogue.", 404)
    key, _ = generative._key()
    if not key:
        raise GenerativeError("Add a fal API key to run this model.", 428)
    body = build_body(entry, inputs, images)
    headers = {"Authorization": f"Key {key}", "Content-Type": "application/json", "Accept": "application/json"}
    try:
        with httpx.Client(follow_redirects=True) as client:
            submit = client.post(f"{_queue_base()}/{entry['id']}", json=body, headers=headers, timeout=180)
            if submit.status_code >= 400:
                raise _fail(submit, key)
            generative._refused.pop(generative._print(key), None)
            out = _collect(client, _result(client, submit.json(), entry["id"], headers), entry["role"])
    except httpx.HTTPError as exc:
        raise GenerativeError(f"Could not reach fal: {exc}.", 502) from exc
    if out["seed"] is None and isinstance(body.get("seed"), int):
        out["seed"] = body["seed"]
    out["model"] = entry["id"]
    return out
