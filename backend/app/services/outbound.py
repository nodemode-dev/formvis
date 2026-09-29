"""Requests from the engine to other apps on the user's machine (NodeMode, ComfyUI): an address checked to be http(s)
and used as given, plain requests, and multipart image uploads. The engine sends rather than the page, as a page
cannot post to another app's address unless that app allows it."""

import urllib.parse
import urllib.request
import uuid

from fastapi import HTTPException


def base(target: str, app: str, example: str) -> str:
    """An app's address, as given: http or https with a host, nothing else."""
    parsed = urllib.parse.urlparse(target.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=422, detail=f"{app}'s address must be an http:// or https:// address, such as {example}.")
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"


def request(url: str, data: bytes | None = None, headers: dict | None = None, method: str = "GET", timeout: float = 20):
    return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers or {}, method=method), timeout=timeout)


def multipart(file_field: str, filename: str, blob: bytes, fields: dict | None = None) -> tuple[bytes, str]:
    """A multipart body with text `fields` and one PNG, and its content type."""
    boundary = uuid.uuid4().hex
    parts = [f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode() for k, v in (fields or {}).items()]
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\nContent-Type: image/png\r\n\r\n".encode() + blob + b"\r\n")
    return b"".join(parts) + f"--{boundary}--\r\n".encode(), f"multipart/form-data; boundary={boundary}"


def unreachable(app: str, base_url: str, where: str, exc: Exception) -> HTTPException:
    return HTTPException(status_code=502, detail=f"{app} is not answering at {base_url}. Start {app}, or set its address in {where}. ({exc.__class__.__name__})")
