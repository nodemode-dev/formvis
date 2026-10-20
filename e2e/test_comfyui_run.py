# File > Run ComfyUI Workflow (1.51.1), against a stand-in ComfyUI answering upload, prompt, queue, history, view and
# interrupt as its API documents them: the workflow is filled and run, and its result comes back as a masked layer.
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
FLOW = {"6": {"class_type": "CLIPTextEncode", "inputs": {"text": "old"}, "_meta": {"title": "formvis prompt"}},
        "10": {"class_type": "LoadImage", "inputs": {"image": "x.png"}}, "11": {"class_type": "LoadImageMask", "inputs": {"image": "m.png", "channel": "red"}},
        "20": {"class_type": "SaveImage", "inputs": {}}}


@pytest.fixture()
def comfy():
    seen = {"prompts": [], "polls": 0, "interrupted": 0}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _reply(self, code, obj=None, raw=None, kind="application/json"):
            self.send_response(code); self.send_header("Content-Type", kind); self.end_headers(); self.wfile.write(raw if raw is not None else json.dumps(obj or {}).encode())

        def do_GET(self):
            if self.path == "/system_stats": return self._reply(200, {"system": {"comfyui_version": "0.3.60"}})
            if self.path.startswith("/history/"):
                seen["polls"] += 1
                return self._reply(200, {} if seen["polls"] < 2 or seen.get("hold") else {"j1": {"status": {"status_str": "success"}, "outputs": {"20": {"images": [{"filename": "r.png", "subfolder": "", "type": "output"}]}}}})
            if self.path == "/queue": return self._reply(200, {"queue_running": [[0, "j1"]], "queue_pending": []})
            if self.path.startswith("/view?"):
                b = io.BytesIO(); Image.new("RGBA", (60, 40), (20, 200, 60, 255)).save(b, "PNG"); return self._reply(200, raw=b.getvalue(), kind="image/png")
            self._reply(404)

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.path == "/upload/image":
                return self._reply(200, {"name": body.split(b'filename="', 1)[1].split(b'"', 1)[0].decode(), "subfolder": "formvis", "type": "input"})
            if self.path == "/prompt": seen["prompts"].append(json.loads(body)); return self._reply(200, {"prompt_id": "j1"})
            if self.path == "/interrupt": seen["interrupted"] += 1
            self._reply(200)

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}", seen
    server.shutdown()


def setup(page, url, tmp_path, flow):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    box = page.locator("input[aria-label='ComfyUI address']"); box.fill(url); box.press("Tab"); page.keyboard.press("Escape")
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(120, 80, 'Poster', 'white');
      e.applySelection(E.SelectionMask.cropped(10, 10, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's'); }""")
    wf = tmp_path / "flow.json"; wf.write_text(json.dumps(flow))
    page.evaluate("window.formvis.commands.run('comfyui-run')")
    page.locator(DLG, has_text="Run ComfyUI Workflow").wait_for()
    page.locator(f"{DLG} input[type=file][aria-label='Workflow']").set_input_files(str(wf))


def test_a_workflow_runs_and_its_result_comes_back_masked(page, comfy, tmp_path):
    url, seen = comfy
    setup(page, url, tmp_path, FLOW)
    page.locator(f"{DLG} textarea[aria-label='Prompt']").fill("a green kite")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Run").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some((l) => l.name === 'ComfyUI result')", timeout=15000)
    sent = seen["prompts"][0]["prompt"]
    assert sent["6"]["inputs"]["text"] == "a green kite" and sent["10"]["inputs"]["image"] == "formvis/Poster.png" and sent["11"]["inputs"]["image"] == "formvis/Poster mask.png"
    got = page.evaluate("""(() => { const l = window.formvis.engine.current.doc.layers.find((x) => x.name === 'ComfyUI result'), px = (r, x, y) => Array.from(r.ctx.getImageData(x, y, 1, 1).data);
      return [l.raster.width, l.raster.height, px(l.raster, 30, 25).slice(0, 3), px(l.mask.raster, 30, 25)[0], px(l.mask.raster, 100, 70)[0]]; })()""")
    assert got == [120, 80, [20, 200, 60], 255, 0], got                                    # scaled to the document; shown only in the selection


def test_an_editor_workflow_is_refused_and_closing_cancels_a_running_job(page, comfy, tmp_path):
    url, seen = comfy
    setup(page, url, tmp_path, {"nodes": [], "links": []})
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) .cv-run-status').textContent.includes('editor format')")
    seen["hold"] = True
    wf = tmp_path / "ok.json"; wf.write_text(json.dumps(FLOW))
    page.locator(f"{DLG} input[type=file][aria-label='Workflow']").set_input_files(str(wf))
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Run").click()
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) .cv-run-status').textContent.includes('Running in ComfyUI')", timeout=10000)
    page.keyboard.press("Escape")
    for _ in range(40):
        if seen["interrupted"]: break
        page.wait_for_timeout(100)
    assert seen["interrupted"] >= 1                                                            # closing cancelled it in ComfyUI
