import json
import os
import subprocess

REPO = os.environ.get("FORMVIS_REPO", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MESSAGES = [
    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "covauto5", "version": "1"}}},
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "ping", "arguments": {}}},
    {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "get_document", "arguments": {}}},
]


def attach(url, count):
    env = dict(os.environ)
    if url:
        env["FORMVIS_MCP_URL"] = url
    feed = "\n".join(json.dumps(m) for m in MESSAGES[:count])
    r = subprocess.run(["bash", "-c", f"(printf '%s\\n' \"$FEED\"; sleep 8) | timeout 20 {REPO}/formvis mcp --attach 2>/dev/null"], env=dict(env, FEED=feed), capture_output=True, text=True, cwd="/tmp", timeout=60)
    return {o["id"]: o["result"] for o in (json.loads(l) for l in r.stdout.splitlines() if l.startswith("{"))}


def test_attach_only_mode_answers_with_just_ping_when_no_engine_runs():
    out = attach("http://127.0.0.1:1/mcp", 4)
    assert out[1]["serverInfo"]["version"] == "not running"
    assert [t["name"] for t in out[2]["tools"]] == ["ping"]
    assert out[3]["structuredContent"] == {"version": "not running", "window": False, "allowed": False, "documents": []}
    assert out[4]["isError"] and "not running" in out[4]["content"][0]["text"]


def test_attach_only_mode_passes_ping_to_a_running_engine_without_starting_anything():
    out = attach(None, 3)
    assert out[1]["serverInfo"]["name"] == "formvis" and out[1]["serverInfo"]["version"] != "not running"
    assert len(out[2]["tools"]) > 50
    assert out[3]["structuredContent"]["window"] is True and out[3]["structuredContent"]["version"] == out[1]["serverInfo"]["version"]
