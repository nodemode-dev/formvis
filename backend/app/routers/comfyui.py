"""Send to ComfyUI (1.50.9): images into ComfyUI's input folder, through its documented HTTP API, so its Load Image and
Load Image (as Mask) nodes list them. GET /system_stats says whether ComfyUI runs (and its version); POST /upload/image
takes each image, into a formvis subfolder, replacing an earlier send of the same name."""

import json
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile

from app.routers.terminal import require_local
from app.services import comfyui_auth, outbound

router = APIRouter(prefix="/api/comfyui", tags=["comfyui"])
SUBFOLDER = "formvis"


def _base(target: str) -> str:
    return outbound.base(target, "ComfyUI", "http://127.0.0.1:8188")


class _SameHostRedirects(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to the same scheme, host and port, so the sign-in headers never reach another server."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        old, new = urllib.parse.urlsplit(req.full_url), urllib.parse.urlsplit(newurl)
        if (old.scheme, old.netloc) != (new.scheme, new.netloc):
            raise urllib.error.HTTPError(newurl, code, "ComfyUI redirected to another server; not followed with the sign-in", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_signed = urllib.request.build_opener(_SameHostRedirects)


def _request(url: str, data: bytes | None = None, headers: dict | None = None, method: str = "GET", timeout: float = 20):
    """outbound.request with the sign-in headers set up in Preferences > Plugins (basic, bearer or a custom header); with a
    sign-in, a redirect to another server is refused rather than sent the credentials."""
    auth = comfyui_auth.headers()
    if not auth:
        return outbound.request(url, data, headers, method, timeout)
    return _signed.open(urllib.request.Request(url, data=data, headers={**auth, **(headers or {})}, method=method), timeout=timeout)


@router.get("/auth")
def auth_status(request: Request) -> dict:
    require_local(request)
    return comfyui_auth.status()


@router.post("/auth")
def auth_save(request: Request, mode: str = Form("none"), user: str = Form(""), header: str = Form(""), secret: str | None = Form(None), forget_secret: bool = Form(False)) -> dict:
    require_local(request)
    try:
        return comfyui_auth.save(mode, user, header, secret, forget_secret)
    except comfyui_auth.AuthError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))


@router.get("/status")
def status(target: str) -> dict:
    """Whether ComfyUI answers at `target`, and its version when it says."""
    base = _base(target)
    try:
        with _request(base + "/system_stats", timeout=3) as r:
            stats = json.loads(r.read() or b"{}")
    except urllib.error.HTTPError:
        return {"running": False, "detail": f"Something answers at {base}, but it is not ComfyUI."}
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return {"running": False, "detail": str(outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc).detail)}
    system = stats.get("system") if isinstance(stats, dict) else None
    version = system.get("comfyui_version") if isinstance(system, dict) else None
    return {"running": True, **({"version": str(version)[:40]} if version else {})}


@router.post("/convert")
def convert(target: str = Form(...), workflow: str = Form(...)) -> dict:
    """A workflow saved in the editor's (UI) format, as the API format the other routes take. The widget names and order come
    from the node definitions of the ComfyUI at `target`, so it must be running. 422 for a file that is not a workflow."""
    from app.services import comfy_convert
    base = _base(target)
    try:
        flow = json.loads(workflow)
    except ValueError:
        raise HTTPException(status_code=422, detail="That file is not a ComfyUI workflow (it is not JSON).")
    if not comfy_convert.is_ui_format(flow):
        raise HTTPException(status_code=422, detail="That file is not a ComfyUI workflow in the editor format.")
    info: dict[str, dict] = {}
    for kind in comfy_convert.node_types(flow):
        try:
            with _request(base + "/object_info/" + urllib.parse.quote(kind, safe=""), timeout=10) as r:
                got = json.loads(r.read() or b"{}")
        except urllib.error.HTTPError:
            raise HTTPException(status_code=422, detail=f"ComfyUI does not have the node {kind}; install its custom node package, then try again.")
        except (urllib.error.URLError, OSError, ValueError) as exc:
            raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
        if isinstance(got, dict) and isinstance(got.get(kind), dict):
            info[kind] = got[kind]
    try:
        return {"workflow": json.dumps(comfy_convert.convert(flow, info))}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/send")
