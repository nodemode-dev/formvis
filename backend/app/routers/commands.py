"""The command catalogue (DEV_PLAN 28.3): everything formvis can do, as one list. The window builds it (frontend/src/automation/
catalogue.ts) and mirrors it here at boot and whenever it changes; GET /api/commands reads it, POST /api/commands/{id} runs a
command by handing it to the window over the agent bridge (the run_command message, answered by the window's runCommand)."""

import asyncio
import json
import threading
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core import config
from app.routers import mcp
from app.routers.terminal import require_local

router = APIRouter(prefix="/api/commands")

FILE = "commands-catalogue.json"
_lock = threading.Lock()
_state: dict = {"size": 0, "missing": [], "commands": [], "at": 0.0}


class Mirror(BaseModel):
    size: int = 0
    missing: list[str] = Field(default_factory=list)
    commands: list[dict] = Field(default_factory=list)


class Run(BaseModel):
    params: dict = Field(default_factory=dict)


def _load() -> None:
    if _state["commands"]:
        return
    try:
        saved = json.loads((config.data_dir() / FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    with _lock:
        _state.update(size=saved.get("size", 0), missing=saved.get("missing", []), commands=saved.get("commands", []), at=saved.get("at", 0.0))


def _find(cid: str) -> dict | None:
    return next((c for c in _state["commands"] if c.get("id") == cid), None)


@router.post("/catalogue")
def mirror(body: Mirror, request: Request) -> dict:
    """The window's catalogue, kept in memory and in the data folder (./formvis counts --commands reads that file)."""
    require_local(request)
    with _lock:
        _state.update(size=len(body.commands), missing=body.missing, commands=body.commands, at=time.time())
        text = json.dumps({"size": _state["size"], "missing": _state["missing"], "at": _state["at"], "commands": body.commands})
    try:
        (config.data_dir() / FILE).write_text(text, encoding="utf-8")
    except OSError:
        pass
    return {"ok": True, "size": _state["size"]}


@router.get("")
def catalogue(group: str = "", text: str = "") -> dict:
    """The catalogue as the window last mirrored it; group and text narrow it. live says whether a window is answering now."""
    _load()
    g, t = group.strip().lower(), text.strip().lower()
    rows = [c for c in _state["commands"] if (not g or str(c.get("group", "")).lower() == g)
            and (not t or t in f"{c.get('id', '')} {c.get('label', '')} {c.get('description', '')} {c.get('when', '')}".lower())]
    return {"size": _state["size"], "shown": len(rows), "missing": _state["missing"], "live": mcp._live(), "commands": rows,
            "hint": "" if _state["commands"] else "The catalogue is empty: open the formvis window (./formvis boot), wait a few seconds, then ask again."}


@router.get("/{cid}")
def describe(cid: str) -> dict:
    _load()
    found = _find(cid)
    if found is None:
        near = [c["id"] for c in _state["commands"] if cid.split(".")[-1].split("-")[-1].lower() in c.get("id", "").lower()][:5]
        raise HTTPException(404, f"No command has the id {cid}." + (f" Did you mean {', '.join(near)}?" if near else "") + " List them with GET /api/commands?text=word.")
    return found


@router.post("/{cid}")
async def run(cid: str, request: Request, body: Run | None = None) -> dict:
    """Runs a command in the open window, as an ordinary undoable step. The answer is { ok, result? | error? }: an error says what to do next."""
    require_local(request)
    _load()
    found = _find(cid)
    if _state["commands"] and found is None:
        raise HTTPException(404, f"No command has the id {cid}. List them with GET /api/commands?text=word.")
    task = asyncio.ensure_future(mcp._call("run_command", {"id": cid, "params": body.params if body else {}}))
    if await mcp._until_gone(request, task):
        return {"ok": False, "error": "The caller hung up; the queued request was dropped."}
    out = task.result()
    text = " ".join(c.get("text", "") for c in out.get("content", []) if c.get("type") == "text").strip()
    risky = bool(found and found.get("risky"))
    if out.get("isError"):
        return {"ok": False, "error": text or "formvis gave no reason. Check the formvis window, then retry.", "risky": risky}
    structured = out.get("structuredContent") or {}
    return {"ok": True, "result": structured.get("result", text), "risky": risky}
