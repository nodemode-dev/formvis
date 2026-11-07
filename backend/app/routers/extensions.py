"""Form Extension Contract, API 1: the extensions FormPortal installed (enabled.json) and form.ext runs (dev.json) for
formvis, listed for the window and their files served to its sandboxed frames. The resolver and the file checks are the
kit's (app/services/formext_host.py, vendored unchanged); this router only caches its answer by the two files' times."""

import shutil
import subprocess
import sys
import threading

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from app.core import config
from app.services import formext_host as kit

PRODUCT = "formvis"
APP_NAME = "FormVis"
BASE = "/api/extensions/files"
router = APIRouter(prefix="/api/extensions", tags=["extensions"])
_lock = threading.Lock()
_cache: dict = {"key": None, "list": []}


def _resolved(force: bool = False) -> tuple[list[kit.Extension], tuple[float, float]]:
    stamp = kit.stamp(PRODUCT)
    key = (str(kit.portal_root()), stamp)
    with _lock:
        if force or _cache["key"] != key:
            _cache["list"] = kit.resolve(PRODUCT, config.VERSION, APP_NAME)
            _cache["key"] = key
        return _cache["list"], stamp


@router.get("/stamp")
def extensions_stamp() -> dict:
    return {"stamp": list(kit.stamp(PRODUCT))}


@router.get("")
def list_extensions(reload: bool = False) -> dict:
    found, stamp = _resolved(force=reload)
    return {"product": PRODUCT, "app": APP_NAME, "appVersion": config.VERSION, "api": kit.API, "root": str(kit.portal_root()),
            "stamp": list(stamp), "extensions": [e.public(BASE) for e in found]}


@router.post("/portal")
def open_portal() -> dict:
    """Manage in FormPortal: the system opens formai://extensions?product=formvis (FormPortal's own link). 501 with nothing
    to open it, so the window says where to look instead."""
    url = f"formai://extensions?product={PRODUCT}"
    if sys.platform == "darwin":
        opener = ["open", url]
    elif sys.platform.startswith("win"):
        opener = ["cmd", "/c", "start", "", url]
    else:
        found = shutil.which("xdg-open")
        if not found:
            raise HTTPException(status_code=501, detail="Nothing here opens formai:// links. Open FormPortal and choose Extensions.")
        opener = [found, url]
    try:
        subprocess.Popen(opener, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as exc:
        raise HTTPException(status_code=501, detail=f"FormPortal could not be opened: {exc.strerror or exc}.") from exc
    return {"ok": True, "url": url}


def _missing() -> Response:
    return Response(status_code=404, headers=kit.headers_for("text/plain", ""))


@router.api_route("/files/{ext_id}/{version}/{rel:path}", methods=["GET", "HEAD"])
def extension_file(ext_id: str, version: str, rel: str) -> Response:
    found, _ = _resolved()
    hit = kit.file_for(found, ext_id, version, rel)
    if hit is None:
        return _missing()
    path, content_type = hit
    headers = {**kit.headers_for(content_type, ""), "Cross-Origin-Embedder-Policy": "credentialless"}
    return FileResponse(path, media_type=content_type, headers=headers)
