SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 100, 'S', 'white'); e.fg = { r: 0, g: 0, b: 0 }; e.setTool('brush'); e.setBrushMode('paint');
  e.setBrush({ diameter: 10, hardness: 1, opacity: 1 }); const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
DARK = "([x, y]) => window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[0] < 100"


def drag(page, s, a, b):
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(*a)); page.mouse.down(); page.mouse.move(*at(*b), steps=10); page.mouse.up()


def symmetry(page, key):
    page.evaluate("""async (key) => { const R = await import('/src/extensions/registry.ts'); R.getTool('brush').options(window.formvis.engine).find((o) => o.label === 'Symmetry').set(key); }""", key)


def test_vertical_symmetry_mirrors_the_stroke_across_the_centre_line(page):
    s = page.evaluate(SETUP)
    drag(page, s, (20, 30), (60, 30))
    assert page.evaluate(DARK, [40, 30]) and not page.evaluate(DARK, [160, 30])      # off: the stroke alone
    page.evaluate(SETUP)
    symmetry(page, "vertical")
    try:
        drag(page, s, (20, 30), (60, 30))
        assert page.evaluate(DARK, [40, 30]) and page.evaluate(DARK, [160, 30])      # mirrored: 200 - 40
        assert not page.evaluate(DARK, [40, 70]) and not page.evaluate(DARK, [100, 30])
        symmetry(page, "both")
        page.evaluate(SETUP)
        drag(page, s, (20, 20), (60, 20))
        assert all(page.evaluate(DARK, p) for p in ([40, 20], [160, 20], [40, 80], [160, 80]))
        symmetry(page, "horizontal")
        page.evaluate(SETUP)
        drag(page, s, (20, 20), (60, 20))
        assert page.evaluate(DARK, [40, 80]) and not page.evaluate(DARK, [160, 20])
    finally:
        symmetry(page, "off")


def test_the_bracket_keys_step_the_brush_size_and_shift_brackets_the_hardness(page):
    page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.setBrush({ diameter: 40, hardness: 0.5 })")
    d0 = page.evaluate("window.formvis.engine.brush.diameter")
    page.keyboard.press("]")
    d1 = page.evaluate("window.formvis.engine.brush.diameter")
    assert d1 > d0
    page.keyboard.press("[")
    page.keyboard.press("[")
    assert page.evaluate("window.formvis.engine.brush.diameter") < d0
    h0 = page.evaluate("window.formvis.engine.brush.hardness")
    page.keyboard.press("Shift+]")
    assert page.evaluate("window.formvis.engine.brush.hardness") > h0
    page.keyboard.press("Shift+[")
    page.keyboard.press("Shift+[")
    assert page.evaluate("window.formvis.engine.brush.hardness") < h0
