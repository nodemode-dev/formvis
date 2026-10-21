import io

from PIL import Image

PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
LAYERS = "window.formvis.engine.current.doc.layers.length"
GREY_HALVES = """() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
  k.fillStyle = 'rgb(90,90,90)'; k.fillRect(0, 0, 50, 60); k.fillStyle = 'rgb(150,150,150)'; k.fillRect(50, 0, 50, 60); e.activeLayer.raster.touch(); e.refresh(); }"""
RED_COPY = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 100, 'P', 'white'); e.deselect(); e.fg = { r: 200, g: 20, b: 20 };
  e.applySelection(E.SelectionMask.cropped(20, 20, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); window.formvis.commands.run('copy'); }"""
SELECT_SQUARE = """async () => { const E = await import('/src/engine/index.ts'); window.formvis.engine.applySelection(E.SelectionMask.cropped(20, 20, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); }"""
STATS = "() => Object.fromEntries([...document.querySelectorAll('.cv-hist-stats dd')].map((n) => [n.dataset.s, n.textContent]))"
SELECT_BY_TEXT = """([start, value]) => { const s = [...document.querySelectorAll('select')].find((n) => n.getClientRects().length && [...n.options].some((o) => o.text.startsWith(start)));
  s.value = value; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }"""


def menu(page, top, *labels):
    page.keyboard.press("Escape")
    page.get_by_text(top, exact=True).first.click()
    for label in labels:
        page.locator(f".cv-menu-item:has(.cv-menu-label:text-is('{label}'))").first.click()
        page.wait_for_timeout(200)


def shot(page):
    return Image.open(io.BytesIO(page.screenshot())).convert("RGB")


def new_adjustment(page, kind):
    assert page.evaluate(f"window.formvis.commands.run('new-adj-{kind}')")
    page.wait_for_timeout(800)


def close_adjustment_dialog(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(700)


def test_dragging_a_curve_point_up_lifts_the_grey_it_sits_on(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = 'rgb(100,100,100)'; k.fillRect(0, 0, 100, 60); e.activeLayer.raster.touch(); e.refresh(); }""")
    new_adjustment(page, "curves")
    box = page.locator("canvas.cv-curves:visible").first.bounding_box()

    def at(x, y):
        return box["x"] + x / 255 * box["width"], box["y"] + (1 - y / 255) * box["height"]

    page.mouse.move(*at(100, 100))
    page.mouse.down()
    page.mouse.move(*at(100, 200), steps=5)
    page.mouse.up()
    page.wait_for_timeout(600)
    assert page.evaluate(PX, [50, 30])[:3] == [200, 200, 200]
    assert page.evaluate(PX, [0, 0])[:3] == [200, 200, 200]


def test_a_curve_point_dragged_off_the_graph_is_removed_and_the_picture_returns(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = 'rgb(100,100,100)'; k.fillRect(0, 0, 100, 60); e.activeLayer.raster.touch(); e.refresh(); }""")
    new_adjustment(page, "curves")
    box = page.locator("canvas.cv-curves:visible").first.bounding_box()

    def at(x, y):
        return box["x"] + x / 255 * box["width"], box["y"] + (1 - y / 255) * box["height"]

    page.mouse.move(*at(100, 100))
    page.mouse.down()
    page.mouse.move(*at(100, 200), steps=4)
    page.mouse.up()
    page.wait_for_timeout(500)
    assert page.evaluate(PX, [50, 30])[0] == 200
    page.mouse.move(*at(100, 200))
    page.mouse.down()
    page.mouse.move(box["x"] + 100, box["y"] + box["height"] + 60, steps=6)
    page.mouse.up()
    page.wait_for_timeout(600)
    assert page.evaluate(PX, [50, 30])[0] == 100


def test_normalise_stretches_to_the_ends_then_pulls_towards_the_mean_from_the_properties_panel(page):
    page.evaluate(GREY_HALVES)
    new_adjustment(page, "normalise")
    assert page.evaluate(PX, [10, 30])[:3] == [0, 0, 0]
    assert page.evaluate(PX, [80, 30])[:3] == [255, 255, 255]
    close_adjustment_dialog(page)
    page.evaluate(SELECT_BY_TEXT, ["Stretch", "mean"])
    page.wait_for_timeout(800)
    dark, light = page.evaluate(PX, [10, 30]), page.evaluate(PX, [80, 30])
    assert abs(dark[0] - 71) <= 2 and abs(light[0] - 184) <= 2, (dark, light)
    assert page.evaluate("window.formvis.engine.activeLayer.adjustment.data.params.mode") == "mean"


def test_the_histogram_panel_reports_a_flat_grey_picture(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = 'rgb(100,100,100)'; k.fillRect(0, 0, 100, 60); e.activeLayer.raster.touch(); e.refresh(); }""")
    assert page.evaluate("window.formvis.commands.run('panel-histogram')")
    page.wait_for_function("document.querySelector('.cv-hist-stats [data-s=mean]')?.textContent === '100.00'", timeout=8000)
    stats = page.evaluate(STATS)
    assert stats["sd"] == "0.00" and stats["median"] == "100" and stats["n"] == "6,000", stats
    page.locator("select.cv-hist-channel").select_option("r", force=True)
    page.wait_for_timeout(500)
    lit = page.evaluate("""() => { const d = document.querySelector('.cv-hist-canvas').getContext('2d').getImageData(100, 0, 1, 100).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }""")
    assert lit >= 90 and page.evaluate("document.querySelector('.cv-hist-canvas').getContext('2d').getImageData(50, 50, 1, 1).data[3]") == 0


