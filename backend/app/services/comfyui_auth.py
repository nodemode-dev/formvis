"""Sign-in for the user's own ComfyUI server (basic, bearer token or a custom header). The mode, the user name and the
header name are kept in the engine's data folder; the secret (password, token or header value) goes to the system's
password store through secrets.py and is never handed back to the page."""

import base64
import json
import os
import re
from pathlib import Path

from app.core import config
from app.services import secrets

MODES = ("none", "basic", "bearer", "header")
NAME = "comfyui"
HEADER_NAME = re.compile(r"^[A-Za-z0-9-]{1,64}$")
BLOCKED = {"host", "content-length", "content-type", "transfer-encoding", "connection"}


class AuthError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def _path() -> Path:
    return config.data_dir() / "comfyui_auth.json"


def _settings() -> dict:
    try:
        s = json.loads(_path().read_text())
        return s if isinstance(s, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(s: dict) -> None:
    path = _path()
    temp = path.with_suffix(".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(s, f)
    os.replace(temp, path)
    os.chmod(path, 0o600)


def _file_secret() -> str | None:
    return _settings().get("secret") or None


def _file_clear() -> None:
    s = _settings()
    if "secret" in s:
        s.pop("secret")
        _write(s)


def _file_write(value: str) -> None:
    s = _settings()
    s["secret"] = value
    _write(s)


def _secret() -> str | None:
    return secrets.get(NAME, _file_secret, _file_clear)


def status() -> dict:
    s = _settings()
    mode = s.get("mode") if s.get("mode") in MODES else "none"
    return {"mode": mode, "user": s.get("user", ""), "header": s.get("header", ""), "hasSecret": bool(_secret()), "store": secrets.where()["store"]}


def save(mode: str, user: str = "", header: str = "", secret: str | None = None, forget_secret: bool = False) -> dict:
    if mode not in MODES:
        raise AuthError("Choose none, basic, bearer or header.")
    user, header = user.strip()[:200], header.strip()
    if mode == "header" and (not HEADER_NAME.fullmatch(header) or header.lower() in BLOCKED):
        raise AuthError("Name the header with letters, digits and hyphens, such as X-Api-Key.")
    if mode == "basic" and (not user or ":" in user):
        raise AuthError("Basic sign-in needs a user name without a colon.")
    if secret is not None and secret.strip() and (len(secret) > 2048 or "\n" in secret or "\r" in secret):
        raise AuthError("That does not look like a password or token.")
    s = _settings()
    s["mode"], s["user"], s["header"] = mode, user if mode == "basic" else "", header if mode == "header" else ""
    _write(s)
    if mode == "none" or forget_secret:
        secrets.delete(NAME, _file_clear)
    elif secret is not None and secret.strip():
        secrets.put(NAME, secret.strip() if mode != "basic" else secret, _file_write, _file_clear)
    return status()


def headers() -> dict:
    """The request headers that sign in to ComfyUI; empty when none is set up or the secret is missing."""
    s = _settings()
    mode = s.get("mode")
    value = _secret() if mode in ("basic", "bearer", "header") else None
    if not value:
        return {}
    if mode == "basic":
        return {"Authorization": "Basic " + base64.b64encode(f"{s.get('user', '')}:{value}".encode()).decode()}
    if mode == "bearer":
        return {"Authorization": f"Bearer {value}"}
    name = str(s.get("header") or "")
    return {name: value} if HEADER_NAME.fullmatch(name) and name.lower() not in BLOCKED else {}
