# The fal catalogue in the dialogs: Generate Image, Generative Fill, Expand, Upscale, Subject by Text, Relight with fal and
# the Remove Background cutout choice. The engine's /api/fal routes are stood in for with the real catalogue file and a fixed picture.
import base64
import io
import json
import re
from pathlib import Path

import pytest
from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
CATALOGUE = json.loads((Path(__file__).resolve().parent.parent / "backend" / "app" / "data" / "fal_models.json").read_text())["models"]
SKIP = {"prompt", "text_prompt", "sync_mode", "num_images", "output_format", "image_size"}


def png(w=64, h=64, color=(20, 200, 60, 255), half=False):
    im = Image.new("RGBA", (w, h), color if not half else (0, 0, 0, 255))
    if half:
        im.paste((255, 255, 255, 255), (0, 0, w // 2, h))
    b = io.BytesIO(); im.save(b, "PNG"); return base64.b64encode(b.getvalue()).decode()


def by_role(*roles):
    return [m for m in CATALOGUE if m["role"] in roles]


def options_of(m):
    return [i for i in m["inputs"] if i["key"] not in SKIP and not re.search(r"_urls?$", i["key"]) and not i.get("isArray") and i["type"] in ("string", "integer", "number", "boolean")]


@pytest.fixture()
def fal(page):
    seen = []

    def models(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"ready": True, "models": CATALOGUE}))

    def status(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"configured": True, "source": "settings", "fillModel": "x", "eraseModel": "x", "upscaleModel": "x"}))

    def run(route):
        body = json.loads(route.request.post_data)
        seen.append(body)
        role = next(m["role"] for m in CATALOGUE if m["id"] == body["model"])
        out = {"images": [{"png": png(), "width": 64, "height": 64}], "masks": [{"png": png(half=True), "width": 64, "height": 64}] if role in ("segment", "cutout") else [], "seed": 7, "model": body["model"]}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(out))

    page.route("**/api/fal/models", models)
    page.route("**/api/generative/status", status)
    page.route("**/api/fal/run", run)
    return seen


def pick(page, model_id):
    page.locator(f"{DLG} select[aria-label=Model]").select_option(f"falcat:{model_id}")


def offered(page):
    return page.evaluate("() => [...document.querySelectorAll('.cv-scrim:not([hidden]) select[aria-label=Model] option')].map(o => o.value).filter(v => v.startsWith('falcat:')).map(v => v.slice(7))")