def test_the_styles_panel_applies_a_default_style_to_the_active_layer_and_clears_it(page):
    page.evaluate("""() => { window.formvis.engine.newDocument(100, 60, 'T', 'white'); }""")
    assert page.evaluate("window.formvis.commands.run('panel-styles')")
    page.wait_for_timeout(600)
    page.locator(".cv-styles [data-act=defaults]").click()
    page.wait_for_timeout(400)
    assert page.locator(".cv-style-tile").count() > 20
    assert not page.evaluate("Object.keys(window.formvis.engine.activeLayer.effects || {}).length")
    page.locator(".cv-style-tile").first.click()
    page.wait_for_timeout(600)
    assert page.evaluate("Object.keys(window.formvis.engine.activeLayer.effects || {}).length") >= 1
    page.locator(".cv-styles .cv-styles-clear").click()
    page.wait_for_timeout(400)
    assert not page.evaluate("Object.keys(window.formvis.engine.activeLayer.effects || {}).length")


def test_selection_display_tint_replaces_the_marching_ants_with_a_red_tint_outside(page):
    page.evaluate(RED_COPY)
    page.evaluate(SELECT_SQUARE)
    page.wait_for_timeout(400)
    before = shot(page)
    menu(page, "View", "Show", "Selection Display: Tint")
    page.wait_for_timeout(500)
    after = shot(page)
    reddened = sum(
        1
        for x in range(0, after.width, 6)
        for y in range(0, after.height, 6)
        if after.getpixel((x, y)) != before.getpixel((x, y)) and after.getpixel((x, y))[0] > after.getpixel((x, y))[2] + 25
    )
    assert reddened >= 10, reddened
    menu(page, "View", "Show", "Selection Display: Tint")


def test_purge_histories_empties_every_documents_undo_after_the_confirm(page):
    page.evaluate(RED_COPY)
    page.evaluate("window.formvis.engine.newDocument(50, 50, 'Q', 'white')")
    page.evaluate("() => { window.formvis.engine.fg = { r: 1, g: 2, b: 3 }; window.formvis.engine.selectAll(); window.formvis.engine.fill('fg'); }")
    assert page.evaluate("window.formvis.engine.projects.every((q) => q.history.steps.names.length > 0)")
    menu(page, "Edit", "Purge", "Histories")
    page.locator(".cv-scrim:not([hidden]) button", has_text="Purge").last.click()
    page.wait_for_timeout(600)
    assert page.evaluate("window.formvis.engine.projects.map((q) => q.history.steps.names.length)") == [0, 0]


def test_new_from_clipboard_opens_a_document_the_size_of_the_copied_selection(page):
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    page.evaluate(RED_COPY)
    n = page.evaluate("window.formvis.engine.projects.length")
    menu(page, "File", "New from Clipboard")
    page.wait_for_function(f"window.formvis.engine.projects.length === {n + 1}", timeout=6000)
    assert page.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [40, 40]
    assert page.evaluate(PX, [20, 20])[:3] == [200, 20, 20]


def test_edit_paste_adds_the_copied_pixels_as_a_new_layer(page):
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    page.evaluate(RED_COPY)
    page.evaluate("window.formvis.engine.deselect()")
    n = page.evaluate(LAYERS)
    menu(page, "Edit", "Paste")
    page.wait_for_function(f"{LAYERS} > {n}", timeout=6000)
    assert page.evaluate(LAYERS) == n + 1
    assert page.evaluate("window.formvis.engine.activeLayer.name") == "Pasted Layer"


def test_free_transform_a_copy_duplicates_the_layer_and_starts_the_transform(page):
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    page.evaluate(RED_COPY)
    page.evaluate("window.formvis.engine.deselect()")
    n = page.evaluate(LAYERS)
    menu(page, "Edit", "Free Transform a Copy")
    page.wait_for_function(f"{LAYERS} === {n + 1}", timeout=6000)
    assert page.evaluate("window.formvis.engine.tool") == "move"
