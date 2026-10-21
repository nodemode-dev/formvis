SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 100, 'S', 'white'); e.fg = { r: 0, g: 0, b: 0 }; e.setTool('brush'); e.setBrushMode('paint');
  e.setBrush({ diameter: 6, hardness: 1, opacity: 1 }); e.brushFlow = 1; const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
DARK = "([x, y]) => window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[0] < 100"


def test_number_keys_set_the_opacity_and_shift_number_keys_set_the_flow(page):
    page.evaluate(SETUP)
    page.keyboard.press("5")
    assert page.evaluate("window.formvis.engine.brush.opacity") == 0.5
    page.wait_for_timeout(800)
    page.keyboard.press("4"); page.keyboard.press("5")
    assert abs(page.evaluate("window.formvis.engine.brush.opacity") - 0.45) < 0.001
    page.wait_for_timeout(800)
    page.keyboard.press("Shift+Digit3")
    assert abs(page.evaluate("window.formvis.engine.brushFlow") - 0.3) < 0.001
    page.wait_for_timeout(800)
    page.keyboard.press("0")
    assert page.evaluate("window.formvis.engine.brush.opacity") == 1


def test_shift_click_draws_a_straight_line_from_the_last_point(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.click(*at(20, 20))
    page.keyboard.down("Shift")
    page.mouse.click(*at(160, 70))
    page.keyboard.up("Shift")
    assert page.evaluate(DARK, [20, 20]) and page.evaluate(DARK, [160, 70]) and page.evaluate(DARK, [90, 45])
    assert not page.evaluate(DARK, [90, 20]) and not page.evaluate(DARK, [90, 70])


def test_shift_drag_locks_the_stroke_to_the_nearest_45_degrees(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(30, 30)); page.mouse.down(); page.mouse.move(*at(40, 30), steps=3)
    page.keyboard.down("Shift"); page.mouse.move(*at(120, 38), steps=10); page.mouse.up(); page.keyboard.up("Shift")
    assert page.evaluate(DARK, [75, 30]) and page.evaluate(DARK, [110, 30])
    assert not page.evaluate(DARK, [75, 36]) and not page.evaluate(DARK, [110, 38])
