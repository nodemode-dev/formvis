"""Send to ComfyUI (1.50.9): images into ComfyUI's input folder, through its documented HTTP API, so its Load Image and
Load Image (as Mask) nodes list them. GET /system_stats says whether ComfyUI runs (and its version); POST /upload/image
takes each image, into a formvis subfolder, replacing an earlier send of the same name."""

import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile

from app.core import config
from app.routers.terminal import require_local
from app.services import comfyui_auth, outbound

try:
    from websockets.sync.client import connect as _ws_connect
except ImportError:   # without it a run still works, its progress bar just stays unknown
    _ws_connect = None

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


RECIPE_NAME = re.compile(r"[\w ().-]{1,100}")


def _recipe_dir() -> Path:
    folder = config.data_dir() / "recipes"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _recipe_file(name: str) -> Path:
    name = name[:-5] if name.lower().endswith(".json") else name
    if not RECIPE_NAME.fullmatch(name) or name.startswith("."):
        raise HTTPException(status_code=400, detail="That is not a name a recipe can be kept under.")
    return _recipe_dir() / f"{name}.json"


@router.get("/recipe-files")
def recipe_files(request: Request) -> dict:
    """The workflows kept as files in the data folder's recipes folder (made on first use)."""
    require_local(request)
    files = []
    for f in sorted(_recipe_dir().glob("*.json"))[:100]:
        try:
            if f.stat().st_size <= 500_000:
                files.append({"name": f.stem, "text": f.read_text(encoding="utf-8", errors="replace")})
        except OSError:
            continue
    return {"folder": str(_recipe_dir()), "files": files}


@router.put("/recipe-files/{name}")
async def recipe_file_put(name: str, request: Request) -> dict:
    require_local(request)
    body = await request.body()
    if len(body) > 500_000:
        raise HTTPException(status_code=413, detail="A recipe is 500 KB at most.")
    path = _recipe_file(name)
    temp = path.with_suffix(".tmp")
    temp.write_bytes(body)
    temp.replace(path)
    return {"ok": True}


@router.delete("/recipe-files/{name}")
def recipe_file_delete(name: str, request: Request) -> dict:
    require_local(request)
    _recipe_file(name).unlink(missing_ok=True)
    return {"ok": True}


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


@router.get("/graph")
def last_graph(target: str) -> dict:
    """The graph of the newest job ComfyUI ran, in the API format its history keeps, to save as a recipe. 404 when it has run nothing."""
    base = _base(target)
    try:
        with _request(base + "/history?max_items=1", timeout=10) as r:
            hist = json.loads(r.read() or b"{}")
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
    for entry in reversed(list(hist.values())) if isinstance(hist, dict) else []:
        prompt = entry.get("prompt") if isinstance(entry, dict) else None
        if isinstance(prompt, list) and len(prompt) > 2 and isinstance(prompt[2], dict) and prompt[2]:
            return {"workflow": json.dumps(prompt[2])}
    raise HTTPException(status_code=404, detail="ComfyUI has not run a graph yet. Queue the graph in ComfyUI once, then save it here.")


def _get_json(base: str, path: str, timeout: float):
    with _request(base + path, timeout=timeout) as r:
        return json.loads(r.read() or b"null")


def _needs(flow: dict) -> tuple[set[str], list[tuple[str, str, str]]]:
    """The node classes a workflow uses, and the model file names its nodes pick (class, input, file)."""
    classes, files = set(), []
    for node in flow.values():
        if not isinstance(node, dict) or not isinstance(node.get("class_type"), str):
            continue
        kind = node["class_type"]
        classes.add(kind)
        if kind in ("LoadImage", "LoadImageMask"):
            continue
        for key, value in (node.get("inputs") or {}).items():
            if isinstance(value, str) and key.endswith("_name") and key != "sampler_name" and value:
                files.append((kind, key, value))
    return classes, files


def _offered(info: dict, kind: str, key: str) -> list[str] | None:
    """The choices a node's input offers (its model files), or None when the input is not a list of choices."""
    ins = info.get(kind, {}).get("input", {}) if isinstance(info.get(kind), dict) else {}
    for part in ("required", "optional"):
        spec = (ins.get(part) or {}).get(key)
        if isinstance(spec, list) and spec and isinstance(spec[0], list):
            return [str(x) for x in spec[0]]
    return None


