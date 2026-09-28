"""Send to NodeMode from a standalone formvis (1.50.8, the owner's priority). Embedded in NodeMode, formvis hands images
to its host page; standalone, the engine sends them: each image is uploaded through NodeMode's POST /api/upload, then
one POST /api/formvis/receive tells NodeMode what arrived (names, sizes, which image is the mask of which) so it can
place them on its canvas. A NodeMode without that receiver still gets the uploads, and the reply says so. The engine
sends rather than the page, as a page cannot post to another app's address unless that app allows it."""

import json
import urllib.error
import urllib.parse
import urllib.request
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(prefix="/api/nodemode", tags=["nodemode"])
TIMEOUT = 20


def _base(target: str) -> str:
    """NodeMode's address, as given: http or https with a host, nothing else."""
    parsed = urllib.parse.urlparse(target.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=422, detail="NodeMode's address must be an http:// or https:// address, such as http://localhost:8000.")
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"


def _request(url: str, data: bytes | None = None, headers: dict | None = None, method: str = "GET", timeout: float = TIMEOUT):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    return urllib.request.urlopen(req, timeout=timeout)


def _unreachable(base: str, exc: Exception) -> HTTPException:
    return HTTPException(status_code=502, detail=f"NodeMode is not answering at {base}. Start NodeMode, or set its address in Preferences > Plugins. ({exc.__class__.__name__})")


@router.get("/status")
def status(target: str) -> dict:
    """Whether NodeMode answers at `target`, and whether it has formvis's receiver."""
    base = _base(target)
    try:
        with _request(base + "/", timeout=3):
            pass
    except urllib.error.HTTPError:
        pass  # it answered, with an error page: it is running
    except (urllib.error.URLError, OSError) as exc:
        return {"running": False, "receiver": False, "detail": str(_unreachable(base, exc).detail)}
    try:
        with _request(base + "/api/formvis/receive", timeout=3):
            receiver = True
    except urllib.error.HTTPError as exc:
        receiver = exc.code == 405  # there, for POST only
    except (urllib.error.URLError, OSError):
        receiver = False
    return {"running": True, "receiver": receiver}


def _upload(base: str, name: str, blob: bytes) -> str:
    """One image through NodeMode's upload; its address on NodeMode."""
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").encode() + blob + f"\r\n--{boundary}--\r\n".encode()
    with _request(base + "/api/upload", body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}, "POST") as r:
        reply = json.loads(r.read() or b"{}")
    url = reply.get("url") or reply.get("path")
    if not url:
        file_id = reply.get("file_id") or reply.get("id") or reply.get("filename")
        if not file_id:
            raise HTTPException(status_code=502, detail="NodeMode took the upload but did not say where it put it.")
        url = f"/api/files/{file_id}"
    return url if url.startswith("http") else base + (url if url.startswith("/") else "/" + url)


@router.post("/send")
async def send(target: str = Form(...), title: str = Form("formvis"), items: str = Form(...), files: list[UploadFile] = File(...)) -> dict:
    """Uploads `files` to NodeMode and announces them. `items` is JSON, one entry per file in order: its name, kind
    (image, layer or mask), size, and for a mask the index of the image it belongs to."""
    base = _base(target)
    try:
        meta = json.loads(items)
        assert isinstance(meta, list) and len(meta) == len(files) and 0 < len(files) <= 64
    except (ValueError, AssertionError):
        raise HTTPException(status_code=422, detail="Nothing to send, or the list of what is sent did not match the files.")
    sent = []
    try:
        for m, f in zip(meta, files):
            name = str(m.get("name") or "image")[:120].replace("/", "_").replace("\\", "_") + ".png"
            sent.append({"url": _upload(base, name, await f.read()), "filename": name, "fileType": "image",
                         "kind": m.get("kind", "image"), "width": int(m.get("width", 0)), "height": int(m.get("height", 0)),
                         **({"maskOf": int(m["maskOf"])} if isinstance(m.get("maskOf"), int) else {})})
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"NodeMode refused the upload ({exc.code}).")
    except (urllib.error.URLError, OSError) as exc:
        raise _unreachable(base, exc)
    announce = json.dumps({"source": "formvis", "title": title[:120], "files": sent}).encode()
    try:
        with _request(base + "/api/formvis/receive", announce, {"Content-Type": "application/json"}, "POST"):
            placed = True
    except urllib.error.HTTPError as exc:
        if exc.code not in (404, 405):
            raise HTTPException(status_code=502, detail=f"NodeMode refused what was sent ({exc.code}).")
        placed = False
    except (urllib.error.URLError, OSError) as exc:
        raise _unreachable(base, exc)
    return {"placed": placed, "files": sent,
            **({} if placed else {"detail": "Uploaded to NodeMode, but this NodeMode cannot place them on its canvas yet: it needs formvis's receiver. The files are in NodeMode's uploads."})}
