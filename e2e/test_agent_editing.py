# Natural-language editing through MCP (1.53.3): a sequence an agent would run, against the real engine and window,
# each step's result checked; files written and read at real paths; generative fill choosing LaMa on its own.
import json
import os
import urllib.request

from PIL import Image

MODERN = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "test-agent", "version": "1"}}


def tool(tool_name, **args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": MODERN, "name": tool_name, "arguments": args}}).encode()
    req = urllib.request.Request("http://127.0.0.1:8190/mcp", body, {"Content-Type": "application/json", "Accept": "application/json", "MCP-Protocol-Version": "2026-07-28"})
    r = json.loads(urllib.request.urlopen(req, timeout=180).read())["result"]
    return r


def ok(tool_name, **args):
    r = tool(tool_name, **args)
    assert not r.get("isError"), (tool_name, r)
    return r


def test_an_agent_edits_saves_exports_and_reopens(page, tmp_path):
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/generative/key", method="DELETE"), timeout=10)
    page.evaluate("() => { localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), agentsAllowed: true })); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: true })); }")
    page.wait_for_timeout(1200)
    px = lambda x, y: page.evaluate("([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)", [x, y])
    ok("new_document", width=400, height=300, name="Poster", background="white")
    shape = ok("draw_shape", kind="rectangle", x=40, y=40, width=150, height=100, fill="#3366ff")["structuredContent"]["id"]
    assert px(100, 90) == [51, 102, 255]
    ok("transform_layer", id=shape, x=60, y=60)
    assert px(45, 45) == [255, 255, 255] and px(200, 150) == [51, 102, 255]                  # moved by 20, 20
    text = ok("add_text", text="Hello", x=240, y=120, size=40, color="#111111")["structuredContent"]["id"]
    ok("set_layer", id=shape, active=True)
    refused = tool("apply_filter", kind="gaussianBlur", settings={"radius": 6})
    assert refused["isError"] and "rasterize_layer" in refused["content"][0]["text"]            # a shape layer: says what to do
    ok("rasterize_layer", id=shape)
    ok("apply_filter", kind="gaussianBlur", settings={"radius": 6})
    page.wait_for_function("() => { const f = window.formvis.engine.flattened().getContext('2d').getImageData(60, 110, 1, 1).data; return f[0] > 60 && f[0] < 250; }", timeout=20000)   # the edge softened
    doc = json.loads(ok("get_document")["content"][0]["text"])
    assert {l["id"] for l in doc["layers"]} >= {shape, text} and [d["name"] for d in doc["documents"]].count("Poster") == 1
    ok("select", shape="ellipse", x=100, y=80, width=60, height=60)
    filled = ok("generative_fill")                                                             # auto: LaMa, here with no fal key
    assert filled["structuredContent"]["model"] == "lama" and "LaMa on this computer" in filled["content"][0]["text"]
    ok("select", shape="none")
    png, fmv = tmp_path / "poster.png", tmp_path / "poster.fmv"
    assert ok("export_image", path=str(png))["structuredContent"]["bytes"] > 1000 and Image.open(png).size == (400, 300)
    assert ok("save_project", path=str(fmv))["structuredContent"]["bytes"] > 1000 and fmv.read_bytes()[:2] == b"PK"   # a .fmv is a zip
    reopened = ok("open_file", path=str(png))["structuredContent"]
    assert (reopened["width"], reopened["height"]) == (400, 300)
    docs = json.loads(ok("get_document")["content"][0]["text"])["documents"]
    assert len(docs) >= 2
    poster = next(d for d in docs if d["name"] == "Poster")
    ok("switch_document", id=poster["id"])
    ok("resize_image", width=200, height=150)
    assert page.evaluate("[window.formvis.engine.current.name, window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == ["Poster", 200, 150]
    bad = tool("export_image", path="relative/out.png")
    assert bad["isError"] and "absolute path" in bad["content"][0]["text"]                   # how to fix it
    missing = tool("open_file", path=str(tmp_path / "nothing.png"))
    assert missing["isError"] and "no file" in missing["content"][0]["text"]
