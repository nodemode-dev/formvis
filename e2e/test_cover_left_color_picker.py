SCENE = """() => { const e = window.formvis.engine; e.newDocument(200, 100, 'P', 'white'); const c = e.activeLayer.raster.ctx;
  c.fillStyle = 'rgb(30,160,70)'; c.fillRect(100, 0, 100, 100); e.activeLayer.raster.touch();
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
FG = "(() => { const f = window.formvis.engine.fg; return [f.r, f.g, f.b]; })()"
BG = "(() => { const f = window.formvis.engine.bg; return [f.r, f.g, f.b]; })()"
DIALOG = ".cv-scrim:not([hidden]) .cv-dialog"


def test_color_picker_dialog_takes_a_hex_and_sets_the_foreground_on_ok(page):
    # PC-UI-0919
    page.evaluate(SCENE)
    page.locator(".cv-swatch-fg").click()
    d = page.locator(DIALOG)
    d.wait_for()
    d.locator("input[aria-label='Hex']").fill("#2a7bd0")
    d.locator("input[aria-label='Hex']").press("Enter")
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("window.formvis.engine.fg.b === 0xd0")
    assert page.evaluate(FG) == [0x2A, 0x7B, 0xD0]


def test_color_picker_dialog_for_the_background_and_cancel_keeps_the_colour(page):
    # PC-UI-0919
    page.evaluate(SCENE)
    before = page.evaluate(BG)
    page.locator(".cv-swatch-bg").click()
    d = page.locator(DIALOG)
    d.wait_for()
    d.locator("input[aria-label='Hex']").fill("#ff00ff")
    d.locator("input[aria-label='Hex']").press("Enter")
    d.locator(".cv-dialog-foot button", has_text="Cancel").click()
    page.wait_for_timeout(300)
    assert page.evaluate(BG) == before

