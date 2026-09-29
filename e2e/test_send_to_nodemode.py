# File > Send to NodeMode (1.50.8), standalone, against a stand-in NodeMode: an upload answering with a file id, as
# NodeMode's does, and a receiver recording what formvis announces.
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


@pytest.fixture()
def nodemode():
    seen = {"uploads": 0, "announced": []}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _reply(self, code, body=b"{}"):
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            self._reply(405 if self.path == "/api/formvis/receive" else 200 if self.path == "/" else 404)

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.path == "/api/upload":
                seen["uploads"] += 1
                return self._reply(200, json.dumps({"file_id": f"f{seen['uploads']}.png"}).encode())
            if self.path == "/api/formvis/receive":
                seen["announced"].append(json.loads(body)); return self._reply(200)
            self._reply(404)

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}", seen
    server.shutdown()


def set_address(page, url):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    box = page.locator("input[aria-label='NodeMode address']")
    box.fill(url); box.press("Tab")
    return page.locator(DLG + " .cv-note[role='status']")


def test_send_the_selection_and_every_layer(page, nodemode):
    url, seen = nodemode
    note = set_address(page, url)
    page.wait_for_function("(u) => [...document.querySelectorAll('.cv-note[role=status]')].some((n) => n.textContent.includes('running at ' + u))", arg=url)
    page.keyboard.press("Escape")
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(120, 80, 'Poster', 'white'); e.addLayer();
      e.fg = { r: 200, g: 30, b: 30 }; e.applySelection(E.SelectionMask.cropped(10, 10, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's'); }""")
    page.evaluate("window.formvis.commands.run('send-nodemode')")
    page.locator(DLG, has_text="Send to NodeMode").wait_for()
    page.wait_for_function("(u) => document.querySelector('.cv-scrim:not([hidden]) .cv-send-status').textContent.includes('running at ' + u)", arg=url)
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Send").click()
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('Sent to NodeMode'))")
    a = seen["announced"][-1]
    assert seen["uploads"] == 2 and [f["kind"] for f in a["files"]] == ["image", "mask"] and a["files"][1]["maskOf"] == 0
    assert (a["files"][0]["width"], a["files"][0]["height"]) == (40, 30) and a["title"] == "Poster"
    page.evaluate("window.formvis.commands.run('send-nodemode')")
    page.locator(f"{DLG} select[aria-label='Send']").select_option("layers")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Send").click()
    for _ in range(60):                                                                           # the second announcement arriving
        if len(seen["announced"]) >= 2: break
        page.wait_for_timeout(100)
    assert len(seen["announced"]) == 2
    assert len(seen["announced"][-1]["files"]) == 1                                                # the one layer with pixels (the Background)
    page.evaluate("window.formvis.engine.deselect()")


def test_nodemode_not_running_is_said(page):
    set_address(page, "http://127.0.0.1:9")
    page.keyboard.press("Escape")
    page.evaluate("window.formvis.engine.newDocument(40, 30, 'X', 'white'); window.formvis.commands.run('send-nodemode')")
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) .cv-send-status').textContent.includes('not answering')")
    page.keyboard.press("Escape")
    set_address(page, "http://localhost:8000"); page.keyboard.press("Escape")
