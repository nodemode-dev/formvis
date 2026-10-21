# SC-AI-0152: Save graph in the ComfyUI panel replaces the chosen recipe with the graph ComfyUI ran last, against the
# backend's stand-in ComfyUI (it validates graphs, runs them on pixels and keeps a history).
import importlib.util
import json
import pathlib
import time
import urllib.request

import pytest

_spec = importlib.util.spec_from_file_location("comfy_mock", pathlib.Path(__file__).resolve().parents[1] / "backend" / "tests" / "comfy_mock.py")
comfy_mock = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(comfy_mock)

OLD = {"1": {"class_type": "LoadImage", "inputs": {"image": "x.png"}}, "2": {"class_type": "ImageInvert", "inputs": {"image": ["1", 0]}},
       "3": {"class_type": "SaveImage", "inputs": {"images": ["2", 0], "filename_prefix": "a"}}}
NEW = {**OLD, "4": {"class_type": "ImageInvert", "inputs": {"image": ["2", 0]}}, "3": {"class_type": "SaveImage", "inputs": {"images": ["4", 0], "filename_prefix": "b"}}}


@pytest.fixture()
def comfy():
    mock = comfy_mock.ComfyMock().start()
    yield mock
    mock.stop()


def _run_in_comfy(mock, graph):
    from io import BytesIO
    from PIL import Image
    buf = BytesIO(); Image.new("RGB", (8, 6), (10, 20, 30)).save(buf, "PNG")
    mock.inputs[("", "x.png")] = buf.getvalue()
    req = urllib.request.Request(mock.url + "/prompt", json.dumps({"prompt": graph, "client_id": "t"}).encode(), {"Content-Type": "application/json"})
    pid = json.loads(urllib.request.urlopen(req).read())["prompt_id"]
    for _ in range(100):
        if json.loads(urllib.request.urlopen(f"{mock.url}/history/{pid}").read()):
            return
        time.sleep(0.05)
    raise AssertionError("the stand-in did not finish")


def test_save_graph_replaces_the_chosen_recipe_with_the_last_graph_comfyui_ran(page, comfy):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    box = page.locator("input[aria-label='ComfyUI address']"); box.fill(comfy.url); box.press("Tab"); page.keyboard.press("Escape")
    page.evaluate("(j) => localStorage.setItem('formvis.comfyui.recipes', JSON.stringify([{ name: 'Mine', json: j }]))", json.dumps(OLD))
    _run_in_comfy(comfy, NEW)
    page.evaluate("""() => { const sec = document.querySelector('section.cv-comfyui'), pick = sec.querySelector('[data-recipe]');
      pick.dispatchEvent(new Event('focus')); pick.value = 'Mine'; pick.dispatchEvent(new Event('change')); sec.querySelector('[data-act=save-graph]').click(); }""")
    page.wait_for_function("() => document.querySelector('section.cv-comfyui [data-note]').textContent.includes('saved from the last graph')", timeout=15000)
    kept = page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipes')).find((r) => r.name === 'Mine').json")
    graph = json.loads(kept)
    assert set(graph) == {"1", "2", "3", "4"} and graph["3"]["inputs"]["images"] == ["4", 0]
    note = page.evaluate("document.querySelector('section.cv-comfyui [data-note]').textContent")
    assert "Every node and model it needs is there" in note, note
