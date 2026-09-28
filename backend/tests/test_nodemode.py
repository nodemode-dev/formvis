"""Send to NodeMode (1.50.8), against a stand-in NodeMode: an upload answering with a file id, as NodeMode's does, and
an optional receiver that records what formvis announces."""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from tests.conftest import png_bytes


def _stand_in(receiver: bool):
    seen = {"uploads": [], "announced": None}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _reply(self, code, body=b"{}"):
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/api/formvis/receive" and receiver:
                return self._reply(405)
            self._reply(200 if self.path == "/" else 404)

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.path == "/api/upload":
                seen["uploads"].append(body)
                return self._reply(200, json.dumps({"file_id": f"f{len(seen['uploads'])}.png"}).encode())
            if self.path == "/api/formvis/receive" and receiver:
                seen["announced"] = json.loads(body)
                return self._reply(200)
            self._reply(404)

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}", seen


@pytest.mark.parametrize("receiver", [True, False])
def test_images_upload_and_are_announced_with_the_mask(client, receiver):
    server, base, seen = _stand_in(receiver)
    try:
        items = [{"name": "Selection", "kind": "image", "width": 8, "height": 6}, {"name": "Selection mask", "kind": "mask", "width": 8, "height": 6, "maskOf": 0}]
        r = client.post("/api/nodemode/send", data={"target": base, "title": "Poster", "items": json.dumps(items)},
                        files=[("files", ("a.png", png_bytes((8, 6)), "image/png")), ("files", ("b.png", png_bytes((8, 6)), "image/png"))])
        assert r.status_code == 200, r.text
        out = r.json()
        assert len(seen["uploads"]) == 2 and out["placed"] is receiver
        assert [f["url"] for f in out["files"]] == [f"{base}/api/files/f1.png", f"{base}/api/files/f2.png"]
        if receiver:
            a = seen["announced"]
            assert a["source"] == "formvis" and a["title"] == "Poster" and a["files"][1]["kind"] == "mask" and a["files"][1]["maskOf"] == 0
        else:
            assert "receiver" in out["detail"]
        assert client.get("/api/nodemode/status", params={"target": base}).json() == {"running": True, "receiver": receiver}
    finally:
        server.shutdown()


def test_nodemode_not_running_says_so(client):
    items = [{"name": "Image", "kind": "image", "width": 4, "height": 4}]
    r = client.post("/api/nodemode/send", data={"target": "http://127.0.0.1:9", "items": json.dumps(items)}, files=[("files", ("a.png", png_bytes((4, 4)), "image/png"))])
    assert r.status_code == 502 and "not answering" in r.json()["detail"]
    assert client.post("/api/nodemode/send", data={"target": "file:///etc", "items": json.dumps(items)}, files=[("files", ("a.png", png_bytes((4, 4)), "image/png"))]).status_code == 422
