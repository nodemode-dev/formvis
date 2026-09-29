"""Send to ComfyUI (1.50.9), against a stand-in ComfyUI answering /system_stats and /upload/image as ComfyUI's API
documents them."""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from tests.conftest import png_bytes


def _stand_in():
    seen = []

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _reply(self, code, obj):
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(json.dumps(obj).encode())

        def do_GET(self):
            if self.path == "/system_stats": return self._reply(200, {"system": {"os": "posix", "comfyui_version": "0.3.60"}, "devices": []})
            self._reply(404, {})

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.path != "/upload/image": return self._reply(404, {})
            name = body.split(b'filename="', 1)[1].split(b'"', 1)[0].decode()
            fields = {k: body.split(f'name="{k}"\r\n\r\n'.encode(), 1)[1].split(b"\r\n", 1)[0].decode() for k in ("type", "subfolder", "overwrite")}
            seen.append({"name": name, **fields})
            self._reply(200, {"name": name, "subfolder": fields["subfolder"], "type": fields["type"]})

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}", seen


def test_images_go_into_the_input_folder(client):
    server, base, seen = _stand_in()
    try:
        assert client.get("/api/comfyui/status", params={"target": base}).json() == {"running": True, "version": "0.3.60"}
        items = [{"name": "Poster", "kind": "image"}, {"name": "Poster mask", "kind": "mask"}]
        r = client.post("/api/comfyui/send", data={"target": base, "items": json.dumps(items)},
                        files=[("files", ("a.png", png_bytes((8, 6)), "image/png")), ("files", ("b.png", png_bytes((8, 6)), "image/png"))])
        assert r.status_code == 200, r.text
        assert r.json()["files"] == [{"name": "formvis/Poster.png", "kind": "image"}, {"name": "formvis/Poster mask.png", "kind": "mask"}]
        assert all(s["type"] == "input" and s["subfolder"] == "formvis" and s["overwrite"] == "true" for s in seen)
    finally:
        server.shutdown()


def test_comfyui_not_running_or_a_bad_address(client):
    st = client.get("/api/comfyui/status", params={"target": "http://127.0.0.1:9"}).json()
    assert st["running"] is False and "not answering" in st["detail"]
    items = json.dumps([{"name": "x", "kind": "image"}])
    assert client.post("/api/comfyui/send", data={"target": "http://127.0.0.1:9", "items": items}, files=[("files", ("a.png", png_bytes((4, 4)), "image/png"))]).status_code == 502
    assert client.post("/api/comfyui/send", data={"target": "javascript:x", "items": items}, files=[("files", ("a.png", png_bytes((4, 4)), "image/png"))]).status_code == 422