async def send(target: str = Form(...), items: str = Form(...), files: list[UploadFile] = File(...)) -> dict:
    """Uploads `files` into ComfyUI's input folder. `items` is JSON, one entry per file in order: its name and kind
    (image, layer or mask). Replies with each file's name as ComfyUI's Load Image lists it."""
    base = _base(target)
    try:
        meta = json.loads(items)
        assert isinstance(meta, list) and len(meta) == len(files) and 0 < len(files) <= 64
    except (ValueError, AssertionError):
        raise HTTPException(status_code=422, detail="Nothing to send, or the list of what is sent did not match the files.")
    sent = []
    try:
        for m, f in zip(meta, files):
            name = "".join(c if c.isalnum() or c in " -_." else "_" for c in str(m.get("name") or "image"))[:120].strip() or "image"
            body, kind = outbound.multipart("image", f"{name}.png", await f.read(), {"type": "input", "subfolder": SUBFOLDER, "overwrite": "true"})
            with _request(base + "/upload/image", body, {"Content-Type": kind}, "POST") as r:
                reply = json.loads(r.read() or b"{}")
            stored = reply.get("name") or f"{name}.png"
            folder = reply.get("subfolder", SUBFOLDER)
            sent.append({"name": f"{folder}/{stored}" if folder else stored, "kind": m.get("kind", "image")})
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"ComfyUI refused the upload ({exc.code}).")
    except (urllib.error.URLError, OSError) as exc:
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
    return {"files": sent}


# Running a workflow (1.51.1): the user's workflow, saved from ComfyUI with Export (API), with formvis's inputs filled:
# the first Load Image takes the image, the first Load Image (as Mask) the mask, and a text node titled "formvis
# prompt" the prompt. Queued with POST /prompt; followed with /queue and /history; results fetched with /view.
PROMPT_TITLE = "formvis prompt"
#: Load Image nodes titled "formvis reference" (or "formvis reference 1", "2" and on) take the reference layers (1.51.4).
REFERENCE_TITLE = "formvis reference"


def _title(n: dict) -> str:
    return str(n.get("_meta", {}).get("title", "")).strip().lower()


def _fill(workflow: dict, image: str | None, mask: str | None, prompt: str | None, references: list[str] | None = None) -> dict:
    """The workflow with formvis's inputs; refuses one that is not in API format, or has nothing to take the image."""
    if not isinstance(workflow, dict) or "nodes" in workflow or not workflow or not all(isinstance(n, dict) and "class_type" in n for n in workflow.values()):
        raise HTTPException(status_code=422, detail="This workflow is in ComfyUI's editor format. In ComfyUI, save it with Export (API) and choose that file.")
    nodes = sorted(workflow.items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 10**9)
    refs = [n for _, n in nodes if n["class_type"] == "LoadImage" and _title(n).startswith(REFERENCE_TITLE)]
    loads = [n for _, n in nodes if n["class_type"] == "LoadImage" and not _title(n).startswith(REFERENCE_TITLE)]   # references are never the picture
    masks = [n for _, n in nodes if n["class_type"] == "LoadImageMask"]
    if image and loads:   # a workflow with no Load Image (text to image) runs on the prompt alone
        loads[0].setdefault("inputs", {})["image"] = image
    if mask and masks:
        masks[0].setdefault("inputs", {})["image"] = mask
    for node, name in zip(sorted(refs, key=_title), references or []):   # "formvis reference", "... 1", "... 2" in order
        node.setdefault("inputs", {})["image"] = name
    if prompt is not None:
        titled = [n for _, n in nodes if str(n.get("_meta", {}).get("title", "")).strip().lower() == PROMPT_TITLE and "text" in n.get("inputs", {})]
        for n in titled:
            n["inputs"]["text"] = prompt
    return workflow


