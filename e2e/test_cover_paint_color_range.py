DLG = ".cv-scrim:not([hidden]) .cv-dialog"
SCENE = """() => { const e = window.formvis.engine; e.newDocument(200, 100, 'C', 'white'); e.deselect(); const c = e.activeLayer.raster.ctx;
  c.fillStyle = 'rgb(210,40,40)'; c.fillRect(0, 0, 100, 100); c.fillStyle = 'rgb(40,60,210)'; c.fillRect(100, 0, 100, 100); e.activeLayer.raster.touch();
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
VAL = "([x, y]) => { const s = window.formvis.engine.current.selection; return s ? s.valueAt(x, y) : 0; }"


def test_color_range_selects_the_clicked_colour_through_its_dialog(page):
    s = page.evaluate(SCENE)
    page.evaluate("window.formvis.commands.run('color-range')")
    dlg = page.locator(DLG)
    dlg.wait_for()
    page.mouse.click(s[0] + 50 * s[2], s[1] + 50 * s[2])
    page.wait_for_timeout(300)
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("!!window.formvis.engine.current.selection")
    assert page.evaluate(VAL, [20, 50]) >= 250 and page.evaluate(VAL, [150, 50]) == 0
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]").startswith("Color Range")
    page.keyboard.press("Control+z")
    assert page.evaluate("window.formvis.engine.current.selection") is None


def test_color_range_invert_selects_everything_but_the_clicked_colour(page):
    s = page.evaluate(SCENE)
    page.evaluate("window.formvis.commands.run('color-range')")
    dlg = page.locator(DLG)
    dlg.wait_for()
    page.mouse.click(s[0] + 50 * s[2], s[1] + 50 * s[2])
    page.wait_for_timeout(300)
    dlg.locator(".cv-check", has_text="Invert").locator("input").check()
    dlg.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("!!window.formvis.engine.current.selection")
    assert page.evaluate(VAL, [20, 50]) == 0 and page.evaluate(VAL, [150, 50]) >= 250
