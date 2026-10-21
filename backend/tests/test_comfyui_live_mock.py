"""SC-AI-0148, SC-AI-0152, SC-AI-0153 against comfy_mock, a stand-in ComfyUI that validates graphs against /object_info,
runs them on real pixels, keeps an input folder, and tells /ws clients its progress: the engine's routes run end to end."""

import io
import json
import time

import pytest
from PIL import Image

from tests.comfy_mock import ComfyMock, OBJECT_INFO, transform_expected
from tests.conftest import png_bytes

FLOW = {
    "5": {"class_type": "KSampler", "inputs": {"steps": 5, "sampler_name": "euler", "positive": ["6", 0]}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "old"}, "_meta": {"title": "formvis prompt"}},
    "10": {"class_type": "LoadImage", "inputs": {"image": "example.png"}},
    "12": {"class_type": "LoadImage", "inputs": {"image": "example.png"}, "_meta": {"title": "formvis reference"}},
    "13": {"class_type": "LoadImage", "inputs": {"image": "example.png"}, "_meta": {"title": "formvis control depth"}},
    "14": {"class_type": "ImageInvert", "inputs": {"image": ["10", 0]}},
    "15": {"class_type": "ImageBlend", "inputs": {"image1": ["14", 0], "image2": ["12", 0], "blend_factor": 0.5}},
    "16": {"class_type": "ImageBlend", "inputs": {"image1": ["15", 0], "image2": ["13", 0], "blend_factor": 0.5}},
    "20": {"class_type": "SaveImage", "inputs": {"images": ["16", 0], "latent": ["5", 0], "filename_prefix": "formvis"}},
}
BASE, REF, CTRL = (200, 100, 50), (40, 80, 120), (10, 250, 130)
ITEMS = [{"name": "Poster", "kind": "image"}, {"name": "Ref one", "kind": "reference"}, {"name": "Depth", "kind": "control depth"}]


@pytest.fixture()
def client(client):
    client.headers["host"] = "127.0.0.1:8190"
    return client


@pytest.fixture()
def comfy():
    mock = ComfyMock().start()
    yield mock
    mock.stop()


def _parts():
    return [("files", (f"{i}.png", png_bytes((16, 12), c + (255,)), "image/png")) for i, c in enumerate((BASE, REF, CTRL))]


def _run(client, mock, flow=FLOW, prompt="a kite"):
    return client.post("/api/comfyui/run", data={"target": mock.url, "workflow": json.dumps(flow), "items": json.dumps(ITEMS), "prompt": prompt}, files=_parts())


def _finish(client, mock, job, timeout=15):
    seen, end = [], time.time() + timeout
    while time.time() < end:
        s = client.get(f"/api/comfyui/job/{job}", params={"target": mock.url}).json()
        seen.append(s)
        if s["state"] in ("done", "failed"):
            return s, seen
        time.sleep(0.03)
    raise AssertionError(f"the job did not finish: {seen[-3:]}")


def _pixel(client, mock, image):
    r = client.get("/api/comfyui/image", params={"target": mock.url, "filename": image["filename"], "subfolder": image["subfolder"]})
    assert r.status_code == 200
    pic = Image.open(io.BytesIO(r.content)).convert("RGB")
    return pic.size, pic.getpixel((3, 3))


def test_a_kept_recipe_runs_with_reference_and_control_layers_and_the_result_comes_back(client, comfy):
    r = _run(client, comfy)
    assert r.status_code == 200, r.text
    assert r.json() == {"job": "mock-1", "references": 1, "image": "formvis/Poster.png", "mask": None, "prompt": True}
    sent = comfy.prompts[0]
    assert (sent["10"]["inputs"]["image"], sent["12"]["inputs"]["image"], sent["13"]["inputs"]["image"]) == ("formvis/Poster.png", "formvis/Ref one.png", "formvis/Depth.png")
    assert sent["6"]["inputs"]["text"] == "a kite"
    done, seen = _finish(client, comfy, "mock-1")
    assert any(s["state"] == "running" and s.get("progress", {}).get("max") == 5 for s in seen), seen
    assert done["state"] == "done" and len(done["images"]) == 1
    size, px = _pixel(client, comfy, done["images"][0])
    assert size == (16, 12)
    assert all(abs(a - b) <= 1 for a, b in zip(px, transform_expected(BASE, REF, CTRL))), px
    assert sorted(comfy.loaded) == ["formvis/Depth.png", "formvis/Poster.png", "formvis/Ref one.png"]


