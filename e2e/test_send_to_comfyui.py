# File > Send to ComfyUI (1.50.9), against a stand-in ComfyUI answering /system_stats and /upload/image as its API
# documents them; each upload's fields and PNG size are recorded.
import json
import struct
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


@pytest.fixture()
def comfyui():
    seen = []

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _reply(self, code, obj):
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(json.dumps(obj).encode())

        def do_GET(self):
            self._reply(200, {"system": {"comfyui_version": "0.3.60"}, "devices": []}) if self.path == "/system_stats" else self._reply(404, {})

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            name = body.split(b'filename="', 1)[1].split(b'"', 1)[0].decode()
            field = lambda k: body.split(f'name="{k}"\r\n\r\n'.encode(), 1)[1].split(b"\r\n", 1)[0].decode()
            png = body[body.index(b"\x89PNG"):]
            w, h = struct.unpack(">II", png[16:24])
            seen.append({"name": name, "subfolder": field("subfolder"), "overwrite": field("overwrite"), "size": (w, h)})
            self._reply(200, {"name": name, "subfolder": field("subfolder"), "type": "input"})

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}", seen
    server.shutdown()


def set_address(page, url):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    box = page.locator("input[aria-label='ComfyUI address']")
    box.fill(url); box.press("Tab")


def test_the_selection_goes_whole_with_its_mask(page, comfyui):
    url, seen = comfyui
    set_address(page, url)
    page.wait_for_function("(u) => [...document.querySelectorAll('.cv-note[role=status]')].some((n) => n.textContent.includes('0.3.60 answered at ' + u))", arg=url)
    page.keyboard.press("Escape")
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(120, 80, 'Poster', 'white');
      e.applySelection(E.SelectionMask.cropped(10, 10, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's'); }""")
    page.evaluate("window.formvis.commands.run('send-comfyui')")
    page.locator(DLG, has_text="Send to ComfyUI").wait_for()
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) .cv-send-status').textContent.includes('Images go to its input folder')")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Send").click()
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('Sent to ComfyUI: formvis/Poster.png'))")
    assert [s["name"] for s in seen] == ["Poster.png", "Poster mask.png"]
    assert all(s["subfolder"] == "formvis" and s["overwrite"] == "true" and s["size"] == (120, 80) for s in seen), seen   # whole, for inpainting
    page.evaluate("window.formvis.engine.deselect()")


def test_comfyui_not_running_is_said(page):
    set_address(page, "http://127.0.0.1:9"); page.keyboard.press("Escape")
    page.evaluate("window.formvis.engine.newDocument(40, 30, 'X', 'white'); window.formvis.commands.run('send-comfyui')")
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) .cv-send-status').textContent.includes('not answering')")
    page.keyboard.press("Escape")
    set_address(page, "http://127.0.0.1:8188"); page.keyboard.press("Escape")
