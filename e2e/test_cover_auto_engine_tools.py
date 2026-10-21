import json
import urllib.error
import urllib.request

import pytest
from PIL import Image

META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covauto-engine", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}
URL = "http://127.0.0.1:8190"


def post(body, path="/mcp"):
    data = body if isinstance(body, bytes) else json.dumps(body).encode()
    req = urllib.request.Request(URL + path, data, {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28"})
    try:
        r = urllib.request.urlopen(req, timeout=60)
        return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def tool(name, **args):
    status, body = post({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META, "name": name, "arguments": args}})
    assert status == 200, body
    return body["result"]


def text(r):
    return r["content"][0]["text"]


def test_file_roots_lists_the_system_folders_and_the_reply_caps():
    r = tool("file_roots")
    d = r["structuredContent"]
    assert d["restricted"] is False and d["roots"] == [] and "/etc" in d["system_folders_refused"]
    assert d["text_chars"] == 200000 and d["image_bytes"] == 12582912 and d["request_bytes"] > 0 and d["reply_bytes"] > 0
    lim = json.loads(urllib.request.urlopen(URL + "/api/agents/limits", timeout=10).read())
    assert lim["text_chars"] == d["text_chars"] and lim["image_bytes"] == d["image_bytes"]


def test_file_info_needs_an_absolute_path_and_refuses_system_folders(tmp_path):
    p = tmp_path / "x.png"
    Image.new("RGB", (30, 20), (1, 2, 3)).save(p)
    ok = tool("file_info", path=str(p))
    assert not ok.get("isError") and (ok["structuredContent"]["width"], ok["structuredContent"]["height"]) == (30, 20)
    rel = tool("file_info", path="relative.png")
    assert rel["isError"] and "absolute path" in text(rel)
    out = tool("convert_file", path=str(p), output_path="/etc/x.png")
    assert out["isError"] and "system location" in text(out) and not __import__("os").path.exists("/etc/x.png")


def test_the_transport_refuses_oversize_and_malformed_bodies():
    status, body = post(b"x" * (5 * 1024 * 1024))
    assert status == 400
    status, body = post(b"{bad")
    assert status == 400 and body["error"]["code"] == -32700


def test_jobs_cancel_names_the_fix_for_an_unknown_job():
    cancel = tool("jobs_cancel", id="no-such-job")
    assert cancel["isError"] and "jobs_list" in text(cancel)


def test_registration_lines_name_the_endpoint_and_the_launcher():
    reg = json.loads(urllib.request.urlopen(URL + "/api/mcp/registration", timeout=10).read())
    assert reg["claude_code"] == "claude mcp add --transport http formvis " + reg["url"] and reg["url"].endswith("/mcp")
    assert reg["claude_code_launcher"].startswith("claude mcp add formvis -- ") and reg["launcher"] in reg["claude_code_launcher"]
    cfg = json.loads(reg["claude_desktop"])
    assert cfg["mcpServers"]["formvis"] == {"command": reg["launcher"], "args": ["mcp"]}
    st = json.loads(urllib.request.urlopen(URL + "/api/mcp/status", timeout=10).read())
    assert st["endpoint"] == reg["url"] and st["tools"] == len(json.loads(json.dumps(post({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {"_meta": META}})[1]["result"]["tools"])))
