# SC-AI-0148, SC-AI-0152, SC-AI-0153 in the browser against backend/tests/comfy_mock.py, a stand-in ComfyUI that validates
# graphs, runs them on real pixels, keeps an input folder and speaks the /ws progress messages.
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pytest
from PIL import Image
from playwright.sync_api import Error as PlaywrightError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from tests.comfy_mock import ComfyMock  # noqa: E402

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
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

# The engine keeps kept recipes as files in the data folder and the app reads that folder back, so a recipe left by an
# earlier run ("Kite fork") would show as a row of its own and match a loose text search for "Kite".
KEPT_NAMES = ("Kite", "Kite fork", "Mirror kite", "Blends")


def clear_recipe_files():
    for name in KEPT_NAMES:
        req = urllib.request.Request("http://127.0.0.1:8190/api/comfyui/recipe-files/" + urllib.parse.quote(name), method="DELETE")
        try:
            urllib.request.urlopen(req, timeout=10).read()
        except OSError:
            pass


@pytest.fixture(autouse=True)
def clean_recipe_folder():
    clear_recipe_files()
    yield
    clear_recipe_files()


@pytest.fixture()
def comfy():
    mock = ComfyMock(step_delay=0.05).start()
    yield mock
    mock.stop()


def set_address(page, url):
    for attempt in (0, 1):
        try:
            page.evaluate("window.formvis.commands.run('settings')")
            page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click(timeout=10000)
            box = page.locator("input[aria-label='ComfyUI address']")
            box.fill(url)
            box.press("Tab")
            return
        except PlaywrightError:
            if attempt:
                raise
            page.reload()
            page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)


