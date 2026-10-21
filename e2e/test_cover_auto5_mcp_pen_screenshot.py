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


def png(result):
    c = result["content"][0]
    assert c["type"] == "image" and c["mimeType"] == "image/png"
    return Image.open(io.BytesIO(base64.b64decode(c["data"])))


def test_simulated_pen_strokes_paint_thicker_with_more_pressure_and_one_history_step_each(agent):
    tool("new_document", width=200, height=120, name="Pen", background="white")
    assert tool("ui_set", tool="brush", foreground="#000000", zoom=1)["structuredContent"]["set"] == ["tool brush", "zoom 100%", "foreground #000000"]
    for pressure, y in ((1.0, 30), (0.2, 80)):
        r = tool("ui_pointer", events=[{"type": "down", "x": 20, "y": y, "pressure": pressure}, {"type": "move", "x": 100, "y": y, "pressure": pressure}, {"type": "move", "x": 180, "y": y, "pressure": pressure}, {"type": "up", "x": 180, "y": y, "pressure": pressure}])["structuredContent"]
        assert (r["sent"], r["tool"], r["historySteps"], r["held"]) == (4, "brush", 1, False)
    img = png(tool("get_image")).convert("L")
    assert img.size == (200, 120)
    thick = sum(1 for yy in range(5, 55) if img.getpixel((100, yy)) < 128)
    thin = sum(1 for yy in range(55, 105) if img.getpixel((100, yy)) < 128)
    assert thick > thin > 0


def test_the_screenshot_command_returns_a_scaled_png_of_the_window_and_refuses_a_hidden_element(agent):
    tool("new_document", width=200, height=120, name="Shot", background="white")
    shot = png(tool("ui_screenshot", max_size=300))
    assert max(shot.size) == 300 and shot.size[0] > shot.size[1]
    r = json.loads(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/mcp", json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META, "name": "ui_screenshot", "arguments": {"selector": ".cv-dialog:not(.x-none-shown)", "max_size": 300}}}).encode(), {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28"}), timeout=60).read())["result"]
    assert r["isError"] and "is not visible" in r["content"][0]["text"]