def test_a_graph_the_server_rejects_comes_back_as_its_reason(client, comfy):
    bad = json.loads(json.dumps(FLOW))
    bad["14"]["inputs"]["image"] = ["99", 0]
    r = _run(client, comfy, bad)
    assert r.status_code == 502 and "links to a node that is not in the prompt" in r.json()["detail"]
    assert comfy.prompts == []


def test_the_mirror_sends_an_input_again_only_when_the_server_lost_it(client, comfy):
    assert _run(client, comfy).status_code == 200
    _finish(client, comfy, "mock-1")
    names = ["formvis/Poster.png", "formvis/Ref one.png", "formvis/Depth.png"]
    listed = client.get("/api/comfyui/mirror").json()["files"]
    assert sorted(f["name"] for f in listed) == sorted(names)
    before = len(comfy.uploads)

    kept = client.post("/api/comfyui/reupload", data={"target": comfy.url, "names": json.dumps(names)}).json()
    assert kept["sent"] == [] and sorted(kept["present"]) == sorted(names) and kept["missing"] == []
    assert len(comfy.uploads) == before

    comfy.restart()
    assert comfy.inputs == {}
    lost = client.post("/api/comfyui/reupload", data={"target": comfy.url, "names": json.dumps(names + ["formvis/never sent.png"])}).json()
    assert sorted(lost["sent"]) == sorted(names) and lost["present"] == [] and lost["missing"] == ["formvis/never sent.png"]
    assert comfy.inputs[("formvis", "Poster.png")] == png_bytes((16, 12), BASE + (255,))

    again = client.post("/api/comfyui/reupload", data={"target": comfy.url, "names": json.dumps(names)}).json()
    assert again["sent"] == [] and len(again["present"]) == 3

    one = client.post("/api/comfyui/reupload", data={"target": comfy.url, "names": json.dumps(names[:1])}).json()
    assert one["present"] == names[:1]
    comfy.inputs.pop(("formvis", "Ref one.png"))
    partly = client.post("/api/comfyui/reupload", data={"target": comfy.url, "names": json.dumps(names)}).json()
    assert partly["sent"] == ["formvis/Ref one.png"] and len(partly["present"]) == 2


def test_a_changed_picture_under_the_same_name_replaces_it_instead_of_being_renamed(client, comfy):
    for colour in ((10, 20, 30), (90, 80, 70)):
        r = client.post("/api/comfyui/send", data={"target": comfy.url, "items": json.dumps([{"name": "Poster", "kind": "image"}])}, files=[("files", ("a.png", png_bytes((8, 6), colour + (255,)), "image/png"))])
        assert r.json() == {"files": [{"name": "formvis/Poster.png", "kind": "image"}]}
    assert comfy.inputs[("formvis", "Poster.png")] == png_bytes((8, 6), (90, 80, 70, 255)) and len(comfy.inputs) == 1
    mirrored = client.get("/api/comfyui/mirror").json()["files"]
    assert [f["name"] for f in mirrored] == ["formvis/Poster.png"]


def test_the_mock_renames_a_same_named_upload_with_other_bytes_unless_overwrite_is_set(comfy):
    import urllib.request
    from app.services import outbound

    def up(data, overwrite):
        fields = {"type": "input", "subfolder": "formvis", **({"overwrite": "true"} if overwrite else {})}
        body, kind = outbound.multipart("image", "pic.png", data, fields)
        with urllib.request.urlopen(urllib.request.Request(comfy.url + "/upload/image", body, {"Content-Type": kind}, method="POST")) as r:
            return json.loads(r.read())

    a, b = png_bytes((4, 4), (1, 2, 3, 255)), png_bytes((4, 4), (9, 8, 7, 255))
    assert up(a, False)["name"] == "pic.png" and up(a, False)["name"] == "pic.png"
    assert up(b, False)["name"] == "pic (1).png"
    assert up(b, True)["name"] == "pic.png" and comfy.inputs[("formvis", "pic.png")] == b


