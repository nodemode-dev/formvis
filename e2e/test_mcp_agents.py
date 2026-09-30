# Outside agents over MCP (1.52.1): a real MCP client over HTTP, the running engine and this window.
import base64
import io
import json
import urllib.request

from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "e2e", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def call(name, args=None):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META, "name": name, "arguments": args or {}}}).encode()
    req = urllib.request.Request("http://127.0.0.1:8190/mcp", body, {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())["result"]


def agents(page, on):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    box = page.locator("input[aria-label='Allow outside agents']")
    box.check() if on else box.uncheck()
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)


def agents_on(page):
    """Agents allowed, and the engine told by the window's next poll (1.53.8): each test starts from this, not from
    whatever an earlier test in the same engine left (a refusal is remembered for ten minutes)."""
    import time
    agents(page, True)
    for _ in range(60):
        if not call("get_document").get("isError"):
            return
        time.sleep(0.5)


def test_an_agent_works_in_the_document(page):
    agents_on(page)
    page.evaluate("window.formvis.engine.newDocument(120, 80, 'Agent', 'white')")
    agents(page, True)
    doc = call("get_document")["structuredContent"]
    assert doc["name"] == "Agent" and doc["width"] == 120 and [l["name"] for l in doc["layers"]] == ["Background"]
    added = call("add_layer", {"name": "Paint"})["structuredContent"]["id"]
    assert call("set_layer", {"id": added, "opacity": 0.5})["content"][0]["text"].startswith("Updated")
    call("select", {"shape": "rectangle", "x": 10, "y": 10, "width": 30, "height": 20})
    call("fill", {"color": "#ff0000"})
    got = page.evaluate("(id) => { const l = window.formvis.engine.current.layer(id); return [l.name, l.opacity, Array.from(l.raster.ctx.getImageData(20, 20, 1, 1).data)]; }", added)
    assert got == ["Paint", 0.5, [255, 0, 0, 255]], got                                        # the agent's changes, in the document
    img = call("get_image", {"max_size": 64})["content"][0]
    assert img["type"] == "image" and Image.open(io.BytesIO(base64.b64decode(img["data"]))).size == (64, 43)
    call("undo")
    assert page.evaluate("(id) => Array.from(window.formvis.engine.current.layer(id).raster?.ctx.getImageData(20, 20, 1, 1).data ?? [0, 0, 0, 0])[3]", added) == 0   # the fill was one step
    missing = call("set_layer", {"id": "nope", "opacity": 1})
    assert missing["isError"] and "get_document" in missing["content"][0]["text"]


def test_money_asks_first_and_off_refuses(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'Ask', 'white')")
    agents(page, True)
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/generative/key", json.dumps({"key": "stand-in-key"}).encode(), {"Content-Type": "application/json"}, method="PUT"), timeout=10)
    try:
        call("select", {"shape": "all"})
        import threading
        out = {}
        t = threading.Thread(target=lambda: out.setdefault("r", call("generative_fill", {"prompt": "a lighthouse"}))); t.start()
        page.locator(DLG, has_text="An agent asks to run Generative Fill").wait_for(timeout=15000)
        assert "a lighthouse" in page.locator(f"{DLG} .cv-agent-ask").inner_text()
        page.locator(f"{DLG} .cv-dialog-foot button", has_text="Don't").click()
        t.join(timeout=20)
        assert out["r"]["isError"] and "declined" in out["r"]["content"][0]["text"]            # nothing spent
    finally:
        urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/generative/key", method="DELETE"), timeout=10)
    agents(page, False)
    r = call("get_document")
    assert r["isError"] and "Allow outside agents" in r["content"][0]["text"]                   # refused at once
    # Left as found (1.53.8): agents back on, and the engine told so by the window's next poll, so a second run of this file
    # in the same engine does not meet this test's refusal.
    agents_on(page)
