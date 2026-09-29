# ComfyUI workflows as Generative Fill's model, and Edit > Generate Image (1.51.2), against a stand-in ComfyUI.
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
INPAINT = {"6": {"class_type": "CLIPTextEncode", "inputs": {"text": ""}, "_meta": {"title": "formvis prompt"}},
           "10": {"class_type": "LoadImage", "inputs": {"image": "x.png"}}, "11": {"class_type": "LoadImageMask", "inputs": {"image": "m.png", "channel": "red"}},
           "20": {"class_type": "SaveImage", "inputs": {}}}
TEXT = {"6": {"class_type": "CLIPTextEncode", "inputs": {"text": ""}, "_meta": {"title": "formvis prompt"}}, "20": {"class_type": "SaveImage", "inputs": {}}}


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
                b = io.BytesIO(); Image.new("RGBA", (64, 64), (20, 200, 60, 255)).save(b, "PNG"); return self._reply(200, raw=b.getvalue(), kind="image/png")
            self._reply(200, {"queue_running": [], "queue_pending": []} if self.path == "/queue" else {})

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


def address(page, url):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    box = page.locator("input[aria-label='ComfyUI address']"); box.fill(url); box.press("Tab"); page.keyboard.press("Escape")


def test_a_workflow_as_generative_fills_model(page, comfy, tmp_path):
    url, seen = comfy
    address(page, url)
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(120, 80, 'Poster', 'white');
      e.applySelection(E.SelectionMask.cropped(20, 20, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's'); }""")
    page.evaluate("window.formvis.commands.run('generative-fill')")
    page.locator(DLG, has_text="Generative Fill").wait_for()
    wf = tmp_path / "Inpaint.json"; wf.write_text(json.dumps(INPAINT))
    page.locator(f"{DLG} input[type=file][aria-label='Add ComfyUI workflow']").set_input_files(str(wf))
    assert page.locator(f"{DLG} select[aria-label='Model']").input_value() == "comfy:Inpaint"
    page.locator(f"{DLG} input.cv-input[type=text]").first.fill("a green kite")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length === 2", timeout=15000)
    sent = seen["prompts"][0]
    assert sent["6"]["inputs"]["text"] == "a green kite" and sent["10"]["inputs"]["image"].startswith("formvis/") and sent["11"]["inputs"]["image"].endswith("mask.png")
    got = page.evaluate("""(() => { const e = window.formvis.engine, f = e.flattened().getContext('2d'), px = (x, y) => Array.from(f.getImageData(x, y, 1, 1).data).slice(0, 3); return [px(40, 35), px(100, 70)]; })()""")
    assert got == [[20, 200, 60], [255, 255, 255]], got                                      # filled in the selection only


def test_generate_image_from_a_workflow_and_fal_without_a_key(page, comfy, tmp_path):
    url, seen = comfy
    address(page, url)
    page.evaluate("(j) => localStorage.setItem('formvis.comfyui.recipes', JSON.stringify([{ name: 'Lighthouse', json: j }]))", json.dumps(TEXT))
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'G', 'white'); window.formvis.commands.run('generate-image')")
    page.locator(DLG, has_text="Generate Image").wait_for()
    page.locator(f"{DLG} select[aria-label='Model']").select_option("fal")
    page.locator(f"{DLG} textarea[aria-label='Prompt']").fill("a lighthouse")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) .cv-gen-status').textContent.includes('fal API key')")
    page.locator(f"{DLG} select[aria-label='Model']").select_option("Lighthouse")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some((l) => l.name === 'Generated Image')", timeout=15000)
    assert seen["prompts"][-1]["6"]["inputs"]["text"] == "a lighthouse"
    got = page.evaluate("(() => { const l = window.formvis.engine.current.doc.layers.find((x) => x.name === 'Generated Image'); return [l.raster.width, l.raster.height, Array.from(l.raster.ctx.getImageData(150, 80, 1, 1).data).slice(0, 3)]; })()")
    assert got == [200, 100, [20, 200, 60]], got                                             # at the document's size
    page.evaluate("localStorage.removeItem('formvis.comfyui.recipes')")
