# Window > Assistant (1.52.2), with a stand-in model answering as the OpenAI-compatible chat API does, tool calls included.
import json
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

PANEL = ".cv-assistant"
DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def calls(*pairs):
    return {"tool_calls": [{"id": f"c{i}", "type": "function", "function": {"name": n, "arguments": json.dumps(a)}} for i, (n, a) in enumerate(pairs)], "content": None}


@pytest.fixture()
def model():
    seen = {"bodies": [], "script": []}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def do_GET(self):
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b'{"data": []}')

        def do_POST(self):
            seen["bodies"].append(json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)))))
            msg = seen["script"].pop(0) if seen["script"] else {"content": "Done."}
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"choices": [{"message": {"role": "assistant", **msg}}]}).encode())

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}/v1"
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/llm/settings", urllib.parse.urlencode({"base_url": base, "model": "stand-in"}).encode()), timeout=10)
    yield seen
    server.shutdown()


def ask(page, text):
    page.locator(f"{PANEL} textarea[aria-label='Message']").fill(text)
    page.locator(f"{PANEL} button", has_text="Send").click()


def test_a_turn_acts_shows_cards_and_undoes(page, model):
    model["script"] += [calls(("add_layer", {"name": "Sky"})), calls(("select", {"shape": "rectangle", "x": 0, "y": 0, "width": 60, "height": 20}), ("fill", {"color": "#3366ff"})), {"content": "Added a blue sky."}]
    page.evaluate("window.formvis.engine.newDocument(80, 60, 'A', 'white'); window.formvis.commands.run('assistant')")
    ask(page, "Add a blue sky band at the top.")
    page.locator(f"{PANEL} .cv-assistant-msg.is-assistant", has_text="Added a blue sky.").wait_for(timeout=20000)
    assert page.locator(f"{PANEL} .cv-assistant-card summary").all_inner_texts() == ["add_layer", "select", "fill"]
    sky = page.evaluate("(() => { const l = window.formvis.engine.current.doc.layers.find((x) => x.name === 'Sky'); return l ? Array.from(l.raster.ctx.getImageData(10, 10, 1, 1).data) : null; })()")
    assert sky == [51, 102, 255, 255], sky
    second = model["bodies"][1]
    tool_msgs = [m for m in second["messages"] if m["role"] == "tool"]
    assert tool_msgs and tool_msgs[0]["tool_call_id"] == "c0" and "Sky" in tool_msgs[0]["content"] and any(t["function"]["name"] == "fill" for t in second["tools"])
    page.locator(f"{PANEL} button", has_text="Undo This Turn").click()
    assert page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.name)") == ["Background"]   # back to before the message


def test_a_paid_call_asks_and_a_decline_reaches_the_model(page, model):
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/generative/key", json.dumps({"key": "stand-in-key"}).encode(), {"Content-Type": "application/json"}, method="PUT"), timeout=10)
    try:
        model["script"] += [calls(("generate_image", {"prompt": "a lighthouse"})), {"content": "All right, nothing generated."}]
        page.evaluate("window.formvis.engine.newDocument(60, 40, 'B', 'white'); window.formvis.commands.run('assistant')")
        ask(page, "Make me a lighthouse.")
        page.locator(DLG, has_text="An agent asks to run Generate Image").wait_for(timeout=15000)
        page.locator(f"{DLG} .cv-dialog-foot button", has_text="Don't").click()
        page.locator(f"{PANEL} .cv-assistant-msg.is-assistant", has_text="nothing generated").wait_for(timeout=15000)
        assert "declined" in page.locator(f"{PANEL} .cv-assistant-card.is-error .cv-assistant-result").text_content()   # inside a closed card
        assert any(m["role"] == "tool" and "declined" in m["content"] for m in model["bodies"][-1]["messages"])
    finally:
        urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/generative/key", method="DELETE"), timeout=10)
