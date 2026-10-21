import re

SCENE = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(100, 60, 'S', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx; c.fillStyle = '#00a000'; c.fillRect(20, 10, 30, 20); l.raster.touch(); e.refresh();
  e.applySelection(E.SelectionMask.cropped(20, 10, 30, 20, new Uint8Array(600).fill(255)), 'replace', 's'); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
LAST = "window.formvis.engine.historySteps.names.slice(-1)[0]"
GREEN = [0, 160, 0, 255]
WHITE = [255, 255, 255, 255]


def menu(page, *path):
    if page.locator(".cv-menu:not([hidden])").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(100)
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *").filter(has=page.locator(".cv-menu-label", has_text=re.compile("^" + re.escape(label) + r"(\.\.\.|…)?$"))).first
        item.hover() if i < len(path) - 2 else item.click()


def test_clear_and_cut_empty_the_selection_and_undo_brings_it_back(page):
    # PC-UI-0064 PC-EN-0533 PC-EN-0526
    page.evaluate(SCENE)
    assert page.evaluate(PX, [30, 20]) == GREEN
    menu(page, "Edit", "Clear Selection Pixels")
    page.wait_for_function(f"{LAST} === 'Clear'")
    assert page.evaluate(PX, [30, 20]) == WHITE
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(PX, [30, 20]) == GREEN
    menu(page, "Edit", "Copy")
    assert page.evaluate("!!window.formvis.engine.clipboard")
    menu(page, "Edit", "Cut")
    page.wait_for_function(f"{LAST} === 'Clear'")
    assert page.evaluate(PX, [30, 20]) == WHITE


def test_rotate_90_counter_clockwise_moves_the_block_to_the_bottom(page):
    # PC-UI-0088
    page.evaluate(SCENE)
    page.evaluate("window.formvis.commands.call('select-none')")
    menu(page, "Edit", "Transform", "Rotate 90° Counter Clockwise")
    page.wait_for_function(f"{LAST} === 'Rotate 90° Counter Clockwise'")
    assert page.evaluate(PX, [40, 50]) == GREEN and page.evaluate(PX, [30, 20]) == WHITE
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(PX, [30, 20]) == GREEN


def test_image_size_resamples_to_half_width_with_the_proportions_held(page):
    # PC-UI-0165 PC-EN-0003 CO-0011 SC-ED-0128 CO-0011
    page.evaluate(SCENE)
    menu(page, "Image", "Image Size")
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.locator("input").nth(0).fill("50")
    d.locator("input").nth(0).press("Tab")
    page.click(".cv-scrim:not([hidden]) .cv-dialog-foot button:has-text('OK')")
    page.wait_for_function("window.formvis.engine.current.doc.width === 50")
    assert page.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [50, 30]
    assert page.evaluate(PX, [15, 10]) == GREEN and page.evaluate(PX, [40, 25]) == WHITE
