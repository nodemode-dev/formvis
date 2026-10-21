"""SC-AI-0007: an upscaler file chosen on ComfyUI (a .pth among them) runs through /api/comfyui/upscale-models and
/api/comfyui/upscale against comfy_mock, which here also knows the two upscale nodes and makes the picture four times larger."""

import json
import time

import pytest
from PIL import Image

from tests.comfy_mock import IMAGE, OBJECT_INFO, ComfyMock
from tests.conftest import png_bytes

FILES = ["4x-UltraSharp.pth", "RealESRGAN_x4plus.safetensors"]
NODES = {
    "UpscaleModelLoader": {"input": {"required": {"model_name": [FILES]}}, "output": ["UPSCALE_MODEL"], "output_node": False},
    "ImageUpscaleWithModel": {"input": {"required": {"upscale_model": ["UPSCALE_MODEL", {}], "image": IMAGE}}, "output": ["IMAGE"], "output_node": False},
}


class UpscalingMock(ComfyMock):
    def _eval_node(self, graph, nid, cache, client, pid):
        node = graph[nid]
        if node["class_type"] not in NODES:
            return super()._eval_node(graph, nid, cache, client, pid)
        if nid not in cache:
            if node["class_type"] == "UpscaleModelLoader":
                self.chosen = getattr(self, "chosen", []) + [node["inputs"].get("model_name")]
                cache[nid] = Image.new("RGB", (1, 1))
            else:
                self._eval_node(graph, str(node["inputs"]["upscale_model"][0]), cache, client, pid)
                picture = self._eval_node(graph, str(node["inputs"]["image"][0]), cache, client, pid)
                cache[nid] = picture.resize((picture.width * 4, picture.height * 4), Image.Resampling.NEAREST)
        return cache[nid]


@pytest.fixture()
def client(client):
    client.headers["host"] = "127.0.0.1:8190"
    return client


@pytest.fixture()
def comfy():
    mock = UpscalingMock(nodes={**OBJECT_INFO, **NODES}).start()
    yield mock
    mock.stop()


def _finish(client, mock, job):
    end = time.time() + 15
    while time.time() < end:
        state = client.get(f"/api/comfyui/job/{job}", params={"target": mock.url}).json()
        if state["state"] in ("done", "failed"):
            return state
        time.sleep(0.03)
    raise AssertionError("the job did not finish")


def test_the_upscaler_files_comfyui_lists_come_back_pth_included(client, comfy):
    reply = client.get("/api/comfyui/upscale-models", params={"target": comfy.url}).json()
    assert reply == {"models": FILES, "missing": []}


def test_a_chosen_pth_upscales_the_picture_on_comfyui(client, comfy):
    sent = client.post("/api/comfyui/upscale", data={"target": comfy.url, "model": "4x-UltraSharp.pth"}, files={"image": ("a.png", png_bytes((16, 12), (200, 100, 50, 255)), "image/png")})
    assert sent.status_code == 200, sent.text
    state = _finish(client, comfy, sent.json()["job"])
    assert state["state"] == "done" and state["images"]
    one = state["images"][0]
    result = client.get("/api/comfyui/image", params={"target": comfy.url, "filename": one["filename"], "subfolder": one["subfolder"]})
    picture = Image.open(__import__("io").BytesIO(result.content))
    assert picture.size == (64, 48) and picture.convert("RGB").getpixel((10, 10)) == (200, 100, 50)
    assert comfy.chosen == ["4x-UltraSharp.pth"]


def test_a_file_comfyui_does_not_list_is_refused_before_anything_is_queued(client, comfy):
    sent = client.post("/api/comfyui/upscale", data={"target": comfy.url, "model": "../etc/passwd"}, files={"image": ("a.png", png_bytes((8, 6)), "image/png")})
    assert sent.status_code == 422 and "does not list" in sent.json()["detail"]
    assert comfy.uploads == []


def test_a_comfyui_without_the_nodes_says_which_are_missing(client):
    mock = ComfyMock().start()
    try:
        assert client.get("/api/comfyui/upscale-models", params={"target": mock.url}).json() == {"models": [], "missing": ["UpscaleModelLoader", "ImageUpscaleWithModel"]}
        sent = client.post("/api/comfyui/upscale", data={"target": mock.url, "model": "x.pth"}, files={"image": ("a.png", png_bytes((8, 6)), "image/png")})
        assert sent.status_code == 422 and "UpscaleModelLoader" in sent.json()["detail"]
    finally:
        mock.stop()
