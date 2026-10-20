# SC-AI-0007 in the browser: the Upscale dialog lists the upscaler files of the ComfyUI at the Preferences address
# (a .pth among them) in its Model list without rebuilding the dialog, runs the chosen one against backend/tests/comfy_mock.py
# extended with the two upscale nodes, places the result as a new document, names missing nodes, and cancels.
import sys
from pathlib import Path

import pytest
from playwright.sync_api import Error as PlaywrightError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from tests.comfy_mock import OBJECT_INFO  # noqa: E402
from tests.test_comfyui_upscale_route import FILES, NODES, UpscalingMock  # noqa: E402

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def set_address(page, url):
    for attempt in (0, 1):
        try:
            page.evaluate("window.formvis.commands.run('settings')")
            page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click(timeout=10000)
            box = page.locator("input[aria-label='ComfyUI address']")
            box.fill(url)
            box.press("Tab")
            page.locator(".cv-prefs-dlg .cv-dialog-foot button.cv-btn-primary").click(timeout=10000)
            page.locator(".cv-prefs-dlg").wait_for(state="hidden", timeout=10000)
            return
        except PlaywrightError:
            if attempt:
                raise
            page.reload()
            page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)


def again(page, step):
    for attempt in (0, 1):
        try:
            return step()
        except PlaywrightError as err:
            if attempt or not ("context was destroyed" in str(err) or "undefined" in str(err)):
                raise
            page.reload()
            page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)


def make_document(page):
    again(page, lambda: page.evaluate("window.formvis.engine.newDocument(30, 20, 'Small', { r: 200, g: 100, b: 50 })"))


def open_upscale(page):
    def step():
        page.evaluate("window.formvis.commands.run('upscale-4x')")
        page.locator(DLG, has_text="Upscale 4x").wait_for()
    again(page, step)


@pytest.fixture()
def comfy():
    mock = UpscalingMock(nodes={**OBJECT_INFO, **NODES}, step_delay=0.02).start()
    yield mock
    mock.stop()


def test_the_comfyui_upscaler_files_join_the_model_list_in_place_and_one_runs_into_a_new_document(page, comfy):
    set_address(page, comfy.url)
    make_document(page)
    page.evaluate("""() => { window.__flash = []; new MutationObserver((rs) => { for (const r of rs) for (const n of r.removedNodes) if (n.nodeType === 1 && n.tagName !== 'OPTION' && n.tagName !== 'OPTGROUP' && r.target.closest && r.target.closest('.cv-dialog')) window.__flash.push(n.tagName + '.' + n.className); }).observe(document.body, { childList: true, subtree: true }); }""")
    open_upscale(page)
    model = page.locator(f"{DLG} select[aria-label='Model']")
    group = model.locator("optgroup[label='ComfyUI upscaler']")
    group.locator("option").first.wait_for(state="attached", timeout=15000)
    assert group.locator("option").all_inner_texts() == [f"{f} (ComfyUI)" for f in FILES]
    assert "4x-UltraSharp.pth (ComfyUI)" in model.locator("option").all_inner_texts()
    model.select_option("comfy-file:4x-UltraSharp.pth")
    assert "runs on ComfyUI" in page.locator(DLG).inner_text()
    assert page.evaluate("window.__flash") == []
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.projects.length === 2 && window.formvis.engine.current.doc.width === 120", timeout=30000)
    got = page.evaluate("(() => { const e = window.formvis.engine; return [e.current.doc.width, e.current.doc.height, Array.from(e.flattened().getContext('2d').getImageData(60, 40, 1, 1).data)]; })()")
    w, h, (r, g, b, _a) = got
    assert (w, h) == (120, 80) and abs(r - 200) < 6 and abs(g - 100) < 6 and abs(b - 50) < 6, got
    assert comfy.chosen == ["4x-UltraSharp.pth"]
    assert page.evaluate("window.__flash") == []


def test_missing_upscale_nodes_are_named_and_the_entry_cannot_be_chosen(page):
    mock = UpscalingMock(nodes=dict(OBJECT_INFO)).start()
    try:
        set_address(page, mock.url)
        make_document(page)
        open_upscale(page)
        entry = page.locator(f"{DLG} select[aria-label='Model'] option[value='comfy-missing']")
        entry.wait_for(state="attached", timeout=15000)
        text = entry.inner_text()
        assert "UpscaleModelLoader" in text and "ImageUpscaleWithModel" in text and entry.evaluate("(o) => o.disabled")
        assert page.locator(f"{DLG} select[aria-label='Model'] option[value^='comfy-file:']").count() == 0
    finally:
        mock.stop()


def test_stopping_an_upscale_on_comfyui_adds_no_document(page, comfy):
    set_address(page, comfy.url)
    make_document(page)
    open_upscale(page)
    model = page.locator(f"{DLG} select[aria-label='Model']")
    model.locator("option[value^='comfy-file:']").first.wait_for(state="attached", timeout=15000)
    model.select_option("comfy-file:RealESRGAN_x4plus.safetensors")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.keyboard.press("Escape")
    page.wait_for_function("() => !window.formvis.engine.busy", timeout=15000)
    assert page.evaluate("window.formvis.engine.projects.length") == 1


def test_an_unreachable_comfyui_leaves_the_other_upscalers_alone(page):
    set_address(page, "http://127.0.0.1:1")
    make_document(page)
    open_upscale(page)
    model = page.locator(f"{DLG} select[aria-label='Model']")
    page.wait_for_timeout(1500)
    assert model.locator("option[value^='comfy']").count() == 0
    assert "Real-ESRGAN (fal)" in model.locator("option").all_inner_texts()
