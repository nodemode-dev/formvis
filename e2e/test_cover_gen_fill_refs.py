# Generative Fill dialog with a ComfyUI workflow through the stand-in server (backend/tests/comfy_mock.py): @img reference
# chips, the @ list, the chip menu and drag, the prompt's own undo, and a run that sends the references and the prompt.
# SC-ED-0226, SC-ED-0227, SC-ED-0228, SC-ED-0229.
import json
import sys
from pathlib import Path

import pytest
from playwright.sync_api import Error as PlaywrightError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from tests.comfy_mock import ComfyMock  # noqa: E402

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
FILL = {
    "5": {"class_type": "KSampler", "inputs": {"steps": 5, "sampler_name": "euler", "positive": ["6", 0]}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "old"}, "_meta": {"title": "formvis prompt"}},
    "10": {"class_type": "LoadImage", "inputs": {"image": "example.png"}, "_meta": {"title": "formvis fill"}},
    "11": {"class_type": "LoadImageMask", "inputs": {"image": "example.png", "channel": "alpha"}, "_meta": {"title": "formvis fill mask"}},
    "12": {"class_type": "LoadImage", "inputs": {"image": "example.png"}, "_meta": {"title": "formvis reference"}},
    "13": {"class_type": "LoadImage", "inputs": {"image": "example.png"}, "_meta": {"title": "formvis reference 2"}},
    "14": {"class_type": "ImageInvert", "inputs": {"image": ["10", 0]}},
    "15": {"class_type": "ImageBlend", "inputs": {"image1": ["14", 0], "image2": ["12", 0], "blend_factor": 0.5}},
    "16": {"class_type": "ImageBlend", "inputs": {"image1": ["15", 0], "image2": ["13", 0], "blend_factor": 0.5}},
    "20": {"class_type": "SaveImage", "inputs": {"images": ["16", 0], "filename_prefix": "formvis"}},
}
SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  e.newDocument(120, 80, 'Poster', { r: 200, g: 100, b: 50 });
  for (const [name, c] of [['Ref', [40, 80, 120]], ['Ref2', [10, 250, 130]]]) {
    const r = new E.Raster(120, 80); r.ctx.fillStyle = `rgb(${c})`; r.ctx.fillRect(0, 0, 120, 80); r.touch();
    e.insertRasterLayer(r, name, 0, 0, {}, 'Test layer'); e.setLayerRole('reference'); }
  e.applySelection(E.SelectionMask.cropped(20, 20, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's'); }"""
PROMPT = "input[placeholder^='Describe what to add']"


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
            page.locator(".cv-prefs-dlg").first.press("Escape")
            page.wait_for_timeout(300)
            return
        except PlaywrightError:
            if attempt:
                raise
            page.reload()
            page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)


def open_fill(page, comfy, tmp_path, reopen=True):
    set_address(page, comfy.url)
    page.evaluate(SETUP)
    wf = tmp_path / "fill.json"
    wf.write_text(json.dumps(FILL))
    page.evaluate("window.formvis.commands.run('generative-fill')")
    d = page.locator(DLG, has_text="Generative Fill").last
    d.wait_for(timeout=10000)
    d.locator("input[aria-label='Add ComfyUI workflow']").set_input_files(str(wf))
    page.wait_for_function("() => [...document.querySelectorAll(\"select[aria-label='Model'] option\")].some((o) => o.value.startsWith('comfy:'))", timeout=10000)
    d.locator("select[aria-label='Model']").select_option("comfy:fill")
    if reopen:
        d.locator(".cv-dialog-foot button", has_text="Cancel").click()
        page.evaluate("window.formvis.commands.run('generative-fill')")
        d = page.locator(DLG, has_text="Generative Fill").last
        d.wait_for(timeout=10000)
        page.wait_for_timeout(1200)
    return d


def chips(d):
    return d.locator(".cv-chips-list .cv-chip").evaluate_all("(c) => c.map((x) => x.textContent)")


def test_the_at_list_the_chip_menu_drag_and_prompt_undo(page, comfy, tmp_path):
    d = open_fill(page, comfy, tmp_path)
    assert chips(d) == ["@img1Ref2", "@img2Ref"]
    prompt = d.locator(PROMPT)
    prompt.click()
    prompt.type("like @")
    assert d.locator(".cv-chip-pick").is_visible()
    assert d.locator(".cv-chip-pick button").evaluate_all("(c) => c.map((x) => x.textContent)") == ["@img1  Ref2", "@img2  Ref", "Background"]
    prompt.press("ArrowDown")
    prompt.press("Enter")
    assert prompt.input_value() == "like @img2 "
    d.locator(".cv-chips-list .cv-chip").first.click()
    assert d.locator(".cv-chip-menu").is_visible()
    assert d.locator(".cv-chip-menu button").evaluate_all("(c) => c.map((x) => [x.textContent, x.disabled])") == [["Put in prompt", False], ["Move earlier", True], ["Move later", False], ["Remove", False]]
    d.locator(".cv-chip-menu button[data-act=insert]").click()
    assert prompt.input_value().endswith("@img1 ")
    d.locator(".cv-chip-menu button[data-act=later]").click()
    assert chips(d) == ["@img1Ref", "@img2Ref2"]
    assert prompt.input_value() == "like @img1 @img2 "
    first, second = d.locator(".cv-chips-list .cv-chip").nth(0).bounding_box(), d.locator(".cv-chips-list .cv-chip").nth(1).bounding_box()
    page.mouse.move(second["x"] + second["width"] / 2, second["y"] + second["height"] / 2)
    page.mouse.down()
    page.mouse.move(first["x"] + first["width"] / 2, first["y"] + first["height"] / 2, steps=8)
    page.mouse.up()
    assert chips(d) == ["@img1Ref2", "@img2Ref"]
    assert prompt.input_value() == "like @img2 @img1 "
    prompt.fill("alpha")
    page.wait_for_timeout(700)
    prompt.fill("alpha beta")
    page.wait_for_timeout(500)
    prompt.press("Control+z")
    assert prompt.input_value() == "alpha"
    prompt.press("Control+Shift+z")
    assert prompt.input_value() == "alpha beta"
    if not d.locator(".cv-chip-menu").is_visible():
        d.locator(".cv-chips-list .cv-chip").first.click()
    d.locator(".cv-chip-menu button[data-act=remove]").click()
    assert chips(d) == ["@img1Ref"]


def test_a_run_sends_the_references_in_chip_order_and_names_them_in_the_prompt(page, comfy, tmp_path):
    d = open_fill(page, comfy, tmp_path)
    d.locator(PROMPT).fill("@img2 over @img1")
    page.wait_for_timeout(500)
    d.locator(".cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length >= 4", timeout=40000)
    sent = comfy.prompts[0]
    assert sent["6"]["inputs"]["text"] == "image 2 over image 1"
    assert sorted(comfy.loaded)[0].startswith("formvis/")
    assert len(comfy.loaded) == 3


def test_choosing_a_workflow_in_the_open_dialog_shows_the_reference_chips(page, comfy, tmp_path):
    d = open_fill(page, comfy, tmp_path, reopen=False)
    assert chips(d) == ["@img1Ref2", "@img2Ref"]
