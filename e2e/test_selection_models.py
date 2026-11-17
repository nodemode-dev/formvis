# Select Subject and Object Selection offer their recommended model (BiRefNet, SAM 2.1 base-plus) first, once a session;
# Use the small model keeps the small one, Escape keeps nothing, Install now downloads the recommended one and the
# selection carries on. The downloads and the masks are stood in for inside the page; the engine's choices are put back.
import io

import pytest
from PIL import Image

from e2e.conftest import choose_selection_model, selection_choices

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


@pytest.fixture(autouse=True)
def recommended_then_restored():
    before = selection_choices()
    for kind in before:
        choose_selection_model(kind, "recommended")
    yield
    for kind, choice in before.items():
        choose_selection_model(kind, choice)


def _mask(w, h):
    b = io.BytesIO(); m = Image.new("L", (w, h), 0); m.paste(255, (w // 4, h // 4, 3 * w // 4, 3 * h // 4)); m.save(b, "PNG"); return b.getvalue()


def _subject(page, seen):
    def remove(route, request):
        seen["remove"] += 1
        route.fulfill(body=_mask(80, 60), headers={"content-type": "image/png", "X-Method": "ml"})
    page.route("**/api/ops/remove-background", remove)
    page.evaluate("window.formvis.engine.newDocument(80, 60, 'S', 'white'); window.formvis.commands.run('select-subject')")


def test_select_subject_offers_birefnet_and_the_small_model_keeps_working(page):
    seen = {"remove": 0}
    _subject(page, seen)
    ask = page.locator(DLG, has_text="for Select Subject")
    ask.wait_for(timeout=15000)
    said = ask.inner_text()
    assert "BiRefNet" in said and "Swin-T" in said and "224 MB" in said and "U2-Net" in said and "MIT" in said
    assert ask.get_by_role("button", name="Install now (224 MB)").count() == 1
    ask.get_by_role("button", name="Use the small model").click()
    page.wait_for_function("() => !!window.formvis.engine.current.selection", timeout=15000)
    assert seen["remove"] == 1
    assert selection_choices()["subject"] == "small"
    page.evaluate("window.formvis.commands.run('deselect'); window.formvis.commands.run('select-subject')")
    page.wait_for_function("() => !!window.formvis.engine.current.selection", timeout=15000)
    assert page.locator(DLG, has_text="for Select Subject").count() == 0                 # asked once


def test_escape_closes_the_offer_without_choosing_the_small_model(page):
    seen = {"remove": 0}
    _subject(page, seen)
    page.locator(DLG, has_text="for Select Subject").wait_for(timeout=15000)
    page.keyboard.press("Escape")
    page.wait_for_function("() => !!window.formvis.engine.current.selection", timeout=15000)
    assert selection_choices()["subject"] == "recommended"


def test_install_now_downloads_birefnet_and_the_selection_carries_on(page):
    seen = {"remove": 0, "download": 0}
    page.route("**/api/models/birefnet-swin-t/download", lambda route, request: (seen.__setitem__("download", seen["download"] + 1), route.fulfill(status=202, json={"job_id": "bj"}))[1])
    page.route("**/api/jobs/bj", lambda route, request: route.fulfill(json={"status": "done", "result": {"model": "birefnet-swin-t", "ready": True}}))
    _subject(page, seen)
    ask = page.locator(DLG, has_text="for Select Subject")
    ask.wait_for(timeout=15000)
    ask.get_by_role("button", name="Install now (224 MB)").click()
    page.wait_for_function("() => !!window.formvis.engine.current.selection", timeout=20000)
    assert seen == {"remove": 1, "download": 1}


def test_object_selection_offers_sam_base_plus_before_its_first_picture(page):
    seen = {"select": 0}

    def select(route, request):
        seen["select"] += 1
        route.fulfill(body=_mask(40, 30), headers={"content-type": "image/png"})
    page.route("**/api/ops/select-object", select)
    page.evaluate("""async () => { const { api } = await import('/src/io/api.ts');
      window.__picked = api.selectObject('k1', [[10, 10, 1]], async () => new Blob([new Uint8Array([1])], { type: 'image/png' }), true).then((b) => b.size); }""")
    ask = page.locator(DLG, has_text="for Object Selection")
    ask.wait_for(timeout=15000)
    assert "SAM 2.1 base-plus" in ask.inner_text() and "328 MB" in ask.inner_text()
    assert seen["select"] == 0                                                              # nothing sent while it asks
    ask.get_by_role("button", name="Use the small model").click()
    assert page.evaluate("window.__picked") > 0 and seen["select"] == 1


def test_two_actions_missing_the_same_model_share_one_question(page):
    page.evaluate("""async () => { const m = await import('/src/ui/model-install.ts');
      window.__offers = [m.offerModel('lama-inpaint'), m.offerModel('lama-inpaint')]; }""")
    page.locator(DLG, has_text="Install LaMa").wait_for(timeout=15000)
    assert page.locator(".cv-scrim:not([hidden]) .cv-dialog", has_text="Install LaMa").count() == 1
    page.locator(DLG, has_text="Install LaMa").get_by_role("button", name="Cancel").click()
    assert page.evaluate("Promise.all(window.__offers)") == [False, False]
