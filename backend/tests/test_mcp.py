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

from app.main import app
from app.routers import mcp as M

MODERN = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "test", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def rpc(client, method, params=None, id=1, headers=None):
    return client.post("/mcp", json={"jsonrpc": "2.0", "id": id, "method": method, "params": params or {}}, headers=headers or {})


def test_the_protocol(client):
    d = rpc(client, "server/discover", {"_meta": MODERN}).json()["result"]
    assert d["resultType"] == "complete" and d["supportedVersions"] == ["2026-07-28", "2025-11-25"] and d["capabilities"] == {"tools": {}}
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
    assert r["isError"] is True and "Allow outside agents" in r["content"][0]["text"]


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