def selection(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 100, 'Poster', 'white'); localStorage.setItem('formvis.generative', JSON.stringify({ match: 0 })); e.generativeMatch = 0;
      e.applySelection(E.SelectionMask.cropped(20, 20, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's'); }""")


def test_generate_image_offers_the_generate_models_and_sends_their_options(page, fal):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'G', 'white'); window.formvis.commands.run('generate-image')")
    page.locator(DLG, has_text="Generate Image").wait_for()
    page.wait_for_function("() => document.querySelectorAll('.cv-scrim:not([hidden]) select[aria-label=Model] option[value^=\"falcat:\"]').length > 0")
    assert sorted(offered(page)) == sorted(m["id"] for m in by_role("generate"))
    m = next(x for x in by_role("generate") if any(i.get("enum") for i in options_of(x)) and any(i["type"] in ("integer", "number") for i in options_of(x)))
    assert page.locator(f"{DLG} .cv-fal").is_hidden()
    pick(page, m["id"])
    assert page.locator(f"{DLG} .cv-fal").is_visible()
    page.evaluate("() => { window.__fal = document.querySelector('.cv-scrim:not([hidden]) .cv-fal'); window.__dlg = document.querySelector('.cv-scrim:not([hidden]) .cv-dialog-body'); }")
    other = next(x for x in by_role("generate") if x["id"] != m["id"])
    pick(page, other["id"])
    pick(page, m["id"])
    assert page.evaluate("() => window.__fal === document.querySelector('.cv-scrim:not([hidden]) .cv-fal') && window.__dlg === document.querySelector('.cv-scrim:not([hidden]) .cv-dialog-body')")
    page.locator(f"{DLG} .cv-fal-more summary").click()
    sel = next(i for i in options_of(m) if i.get("enum")); num = next(i for i in options_of(m) if i["type"] in ("integer", "number"))
    assert page.locator(f"{DLG} .cv-fal-fields select[aria-label='{sel['label']}']").count() == 1
    choice = [v for v in sel["enum"] if v != sel.get("default")][0]
    page.locator(f"{DLG} .cv-fal-fields select[aria-label='{sel['label']}']").select_option(choice)
    value = num.get("min", 1) if num.get("min") is not None else 1
    page.locator(f"{DLG} .cv-fal-fields input[aria-label='{num['label']}']").fill(str(value))
    page.locator(f"{DLG} .cv-fal-fields input[aria-label='{num['label']}']").press("Tab")
    page.locator(f"{DLG} textarea[aria-label=Prompt]").fill("a red kite")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some(l => l.name === 'Generated Image')", timeout=15000)
    body = fal[0]
    assert body["model"] == m["id"] and body["inputs"]["prompt"] == "a red kite" and body["inputs"][sel["key"]] == choice and body["inputs"][num["key"]] == value, body
    assert body["images"] == {}


def test_fill_offers_edit_and_inpaint_and_sends_the_mask_to_the_mask_key(page, fal):
    selection(page)
    page.evaluate("window.formvis.commands.run('generative-fill')")
    page.locator(DLG, has_text="Generative Fill").wait_for()
    page.wait_for_function("() => document.querySelectorAll('.cv-scrim:not([hidden]) select[aria-label=Model] option[value^=\"falcat:\"]').length > 0")
    assert sorted(offered(page)) == sorted(m["id"] for m in by_role("edit", "inpaint", "remove"))
    inp = by_role("inpaint")[0]
    pick(page, inp["id"])
    page.locator(f"{DLG} input[placeholder^='Describe what to add']").fill("a green kite")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length === 2", timeout=15000)
    body = fal[0]
    assert body["model"] == inp["id"] and body["inputs"]["prompt"] == "a green kite"
    assert set(body["images"]) == {"image_url", "mask_url"} and all(v.startswith("data:image/png;base64,") for v in body["images"].values())
    px = page.evaluate("(() => { const f = window.formvis.engine.flattened().getContext('2d'), p = (x, y) => Array.from(f.getImageData(x, y, 1, 1).data).slice(0, 3); return [p(40, 35), p(150, 80)]; })()")
    assert px == [[20, 200, 60], [255, 255, 255]], px
    selection(page)
    page.evaluate("window.formvis.commands.run('generative-fill')")
    page.locator(DLG, has_text="Generative Fill").wait_for()
    page.wait_for_function("() => document.querySelectorAll('.cv-scrim:not([hidden]) select[aria-label=Model] option[value^=\"falcat:\"]').length > 0")
    nomask = next(m for m in by_role("edit") if not any(i["key"].startswith("mask") for i in m["inputs"]) and any(i["key"] == "image_urls" for i in m["inputs"]))
    pick(page, nomask["id"])
    page.locator(f"{DLG} input[placeholder^='Describe what to add']").fill("make it blue")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length === 2", timeout=15000)
    last = fal[-1]
    assert last["model"] == nomask["id"] and list(last["images"]) == ["image_urls"] and isinstance(last["images"]["image_urls"], list)


def test_expand_and_upscale_offer_their_own_models(page, fal):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'E', 'white'); window.formvis.commands.run('generative-expand')")
    page.locator(DLG, has_text="Generative Expand").wait_for()
    page.wait_for_function("() => document.querySelectorAll('.cv-scrim:not([hidden]) select[aria-label=Model] option[value^=\"falcat:\"]').length > 0")
    assert sorted(offered(page)) == sorted(m["id"] for m in by_role("expand"))
    out = next(m for m in by_role("expand") if any(i["key"] == "expand_left" for i in m["inputs"]))
    pick(page, out["id"])
    assert page.locator(f"{DLG} .cv-fal-fields [aria-label='Expand Left']").count() == 0
    page.locator(f"{DLG} input[aria-label='Left margin']").fill("20")
    page.locator(f"{DLG} input[aria-label='Right margin']").fill("10")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.width === 230", timeout=15000)
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.length === 2", timeout=15000)
    body = fal[0]
    assert body["model"] == out["id"] and body["inputs"]["expand_left"] == 20 and body["inputs"]["expand_right"] == 10 and body["inputs"]["expand_top"] == 0 and list(body["images"]) == ["image_url"]
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'U', 'white'); window.formvis.commands.run('upscale-2x')")
    page.locator(DLG, has_text="Upscale").wait_for()
    page.wait_for_function("() => document.querySelectorAll('.cv-scrim:not([hidden]) select[aria-label=Model] option[value^=\"falcat:\"]').length > 0")
    assert sorted(offered(page)) == sorted(m["id"] for m in by_role("upscale"))
    up = by_role("upscale")[0]
    pick(page, up["id"])
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Generate").click()
    page.wait_for_function("() => window.formvis.engine.projects.length >= 3", timeout=15000)
    assert fal[-1]["model"] == up["id"] and list(fal[-1]["images"]) == ["image_url"]


def test_subject_by_text_relight_and_the_cutout_choice(page, fal):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'S', 'white'); window.formvis.commands.run('select-subject-text')")
    page.locator(DLG, has_text="Select Subject by Text").wait_for()
    page.locator(f"{DLG} input[aria-label=Prompt]").fill("wheel")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Select").click()
    page.wait_for_function("() => !!window.formvis.engine.current.selection", timeout=15000)
    assert fal[0]["model"] == "fal-ai/sam-3/image" and fal[0]["inputs"]["prompt"] == "wheel"
    page.evaluate("window.formvis.commands.run('filter-relight-fal')")
    page.locator(DLG, has_text="Relight with fal").wait_for()
    page.locator(f"{DLG} input[aria-label=Prompt]").fill("warm sunset from the left")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Relight").click()
    page.wait_for_function("() => window.formvis.engine.current.doc.layers.some(l => l.name === 'Relight (fal)')", timeout=15000)
    assert fal[1]["model"] == "fal-ai/iclight-v2" and fal[1]["inputs"]["prompt"] == "warm sunset from the left"
    page.evaluate("""async () => { const P = await import('/src/ui/prefs.ts'); P.remembered('Remove Background', 'model', 'fal-cutout'); window.formvis.commands.run('remove-bg'); }""")
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden])') !== null", timeout=15000)
    assert fal[2]["model"] == "fal-ai/bria/background/remove" and list(fal[2]["images"]) == ["image_url"]
    page.wait_for_function("() => [...document.querySelectorAll('.cv-scrim:not([hidden]) select option')].some(o => o.value === 'fal-cutout')")
