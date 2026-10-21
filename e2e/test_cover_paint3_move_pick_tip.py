import re

SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(300, 200, 'M', 'white'); e.deselect();
  const box = (x, y, w, h, r, g, bl, name) => { e.addLayer({ name }); e.fg = { r, g, b: bl }; e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  box(20, 20, 60, 60, 255, 0, 0, 'Red'); box(200, 100, 60, 60, 0, 0, 255, 'Blue'); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
NAMES = "window.formvis.engine.current.doc.layers.map(l => l.name)"
BRUSH = "[window.formvis.engine.brush.diameter, window.formvis.engine.brush.hardness]"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def drag(page, a, b, button="left"):
    page.mouse.move(*scr(page, *a))
    page.mouse.down(button=button)
    page.mouse.move(*scr(page, *b), steps=10)
    page.mouse.up(button=button)
    page.wait_for_timeout(300)


def test_move_tool_drag_moves_the_active_layer_and_undo_puts_it_back(page):
    # PC-UI-0700
    page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.setTool('move')")
    assert page.evaluate(PX, [230, 130])[:3] == [0, 0, 255]
    drag(page, (230, 130), (150, 130))
    assert page.evaluate(PX, [130, 130])[:3] == [0, 0, 255]
    assert page.evaluate(PX, [230, 130])[:3] == [255, 255, 255]
    page.keyboard.press("Control+z")
    page.wait_for_function("window.formvis.engine.flattened().getContext('2d').getImageData(230, 130, 1, 1).data[0] === 0")


def test_alt_drag_with_the_move_tool_copies_the_layer_and_leaves_the_original(page):
    # CO-0033
    page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.setTool('move')")
    page.keyboard.down("Alt")
    drag(page, (230, 130), (150, 130))
    page.keyboard.up("Alt")
    assert page.evaluate(NAMES) == ["Background", "Red", "Blue", "Blue copy"]
    assert page.evaluate(PX, [130, 130])[:3] == [0, 0, 255]
    assert page.evaluate(PX, [230, 130])[:3] == [0, 0, 255]
    steps = "window.formvis.engine.historySteps"
    assert page.evaluate(steps + ".names.slice(-1)[0]") == "Duplicate Layer"
    page.keyboard.press("Control+z")
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 3")
    assert page.evaluate(NAMES) == ["Background", "Red", "Blue"]
    assert page.evaluate(PX, [130, 130])[:3] == [255, 255, 255]
    assert page.evaluate(PX, [230, 130])[:3] == [0, 0, 255]
    page.keyboard.press("Control+Shift+z")
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 4")
    assert page.evaluate(PX, [130, 130])[:3] == [0, 0, 255]


def test_ctrl_alt_shift_click_picks_the_layer_under_the_pointer_with_the_brush_tool(page):
    # PC-UI-0828
    page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.setTool('brush')")
    assert page.evaluate("window.formvis.engine.activeLayer.name") == "Blue"
    page.keyboard.down("Control")
    page.keyboard.down("Alt")
    page.keyboard.down("Shift")
    page.mouse.click(*scr(page, 50, 50))
    page.keyboard.up("Shift")
    page.keyboard.up("Alt")
    page.keyboard.up("Control")
    page.wait_for_function("window.formvis.engine.activeLayer.name === 'Red'", timeout=3000)
    assert page.evaluate(NAMES) == ["Background", "Red", "Blue"]


def test_right_drag_sizes_the_brush_across_and_softens_it_down(page):
    # PC-UI-0773
    page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.setTool('brush'); window.formvis.engine.setBrush({ diameter: 20, hardness: 0.5 })")
    drag(page, (150, 60), (190, 60), "right")
    d, h = page.evaluate(BRUSH)
    assert d > 20 and h == 0.5
    drag(page, (150, 60), (150, 90), "right")
    d2, h2 = page.evaluate(BRUSH)
    assert d2 == d and h2 < 0.5


def test_new_dodge_and_burn_layer_is_a_grey_soft_light_layer_above_the_active_one_in_one_undo(page):
    # SC-AI-0326
    page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.selectLayer(window.formvis.engine.current.doc.layers.find(l => l.name === 'Red').id)")
    page.locator(".cv-menu-btn", has_text="Layer").first.click()
    page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^New(?![A-Za-z ])")).first.hover()
    page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^Dodge & Burn Layer")).first.click()
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 4", timeout=5000)
    assert page.evaluate(NAMES) == ["Background", "Red", "Dodge & Burn", "Blue"]
    assert page.evaluate("window.formvis.engine.activeLayer.blend") == "soft-light"
    assert page.evaluate("Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(5, 5, 1, 1).data)") == [128, 128, 128, 255]
    assert page.evaluate(PX, [50, 50])[:3] == [255, 0, 0]
    page.keyboard.press("Control+z")
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 3", timeout=3000)
