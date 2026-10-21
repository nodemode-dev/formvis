import base64
import io
import json
import time
import urllib.request

import pytest
from PIL import Image

META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covauto5", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def tool(name, /, **args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META, "name": name, "arguments": args}}).encode()
    req = urllib.request.Request("http://127.0.0.1:8190/mcp", body, {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28"})
    r = json.loads(urllib.request.urlopen(req, timeout=120).read())["result"]
    assert not r.get("isError"), (name, r)
    return r


def policy(p):
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/agents/policy", json.dumps({"client": "covauto5", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)


@pytest.fixture()
def agent(page):
    policy("allow")
    page.evaluate("() => { localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), agentsAllowed: true })); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: true })); }")
    for _ in range(60):
        try:
            if tool("ping")["structuredContent"].get("allowed"):
                break
        except Exception:
            pass
        time.sleep(0.5)
    yield page
    policy("ask")




def thickness(page, curve):
    tool("new_document", width=200, height=60, name="Pen", background="white")
    tool("ui_set", tool="brush", foreground="#000000", zoom=1)
    page.evaluate("(c) => { window.formvis.engine.pressureCurve = c; }", curve)
    ev = [{"type": "down", "x": 20, "y": 30, "pressure": 0.5}, {"type": "move", "x": 100, "y": 30, "pressure": 0.5}, {"type": "move", "x": 180, "y": 30, "pressure": 0.5}, {"type": "up", "x": 180, "y": 30, "pressure": 0.5}]
    tool("ui_pointer", events=ev)
    img = png(tool("get_image")).convert("L")
    return sum(1 for yy in range(0, 60) if img.getpixel((100, yy)) < 128)


def png(result):
    return Image.open(io.BytesIO(base64.b64decode(result["content"][0]["data"])))


def test_the_pressure_response_curve_changes_how_thick_a_half_pressure_pen_stroke_paints(agent):
    linear = thickness(agent, None)
    soft = thickness(agent, [0, 0.35, 0.6, 0.8, 1])
    firm = thickness(agent, [0, 0.1, 0.3, 0.6, 1])
    assert 0 < firm < linear < soft