@router.post("/run")
async def run(target: str = Form(...), workflow: str = Form(...), items: str = Form("[]"), prompt: str | None = Form(None), files: list[UploadFile] | None = File(None)) -> dict:
    """Uploads the inputs, fills the workflow and queues it. Replies with the job's id and what was filled."""
    base = _base(target)
    try:
        flow = json.loads(workflow)
    except ValueError:
        raise HTTPException(status_code=422, detail="That file is not a ComfyUI workflow (it is not JSON).")
    _fill(json.loads(workflow), None, None, None)   # its format checked before anything is uploaded
    takes_image = any(n.get("class_type") == "LoadImage" for n in flow.values())
    uploaded = await send(target=target, items=items, files=files) if takes_image and files else {"files": []}   # text to image sends nothing
    image = next((f["name"] for f in uploaded["files"] if f["kind"] not in ("mask", "reference")), None)
    references = [f["name"] for f in uploaded["files"] if f["kind"] == "reference"]
    mask = next((f["name"] for f in uploaded["files"] if f["kind"] == "mask"), None)
    flow = _fill(flow, image, mask, prompt, references)
    body = json.dumps({"prompt": flow, "client_id": "formvis"}).encode()
    try:
        with _request(base + "/prompt", body, {"Content-Type": "application/json"}, "POST") as r:
            reply = json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            err = json.loads(exc.read() or b"{}")
            detail = (err.get("error") or {}).get("message", "") if isinstance(err, dict) else ""
        except ValueError:
            pass
        raise HTTPException(status_code=502, detail=f"ComfyUI would not run the workflow ({exc.code}){': ' + detail if detail else ''}.")
    except (urllib.error.URLError, OSError) as exc:
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
    job = reply.get("prompt_id")
    if not job:
        raise HTTPException(status_code=502, detail="ComfyUI took the workflow but gave it no id.")
    used = sum(1 for n in flow.values() if n.get("class_type") == "LoadImage" and _title(n).startswith(REFERENCE_TITLE))
    return {"job": job, "references": min(used, len(references)), "image": image, "mask": mask if mask and any(n["class_type"] == "LoadImageMask" for n in flow.values()) else None,
            "prompt": prompt is not None and any(str(n.get("_meta", {}).get("title", "")).strip().lower() == PROMPT_TITLE for n in flow.values())}


@router.get("/job/{job}")
def job(job: str, target: str) -> dict:
    """queued (with how many are ahead), running, done (with the output images) or failed."""
    base = _base(target)
    try:
        with _request(f"{base}/history/{urllib.parse.quote(job)}", timeout=5) as r:
            history = json.loads(r.read() or b"{}")
        entry = history.get(job)
        if entry:
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                return {"state": "failed", "detail": "ComfyUI stopped the workflow with an error; its console says why."}
            images = [{"filename": i["filename"], "subfolder": i.get("subfolder", ""), "type": i.get("type", "output")}
                      for out in entry.get("outputs", {}).values() for i in out.get("images", []) if i.get("type", "output") == "output"]
            return {"state": "done", "images": images}
        with _request(base + "/queue", timeout=5) as r:
            queue = json.loads(r.read() or b"{}")
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
    running = [q[1] for q in queue.get("queue_running", []) if len(q) > 1]
    pending = [q[1] for q in queue.get("queue_pending", []) if len(q) > 1]
    if job in running:
        return {"state": "running"}
    if job in pending:
        return {"state": "queued", "ahead": pending.index(job) + len(running)}
    return {"state": "running"}   # between the queue and the history


@router.get("/image")
def image(target: str, filename: str, subfolder: str = "") -> Response:
    """One output image, fetched through ComfyUI's /view (only from its output folder)."""
    base = _base(target)
    q = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": "output"})
    try:
        with _request(f"{base}/view?{q}") as r:
            return Response(content=r.read(), media_type=r.headers.get("Content-Type", "image/png"))
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=404 if exc.code == 404 else 502, detail="ComfyUI no longer has that result.")
    except (urllib.error.URLError, OSError) as exc:
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)


@router.post("/cancel/{job}")
def cancel(job: str, target: str = Form(...)) -> dict:
    """Stops the job: interrupted if it is running, taken out of the queue if it is waiting."""
    base = _base(target)
    try:
        with _request(base + "/queue", json.dumps({"delete": [job]}).encode(), {"Content-Type": "application/json"}, "POST", 5):
            pass
        with _request(base + "/interrupt", b"{}", {"Content-Type": "application/json"}, "POST", 5):
            pass
    except (urllib.error.URLError, OSError) as exc:
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
    return {"cancelled": True}
