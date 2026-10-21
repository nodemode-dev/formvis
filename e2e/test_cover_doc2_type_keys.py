SCR = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"
SET = "(() => { const t = window.formvis.engine.textSettings; return [t.size, t.lineHeight, t.tracking]; })()"
PIX = """([x0, y0, x1, y1]) => { const e = window.formvis.engine; let red = 0, dark = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const c = e.compositePixel({ x, y }); if (c.a > 0 && c.r > 200 && c.g < 80 && c.b < 80) red++; else if (c.r < 60 && c.g < 60 && c.b < 60) dark++; }
  return [red, dark]; }"""


def start(page, text, at=(40, 80)):
    page.evaluate("window.formvis.engine.newDocument(500, 200, 'T', 'white'); window.formvis.engine.setTool('type'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }")
    x, y = page.evaluate(SCR, list(at))
    page.mouse.click(x, y)
    ed = page.locator(".cv-type-editor")
    ed.fill(text)
    return ed


def commit(page, ed):
    ed.press("Control+Enter")
    page.wait_for_function("window.formvis.engine.current.activeLayer && window.formvis.engine.current.activeLayer.text")


def test_type_size_and_leading_shortcuts_change_the_typed_text(page):
    # PC-EN-0419 CO-0188
    ed = start(page, "Hello world")
    assert page.evaluate(SET) == [48, 1.2, 0]
    ed.press("Control+Shift+Period")
    ed.press("Control+Shift+Period")
    assert page.evaluate(SET)[0] == 52
    ed.press("Control+Shift+Comma")
    assert page.evaluate(SET)[0] == 50
    ed.press("Alt+Control+Shift+Period")
    assert page.evaluate(SET)[0] == 60
    ed.press("Alt+ArrowUp")
    ed.press("Alt+Shift+ArrowUp")
    assert page.evaluate(SET)[1] == 1.5
    ed.press("Alt+ArrowDown")
    assert page.evaluate(SET)[1] == 1.45
    ed.press("Alt+ArrowRight")
    assert page.evaluate(SET)[2] == 20
    commit(page, ed)
    got = page.evaluate("(() => { const t = window.formvis.engine.current.activeLayer.text; return [t.size, t.lineHeight, t.tracking]; })()")
    assert got == [60, 1.45, 20], got


def test_color_of_selected_letters_reaches_the_pixels_of_those_letters_only(page):
    # CO-0184
    ed = start(page, "HHHHHH", (20, 120))
    ed.press("Home")
    for _ in range(3):
        ed.press("Shift+ArrowRight")
    r = page.evaluate("window.formvis.commands.call('type-range-style', { color: '#ff0000' })")
    assert r["result"]["scope"] == "selection"
    commit(page, ed)
    runs = page.evaluate("window.formvis.engine.current.activeLayer.text.runs")
    assert runs[0]["color"] == {"r": 255, "g": 0, "b": 0} and (runs[0]["start"], runs[0]["end"]) == (0, 3)
    x, y, w, h = page.evaluate("(() => { const t = window.formvis.engine.current.activeLayer.transform; return [t.x, t.y, t.w, t.h]; })()")
    left = page.evaluate(PIX, [int(x), int(y), int(x + w / 2 - 4), int(y + h)])
    right = page.evaluate(PIX, [int(x + w / 2 + 4), int(y), int(x + w), int(y + h)])
    assert left[0] > 50 and left[1] == 0, left
    assert right[0] == 0 and right[1] > 50, right
