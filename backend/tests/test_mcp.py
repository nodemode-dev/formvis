"""The MCP server (1.52.1): the 2026-07-28 stateless protocol and 2025-11-25's initialize, the checks, the window bridge,
and the stdio bridge program against a running engine."""

import asyncio
import json
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
import uvicorn

import os

os.environ["FORMVIS_OPEN_WINDOW"] = "0"   # no real browser is opened by any engine test (1.53.3)

from app.main import app  # noqa: E402
from app.routers import mcp as M  # noqa: E402

MODERN = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "test", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def rpc(client, method, params=None, id=1, headers=None):
    return client.post("/mcp", json={"jsonrpc": "2.0", "id": id, "method": method, "params": params or {}}, headers=headers or {})


def test_the_protocol(client):
    d = rpc(client, "server/discover", {"_meta": MODERN}).json()["result"]
    assert d["resultType"] == "complete" and d["supportedVersions"] == ["2026-07-28", "2025-11-25"] and d["capabilities"] == {"tools": {}, "prompts": {}, "resources": {}}
    assert d["_meta"]["io.modelcontextprotocol/serverInfo"]["name"] == "formvis" and "get_document" in d["instructions"]
    init = rpc(client, "initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "old", "version": "1"}}).json()["result"]
    assert init["protocolVersion"] == "2025-11-25" and init["serverInfo"]["name"] == "formvis" and "resultType" not in init
    tools = rpc(client, "tools/list", {"_meta": MODERN}).json()["result"]["tools"]
    names = {t["name"] for t in tools}
    assert {"get_document", "get_image", "generative_fill", "undo"} <= names and all(t["inputSchema"]["type"] == "object" for t in tools)
    assert next(t for t in tools if t["name"] == "get_document")["annotations"]["readOnlyHint"] is True
    assert next(t for t in tools if t["name"] == "generative_fill")["annotations"]["openWorldHint"] is True
    assert client.post("/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}).status_code == 202
    assert rpc(client, "tools/list", headers={"Origin": "https://evil.example"}).status_code == 403                  # DNS rebinding
    assert rpc(client, "tools/list", headers={"Origin": "http://localhost:5190"}).status_code == 200
    assert client.post("/mcp", json=[{"jsonrpc": "2.0", "id": 1, "method": "ping"}]).status_code == 400                  # no batches
    assert rpc(client, "tools/list", {"_meta": {"io.modelcontextprotocol/protocolVersion": "1999-01-01"}}).json()["error"]["code"] == -32602
    assert rpc(client, "nope/nothing", {"_meta": MODERN}).json()["error"]["code"] == -32601


def test_a_tool_call_without_a_window_says_so(client):
    M._seen = 0.0
    r = rpc(client, "tools/call", {"_meta": MODERN, "name": "get_document", "arguments": {}}).json()["result"]
    assert r["isError"] is True and "./formvis boot" in r["content"][0]["text"]                  # 1.53.3: how to start it


def test_a_tool_call_goes_through_the_window():
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            M._pending.clear(); M._ready = None
            first = asyncio.create_task(c.get("/api/mcp/bridge/next"))           # the window starts collecting
            await asyncio.sleep(0.05)

            async def window():
                r = await first
                item = r.json()
                assert item["name"] == "set_layer" and item["arguments"] == {"id": "L1", "opacity": 0.5}
                await c.post("/api/mcp/bridge/result", json={"id": item["id"], "result": {"content": [{"type": "text", "text": "done"}]}})

            w = asyncio.create_task(window())
            r = await c.post("/mcp", json={"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"_meta": MODERN, "name": "set_layer", "arguments": {"id": "L1", "opacity": 0.5}}})
            await w
            return r.json()
    out = asyncio.run(run())
    assert out == {"jsonrpc": "2.0", "id": 7, "result": {"content": [{"type": "text", "text": "done"}], "resultType": "complete"}}


def test_the_stdio_bridge_against_a_running_engine():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    t = threading.Thread(target=server.run, daemon=True); t.start()
    for _ in range(100):
        if server.started: break
        time.sleep(0.05)
    try:
        lines = [json.dumps({"jsonrpc": "2.0", "id": 1, "method": "server/discover", "params": {"_meta": MODERN}}),
                 json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}),
                 json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {"_meta": MODERN}})]
        script = Path(__file__).resolve().parents[2] / "setup" / "mcp_stdio.py"
        p = subprocess.run([sys.executable, str(script)], input="\n".join(lines) + "\n", capture_output=True, text=True, timeout=30, env={"FORMVIS_MCP_URL": f"http://127.0.0.1:{port}/mcp", "PATH": "/usr/bin:/bin"})
        out = [json.loads(l) for l in p.stdout.splitlines()]
        assert [o["id"] for o in out] == [1, 2] and out[0]["result"]["supportedVersions"][0] == "2026-07-28" and len(out[1]["result"]["tools"]) == len(M.TOOLS)
        assert p.stderr == ""                                                                                      # nothing but protocol on stdout
    finally:
        server.should_exit = True; t.join(timeout=5)


def _reset():
    M._pending.clear(); M._ready = None; M._allowed = False; M._declined_until = 0.0; M._seen = 0.0; M._opened_at = 0.0


