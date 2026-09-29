"""An MCP server (1.52.1, the capability plan): outside agents (Claude Code, Claude Desktop, any MCP client) drive the open
formvis window. Streamable HTTP in stateless JSON mode at /mcp, following the 2026-07-28 specification (no initialize
handshake, no session; server/discover; the version on every request) and still answering initialize for clients of
2025-11-25. The Origin header is checked (only this computer), as the specification requires. The work happens in the
window, which collects requests from /api/mcp/bridge only while Allow outside agents is on in Preferences > Plugins;
anything that costs money asks the user there first."""

import asyncio
import collections
import itertools
import json
import time
import urllib.parse

from fastapi import APIRouter, Request, Response

from app import __version__

router = APIRouter()
VERSIONS = ["2026-07-28", "2025-11-25"]
INSTRUCTIONS = ("formvis is a layered image editor open on this computer. Call get_document first to see the document and its layers "
                "(ids for later calls), and get_image to see it. Every change is one undoable step. Generative tools cost the user "
                "money and ask them in formvis first.")


def _tool(name: str, description: str, props: dict, required: list[str] | None = None, **hints: bool) -> dict:
    return {"name": name, "description": description, "inputSchema": {"type": "object", "properties": props, "required": required or [], "additionalProperties": False},
            "annotations": {"readOnlyHint": hints.get("read", False), "destructiveHint": hints.get("destructive", False), "idempotentHint": hints.get("idempotent", False), "openWorldHint": hints.get("open", False)}}


_ID = {"type": "string", "description": "A layer id from get_document."}
TOOLS = [
    _tool("get_document", "The open document: name, size, resolution, colour mode, the layers bottom to top (id, name, kind, visible, opacity, blend, parent group), the active layer and the selection's bounds.", {}, read=True, idempotent=True),
    _tool("get_image", "The document as it looks, as a PNG image, its longer side at most max_size pixels.", {"max_size": {"type": "integer", "minimum": 64, "maximum": 2048, "default": 1024}}, read=True, idempotent=True),
    _tool("new_document", "Opens a new document.", {"width": {"type": "integer", "minimum": 1, "maximum": 30000}, "height": {"type": "integer", "minimum": 1, "maximum": 30000},
          "name": {"type": "string", "maxLength": 120}, "background": {"type": "string", "enum": ["white", "transparent", "black"], "default": "white"}}, ["width", "height"]),
    _tool("select", "Changes the selection: a rectangle (x, y, width, height in pixels) combined by mode, or all, or none.", {"shape": {"type": "string", "enum": ["rectangle", "all", "none"]},
          "x": {"type": "number"}, "y": {"type": "number"}, "width": {"type": "number", "minimum": 1}, "height": {"type": "number", "minimum": 1},
          "mode": {"type": "string", "enum": ["replace", "add", "subtract", "intersect"], "default": "replace"}}, ["shape"]),
    _tool("add_layer", "Adds an empty layer above the active one and makes it active; returns its id.", {"name": {"type": "string", "maxLength": 120}}),
    _tool("set_layer", "Changes a layer's name, visibility, opacity (0 to 1) or blend mode, or makes it the active layer.", {"id": _ID, "name": {"type": "string", "maxLength": 120},
          "visible": {"type": "boolean"}, "opacity": {"type": "number", "minimum": 0, "maximum": 1}, "blend": {"type": "string"}, "active": {"type": "boolean"}}, ["id"], idempotent=True),
    _tool("delete_layer", "Deletes a layer (undoable).", {"id": _ID}, ["id"], destructive=True),
    _tool("fill", "Fills the selection (or the whole active layer when nothing is selected) with a colour.", {"color": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "description": "#rrggbb"}}, ["color"]),
    _tool("add_adjustment", "Adds an adjustment layer (for example curves, levels, hsv, exposure, splitToning, halation, glow) with optional parameters.",
          {"kind": {"type": "string"}, "params": {"type": "object", "description": "The adjustment's parameters, as its Properties show them."}}, ["kind"]),
    _tool("place_image", "Places a PNG or JPEG image (base64) as a new layer at x, y.", {"data": {"type": "string", "description": "Base64 image data."}, "name": {"type": "string", "maxLength": 120},
          "x": {"type": "number", "default": 0}, "y": {"type": "number", "default": 0}}, ["data"]),
    _tool("undo", "Steps back through the document's history.", {"steps": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1}}),
    _tool("redo", "Steps forward through the document's history.", {"steps": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1}}),
    _tool("generative_fill", "Fills the selection from a prompt with FLUX.1 Fill on fal, the result a new layer masked to the selection. Costs the user money: they are asked in formvis first.",
          {"prompt": {"type": "string", "maxLength": 2000}}, ["prompt"], open=True),
    _tool("generate_image", "Generates a picture from a prompt as a new layer, with FLUX1.1 [pro] on fal. Costs the user money: they are asked in formvis first.",
          {"prompt": {"type": "string", "maxLength": 2000}}, ["prompt"], open=True),
]
NAMES = {t["name"] for t in TOOLS}

# The bridge to the window: requests queued here, collected by the window, answered back.
_pending: collections.deque = collections.deque()
_ready: asyncio.Event | None = None
_waiting: dict[str, asyncio.Future] = {}
_ids = itertools.count(1)
_seen = 0.0
LIVE = 30.0


