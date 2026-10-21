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


def result(r):
    return r["structuredContent"]["result"] if "result" in r["structuredContent"] else r["structuredContent"]


def test_composite_pixel_over_the_agent_bridge_reads_the_blended_colour_and_refuses_a_point_outside(agent):
    tool("new_document", width=20, height=10, name="Comp", background="white")
    agent.evaluate("() => { const e = window.formvis.engine; e.fg = { r: 0, g: 0, b: 255 }; e.selectAll(); e.fill('fg'); e.deselect(); e.addLayer({ name: 'Half' }); e.fg = { r: 255, g: 0, b: 0 }; e.selectAll(); e.fill('fg'); e.deselect(); e.setLayerOpacity ? e.setLayerOpacity(e.activeLayer.id, 0.5) : (e.activeLayer.opacity = 0.5); }")
    agent.wait_for_timeout(500)
    r = tool("run_command", id="composite-pixel", params={"x": 3, "y": 4})
    got = result(r)
    flat = agent.evaluate("() => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(3, 4, 1, 1).data)")
    text = json.dumps(r["structuredContent"])
    for k, v in zip(("r", "g", "b"), flat):
        assert f'"{k}": {v}' in text
    assert f'"hex": "#{flat[0]:02x}{flat[1]:02x}{flat[2]:02x}"' in text
    with pytest.raises(AssertionError) as err:
        tool("run_command", id="composite-pixel", params={"x": 99, "y": 4})
    assert "x and y must lie inside the canvas" in str(err.value.args[0]) or "'isError': True" in str(err.value)
    assert flat[0] > 0 and flat[2] > 0 and flat[3] == 255
