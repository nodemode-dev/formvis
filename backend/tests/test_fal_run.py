import base64
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from PIL import Image

from tests.conftest import png_bytes

NSFW_WORD = "unsafe"


class Stub:
    def __init__(self):
        self.submits = []
        self.polls = {}
        self.auth = []
        self.base = ""


def make_handler(stub):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send_json(self, code, payload):
            raw = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            endpoint = self.path.lstrip("/")
            stub.auth.append(self.headers.get("Authorization"))
            rid = f"req{len(stub.submits)}"
            stub.submits.append({"endpoint": endpoint, "body": body, "id": rid})
            parts = endpoint.split("/")
            short = "/".join(parts[:2])
            self.send_json(200, {
                "request_id": rid,
                "status_url": f"{stub.base}/{endpoint}/requests/{rid}/status",
                "response_url": f"{stub.base}/{short}/requests/{rid}",
            })

        def do_GET(self):
            path = self.path.split("?")[0]
            if path.startswith("/img/"):
                data = png_bytes((5, 4), (10, 20, 30, 128))
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            rid = path.split("/requests/")[1].split("/")[0]
            submit = next(s for s in stub.submits if s["id"] == rid)
            if path.endswith("/status"):
                n = stub.polls[rid] = stub.polls.get(rid, 0) + 1
                self.send_json(200, {"status": "IN_QUEUE" if n == 1 else "COMPLETED"})
                return
            if "/requests/" in path and path.split("/requests/")[0] != "/" + submit["endpoint"]:
                self.send_json(422, {"detail": "truncated"})
                return
            img = {"url": f"{stub.base}/img/{rid}.png", "width": 5, "height": 4}
            if submit["endpoint"] == "fal-ai/sam-3/image":
                self.send_json(200, {"image": img, "masks": [img, img]})
            elif NSFW_WORD in str(submit["body"].get("prompt", "")):
                self.send_json(200, {"images": [img], "has_nsfw_concepts": [True]})
            else:
                self.send_json(200, {"images": [img], "seed": 42, "has_nsfw_concepts": [False]})

    return Handler


@pytest.fixture()
def stub(monkeypatch):
    s = Stub()
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(s))
    s.base = f"http://127.0.0.1:{server.server_address[1]}"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("FORMVIS_FAL_QUEUE_BASE", s.base)
    monkeypatch.setenv("FORMVIS_FAL_POLL", "0.02")
    monkeypatch.setenv("FAL_KEY", "test-key-1234")
    yield s
    server.shutdown()
    server.server_close()


def uri(color=(1, 2, 3, 255)):
    return "data:image/png;base64," + base64.b64encode(png_bytes((4, 4), color)).decode()


def test_listing_and_ready(client, monkeypatch):
    monkeypatch.setenv("FAL_KEY", "k-abcdefgh")
    data = client.get("/api/fal/models").json()
    assert data["ready"] is True
    assert len(data["models"]) == 545
    first = data["models"][0]
    assert {"id", "label", "role", "row", "category", "pricing", "license", "inputs"} <= set(first)
    monkeypatch.delenv("FAL_KEY")
    monkeypatch.delenv("FAL_API_KEY", raising=False)
    from app.services import generative
    monkeypatch.setattr(generative, "_key", lambda: (None, None))
    assert client.get("/api/fal/models").json()["ready"] is False


def test_uncatalogued_model_refused(client, stub):
    r = client.post("/api/fal/run", json={"model": "fal-ai/not-in-the-catalogue/v0", "inputs": {"prompt": "x"}})
    assert r.status_code == 404
    assert stub.submits == []


def test_unknown_keys_dropped_and_defaults_not_filled(client, stub):
    r = client.post("/api/fal/run", json={"model": "fal-ai/boogu-image", "inputs": {"prompt": "a cat", "bogus": 1, "image_url": "x"}})
    assert r.status_code == 200, r.text
    assert stub.submits[0]["body"] == {"prompt": "a cat"}
    assert stub.auth[0] == "Key test-key-1234"


