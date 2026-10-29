# Local generation in the window (1.52.9): the engine's answers stood in for inside the page (the engine side has its
# own tests; a real Krea 2 needs its model files), checking what the window sends and does with what comes back.
import base64
import io
import json

from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
NOTICE = "Krea 2 is licensed under the Krea 2 Community License Agreement. For more information, visit https://krea.ai/krea-2-licensing."


def engine(page, seen):
    teal = io.BytesIO(); Image.new("RGB", (96, 64), (20, 160, 150)).save(teal, "PNG")
    catalogue = {"generators": [
        {"id": "local:krea-2", "label": "Krea 2 Turbo (local)", "kind": "image", "ready": True, "reason": None, "options": {"image": 0.4, "steps": 8}},
        {"id": "local:flux2-klein-4b", "label": "FLUX.2 [klein] 4B (local)", "kind": "image", "ready": False, "reason": "not installed", "options": {"steps": 4}}]}

    def handle(route, request):
        url, method = request.url, request.method
        if url.endswith("/api/generate") and method == "GET":
            return route.fulfill(json=catalogue)
        if url.endswith("/api/generate") and method == "POST":
            seen["posts"].append(json.loads(request.post_data)); return route.fulfill(status=202, json={"job_id": "j1"})
        if "/api/jobs/j1" in url:
            return route.fulfill(json={"status": "done", "result": {"media": [{"id": "p1", "url": "/api/generate/pictures/p1"}], "notes": [], "notice": NOTICE}})
        if "/api/generate/pictures/p1" in url:
            if method == "DELETE": seen["deleted"] += 1; return route.fulfill(json={"forgotten": "p1"})
            return route.fulfill(body=teal.getvalue(), headers={"content-type": "image/png"})
        return route.continue_()
    page.route("**/api/generate**", handle)
    page.route("**/api/jobs/**", handle)


def test_generative_fill_on_krea_2_sends_the_area_and_masks_the_result(page):
    seen = {"posts": [], "deleted": 0}
    engine(page, seen)
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 120, 'F', 'white'); localStorage.setItem('formvis.generative', JSON.stringify({ match: 0 })); e.generativeMatch = 0;
      e.applySelection(E.SelectionMask.cropped(50, 30, 60, 40, new Uint8Array(2400).fill(255)), 'replace', 's'); window.formvis.commands.run('generative-fill'); }""")
    page.locator(DLG, has_text="Generative Fill").wait_for()
    model = page.locator(f"{DLG} select[aria-label='Model']")
    page.wait_for_function("() => [...document.querySelectorAll('.cv-scrim:not([hidden]) select[aria-label=Model] option')].some((o) => o.value === 'local:krea-2')")
    assert model.locator("option[value='local:flux2-klein-4b']").count() == 0                   # Klein cannot start from a picture: not offered for fill
    model.select_option("local:krea-2")
    assert page.locator(f"{DLG} input[aria-label='Influence']").input_value() == "40"             # the model's own default
    page.locator(f"{DLG} input[aria-label='Influence']").fill("30")
    page.locator(f"{DLG} input.cv-input[type=text]").first.fill("a lighthouse")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length === 2", timeout=20000)
    body = seen["posts"][-1]
    assert body["generator"] == "local:krea-2" and body["size"] == "source" and body["options"]["imageStrength"] == 0.3 and body["prompt"] == "a lighthouse"
    area = Image.open(io.BytesIO(base64.b64decode(body["options"]["image"]["png"])))
    assert area.size[0] >= 60 and area.size[1] >= 40                                             # the area under the selection, sent
    px = page.evaluate("(() => { const f = window.formvis.engine.flattened().getContext('2d'), p = (x, y) => Array.from(f.getImageData(x, y, 1, 1).data).slice(0, 3); return [p(80, 50), p(20, 100)]; })()")
    assert px == [[20, 160, 150], [255, 255, 255]], px                                           # placed in the selection only
    page.wait_for_function("(n) => [...document.querySelectorAll('.cv-toast')].some((t) => t.textContent.includes(n))", arg="Krea 2 Community License Agreement")
    assert seen["deleted"] == 1                                                                  # the engine's copy removed


def test_generate_image_on_this_computer_at_the_documents_shape(page):
    seen = {"posts": [], "deleted": 0}
    engine(page, seen)
    page.evaluate("window.formvis.engine.newDocument(1000, 600, 'G', 'white'); window.formvis.commands.run('generate-image')")
    page.locator(DLG, has_text="Generate Image").wait_for()
    page.wait_for_function("() => [...document.querySelectorAll('.cv-scrim:not([hidden]) select[aria-label=Model] option')].some((o) => o.value === 'local:krea-2')")
    klein = page.evaluate("(() => { const o = document.querySelector('.cv-scrim:not([hidden]) select[aria-label=Model] option[value=\"local:flux2-klein-4b\"]'); return o && [o.disabled, o.title]; })()")
    assert klein == [True, "not installed"], klein                                               # listed, with why it cannot run
    page.locator(f"{DLG} select[aria-label='Model']").select_option("local:krea-2")
    page.locator(f"{DLG} textarea[aria-label='Prompt']").fill("a lighthouse")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some((l) => l.name === 'Generated Image')", timeout=20000)
    assert seen["posts"][-1]["size"] == "1008x608"                                               # the shape, in multiples of 16
    assert page.evaluate("(() => { const l = window.formvis.engine.current.doc.layers.find((x) => x.name === 'Generated Image'); return [l.raster.width, l.raster.height]; })()") == [1000, 600]
