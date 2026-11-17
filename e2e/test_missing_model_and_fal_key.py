# The review gaps of 2.3.5: an action whose local model is missing offers Install now (with the size) and carries on;
# Generative Fill without a fal key says what it needs and offers a key or a local model; an empty fill with LaMa here
# runs on LaMa. The engine's model list, its downloads and the models' own answers are stood in for inside the page.
import io

from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def _png(w, h, colour):
    b = io.BytesIO(); Image.new("RGB", (w, h), colour).save(b, "PNG"); return b.getvalue()


def models(page, here):
    def handle(route, request):
        if request.method != "GET":
            return route.continue_()
        listed = route.fetch().json()
        route.fulfill(json=[{**m, "ready": m["ready"] or m["id"] in here} for m in listed])
    page.route("**/api/models", handle)


def no_fal_key(page):
    page.route("**/api/generative/status", lambda route, request: route.fulfill(json={"configured": False, "source": None, "fillModel": "", "eraseModel": "", "upscaleModel": ""}))


def test_install_now_downloads_the_missing_model_and_the_action_carries_on(page):
    here, seen = set(), {"download": 0}

    def download(route, request):
        seen["download"] += 1
        here.add("depth-anything-v2-small")
        route.fulfill(status=202, json={"job_id": "dj"})
    models(page, here)
    page.route("**/api/models/depth-anything-v2-small/download", download)
    page.route("**/api/jobs/dj", lambda route, request: route.fulfill(json={"status": "done", "result": {"model": "depth-anything-v2-small", "ready": True}}))
    page.route("**/api/depth/local**", lambda route, request: route.fulfill(body=_png(64, 48, (128, 128, 128)), headers={"content-type": "image/png"}))
    page.evaluate("window.formvis.engine.newDocument(64, 48, 'D', 'white'); window.formvis.commands.run('compute-depth-map')")
    ask = page.locator(DLG, has_text="Install Depth Anything V2 Small")
    ask.wait_for(timeout=15000)
    assert "not on this computer yet" in ask.inner_text() and "99 MB" in ask.inner_text()
    ask.get_by_role("button", name="Install now (99 MB)").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length === 2", timeout=20000)
    assert seen["download"] == 1


def test_cancel_downloads_nothing_and_leaves_the_document_as_it_was(page):
    seen = {"download": 0}
    models(page, set())
    page.route("**/api/models/*/download", lambda route, request: (seen.__setitem__("download", seen["download"] + 1), route.fulfill(status=202, json={"job_id": "x"}))[1])
    page.evaluate("window.formvis.engine.newDocument(64, 48, 'D', 'white'); window.formvis.commands.run('compute-depth-map')")
    ask = page.locator(DLG, has_text="Install Depth Anything V2 Small")
    ask.wait_for(timeout=15000)
    ask.get_by_role("button", name="Cancel").click()
    page.wait_for_function("() => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes('Compute Depth Map needs Depth Anything'))", timeout=10000)
    assert seen["download"] == 0
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == 1


def _fill_selection(page, prompt):
    page.evaluate("""async (prompt) => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 120, 'F', 'white');
      e.applySelection(E.SelectionMask.cropped(50, 30, 60, 40, new Uint8Array(2400).fill(255)), 'replace', 's'); window.formvis.commands.run('generative-fill', { prompt }); }""", prompt)


def test_without_a_fal_key_the_fill_says_what_it_needs_and_offers_a_key_or_a_local_model(page):
    no_fal_key(page)
    models(page, set())
    _fill_selection(page, "a red balloon")
    dlg = page.locator(DLG, has_text="Generative Fill")
    dlg.wait_for(timeout=15000)
    page.wait_for_function("() => { const r = document.querySelector('.cv-scrim:not([hidden]) [data-gen-nokey]'); return r && !r.hidden; }", timeout=10000)
    said = dlg.inner_text()
    assert "needs a fal API key" in said and "paid" in said and "this computer" in said
    dlg.locator("[data-gen-add-key]").click()
    assert page.evaluate("document.activeElement && document.activeElement.placeholder") == "fal API key"
    dlg.locator("[data-gen-use-local]").click()
    ask = page.locator(DLG, has_text="Install LaMa")
    ask.wait_for(timeout=10000)
    assert "Install now (208 MB)" in ask.inner_text()
    ask.get_by_role("button", name="Cancel").click()
    dlg.wait_for(timeout=10000)
    assert page.evaluate("document.querySelector('.cv-scrim:not([hidden]) select[aria-label=Model]').value") != "local:lama"
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == 1


def test_an_empty_fill_without_a_key_uses_lama_when_it_is_here(page):
    seen = {"inpaint": 0}

    def inpaint(route, request):
        seen["inpaint"] += 1
        route.fulfill(body=_png(512, 512, (30, 60, 200)), headers={"content-type": "image/png"})
    no_fal_key(page)
    models(page, {"lama-inpaint"})
    page.route("**/api/inpaint/local", inpaint)
    _fill_selection(page, "")
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length === 2", timeout=20000)
    assert seen["inpaint"] >= 1
    assert page.locator(DLG, has_text="Generative Fill").count() == 0