@router.post("/probe")
def probe(target: str = Form(...), recipes: str = Form("[]")) -> dict:
    """Test (SC-AI-0146): how ComfyUI answers (time, version, Python, system, devices with their memory, queue counts, node
    packs) and, for each kept recipe sent as [{name, workflow}], the nodes it needs that are missing and the model files
    it picks that ComfyUI does not list."""
    base = _base(target)
    began = time.perf_counter()
    try:
        stats = _get_json(base, "/system_stats", 4)
    except urllib.error.HTTPError:
        return {"running": False, "detail": f"Something answers at {base}, but it is not ComfyUI."}
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return {"running": False, "detail": str(outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc).detail)}
    out: dict = {"running": True, "ms": round((time.perf_counter() - began) * 1000)}
    system = stats.get("system") if isinstance(stats, dict) and isinstance(stats.get("system"), dict) else {}
    for key, name in (("comfyui_version", "version"), ("python_version", "python"), ("pytorch_version", "pytorch"), ("os", "os")):
        if system.get(key):
            out[name] = str(system[key])[:80]
    out["devices"] = [{"name": str(d.get("name", ""))[:80], "type": str(d.get("type", ""))[:16], "vram": int(d.get("vram_total") or 0), "free": int(d.get("vram_free") or 0)}
                      for d in (stats.get("devices") or [] if isinstance(stats, dict) else []) if isinstance(d, dict)][:8]
    try:
        queue = _get_json(base, "/queue", 4)
        out["queue"] = {"running": len(queue.get("queue_running", [])), "pending": len(queue.get("queue_pending", []))}
    except (urllib.error.URLError, OSError, ValueError, AttributeError):
        pass
    try:   # the packs that add web extensions, and their versions when the node manager is installed
        listed = _get_json(base, "/extensions", 4)
        packs = {str(p).split("/")[2]: None for p in listed if isinstance(p, str) and p.startswith("/extensions/") and p.count("/") >= 3 and p.split("/")[2] != "core"}
        try:
            for name, meta in (_get_json(base, "/customnode/installed", 4) or {}).items():
                if isinstance(meta, dict) and meta.get("ver"):
                    same = next((p for p in packs if p.lower() == str(name).lower()), str(name))
                    packs[same] = str(meta["ver"])[:30]
        except (urllib.error.URLError, OSError, ValueError, AttributeError):
            pass
        out["packs"] = [{"name": n[:60], **({"version": v} if v else {})} for n, v in sorted(packs.items())][:60]
    except (urllib.error.URLError, OSError, ValueError, TypeError, IndexError):
        pass
    try:
        kept = json.loads(recipes)
        assert isinstance(kept, list)
    except (ValueError, AssertionError):
        raise HTTPException(status_code=422, detail="The list of recipes to check was not understood.")
    info: dict[str, dict] = {}
    checked = []
    for item in kept[:40]:
        try:
            flow = json.loads(item["workflow"]) if isinstance(item.get("workflow"), str) else item["workflow"]
            classes, files = _needs(flow)
        except (ValueError, KeyError, TypeError, AttributeError):
            continue
        missing_nodes, missing_models = [], []
        for kind in sorted(classes):
            if kind not in info and len(info) < 120:
                try:
                    got = _get_json(base, "/object_info/" + urllib.parse.quote(kind, safe=""), 10)
                    info[kind] = got.get(kind) if isinstance(got, dict) and isinstance(got.get(kind), dict) else {}
                except urllib.error.HTTPError:
                    info[kind] = {}
                except (urllib.error.URLError, OSError, ValueError):
                    raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", OSError())
            if not info.get(kind):
                missing_nodes.append(kind)
        known = {k: {"input": v.get("input", {})} for k, v in info.items() if v}
        for kind, key, value in files:
            choices = _offered(known, kind, key)
            if choices is not None and value.replace("\\", "/") not in [c.replace("\\", "/") for c in choices]:
                missing_models.append({"node": kind, "input": key, "name": value[:120]})
        checked.append({"name": str(item.get("name", ""))[:80], "nodes": len(classes), "models": len(files), "missing_nodes": missing_nodes[:20], "missing_models": missing_models[:20]})
    out["recipes"] = checked
    return out


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


MIRROR_KEEP = 64
MIRROR_BYTES = 256_000_000


