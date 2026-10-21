"""The agent tools that use the fal catalogue (generate_image with a catalogue model, upscale choices, select_by_text),
run in the window with /api/fal/models and /api/fal/run stubbed: the inputs sent, the consent question, the new layer,
the selection and the upscaled document are read back from the real engine."""
import base64
import io
import json
from pathlib import Path

from PIL import Image

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
CATALOGUE = json.loads((Path(__file__).resolve().parent.parent / "backend" / "app" / "data" / "fal_models.json").read_text(encoding="utf-8"))["models"]


def png(size, paint):
    buf = io.BytesIO()
    paint(Image.new("RGBA", size, (255, 0, 0, 255))).save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def half_white(im):
    for x in range(im.width // 2):
        for y in range(im.height):
            im.putpixel((x, y), (255, 255, 255, 255))
    for x in range(im.width // 2, im.width):
        for y in range(im.height):
            im.putpixel((x, y), (0, 0, 0, 255))
    return im


def stub(page, runs):
    page.route("**/api/fal/models", lambda r: r.fulfill(json={"ready": True, "models": CATALOGUE}))

    def run(route):
        body = route.request.post_data_json
        runs.append(body)
        model = body["model"]
        if model == "fal-ai/sam-3/image":
            out = {"images": [], "masks": [{"png": png((200, 120), half_white), "width": 200, "height": 120}], "seed": None}
        elif model == "fal-ai/clarity-upscaler":
            out = {"images": [{"png": png((400, 240), lambda i: i), "width": 400, "height": 240}], "masks": [], "seed": None}
        else:
            out = {"images": [{"png": png((160, 90), lambda i: i), "width": 160, "height": 90}], "masks": [], "seed": body["inputs"].get("seed", 99)}
        route.fulfill(json={**out, "model": model})

    page.route("**/api/fal/run", run)


def agent(page, name, args, answer=None):
    page.evaluate("([n, a]) => { window.__r = null; window.formvis.agents.run(n, a).then((r) => { window.__r = r; }); }", [name, args])
    if answer:
        ask = page.locator(DLG, has_text="An agent asks")
        ask.wait_for(timeout=20000)
        ask.locator(".cv-dialog-foot button").filter(has_text=answer).first.click()
    page.wait_for_function("window.__r", timeout=30000)
    return page.evaluate("window.__r")


def new_doc(page):
    page.evaluate("() => window.formvis.engine.newDocument(200, 120, 'Fal', 'white')")


def test_generate_image_with_a_catalogue_model_sends_seed_and_size_and_adds_a_layer(page):
    runs = []
    stub(page, runs)
    new_doc(page)
    r = agent(page, "generate_image", {"prompt": "a barn", "model": "fal-ai/flux-2-pro", "seed": 5, "aspect_ratio": "16:9"}, "Allow")
    assert not r.get("isError"), r
    assert runs[0]["model"] == "fal-ai/flux-2-pro" and runs[0]["inputs"] == {"seed": 5, "image_size": {"width": 1024, "height": 576}, "prompt": "a barn"}
    assert "seed 5" in r["content"][0]["text"] and r["structuredContent"]["model"] == "fal-ai/flux-2-pro"
    size = page.evaluate("() => { const l = window.formvis.engine.activeLayer; return [l.raster.width, l.raster.height, l.name]; }")
    assert size == [160, 90, "Generated Image"]


def test_a_parameter_the_model_does_not_take_is_refused_before_anything_is_asked_or_spent(page):
    runs = []
    stub(page, runs)
    new_doc(page)
    r = agent(page, "generate_image", {"prompt": "a barn", "model": "openai/gpt-image-2", "seed": 5})
    assert r["isError"] and "takes no seed" in r["content"][0]["text"]
    r = agent(page, "generate_image", {"prompt": "a barn", "model": "fal-ai/flux-2-pro", "options": {"not_an_input": 1}})
    assert r["isError"] and "has no input not_an_input" in r["content"][0]["text"]
    r = agent(page, "generate_image", {"prompt": "a barn", "model": "fal-ai/clarity-upscaler"})
    assert r["isError"] and "upscale model" in r["content"][0]["text"]
    r = agent(page, "generate_image", {"prompt": "a barn", "seed": 3})
    assert r["isError"] and "catalogue model" in r["content"][0]["text"]
    assert runs == []


def test_negative_prompt_and_options_reach_a_model_that_has_them(page):
    runs = []
    stub(page, runs)
    new_doc(page)
    r = agent(page, "generate_image", {"prompt": "a barn", "model": "fal-ai/flux-2/klein/9b/base", "negative_prompt": "blur", "options": {"guidance_scale": 4}, "size": {"width": 512, "height": 512}}, "Allow")
    assert not r.get("isError"), r
    sent = runs[0]["inputs"]
    assert sent["negative_prompt"] == "blur" and sent["guidance_scale"] == 4 and sent["image_size"] == {"width": 512, "height": 512}


def test_declining_the_question_spends_nothing(page):
    runs = []
    stub(page, runs)
    new_doc(page)
    r = agent(page, "generate_image", {"prompt": "a barn", "model": "fal-ai/flux-2-pro"}, "Don't")
    assert r["isError"] and "declined" in r["content"][0]["text"] and runs == []


def test_select_by_text_turns_the_returned_mask_into_the_selection(page):
    runs = []
    stub(page, runs)
    new_doc(page)
    r = agent(page, "select_by_text", {"prompt": "the left half"}, "Allow")
    assert not r.get("isError"), r
    assert runs[0]["model"] == "fal-ai/sam-3/image" and runs[0]["inputs"]["prompt"] == "the left half" and runs[0]["inputs"]["apply_mask"] is False
    assert runs[0]["images"]["image_url"].startswith("data:image/png;base64,")
    sel = page.evaluate("() => { const s = window.formvis.engine.current.selection; return [s.x, s.y, s.w, s.h]; }")
    assert sel == [0, 0, 100, 120]


def test_upscale_with_a_catalogue_model_opens_the_enlarged_document(page):
    runs = []
    stub(page, runs)
    new_doc(page)
    r = agent(page, "upscale", {"scale": 2, "model": "fal-ai/clarity-upscaler", "seed": 4}, "Allow")
    assert not r.get("isError"), r
    assert runs[0]["model"] == "fal-ai/clarity-upscaler" and runs[0]["inputs"]["upscale_factor"] == 2 and runs[0]["inputs"]["seed"] == 4
    assert "image_url" in runs[0]["images"]
    assert page.evaluate("() => [window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [400, 240]
