"""The Assistant asks a question while the window is not in front (SC-AI-0108): the desktop shell's requestUserAttention(2) sets the
urgency hint (XUrgencyHint, bit 256) in the window's WM_HINTS on GTK and X11. A fake chat-completions service answers with a question
and no tool calls; the engine on 8190 is pointed at it through its rows and put back afterwards."""
import json
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from e2e.desktop import support
from e2e.desktop.test_linux_desktop_shell import centre, inspect  # noqa: F401

Xlib = pytest.importorskip("Xlib")
from Xlib import X, display as xdisplay  # noqa: E402

URGENCY = 256
QUESTION = "Which layer should I change?"


class FakeModel(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    seen: list = []

    def log_message(self, *_args):
        pass

    def do_GET(self):
        body = json.dumps({"data": [{"id": "fake"}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        asked = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        FakeModel.seen.append(asked)
        if asked.get("stream"):
            chunks = [
                {"choices": [{"delta": {"role": "assistant", "content": QUESTION}}]},
                {"choices": [{"delta": {}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8}},
            ]
            body = "".join(f"data: {json.dumps(c)}\n\n" for c in chunks).encode() + b"data: [DONE]\n\n"
            kind = "text/event-stream"
        else:
            body = json.dumps({"choices": [{"message": {"role": "assistant", "content": QUESTION}, "finish_reason": "stop"}],
                               "usage": {"prompt_tokens": 3, "completion_tokens": 5, "total_tokens": 8}}).encode()
            kind = "application/json"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def engine(path: str, method: str = "GET", form: dict | None = None):
    data = urllib.parse.urlencode(form).encode() if form is not None else None
    request = urllib.request.Request(f"http://127.0.0.1:{support.ENGINE_PORT}/api/llm{path}", data=data, method=method)
    with urllib.request.urlopen(request, timeout=20) as r:
        return json.load(r)


@pytest.fixture()
def fake_model():
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeModel)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    before = engine("/status")
    row = None
    try:
        row = engine("/rows", "POST", {"name": "attention-fake", "base_url": f"http://127.0.0.1:{server.server_address[1]}/v1", "model": "fake", "vision": "false"})
        added = [r for r in row["rows"] if r["name"] == "attention-fake"][-1]["id"]
        engine(f"/rows/{added}/use", "POST", {})
        yield added
    finally:
        if row is not None:
            if before.get("active"):
                engine(f"/rows/{before['active']}/use", "POST", {})
            for r in engine("/status")["rows"]:
                if r["name"] == "attention-fake":
                    engine(f"/rows/{r['id']}", "DELETE")
        server.shutdown()


def wm_hints_flags(display, window_id: int) -> int:
    window = display.create_resource_object("window", window_id)
    hints = window.get_wm_hints()
    return int(hints["flags"]) if hints else 0


def test_the_assistant_asking_sets_the_urgency_hint_when_the_window_is_not_in_front(fresh, fake_model):
    app = fresh
    app.launch()
    app.ok("new_document", {"width": 120, "height": 90})
    top = app.toplevel()
    assert top is not None
    reader = xdisplay.Display(app.xserver.display)
    other = reader.screen().root.create_window(0, 0, 80, 60, 0, reader.screen().root_depth, X.InputOutput, X.CopyFromParent,
                                               background_pixel=reader.screen().white_pixel, event_mask=X.StructureNotifyMask)
    other.set_wm_name("elsewhere")
    try:
        app.ok("run_command", {"id": "assistant"})
        box = app.wait_for(lambda: [b for b in inspect(app, ".cv-assistant .cv-input[aria-label=Message]") if b["visible"]], timeout=20, what="the Assistant's message box")[0]
        gx, gy = top.geometry()[:2]
        x, y = centre(box)
        top.click(gx + x, gy + y)
        top.keys("h", "e", "l", "l", "o")
        before = wm_hints_flags(reader, top.window)
        assert app.ok("ui_window", {"action": "size"}).get("focused"), "the page has focus while the message is typed"
        assert not before & URGENCY, f"the window is not urgent before the message is sent: flags {before}"

        other.map()
        reader.sync()
        reader.set_input_focus(other, X.RevertToParent, X.CurrentTime)
        reader.sync()
        app.ok("ping")
        app.wait_for(lambda: not app.ok("ui_window", {"action": "size"}).get("focused"), timeout=10, what="the page to lose focus")
        assert not wm_hints_flags(reader, top.window) & URGENCY
        send = [b for b in inspect(app, ".cv-assistant-foot .cv-btn-primary") if b["visible"]]
        assert send, "the Assistant's Send button is shown"
        seen = len(FakeModel.seen)
        sx, sy = centre(send[0])
        top.click(gx + sx, gy + sy)
        app.wait_for(lambda: len(FakeModel.seen) > seen, timeout=30, what="the fake model to be asked")
        flags = app.wait_for(lambda: wm_hints_flags(reader, top.window) & URGENCY, timeout=15, what="the urgency hint in WM_HINTS")
        assert flags & URGENCY
    finally:
        other.destroy()
        reader.sync()
        reader.close()


def test_the_assistant_asking_leaves_the_window_calm_while_it_is_in_front(fresh, fake_model):
    app = fresh
    app.launch()
    app.ok("new_document", {"width": 120, "height": 90})
    top = app.toplevel()
    reader = xdisplay.Display(app.xserver.display)
    try:
        app.ok("run_command", {"id": "assistant"})
        box = app.wait_for(lambda: [b for b in inspect(app, ".cv-assistant .cv-input[aria-label=Message]") if b["visible"]], timeout=20, what="the Assistant's message box")[0]
        gx, gy = top.geometry()[:2]
        x, y = centre(box)
        top.click(gx + x, gy + y)
        top.keys("h", "e", "l", "l", "o")
        assert app.ok("ui_window", {"action": "size"}).get("focused")
        seen = len(FakeModel.seen)
        top.keys("Return")
        app.wait_for(lambda: len(FakeModel.seen) > seen, timeout=30, what="the fake model to be asked")
        app.wait_for(lambda: [b for b in inspect(app, ".cv-assistant-msg.is-assistant") if b["visible"]], timeout=20, what="the question to be shown")
        assert app.ok("ui_window", {"action": "size"}).get("focused")
        assert not wm_hints_flags(reader, top.window) & URGENCY
    finally:
        reader.close()