def _mirror_dir() -> Path:
    folder = config.data_dir() / "comfy-inputs"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _mirror(name: str, data: bytes) -> None:
    """A copy of each file sent to ComfyUI, in the data folder: the newest of each name (as ComfyUI keeps it, overwritten),
    MIRROR_KEEP at most, the oldest out. A copy that cannot be written does not stop the send."""
    if len(data) > MIRROR_BYTES // 8:
        return
    try:
        folder = _mirror_dir()
        temp = folder / f".{uuid.uuid4().hex[:8]}.tmp"
        temp.write_bytes(data)
        temp.replace(folder / f"{name}.png")
        files = sorted(folder.glob("*.png"), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        while files and (len(files) > MIRROR_KEEP or total > MIRROR_BYTES):
            old = files.pop(0)
            total -= old.stat().st_size
            old.unlink(missing_ok=True)
    except OSError:
        pass


@router.get("/mirror")
def mirror_list(request: Request) -> dict:
    """The pictures formvis has sent to ComfyUI that the data folder still holds, newest first (name as ComfyUI lists it, size, time)."""
    require_local(request)
    files = []
    for f in sorted(_mirror_dir().glob("*.png"), key=lambda p: -p.stat().st_mtime):
        try:
            st = f.stat()
            files.append({"name": f"{SUBFOLDER}/{f.name}", "bytes": st.st_size, "time": st.st_mtime})
        except OSError:
            continue
    return {"folder": str(_mirror_dir()), "files": files}


@router.post("/reupload")
def reupload(request: Request, target: str = Form(...), names: str = Form(...)) -> dict:
    """Sends mirrored pictures to ComfyUI again, for an input folder ComfyUI emptied or a ComfyUI that was reinstalled.
    `names` is JSON, a list of input names as ComfyUI lists them (formvis/ref0.png). Replies with what was sent and what
    the data folder no longer holds."""
    require_local(request)
    base = _base(target)
    try:
        wanted = json.loads(names)
        assert isinstance(wanted, list) and 0 < len(wanted) <= 64 and all(isinstance(n, str) for n in wanted)
    except (ValueError, AssertionError):
        raise HTTPException(status_code=422, detail="Name the pictures to send again as a list of ComfyUI input names.")
    sent, missing = [], []
    try:
        for n in wanted:
            stem = n.split("/", 1)[-1]
            stem = stem[:-4] if stem.lower().endswith(".png") else stem
            path = _mirror_dir() / f"{stem}.png"
            if not stem or "/" in stem or "\\" in stem or stem.startswith(".") or not path.is_file():
                missing.append(n)
                continue
            body, kind = outbound.multipart("image", path.name, path.read_bytes(), {"type": "input", "subfolder": SUBFOLDER, "overwrite": "true"})
            with _request(base + "/upload/image", body, {"Content-Type": kind}, "POST") as r:
                reply = json.loads(r.read() or b"{}")
            stored = reply.get("name") or path.name
            folder = reply.get("subfolder", SUBFOLDER)
            sent.append(f"{folder}/{stored}" if folder else stored)
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"ComfyUI refused the upload ({exc.code}).")
    except (urllib.error.URLError, OSError) as exc:
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
    return {"sent": sent, "missing": missing}


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
            data = await f.read()
            body, kind = outbound.multipart("image", f"{name}.png", data, {"type": "input", "subfolder": SUBFOLDER, "overwrite": "true"})
            with _request(base + "/upload/image", body, {"Content-Type": kind}, "POST") as r:
                reply = json.loads(r.read() or b"{}")
            stored = reply.get("name") or f"{name}.png"
            folder = reply.get("subfolder", SUBFOLDER)
            _mirror(name, data)
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


CONTROL_TITLE = "formvis control "
CONTROL_ROLES = ("scribble", "depth", "edges", "pose")


def _fill(workflow: dict, image: str | None, mask: str | None, prompt: str | None, references: list[str] | None = None, controls: dict[str, str] | None = None) -> dict:
    """The workflow with formvis's inputs; refuses one that is not in API format, or has nothing to take the image."""
    if not isinstance(workflow, dict) or "nodes" in workflow or not workflow or not all(isinstance(n, dict) and "class_type" in n for n in workflow.values()):
        raise HTTPException(status_code=422, detail="This workflow is in ComfyUI's editor format. In ComfyUI, save it with Export (API) and choose that file.")
    nodes = sorted(workflow.items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 10**9)
    refs = [n for _, n in nodes if n["class_type"] == "LoadImage" and _title(n).startswith(REFERENCE_TITLE)]
    loads = [n for _, n in nodes if n["class_type"] == "LoadImage" and not _title(n).startswith((REFERENCE_TITLE, CONTROL_TITLE))]   # references and controls are never the picture
    masks = [n for _, n in nodes if n["class_type"] == "LoadImageMask"]
    if image and loads:   # a workflow with no Load Image (text to image) runs on the prompt alone
        loads[0].setdefault("inputs", {})["image"] = image
    if mask and masks:
        masks[0].setdefault("inputs", {})["image"] = mask
    for node, name in zip(sorted(refs, key=_title), references or []):   # "formvis reference", "... 1", "... 2" in order
        node.setdefault("inputs", {})["image"] = name
    for _, node in nodes:
        role = _title(node)[len(CONTROL_TITLE):] if node["class_type"] == "LoadImage" and _title(node).startswith(CONTROL_TITLE) else ""
        if role in CONTROL_ROLES and role in (controls or {}):
            node.setdefault("inputs", {})["image"] = controls[role]
    if prompt is not None:
        titled = [n for _, n in nodes if str(n.get("_meta", {}).get("title", "")).strip().lower() == PROMPT_TITLE and "text" in n.get("inputs", {})]
        for n in titled:
            n["inputs"]["text"] = prompt
    return workflow


