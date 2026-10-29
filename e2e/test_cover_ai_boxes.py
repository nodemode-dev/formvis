import functools

from playwright.sync_api import Error as PlaywrightError

SCREEN = """() => { const v = window.formvis.engine.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
BOXES = "() => window.formvis.engine.current.doc.boxes.map((b) => ({ n: b.name, k: b.kind, t: b.text, x: b.x, y: b.y, w: b.w, h: b.h }))"
STEP = "() => window.formvis.engine.historySteps.names.slice(-1)[0]"
ACTIVE = "() => { const e = window.formvis.engine, b = e.current.doc.boxes.find((x) => x.id === e.activeBox); return b ? b.name : null; }"


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


def start(page):
    page.evaluate("window.formvis.engine.newDocument(400, 300, 'B', 'white')")
    page.evaluate("window.formvis.commands.run('generate-panel')")
    page.evaluate("window.formvis.commands.run('boxes-tool')")
    x0, y0, z = page.evaluate(SCREEN)
    return lambda x, y: (x0 + x * z, y0 + y * z)


def drag(page, pt, a, c):
    page.mouse.move(*pt(*a)); page.mouse.down(); page.mouse.move(*pt(*c), steps=5); page.mouse.up()


@steady
def test_drawing_names_kinds_and_a_tiny_drag_adds_nothing(page):
    pt = start(page)
    drag(page, pt, (40, 40), (160, 120))
    drag(page, pt, (200, 150), (300, 250))
    assert page.evaluate(BOXES) == [
        {"n": "New 1", "k": "new", "t": "", "x": 40, "y": 40, "w": 120, "h": 80},
        {"n": "New 2", "k": "new", "t": "", "x": 200, "y": 150, "w": 100, "h": 100}]
    assert page.evaluate(STEP) == "New Box" and page.locator(".cv-box-row").count() == 2
    drag(page, pt, (320, 20), (322, 22))
    assert len(page.evaluate(BOXES)) == 2
    page.evaluate("(() => { const e = window.formvis.engine; e.setBox(e.current.doc.boxes[0].id, { kind: 'keep' }); })()")
    assert page.evaluate(BOXES)[0]["n"] == "Keep 1"
    page.evaluate("(() => { const e = window.formvis.engine; e.setBox(e.current.doc.boxes[1].id, { kind: 'keep' }); })()")
    assert page.evaluate(BOXES)[1]["n"] == "Keep 2"


@steady
def test_move_and_resize_by_drag_each_one_undo_step(page):
    pt = start(page)
    drag(page, pt, (40, 40), (160, 120))
    drag(page, pt, (100, 80), (130, 100))
    assert page.evaluate(BOXES)[0]["x"] == 70 and page.evaluate(BOXES)[0]["y"] == 60 and page.evaluate(STEP) == "Move Box"
    drag(page, pt, (190, 140), (220, 160))
    b = page.evaluate(BOXES)[0]
    assert (b["x"], b["y"], b["w"], b["h"]) == (70, 60, 150, 100) and page.evaluate(STEP) == "Resize Box"
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(BOXES)[0]["w"] == 120
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(BOXES)[0]["x"] == 40


@steady
def test_keys_cycle_nudge_duplicate_delete(page):
    pt = start(page)
    drag(page, pt, (40, 40), (160, 120))
    drag(page, pt, (200, 150), (300, 250))
    assert page.evaluate(ACTIVE) == "New 2"
    page.keyboard.press("Tab")
    assert page.evaluate(ACTIVE) == "New 1"
    page.keyboard.press("Shift+Tab")
    assert page.evaluate(ACTIVE) == "New 2"
    page.keyboard.press("ArrowRight"); page.keyboard.press("Shift+ArrowDown")
    b = page.evaluate(BOXES)[1]
    assert (b["x"], b["y"]) == (201, 160) and page.evaluate(STEP) == "Nudge Box"
    page.keyboard.press("Control+d")
    dup = page.evaluate(BOXES)[2]
    assert dup["n"] == "New 3" and (dup["x"], dup["y"]) == (217, 176) and page.evaluate(STEP) == "Duplicate Box"
    page.keyboard.press("Delete")
    assert len(page.evaluate(BOXES)) == 2 and page.evaluate(STEP) == "Delete Box" and page.evaluate(ACTIVE) is None
    page.evaluate("(() => { const e = window.formvis.engine; e.selectBox(e.current.doc.boxes[0].id); })()")
    page.keyboard.press("Escape")
    assert page.evaluate(ACTIVE) is None


@steady
def test_description_by_enter_shows_in_the_panel_and_clears_the_warning(page):
    pt = start(page)
    drag(page, pt, (40, 40), (160, 120))
    assert page.locator(".cv-boxes-warn").inner_text() == "New 1 has no description."
    assert page.locator(".cv-boxes-crop").inner_text() == "Crop preview for New 1: 184 x 144 at 8, 8 (dashed on the picture)."
    page.keyboard.press("Enter")
    ed = page.locator("input.cv-box-editor")
    assert ed.is_visible()
    ed.fill("a red kite")
    page.keyboard.press("Enter")
    assert not ed.is_visible() and page.evaluate(BOXES)[0]["t"] == "a red kite" and page.evaluate(STEP) == "Describe Box"
    assert page.locator(".cv-box-row .cv-box-text").first.input_value() == "a red kite" and page.locator(".cv-boxes-warn").inner_text() == ""
    page.keyboard.press("Enter")
    ed.fill("discarded")
    page.keyboard.press("Escape")
    assert page.evaluate(BOXES)[0]["t"] == "a red kite"


@steady
def test_panel_kind_copy_rows_and_clear(page):
    pt = start(page)
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    drag(page, pt, (40, 40), (160, 120))
    page.keyboard.press("Enter")
    page.locator("input.cv-box-editor").fill("a red | kite")
    page.keyboard.press("Enter")
    page.locator(".cv-box-row .cv-box-kind").first.select_option("remove")
    assert page.evaluate(BOXES)[0]["n"] == "Remove 1" and page.evaluate(STEP) == "Box Kind"
    page.locator(".cv-boxes-copy").click()
    page.wait_for_function("navigator.clipboard.readText().then((t) => t.includes('box 1 | Remove'))")
    assert page.evaluate("navigator.clipboard.readText()") == (
        "Layout boxes (rectangles in document pixels, the picture is 400 x 300; kind | rectangle | description):\n"
        "box 1 | Remove | x=40 y=40 w=120 h=80 | a red / kite")
    page.locator(".cv-boxes-clear").click()
    page.wait_for_function("document.querySelectorAll('.cv-box-row').length === 0", timeout=5000)   # the rows go on the panel's next repaint
    assert page.evaluate(BOXES) == [] and page.evaluate(STEP) == "Clear Boxes"
    page.evaluate("window.formvis.engine.undo()")
    assert len(page.evaluate(BOXES)) == 1


@steady
def test_selection_to_box_and_the_overlap_and_size_warnings(page):
    pt = start(page)
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'); window.formvis.engine.applySelection(E.SelectionMask.cropped(10, 20, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); }""")
    page.evaluate("window.formvis.commands.run('boxes-from-selection')")
    assert page.evaluate(BOXES)[0] | {"t": ""} == {"n": "New 1", "k": "new", "t": "", "x": 10, "y": 20, "w": 20, "h": 20}
    assert page.evaluate(STEP) == "New Box" and page.evaluate("window.formvis.engine.tool") == "boxes"
    assert "New 1 is very small (20 x 20): a model may ignore it." in page.locator(".cv-boxes-warn").inner_text()
    page.evaluate("window.formvis.engine.deselect()")
    assert page.evaluate("window.formvis.commands.run('boxes-from-selection')") is False


@steady
def test_boxes_follow_a_canvas_rotation(page):
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(400, 300, 'B', 'white'); e.addBox({ x: 40, y: 20, w: 100, h: 60 }); })()")
    page.evaluate("window.formvis.commands.run('rotate-90-cw')")
    got = page.evaluate("() => { const d = window.formvis.engine.current.doc; return [d.width, d.height, d.boxes.map((b) => [b.x, b.y, b.w, b.h])]; }")
    assert got == [300, 400, [[220, 40, 60, 100]]], got
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.formvis.engine.current.doc.boxes.map((b) => [b.x, b.y, b.w, b.h])") == [[40, 20, 100, 60]]