def make_document(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
      e.newDocument(120, 80, 'Poster', { r: 200, g: 100, b: 50 });
      for (const [name, c, role] of [['Ref', [40, 80, 120], 'reference'], ['Depth', [10, 250, 130], 'depth']]) {
        const r = new E.Raster(120, 80); r.ctx.fillStyle = `rgb(${c})`; r.ctx.fillRect(0, 0, 120, 80); r.touch();
        e.insertRasterLayer(r, name, 0, 0, {}, 'Test layer'); e.setLayerRole(role); } }""")


def run_flow(page, tmp_path, flow=FLOW):
    wf = tmp_path / "flow.json"
    wf.write_text(json.dumps(flow))
    page.evaluate("window.formvis.commands.run('comfyui-run')")
    page.locator(DLG, has_text="Run ComfyUI Workflow").wait_for()
    page.locator(f"{DLG} input[type=file][aria-label='Workflow']").set_input_files(str(wf))
    page.locator(f"{DLG} textarea[aria-label='Prompt']").fill("a kite")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Run").click()


def pixels(blob_bytes):
    pic = Image.open(io.BytesIO(blob_bytes)).convert("RGB")
    return pic.getpixel((3, 3))


def blend(a, b):
    return tuple(round((x + y) / 2) for x, y in zip(a, b))


def test_a_kept_recipe_runs_with_reference_and_control_layers_and_the_result_layer_comes_back(page, comfy, tmp_path):
    set_address(page, comfy.url)
    page.keyboard.press("Escape")
    make_document(page)
    run_flow(page, tmp_path)
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some((l) => l.name === 'ComfyUI result')", timeout=30000)
    sent = comfy.prompts[0]
    assert sent["10"]["inputs"]["image"] == "formvis/Poster.png" and sent["12"]["inputs"]["image"] == "formvis/Ref.png" and sent["13"]["inputs"]["image"] == "formvis/Depth.png"
    assert sent["6"]["inputs"]["text"] == "a kite"
    assert pixels(comfy.inputs[("formvis", "Ref.png")]) == (40, 80, 120) and pixels(comfy.inputs[("formvis", "Depth.png")]) == (10, 250, 130)
    base = pixels(comfy.inputs[("formvis", "Poster.png")])
    want = blend(blend(tuple(255 - c for c in base), (40, 80, 120)), (10, 250, 130))
    got = page.evaluate("""() => { const l = window.formvis.engine.current.doc.layers.find((x) => x.name === 'ComfyUI result'); return Array.from(l.raster.ctx.getImageData(3, 3, 1, 1).data).slice(0, 3); }""")
    assert all(abs(a - b) <= 2 for a, b in zip(got, want)), (got, want)
    assert sorted(comfy.loaded) == ["formvis/Depth.png", "formvis/Poster.png", "formvis/Ref.png"]


def keep_ran_graph(page, name):
    page.evaluate("""(name) => { const s = document.querySelector('section.cv-comfyui'); const n = s.querySelector('[data-name]'); n.disabled = false; n.value = name;
      s.querySelector('[data-act="save-graph"]').click(); }""", name)
    page.wait_for_function("(name) => document.querySelector('section.cv-comfyui [data-note]').textContent.startsWith(name + ' saved')", arg=name, timeout=15000)


def open_recipes(page):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()


def row(page, name):
    return page.locator(".cv-plugins-row", has_text=re.compile("^" + re.escape(name) + " · ")).first


def engine_skips_held_inputs():
    req = urllib.request.Request("http://127.0.0.1:8190/api/comfyui/reupload", b"", method="POST")
    body = b"--b\r\nContent-Disposition: form-data; name=\"target\"\r\n\r\nhttp://127.0.0.1:1\r\n--b\r\nContent-Disposition: form-data; name=\"names\"\r\n\r\n[\"formvis/none.png\"]\r\n--b--\r\n"
    req = urllib.request.Request(req.full_url, body, {"Content-Type": "multipart/form-data; boundary=b", "Host": "127.0.0.1:8190"}, method="POST")
    try:
        return "present" in json.loads(urllib.request.urlopen(req, timeout=10).read())
    except OSError:
        return False


def test_the_file_mirror_sends_inputs_again_only_when_comfyui_lost_them(page, comfy, tmp_path):
    if not engine_skips_held_inputs():
        pytest.skip("the running engine was started before the reupload change; restart it to run this")
    set_address(page, comfy.url)
    page.keyboard.press("Escape")
    make_document(page)
    run_flow(page, tmp_path)
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some((l) => l.name === 'ComfyUI result')", timeout=30000)
    keep_ran_graph(page, "Mirror kite")
    open_recipes(page)
    held = len(comfy.uploads)
    row(page, "Mirror kite").get_by_role("button", name="Send inputs").click()
    page.wait_for_function("() => /already in ComfyUI|sent to ComfyUI again/.test(document.body.innerText)", timeout=15000)
    assert len(comfy.uploads) == held
    assert "already in ComfyUI" in page.evaluate("document.body.innerText")
    comfy.restart()
    assert comfy.inputs == {}
    row(page, "Mirror kite").get_by_role("button", name="Send inputs").click()
    page.wait_for_function("() => /3 pictures of Mirror kite sent to ComfyUI again/.test(document.body.innerText)", timeout=15000)
    assert sorted(f"{s}/{n}" for s, n in comfy.inputs) == ["formvis/Depth.png", "formvis/Poster.png", "formvis/Ref.png"]
    again = len(comfy.uploads)
    row(page, "Mirror kite").get_by_role("button", name="Send inputs").click()
    page.wait_for_function("() => /3 pictures of Mirror kite are already in ComfyUI/.test(document.body.innerText)", timeout=15000)
    assert len(comfy.uploads) == again


def test_a_recipe_is_edited_in_comfyui_and_saved_over_or_as_new_with_versions(page, comfy, tmp_path):
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    set_address(page, comfy.url)
    page.keyboard.press("Escape")
    make_document(page)
    run_flow(page, tmp_path)
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some((l) => l.name === 'ComfyUI result')", timeout=30000)
    keep_ran_graph(page, "Kite")
    original = page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipes')).find((r) => r.name === 'Kite').json")

    open_recipes(page)
    with page.context.expect_page() as popup:
        row(page, "Kite").get_by_role("button", name="Edit in ComfyUI").click()
    popup.value.close()
    copied = page.evaluate("navigator.clipboard.readText()")
    assert json.loads(copied) == json.loads(original), ("clipboard", copied[:700], "recipe", original[:700])

    edited = json.loads(original)
    edited["14"]["_meta"] = {"title": "edited in the canvas"}
    update = tmp_path / "edited.json"
    update.write_text(json.dumps(edited))
    with page.expect_file_chooser() as fc:
        row(page, "Kite").get_by_role("button", name="Update...").click()
    fc.value.set_files(str(update))
    try:
        page.wait_for_function("() => /Kite updated\\. ComfyUI has every node and model it needs/.test(document.body.innerText)", timeout=15000)
    except Exception:
        raise AssertionError(page.evaluate("document.body.innerText")[-900:])
    kept = page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipes')).find((r) => r.name === 'Kite').json")
    assert json.loads(kept)["14"]["_meta"]["title"] == "edited in the canvas"
    versions = page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipeVersions')).Kite.map((v) => v.json)")
    assert versions == [original]

    fork = tmp_path / "Kite fork.json"
    fork.write_text(json.dumps(edited))
    with page.expect_file_chooser() as fc:
        row(page, "Kite").get_by_role("button", name="Save as new...").click()
    fc.value.set_files(str(fork))
    page.wait_for_function("() => /Kite fork saved as a new recipe; Kite is unchanged/.test(document.body.innerText)", timeout=15000)
    names = page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipes')).map((r) => r.name)")
    assert "Kite" in names and "Kite fork" in names
    assert page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipes')).find((r) => r.name === 'Kite').json") == kept

    row(page, "Kite").locator("select[aria-label='Earlier versions']").select_option(index=1)
    page.wait_for_function("() => /Kite is back to an earlier version/.test(document.body.innerText)", timeout=10000)
    assert page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipes')).find((r) => r.name === 'Kite').json") == original
    assert page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipeVersions')).Kite.map((v) => v.json)") == [kept, original]

    page.keyboard.press("Escape")
    canvas = json.loads(kept)
    canvas["14"]["_meta"] = {"title": "second canvas edit"}
    req = urllib.request.Request(comfy.url + "/prompt", json.dumps({"prompt": canvas, "client_id": "canvas"}).encode(), {"Content-Type": "application/json"}, method="POST")
    pid = json.loads(urllib.request.urlopen(req).read())["prompt_id"]
    page.wait_for_timeout(1500)
    assert pid in comfy.history
    page.evaluate("""() => { const s = document.querySelector('section.cv-comfyui'), p = s.querySelector('[data-recipe]'); p.dispatchEvent(new Event('focus')); p.value = 'Kite'; p.dispatchEvent(new Event('change'));
      s.querySelector('[data-act="save-graph"]').click(); }""")
    page.wait_for_function("() => document.querySelector('section.cv-comfyui [data-note]').textContent.startsWith('Kite saved from the last graph')", timeout=15000)
    now = page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipes')).find((r) => r.name === 'Kite').json")
    assert json.loads(now)["14"]["_meta"]["title"] == "second canvas edit"
    assert len(page.evaluate("JSON.parse(localStorage.getItem('formvis.comfyui.recipeVersions')).Kite")) == 2


def test_a_missing_node_is_named_when_the_server_lacks_its_type(page, tmp_path):
    from tests.comfy_mock import OBJECT_INFO
    mock = ComfyMock({k: v for k, v in OBJECT_INFO.items() if k != "ImageBlend"}, step_delay=0.05).start()
    try:
        page.evaluate("(j) => localStorage.setItem('formvis.comfyui.recipes', JSON.stringify([{ name: 'Blends', json: j }]))", json.dumps(FLOW))
        set_address(page, mock.url)
        try:
            page.wait_for_function("() => /Recipe Blends: 1 missing node \\(ImageBlend\\)/.test(document.body.innerText)", timeout=20000)
        except Exception:
            raise AssertionError(page.evaluate("document.body.innerText")[-900:])
        page.keyboard.press("Escape")
        make_document(page)
        page.keyboard.press("Escape")
        run_flow(page, tmp_path)
        page.wait_for_function("() => /would not run the workflow \\(400\\)/.test(document.body.innerText)", timeout=20000)
        assert "node ImageBlend does not exist" in page.evaluate("document.body.innerText") and mock.prompts == []
    finally:
        mock.stop()