def _event() -> asyncio.Event:
    global _ready
    if _ready is None:
        _ready = asyncio.Event()
    return _ready


def _put(item: dict, front: bool = False) -> None:
    (_pending.appendleft if front else _pending.append)(item)
    _event().set()


def _local_origin(origin: str | None) -> bool:
    if not origin:
        return True   # not a browser page
    host = urllib.parse.urlparse(origin).hostname or ""
    return host in ("localhost", "127.0.0.1", "::1", "tauri.localhost") or origin.startswith("tauri://")


def _ok(req_id, result: dict, modern: bool) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": {**result, **({"resultType": "complete"} if modern else {})}}


def _err(req_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


async def _call(name: str, args: dict) -> dict:
    """Runs a tool in the window; its MCP result."""
    if time.monotonic() - _seen > LIVE:
        return {"content": [{"type": "text", "text": "formvis is not taking requests: open formvis and turn on Allow outside agents in Preferences > Plugins."}], "isError": True}
    rid = str(next(_ids))
    fut = asyncio.get_running_loop().create_future()
    _waiting[rid] = fut
    _put({"id": rid, "name": name, "arguments": args})
    try:
        out = await asyncio.wait_for(fut, timeout=600)   # a generative call waits for the user and the model
    except asyncio.TimeoutError:
        return {"content": [{"type": "text", "text": "formvis did not answer in time."}], "isError": True}
    finally:
        _waiting.pop(rid, None)
    return out


@router.post("/mcp")
async def mcp(request: Request) -> Response:
    if not _local_origin(request.headers.get("origin")):
        return Response(status_code=403, content=json.dumps(_err(None, -32600, "Origin not allowed")), media_type="application/json")
    try:
        msg = json.loads(await request.body())
    except ValueError:
        return Response(content=json.dumps(_err(None, -32700, "Parse error")), media_type="application/json", status_code=400)
    if isinstance(msg, list):
        return Response(content=json.dumps(_err(None, -32600, "Batches are not supported")), media_type="application/json", status_code=400)
    req_id, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if req_id is None:
        return Response(status_code=202)   # a notification
    meta = params.get("_meta") or {}
    version = meta.get("io.modelcontextprotocol/protocolVersion") or request.headers.get("mcp-protocol-version") or "2025-11-25"
    modern = version == "2026-07-28"
    server = {"name": "formvis", "version": __version__}
    if version not in VERSIONS and method != "initialize":
        out = _err(req_id, -32602, f"Unsupported protocol version {version}; supported: {', '.join(VERSIONS)}")
    elif method == "server/discover":
        out = _ok(req_id, {"supportedVersions": VERSIONS, "capabilities": {"tools": {}}, "_meta": {"io.modelcontextprotocol/serverInfo": server}, "instructions": INSTRUCTIONS}, True)
    elif method == "initialize":
        asked = params.get("protocolVersion")
        out = _ok(req_id, {"protocolVersion": asked if asked in VERSIONS else "2025-11-25", "capabilities": {"tools": {}}, "serverInfo": server, "instructions": INSTRUCTIONS}, False)
    elif method == "ping":
        out = _ok(req_id, {}, modern)
    elif method == "tools/list":
        out = _ok(req_id, {"tools": TOOLS}, modern)
    elif method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        out = _ok(req_id, await _call(name, args), modern) if name in NAMES and isinstance(args, dict) else _err(req_id, -32602, f"No tool named {name}")
    else:
        out = _err(req_id, -32601, f"Method not found: {method}")
    return Response(content=json.dumps(out), media_type="application/json")


@router.get("/api/mcp/bridge/next")
async def bridge_next(request: Request) -> Response:
    """The window's long poll: the next request, or 204 after 20 seconds. Polling is what marks agents as allowed. A
    window that closed or reloaded mid-poll must not take a request with it: the connection is checked before and after
    taking one, and a request taken for a gone window goes back to the front for the next poll (1.52.1)."""
    global _seen
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        _seen = time.monotonic()
        if await request.is_disconnected():
            return Response(status_code=204)
        if not _pending:
            _event().clear()
            try:
                await asyncio.wait_for(_event().wait(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
        if not _pending:
            continue
        item = _pending.popleft()
        if await request.is_disconnected():
            _put(item, front=True)
            return Response(status_code=204)
        return Response(content=json.dumps(item), media_type="application/json")
    return Response(status_code=204)


@router.post("/api/mcp/bridge/result")
async def bridge_result(request: Request) -> dict:
    body = await request.json()
    fut = _waiting.get(str(body.get("id")))
    if fut and not fut.done():
        fut.set_result(body.get("result") or {"content": [{"type": "text", "text": "formvis gave no result."}], "isError": True})
    return {"ok": True}


@router.post("/api/mcp/bridge/stop")
async def bridge_stop() -> dict:
    """The window stopped taking requests (agents turned off): refuse at once, and answer anything queued."""
    global _seen
    _seen = 0.0
    while _pending:
        item = _pending.popleft()
        fut = _waiting.get(item["id"])
        if fut and not fut.done():
            fut.set_result({"content": [{"type": "text", "text": "formvis stopped taking requests."}], "isError": True})
    return {"ok": True}


@router.get("/api/mcp/status")
def status() -> dict:
    return {"live": time.monotonic() - _seen <= LIVE, "endpoint": "http://127.0.0.1:8190/mcp", "tools": len(TOOLS)}
