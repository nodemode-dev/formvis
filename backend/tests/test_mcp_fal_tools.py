"""The agent side of the fal catalogue: fal_models, select_by_text, and the model, seed, size, negative_prompt and options
parameters of generate_image and upscale. The window runs the generation; these tests check what the engine tells an
agent and that the inputs the window builds are accepted by the engine's own run validation."""

import json

import pytest

from app.routers import mcp as M
from app.services import fal_run
from app.services.generative import GenerativeError

MODERN = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "test", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def call(client, name, **args):
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": MODERN, "name": name, "arguments": args}})
    return r.json()["result"]


def tools(client):
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {"_meta": MODERN}})
    return {t["name"]: t for t in r.json()["result"]["tools"]}


def test_the_new_tools_are_listed_with_honest_hints(client):
    t = tools(client)
    assert t["fal_models"]["annotations"]["readOnlyHint"] is True and t["fal_models"]["annotations"]["openWorldHint"] is False
    assert t["select_by_text"]["annotations"]["openWorldHint"] is True and t["select_by_text"]["inputSchema"]["required"] == ["prompt"]
    gen = t["generate_image"]["inputSchema"]["properties"]
    assert {"seed", "size", "aspect_ratio", "negative_prompt", "options", "model"} <= set(gen)
    assert "flux2-klein-4b" in gen["model"]["enum"] and "fal-ai/flux-2-pro" in gen["model"]["enum"]
    assert all(m in fal_run_ids("generate") for m in gen["model"]["enum"] if "/" in m)
    up = t["upscale"]["inputSchema"]["properties"]
    assert "fal-ai/clarity-upscaler" in up["model"]["enum"] and {"seed", "negative_prompt", "options"} <= set(up)
    assert "fal-ai/sam-3/image" not in gen["model"]["enum"] + up["model"]["enum"]


def fal_run_ids(role):
    return [m["id"] for m in fal_run.models() if m["role"] == role]


def test_fal_models_lists_the_catalogue_by_role_without_a_window(client):
    everything = call(client, "fal_models")["structuredContent"]
    assert len(everything["models"]) == 51 and "upscale" in everything["roles"] and "segment" in everything["roles"]
    ups = call(client, "fal_models", role="upscale")["structuredContent"]["models"]
    assert {m["id"] for m in ups} == set(fal_run_ids("upscale")) and all(m["role"] == "upscale" for m in ups)
    one = call(client, "fal_models", model="fal-ai/sam-3/image")["structuredContent"]["model"]
    assert one["role"] == "segment" and any(i["key"] == "prompt" for i in one["inputs"]) and any(i["key"] == "image_url" and i.get("required") for i in one["inputs"])


def test_fal_models_refuses_a_model_outside_the_catalogue(client):
    r = call(client, "fal_models", model="some/other-model")
    assert r["isError"] is True and "not in the formvis catalogue" in r["content"][0]["text"]
    assert call(client, "fal_models", role="video").get("isError") is True


@pytest.mark.parametrize("args", [
    {"name": "generate_image", "prompt": "a barn", "model": "some/other-model"},
    {"name": "generate_image", "prompt": "a barn", "model": "fal-ai/flux-2-pro", "seed": -1},
    {"name": "generate_image", "prompt": "a barn", "model": "fal-ai/flux-2-pro", "size": {"width": 10, "height": 512}},
    {"name": "generate_image", "prompt": "a barn", "aspect_ratio": "wide"},
    {"name": "upscale", "model": "fal-ai/sam-3/image"},
    {"name": "select_by_text"},
    {"name": "select_by_text", "prompt": "a car", "mode": "xor"},
])
def test_arguments_outside_the_schema_are_refused_before_the_window(client, args):
    name = args.pop("name")
    r = call(client, name, **args)
    assert r["isError"] is True


def accepted(model_id, inputs, images=None):
    return fal_run.build_body(fal_run.find(model_id), inputs, images or {})


def test_what_the_window_sends_for_a_generate_model_passes_the_engine_checks():
    body = accepted("fal-ai/flux-2/klein/9b/base", {"prompt": "a barn", "image_size": {"width": 1024, "height": 576}, "seed": 7, "negative_prompt": "blur", "guidance_scale": 4})
    assert body["image_size"] == {"width": 1024, "height": 576} and body["seed"] == 7 and body["negative_prompt"] == "blur"
    assert accepted("fal-ai/nano-banana-2", {"prompt": "a barn", "aspect_ratio": "16:9", "seed": 3})["aspect_ratio"] == "16:9"
    with pytest.raises(GenerativeError) as bad:
        accepted("fal-ai/nano-banana-2", {"prompt": "a barn", "aspect_ratio": "7:3"})
    assert bad.value.status == 422 and "aspect_ratio" in str(bad.value)


def test_what_the_window_sends_for_an_upscale_model_passes_the_engine_checks():
    picture = "data:image/png;base64,iVBORw0KGgo="
    for model_id in fal_run_ids("upscale"):
        spec = {s["key"]: s for s in fal_run.find(model_id)["inputs"]}
        inputs = {"upscale_factor": 4} if "upscale_factor" in spec else {}
        body = accepted(model_id, inputs, {"image_url": picture})
        assert body["image_url"] == picture and body.get("upscale_factor", 4) == 4


def test_what_the_window_sends_for_select_by_text_passes_the_engine_checks():
    body = accepted("fal-ai/sam-3/image", {"prompt": "the red car", "apply_mask": False}, {"image_url": "data:image/png;base64,iVBORw0KGgo="})
    assert body["prompt"] == "the red car" and body["apply_mask"] is False and body["image_url"].startswith("data:image/png")


def test_the_run_route_returns_masks_for_select_by_text(client, monkeypatch):
    seen = {}

    def fake(model, inputs, images):
        seen.update(model=model, inputs=inputs, images=sorted(images))
        return {"images": [], "masks": [{"png": "AAAA", "width": 4, "height": 4}], "seed": None, "model": model}

    monkeypatch.setattr(fal_run, "run", fake)
    r = client.post("/api/fal/run", json={"model": "fal-ai/sam-3/image", "inputs": {"prompt": "the sky"}, "images": {"image_url": "data:image/png;base64,AA=="}})
    assert r.status_code == 200 and r.json()["masks"][0]["width"] == 4
    assert seen == {"model": "fal-ai/sam-3/image", "inputs": {"prompt": "the sky"}, "images": ["image_url"]}


def test_the_listing_text_names_roles_and_is_json(client):
    r = call(client, "fal_models", role="segment")
    assert "1 fal model of role segment" in r["content"][0]["text"] and json.loads(r["content"][0]["text"].split(". ", 1)[1])[0]["id"] == "fal-ai/sam-3/image"
    assert M.TOOLS and any(t["name"] == "select_by_text" for t in M.TOOLS)
