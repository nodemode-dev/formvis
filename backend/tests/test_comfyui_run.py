"""Running a ComfyUI workflow (1.51.1), against a stand-in ComfyUI answering /upload/image, /prompt, /history, /queue,
/view and /interrupt as its API documents them."""

import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from PIL import Image

from tests.conftest import png_bytes

FLOW = {"3": {"class_type": "KSampler", "inputs": {}}, "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "old"}, "_meta": {"title": "formvis prompt"}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry"}, "_meta": {"title": "Negative"}},
        "10": {"class_type": "LoadImage", "inputs": {"image": "example.png"}}, "11": {"class_type": "LoadImageMask", "inputs": {"image": "m.png", "channel": "red"}},
        "20": {"class_type": "SaveImage", "inputs": {}}}


@pytest.fixture()
def comfy():
    seen = {"prompts": [], "polls": 0, "interrupted": False}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _reply(self, code, obj=None, raw=None, kind="application/json"):
            self.send_response(code); self.send_header("Content-Type", kind); self.end_headers()
            self.wfile.write(raw if raw is not None else json.dumps(obj or {}).encode())

        def do_GET(self):
            if self.path.startswith("/history/"):
                seen["polls"] += 1
                if seen["polls"] < 2: return self._reply(200, {})
                return self._reply(200, {"job1": {"status": {"status_str": "success"}, "outputs": {"20": {"images": [{"filename": "r_0001.png", "subfolder": "", "type": "output"}, {"filename": "tmp.png", "subfolder": "", "type": "temp"}]}}}})
            if self.path == "/queue": return self._reply(200, {"queue_running": [[0, "other"]], "queue_pending": [[1, "job1"]]})
            if self.path.startswith("/view?"):
                b = io.BytesIO(); Image.new("RGBA", (6, 4), (20, 200, 60, 255)).save(b, "PNG"); return self._reply(200, raw=b.getvalue(), kind="image/png")
            self._reply(404)

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.path == "/upload/image":
                name = body.split(b'filename="', 1)[1].split(b'"', 1)[0].decode(); return self._reply(200, {"name": name, "subfolder": "formvis", "type": "input"})
            if self.path == "/prompt":
                seen["prompts"].append(json.loads(body)); return self._reply(200, {"prompt_id": "job1", "number": 1})
            if self.path == "/interrupt": seen["interrupted"] = True
            self._reply(200)

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}", seen
    server.shutdown()


def _run(client, base, flow, prompt="a red kite"):
    items = [{"name": "Poster", "kind": "image"}, {"name": "Poster mask", "kind": "mask", "maskOf": 0}]
    return client.post("/api/comfyui/run", data={"target": base, "workflow": json.dumps(flow), "items": json.dumps(items), "prompt": prompt},
                       files=[("files", ("a.png", png_bytes((8, 6)), "image/png")), ("files", ("b.png", png_bytes((8, 6)), "image/png"))])


def test_a_workflow_is_filled_queued_followed_and_its_results_fetched(client, comfy):
    base, seen = comfy
    r = _run(client, base, FLOW)
    assert r.status_code == 200, r.text
    assert r.json() == {"job": "job1", "image": "formvis/Poster.png", "mask": "formvis/Poster mask.png", "prompt": True}
    sent = seen["prompts"][0]["prompt"]
    assert sent["10"]["inputs"]["image"] == "formvis/Poster.png" and sent["11"]["inputs"]["image"] == "formvis/Poster mask.png"
    assert sent["6"]["inputs"]["text"] == "a red kite" and sent["7"]["inputs"]["text"] == "blurry"            # only the titled one
    assert client.get("/api/comfyui/job/job1", params={"target": base}).json() == {"state": "queued", "ahead": 1}
    done = client.get("/api/comfyui/job/job1", params={"target": base}).json()
    assert done == {"state": "done", "images": [{"filename": "r_0001.png", "subfolder": "", "type": "output"}]}  # outputs only
    img = client.get("/api/comfyui/image", params={"target": base, "filename": "r_0001.png"})
    assert img.status_code == 200 and Image.open(io.BytesIO(img.content)).size == (6, 4)
    assert client.post("/api/comfyui/cancel/job1", data={"target": base}).json() == {"cancelled": True} and seen["interrupted"]


def test_an_editor_format_workflow_is_refused_before_anything_is_uploaded(client, comfy):
    base, seen = comfy
    r = _run(client, base, {"nodes": [], "links": []})
    assert r.status_code == 422 and "Export (API)" in r.json()["detail"] and not seen["prompts"]


def test_a_text_to_image_workflow_runs_on_the_prompt_alone(client, comfy):
    base, seen = comfy
    flow = {k: v for k, v in FLOW.items() if k not in ("10", "11")}
    r = _run(client, base, flow)
    assert r.status_code == 200 and r.json()["image"] is None and seen["prompts"][0]["prompt"]["6"]["inputs"]["text"] == "a red kite"


def test_a_text_to_image_run_needs_no_files(client, comfy):
    base, seen = comfy
    flow = {k: v for k, v in FLOW.items() if k not in ("10", "11")}
    r = client.post("/api/comfyui/run", data={"target": base, "workflow": json.dumps(flow), "prompt": "a lighthouse"})
    assert r.status_code == 200 and r.json()["image"] is None and seen["prompts"][-1]["prompt"]["6"]["inputs"]["text"] == "a lighthouse"