def test_not_allowed_asks_once_in_the_window_then_runs(monkeypatch):
    """1.53.3: the window polls with agents not allowed; the engine sends only the question; Allow, and the tool runs."""
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            _reset()
            seen = []

            async def window():
                while len(seen) < 2:
                    r = await c.get(f"/api/mcp/bridge/next?allowed={0 if not seen else 1}")
                    if r.status_code != 200:
                        continue
                    item = r.json(); seen.append(item["name"])
                    result = {"allowed": True} if item["name"] == "__consent__" else {"content": [{"type": "text", "text": "ran"}]}
                    await c.post("/api/mcp/bridge/result", json={"id": item["id"], "result": result})

            w = asyncio.create_task(window())
            await asyncio.sleep(0.05)
            r = await c.post("/mcp", json={"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"_meta": MODERN, "name": "get_document", "arguments": {}}})
            await w
            return seen, r.json()["result"]
    seen, result = asyncio.run(run())
    assert seen == ["__consent__", "get_document"] and result["content"][0]["text"] == "ran" and M._allowed is True


def test_not_now_says_how_to_recover_and_is_not_asked_again_at_once():
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            _reset()

            async def window():
                r = await c.get("/api/mcp/bridge/next?allowed=0")
                item = r.json()
                await c.post("/api/mcp/bridge/result", json={"id": item["id"], "result": {"allowed": False}})

            w = asyncio.create_task(window())
            await asyncio.sleep(0.05)
            first = (await c.post("/mcp", json={"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"_meta": MODERN, "name": "get_document", "arguments": {}}})).json()["result"]
            await w
            M._seen = time.monotonic()   # the window still open
            second = (await c.post("/mcp", json={"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"_meta": MODERN, "name": "get_document", "arguments": {}}})).json()["result"]
            return first, second, len(M._pending)
    first, second, queued = asyncio.run(run())
    assert first["isError"] and "did not allow" in first["content"][0]["text"] and "Preferences > Plugins" in first["content"][0]["text"]
    assert second["isError"] and "chose not to" in second["content"][0]["text"] and queued == 0   # not asked again


def test_no_window_opens_formvis_and_waits_for_it(monkeypatch):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            _reset()
            opened = []

            def opener():
                opened.append(True)

                async def appear():   # the window formvis opened starts polling, agents allowed
                    await asyncio.sleep(0.3)
                    r = await c.get("/api/mcp/bridge/next?allowed=1")
                    item = r.json()
                    await c.post("/api/mcp/bridge/result", json={"id": item["id"], "result": {"content": [{"type": "text", "text": "ran"}]}})
                asyncio.get_running_loop().create_task(appear())
                return True
            monkeypatch.setattr(M, "_open_window", opener)
            r = await c.post("/mcp", json={"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"_meta": MODERN, "name": "get_document", "arguments": {}}})
            return opened, r.json()["result"]
    opened, result = asyncio.run(run())
    assert opened == [True] and result["content"][0]["text"] == "ran"


def test_a_window_that_was_just_here_is_waited_for_not_replaced(monkeypatch):
    """A reload or a busy moment pauses the window's polling: the call waits for it instead of opening another or
    saying formvis is not open (1.53.3)."""
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            _reset()
            M._allowed = True
            M._seen = time.monotonic() - 40            # stale, but here 40 seconds ago
            opened = []
            monkeypatch.setattr(M, "_open_window", lambda: opened.append(True) or True)

            async def back():                           # the reloaded window polls again after two seconds
                await asyncio.sleep(2)
                r = await c.get("/api/mcp/bridge/next?allowed=1")
                item = r.json()
                await c.post("/api/mcp/bridge/result", json={"id": item["id"], "result": {"content": [{"type": "text", "text": "ran"}]}})
            b = asyncio.create_task(back())
            r = await c.post("/mcp", json={"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"_meta": MODERN, "name": "get_document", "arguments": {}}})
            await b
            return opened, r.json()["result"]
    opened, result = asyncio.run(run())
    assert opened == [] and result["content"][0]["text"] == "ran"


def test_the_strategy_prompt_and_current_instructions(client):
    disc = rpc(client, "server/discover", {"_meta": MODERN}).json()["result"]
    assert disc["capabilities"]["prompts"] == {} and "rasterize_layer" in disc["instructions"] and "this computer first" in disc["instructions"]
    listed = rpc(client, "prompts/list", {"_meta": MODERN}).json()["result"]["prompts"]
    assert [p["name"] for p in listed] == ["edit_strategy"]
    got = rpc(client, "prompts/get", {"_meta": MODERN, "name": "edit_strategy"}).json()["result"]
    text = got["messages"][0]["content"]["text"]
    from app.routers.mcp import NAMES
    import re
    named = set(re.findall(r"\b([a-z]+(?:_[a-z]+)+)\b", text)) - {"edit_strategy"}
    assert named and named <= NAMES, named - NAMES                                        # every tool it names exists
    assert rpc(client, "prompts/get", {"_meta": MODERN, "name": "nope"}).json()["error"]["code"] == -32602
