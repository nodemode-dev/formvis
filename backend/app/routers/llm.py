"""Prompt improvement (1.51.5): the language model's settings, its models, and improving a prompt."""

from fastapi import APIRouter, Form, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.core import config
from app.routers.terminal import require_local
from app.services import llm

router = APIRouter(prefix="/api/llm", tags=["llm"])


def _run(fn, *args):
    try:
        return fn(*args)
    except llm.LlmError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@router.get("/status")
def status() -> dict:
    return llm.status()


@router.post("/settings")
def settings(base_url: str = Form(...), model: str = Form(...), key: str | None = Form(None), forget_key: bool = Form(False)) -> dict:
    s = _run(llm.save, base_url, model, key, forget_key)
    return {k: s[k] for k in ("configured", "baseUrl", "model", "hasKey", "store")}


@router.post("/rows")
def add_row(name: str = Form(""), base_url: str = Form(...), model: str = Form(...), vision: bool = Form(False), key: str | None = Form(None)) -> dict:
    return _run(llm.save_row, None, name, base_url, model, vision, key, False)


@router.put("/rows/{row_id}")
def change_row(row_id: str, name: str = Form(""), base_url: str = Form(...), model: str = Form(...), vision: bool = Form(False), key: str | None = Form(None), forget_key: bool = Form(False)) -> dict:
    return _run(llm.save_row, row_id, name, base_url, model, vision, key, forget_key)


@router.post("/rows/{row_id}/use")
def use_row(row_id: str) -> dict:
    return _run(llm.use_row, row_id)


@router.delete("/rows/{row_id}")
def delete_row(row_id: str) -> dict:
    return _run(llm.delete_row, row_id)


@router.get("/templates")
def template_files(request: Request) -> dict:
    """The Markdown files in the data folder's prompt-templates folder (made on first use): a file named like a kept
    template overrides it. The window reads them and parses the front matter."""
    require_local(request)
    folder = config.data_dir() / "prompt-templates"
    folder.mkdir(parents=True, exist_ok=True)
    files = []
    for f in sorted(folder.glob("*.md"))[:100]:
        try:
            if f.stat().st_size <= 64_000:
                files.append({"file": f.name, "text": f.read_text(encoding="utf-8", errors="replace")})
        except OSError:
            continue
    return {"folder": str(folder), "files": files}


@router.get("/models")
async def models() -> dict:
    return {"models": await run_in_threadpool(_run, llm.models)}


@router.post("/chat")
async def chat(request: Request) -> dict:
    """The assistant's step: the conversation in, the model's message out, with formvis's tools (the MCP catalogue, as
    functions) attached here so there is one catalogue."""
    from app.routers.mcp import TOOLS
    body = await request.json()
    skip = {str(n) for n in body.get("exclude") or []} if isinstance(body.get("exclude"), list) else set()
    tools = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["inputSchema"]}} for t in TOOLS if t["name"] not in skip] if body.get("tools", True) else []
    return await run_in_threadpool(_run, llm.chat, body.get("messages"), tools)


@router.get("/tools")
def tools(request: Request) -> dict:
    """The tool names the assistant may call, for the excluded-tools setting."""
    require_local(request)
    from app.routers.mcp import TOOLS
    return {"tools": [{"name": t["name"], "description": t["description"][:160], "read": bool(t["annotations"]["readOnlyHint"])} for t in TOOLS]}


@router.get("/chats")
def chats(request: Request) -> dict:
    require_local(request)
    return {"chats": llm.chats()}


@router.get("/chats/{chat_id}")
def chat_get(chat_id: str, request: Request) -> dict:
    require_local(request)
    return _run(llm.chat_get, chat_id)


@router.put("/chats/{chat_id}")
async def chat_put(chat_id: str, request: Request) -> dict:
    require_local(request)
    return await run_in_threadpool(_run, llm.chat_put, chat_id, await request.json())


@router.delete("/chats")
def chats_clear(request: Request) -> dict:
    require_local(request)
    return {"deleted": llm.chats_clear()}


@router.delete("/chats/{chat_id}")
def chat_delete(chat_id: str, request: Request) -> dict:
    require_local(request)
    _run(llm.chat_delete, chat_id)
    return {"ok": True}


@router.post("/improve")
async def improve(prompt: str = Form(...), instructions: str = Form("")) -> dict:
    return {"prompt": await run_in_threadpool(_run, llm.improve, prompt, instructions)}
