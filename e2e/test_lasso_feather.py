SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 160, 'L', 'white'); e.setTool('lasso'); if (e.tool !== 'lasso') throw new Error('tool'); e.update({ lassoKind: 'polygonal' });
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
AT = "([x, y]) => window.formvis.engine.current.selection.valueAt(x, y)"


def square(page, s):
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    for p in [(50, 40), (150, 40), (150, 120), (50, 120)]: page.mouse.click(*at(*p))
    page.keyboard.press("Enter")


def test_lasso_feather_softens_the_selection(page):
    s = page.evaluate(SETUP)
    f = page.locator(".cv-opt-group:not([hidden]) .cv-opt", has_text="Feather").locator("input[type=number]")
    f.fill("8"); f.press("Tab")
    square(page, s)
    mid, edge, out = page.evaluate(AT, [100, 80]), page.evaluate(AT, [50, 80]), page.evaluate(AT, [45, 80])
    assert mid == 255 and 60 < edge < 200 and 0 < out < 90, (mid, edge, out)
    page.evaluate("window.formvis.engine.deselect()")
    f.fill("0"); f.press("Tab")
    square(page, s)
    assert page.evaluate(AT, [45, 80]) == 0 and page.evaluate(AT, [100, 80]) == 255
