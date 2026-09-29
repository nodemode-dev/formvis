"""Send to ComfyUI (1.50.9): images into ComfyUI's input folder, through its documented HTTP API, so its Load Image and
Load Image (as Mask) nodes list them. GET /system_stats says whether ComfyUI runs (and its version); POST /upload/image
takes each image, into a formvis subfolder, replacing an earlier send of the same name."""

import json
import urllib.error

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services import outbound

router = APIRouter(prefix="/api/comfyui", tags=["comfyui"])
SUBFOLDER = "formvis"


def _base(target: str) -> str:
    return outbound.base(target, "ComfyUI", "http://127.0.0.1:8188")


@router.get("/status")
def status(target: str) -> dict:
    """Whether ComfyUI answers at `target`, and its version when it says."""
    base = _base(target)
    try:
        with outbound.request(base + "/system_stats", timeout=3) as r:
            stats = json.loads(r.read() or b"{}")
    except urllib.error.HTTPError:
        return {"running": False, "detail": f"Something answers at {base}, but it is not ComfyUI."}
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return {"running": False, "detail": str(outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc).detail)}
    system = stats.get("system") if isinstance(stats, dict) else None
    version = system.get("comfyui_version") if isinstance(system, dict) else None
    return {"running": True, **({"version": str(version)[:40]} if version else {})}


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
            with outbound.request(base + "/upload/image", body, {"Content-Type": kind}, "POST") as r:
                reply = json.loads(r.read() or b"{}")
            stored = reply.get("name") or f"{name}.png"
            folder = reply.get("subfolder", SUBFOLDER)
            sent.append({"name": f"{folder}/{stored}" if folder else stored, "kind": m.get("kind", "image")})
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"ComfyUI refused the upload ({exc.code}).")
    except (urllib.error.URLError, OSError) as exc:
        raise outbound.unreachable("ComfyUI", base, "Preferences > Plugins", exc)
    return {"files": sent}