# Progress (SC-AI-0149): ComfyUI tells the client that queued a job its steps over a websocket. Each run takes its own client
# id; a thread follows that socket (reconnecting if it drops) and keeps the latest step value and max for /job.
_PROGRESS: dict[str, dict] = {}
_CLIENT: dict[str, str] = {}
_STOP: dict[str, threading.Event] = {}


def _watch(base: str, client: str, ready: threading.Event) -> None:
    stop = _STOP[client]
    url = ("wss" if base.startswith("https") else "ws") + base[base.index(":"):] + "/ws?clientId=" + client
    end, tries = time.monotonic() + 3600, 0
    while not stop.is_set() and time.monotonic() < end and tries < 6:
        try:
            with _ws_connect(url, additional_headers=comfyui_auth.headers() or None, open_timeout=3, max_size=2**25) as ws:
                ready.set()
                while not stop.is_set() and time.monotonic() < end:
                    try:
                        msg = ws.recv(timeout=1)
                    except TimeoutError:
                        continue
                    if not isinstance(msg, str):
                        continue
                    try:
                        m = json.loads(msg)
                        kind, data = m.get("type"), m.get("data") or {}
                    except (ValueError, AttributeError):
                        continue
                    if kind == "progress":
                        _PROGRESS[client] = {"value": int(data.get("value") or 0), "max": int(data.get("max") or 0)}
                    elif (kind == "executing" and data.get("node") is None) or kind in ("execution_error", "execution_interrupted", "execution_success"):
                        return
        except Exception:
            tries += 1
            ready.set()
            stop.wait(1)
    ready.set()


def _follow(base: str, client: str) -> None:
    """Starts following one run's socket and waits a moment for it to connect, so no early step is missed."""
    if _ws_connect is None:
        return
    for old in list(_STOP)[:-30]:
        _STOP.pop(old).set()
        _PROGRESS.pop(old, None)
    _STOP[client] = threading.Event()
    ready = threading.Event()
    threading.Thread(target=_watch, args=(base, client, ready), daemon=True).start()
    ready.wait(2)


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
    image = next((f["name"] for f in uploaded["files"] if f["kind"] not in ("mask", "reference") and not str(f["kind"]).startswith("control ")), None)
    references = [f["name"] for f in uploaded["files"] if f["kind"] == "reference"]
    controls = {str(f["kind"])[len("control "):]: f["name"] for f in uploaded["files"] if str(f["kind"]).startswith("control ")}
    mask = next((f["name"] for f in uploaded["files"] if f["kind"] == "mask"), None)
    flow = _fill(flow, image, mask, prompt, references, controls)
    client = "formvis-" + uuid.uuid4().hex[:12]
    _follow(base, client)
    body = json.dumps({"prompt": flow, "client_id": client}).encode()
    try:
        with _request(base + "/prompt", body, {"Content-Type": "application/json"}, "POST") as r:
            reply = json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as exc:
        if client in _STOP:
            _STOP[client].set()
        detail = ""
        try:
            err = json.loads(exc.read() or b"{}")
            detail = (err.get("error") or {}).get("message", "") if isinstance(err, dict) else ""
        except ValueError:
            pass
        raise HTTPException(status_code=502, detail=f"ComfyUI would not run the workflow ({exc.code}){': ' + detail if detail else ''}.")
    except (urllib.error.URLError, OSError) as exc:
        if client in _STOP:
            _STOP[client].set()
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
    job = reply.get("prompt_id")
    if not job:
        if client in _STOP:
            _STOP[client].set()
        raise HTTPException(status_code=502, detail="ComfyUI took the workflow but gave it no id.")
    if client in _STOP:
        _CLIENT[str(job)] = client
        for old in list(_CLIENT)[:-60]:
            _CLIENT.pop(old, None)
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
    step = _PROGRESS.get(_CLIENT.get(job, ""))
    if job in pending:
        return {"state": "queued", "ahead": pending.index(job) + len(running)}
    return {"state": "running", **({"progress": step} if step and step["max"] > 0 else {})}   # not in either list: between the queue and the history


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
    stop = _STOP.get(_CLIENT.get(job, ""))
    if stop:
        stop.set()
    try:
        with _request(base + "/queue", json.dumps({"delete": [job]}).encode(), {"Content-Type": "application/json"}, "POST", 5):
            pass
        with _request(base + "/interrupt", b"{}", {"Content-Type": "application/json"}, "POST", 5):
            pass
    except (urllib.error.URLError, OSError) as exc:
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
    return {"cancelled": True}