def _canvas_edit(mock, graph):
    """What editing a pasted recipe on ComfyUI's canvas and pressing Queue does: the edited graph is queued, so it is the newest in history."""
    import urllib.request
    req = urllib.request.Request(mock.url + "/prompt", json.dumps({"prompt": graph, "client_id": "canvas"}).encode(), {"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        pid = json.loads(r.read())["prompt_id"]
    end = time.time() + 10
    while pid not in mock.history and time.time() < end:
        time.sleep(0.05)
    return pid


def test_editing_a_recipe_in_comfyui_hands_its_graph_back_and_the_recipe_files_keep_both_texts(client, comfy):
    assert client.get("/api/comfyui/graph", params={"target": comfy.url}).status_code == 404
    original = json.dumps(FLOW)
    client.put("/api/comfyui/recipe-files/Poster", content=original)
    client.post("/api/comfyui/send", data={"target": comfy.url, "items": json.dumps(ITEMS)}, files=_parts())
    edited = json.loads(original)
    edited["14"] = {"class_type": "ImageInvert", "inputs": {"image": ["10", 0]}, "_meta": {"title": "edited"}}
    for key in ("10", "12", "13"):
        edited[key]["inputs"]["image"] = {"10": "formvis/Poster.png", "12": "formvis/Ref one.png", "13": "formvis/Depth.png"}[key]
    _canvas_edit(comfy, edited)
    back = client.get("/api/comfyui/graph", params={"target": comfy.url})
    assert back.status_code == 200 and json.loads(back.json()["workflow"]) == edited
    client.put("/api/comfyui/recipe-files/Poster", content=back.json()["workflow"])
    client.put("/api/comfyui/recipe-files/Poster 2", content=original)
    files = {f["name"]: json.loads(f["text"]) for f in client.get("/api/comfyui/recipe-files").json()["files"]}
    assert files["Poster"]["14"]["_meta"]["title"] == "edited" and "_meta" not in files["Poster 2"]["14"]
    probe = client.post("/api/comfyui/probe", data={"target": comfy.url, "recipes": json.dumps([{"name": "Poster", "workflow": back.json()["workflow"]}])}).json()
    assert probe["recipes"][0]["missing_nodes"] == [] and probe["recipes"][0]["nodes"] == 6 and probe["version"] == "0.3.60-mock"


def test_a_node_the_server_lacks_is_reported_by_the_probe_the_run_and_the_conversion(client):
    lacking = {k: v for k, v in OBJECT_INFO.items() if k != "ImageBlend"}
    mock = ComfyMock(lacking).start()
    try:
        probe = client.post("/api/comfyui/probe", data={"target": mock.url, "recipes": json.dumps([{"name": "Poster", "workflow": json.dumps(FLOW)}])}).json()
        assert probe["recipes"][0]["missing_nodes"] == ["ImageBlend"]
        r = _run(client, mock)
        assert r.status_code == 502 and "node ImageBlend does not exist" in r.json()["detail"] and mock.prompts == []
        editor = {"nodes": [{"id": 1, "type": "ImageBlend", "inputs": [], "widgets_values": [0.5]}], "links": []}
        c = client.post("/api/comfyui/convert", data={"target": mock.url, "workflow": json.dumps(editor)})
        assert c.status_code == 422 and "ImageBlend" in c.json()["detail"]
        mock.restart(OBJECT_INFO)
        again = client.post("/api/comfyui/probe", data={"target": mock.url, "recipes": json.dumps([{"name": "Poster", "workflow": json.dumps(FLOW)}])}).json()
        assert again["recipes"][0]["missing_nodes"] == []
    finally:
        mock.stop()
