"""PC-AU-0137: the app detects being framed and talks to its parent by postMessage. A parent page from a scratch http server
(another origin) frames the dev page: the app posts ready, the parent answers init and close, the app's Send to canvas posts
plugin:<id>:assign with the picture, and HostLink's save and close post their messages."""
import functools
import http.server
import socket
import tempfile
import threading
from pathlib import Path

import pytest

from .conftest import URL

PARENT = """<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="f" style="width:1300px;height:800px;border:0"></iframe>
<script>
window.got = [];
window.addEventListener('message', (e) => { if (e.source === document.getElementById('f').contentWindow) window.got.push(e.data); });
document.getElementById('f').src = %r;
</script>"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture()
def parent(context):
    with tempfile.TemporaryDirectory(prefix="formvis-host-") as tmp:
        Path(tmp, "index.html").write_text(PARENT % URL)
        port = free_port()
        assert port not in (5190, 8190)
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Quiet, directory=tmp))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{port}/")
        yield page
        assert not errors, errors
        srv.shutdown()
        srv.server_close()


def child_of(page):
    page.wait_for_function("window.got.length > 0", timeout=60000)
    frame = next(f for f in page.frames if f != page.main_frame)
    frame.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return frame


def test_the_framed_app_says_ready_and_takes_init_and_close(parent):
    frame = child_of(parent)
    assert parent.evaluate("window.got[0]") == {"type": "ready", "wantsLiveUpdates": False}
    assert frame.evaluate("window.parent !== window")
    parent.evaluate("document.getElementById('f').contentWindow.postMessage({ type: 'init', pluginId: 'canvas', panelId: 'p1', initialState: { a: 1 } }, '*')")
    parent.evaluate("document.getElementById('f').contentWindow.postMessage({ type: 'close' }, '*')")
    parent.evaluate("document.getElementById('f').contentWindow.postMessage('junk', '*')")
    parent.wait_for_timeout(300)
    assert frame.evaluate("!!document.querySelector('.cv-stage-col')"), "the app is still up after init, close and a stray message"


def test_send_to_canvas_posts_assign_with_the_picture(parent):
    frame = child_of(parent)
    parent.evaluate("document.getElementById('f').contentWindow.postMessage({ type: 'init', pluginId: 'canvas', panelId: 'p1', initialState: null }, '*')")
    frame.evaluate("window.formvis.engine.newDocument(40, 30, 'Sent', 'white')")
    assert frame.evaluate("window.formvis.commands.run('send-host')")
    parent.wait_for_function("window.got.some((m) => m && m.type && m.type.endsWith(':assign'))", timeout=30000)
    msg = parent.evaluate("window.got.find((m) => m && m.type && m.type.endsWith(':assign'))")
    assert msg["type"] == "plugin:canvas:assign", msg
    f = msg["payload"]["files"][0]
    assert f["name"] == "Sent.png" and f["mime"] == "image/png" and (f["width"], f["height"]) == (40, 30)
    assert f["dataUrl"].startswith("data:image/png;base64,")


def test_the_link_posts_save_and_close_to_the_parent(parent):
    frame = child_of(parent)
    parent.evaluate("document.getElementById('f').contentWindow.postMessage({ type: 'init', pluginId: 'canvas', panelId: 'p1', initialState: null }, '*')")
    frame.evaluate("""async () => {
      const H = await import('/src/host.ts');
      const link = new H.HostLink(() => undefined, () => undefined);
      link.save({ doc: 'state' });
      link.close();
    }""")
    parent.wait_for_function("window.got.some((m) => m && m.type === 'close')", timeout=10000)
    got = parent.evaluate("window.got")
    assert {"type": "save", "state": {"doc": "state"}} in got and {"type": "close"} in got, got


def test_the_unframed_app_is_not_embedded(page):
    assert page.evaluate("window.parent === window")
    assert page.evaluate("document.querySelector('[data-cmd=send-host]')") is None
