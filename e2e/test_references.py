# Reference layers for ComfyUI workflows (1.51.4), against a stand-in ComfyUI.
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
FLOW = {"10": {"class_type": "LoadImage", "inputs": {"image": "x.png"}},
        "30": {"class_type": "LoadImage", "inputs": {"image": "r.png"}, "_meta": {"title": "formvis reference"}}, "20": {"class_type": "SaveImage", "inputs": {}}}


@pytest.fixture()
def comfy():
    seen = {"prompts": []}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _reply(self, code, obj=None, raw=None, kind="application/json"):
            self.send_response(code); self.send_header("Content-Type", kind); self.end_headers(); self.wfile.write(raw if raw is not None else json.dumps(obj or {}).encode())

        def do_GET(self):
            if self.path.startswith("/history/"):
                return self._reply(200, {"j1": {"status": {"status_str": "success"}, "outputs": {"20": {"images": [{"filename": "r.png", "subfolder": "", "type": "output"}]}}}})
            if self.path.startswith("/view?"):
                b = io.BytesIO(); Image.new("RGBA", (8, 8), (20, 200, 60, 255)).save(b, "PNG"); return self._reply(200, raw=b.getvalue(), kind="image/png")
            self._reply(200, {})

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.path == "/upload/image":
                return self._reply(200, {"name": body.split(b'filename="', 1)[1].split(b'"', 1)[0].decode(), "subfolder": "formvis", "type": "input"})
            if self.path == "/prompt": seen["prompts"].append(json.loads(body)["prompt"]); return self._reply(200, {"prompt_id": "j1"})
            self._reply(200)

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}", seen
    server.shutdown()


def test_a_reference_layer_reaches_the_titled_node(page, comfy, tmp_path):
    url, seen = comfy
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    box = page.locator("input[aria-label='ComfyUI address']"); box.fill(url); box.press("Tab"); page.keyboard.press("Escape")
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(80, 60, 'Poster', 'white'); e.addLayer(); e.fg = { r: 40, g: 60, b: 210 }; e.paintBucket({ x: 5, y: 5 }); e.renameLayer ? e.renameLayer(e.activeLayer.id, 'Style') : (e.activeLayer.name = 'Style'); }""")
    wf = tmp_path / "flow.json"; wf.write_text(json.dumps(FLOW))
    page.evaluate("window.formvis.commands.run('comfyui-run')")
    page.locator(f"{DLG} input[type=file][aria-label='Workflow']").set_input_files(str(wf))
    page.locator(f"{DLG} .cv-refs-row", has_text="Style").locator("input").check()
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Run").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some((l) => l.name === 'ComfyUI result')", timeout=15000)
    sent = seen["prompts"][-1]
    assert sent["30"]["inputs"]["image"] == "formvis/Style.png" and sent["10"]["inputs"]["image"] == "formvis/Poster.png", sent


def test_fal_takes_no_references(page):
    page.evaluate("window.formvis.engine.newDocument(80, 60, 'X', 'white'); localStorage.removeItem('formvis.comfyui.recipes')")
    page.evaluate("(async () => { const E = await import('/src/engine/index.ts'); window.formvis.engine.applySelection(E.SelectionMask.cropped(0, 0, 10, 10, new Uint8Array(100).fill(255)), 'replace', 's'); window.formvis.commands.run('generative-fill'); })()")
    page.locator(DLG, has_text="Generative Fill").wait_for()
    assert page.locator(f"{DLG} .cv-refs-row input").first.is_disabled()
    assert "fal models take no references" in page.locator(f"{DLG} .cv-refs .cv-note").inner_text()
    page.keyboard.press("Escape")