def test_value_checks_name_the_key(client, stub):
    base = {"model": "fal-ai/boogu-image"}
    r = client.post("/api/fal/run", json={**base, "inputs": {"prompt": "a", "num_inference_steps": 5}})
    assert r.status_code == 422 and "num_inference_steps" in r.json()["detail"]
    r = client.post("/api/fal/run", json={**base, "inputs": {"prompt": "a", "guidance_scale": 99}})
    assert r.status_code == 422 and "guidance_scale" in r.json()["detail"]
    r = client.post("/api/fal/run", json={**base, "inputs": {"prompt": "a", "output_format": "gif"}})
    assert r.status_code == 422 and "output_format" in r.json()["detail"]
    r = client.post("/api/fal/run", json={**base, "inputs": {"prompt": "a", "num_images": "two"}})
    assert r.status_code == 422 and "num_images" in r.json()["detail"]
    r = client.post("/api/fal/run", json={**base, "inputs": {}})
    assert r.status_code == 422 and "prompt" in r.json()["detail"]
    assert stub.submits == []


def test_images_follow_the_schema_keys(client, stub):
    r = client.post("/api/fal/run", json={"model": "fal-ai/flux-2/edit", "inputs": {"prompt": "p"}, "images": {"image_urls": [uri(), uri()]}})
    assert r.status_code == 200, r.text
    assert len(stub.submits[0]["body"]["image_urls"]) == 2
    assert "image_url" not in stub.submits[0]["body"]
    r = client.post("/api/fal/run", json={"model": "fal-ai/boogu-image/edit", "inputs": {"prompt": "p"}, "images": {"image_url": uri()}})
    assert r.status_code == 200, r.text
    assert stub.submits[1]["body"]["image_url"].startswith("data:image/png;base64,")
    r = client.post("/api/fal/run", json={"model": "fal-ai/boogu-image/edit", "inputs": {"prompt": "p"}, "images": {"image_urls": [uri()]}})
    assert r.status_code == 422 and "image_urls" in r.json()["detail"]
    r = client.post("/api/fal/run", json={"model": "fal-ai/boogu-image/edit", "inputs": {"prompt": "p"}, "images": {}})
    assert r.status_code == 422 and "image_url" in r.json()["detail"]


def test_png_result_through_a_multi_segment_endpoint(client, stub):
    r = client.post("/api/fal/run", json={"model": "openai/gpt-image-2.5/flare/edit", "inputs": {"prompt": "p", "quality": "low"},
                                          "images": {"image_urls": uri(), "mask_url": uri()}})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["model"] == "openai/gpt-image-2.5/flare/edit" and data["seed"] == 42 and data["masks"] == []
    image = data["images"][0]
    assert (image["width"], image["height"]) == (5, 4)
    with Image.open(io.BytesIO(base64.b64decode(image["png"]))) as im:
        assert im.format == "PNG" and im.mode == "RGBA" and im.getpixel((0, 0))[3] == 128
    body = stub.submits[0]["body"]
    assert isinstance(body["image_urls"], list) and isinstance(body["mask_url"], str)


def test_no_key_is_428(client, stub, monkeypatch):
    from app.services import generative
    monkeypatch.setattr(generative, "_key", lambda: (None, None))
    r = client.post("/api/fal/run", json={"model": "fal-ai/boogu-image", "inputs": {"prompt": "p"}})
    assert r.status_code == 428
    assert stub.submits == []


def test_safety_filter_is_422(client, stub):
    r = client.post("/api/fal/run", json={"model": "fal-ai/boogu-image", "inputs": {"prompt": NSFW_WORD}})
    assert r.status_code == 422 and "safety" in r.json()["detail"]


def test_segment_model_returns_masks(client, stub):
    r = client.post("/api/fal/run", json={"model": "fal-ai/sam-3/image", "inputs": {"text_prompt": "cat", "return_multiple_masks": True},
                                          "images": {"image_url": uri()}})
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["masks"]) == 2 and data["masks"][0]["width"] == 5
    assert len(data["images"]) == 1 and data["seed"] is None
