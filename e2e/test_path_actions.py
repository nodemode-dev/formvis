PATH = """() => { const e = window.formvis.engine; e.newDocument(200, 160, 'P', 'white');
  const c = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y }); e.setWorkPath({ subpaths: [{ closed: false, anchors: [c(20, 80), c(180, 80)] }] }); }"""
DLG = ".cv-scrim:not([hidden]) .cv-dialog"


SQUARE = """() => { const e = window.formvis.engine; e.newDocument(200, 160, 'Q', 'white');
  const c = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y }); e.setWorkPath({ subpaths: [{ closed: true, anchors: [c(40, 40), c(160, 40), c(160, 120), c(40, 120)] }] }); }"""


def test_both_selection_tools_offer_the_path_actions(page):
    page.evaluate(SQUARE)                                                                        # a closed path: it has an inside
    for tool in ["pathSelect", "directSelect"]:
        page.evaluate(f"window.formvis.engine.setTool('{tool}')")
        page.evaluate("document.querySelector('.cv-opt-more:not([hidden])[aria-expanded=false]')?.click()")
        labels = page.locator(":is(.cv-opt-group:not([hidden]), .cv-opt-pop-sect[style*=contents]) .cv-opt-icon").evaluate_all("(bs) => bs.map((b) => b.getAttribute('aria-label'))")
        for want in ["Make Selection from Path", "Fill Path...", "Stroke Path...", "New Shape Layer from Path"]:
            assert want in labels, (tool, labels)
    page.locator(":is(.cv-opt-group:not([hidden]), .cv-opt-pop-sect[style*=contents]) .cv-opt-icon[aria-label='Make Selection from Path']").click()
    assert page.evaluate("!!window.formvis.engine.current.selection")


def test_stroke_path_from_the_panel_with_its_own_width_and_colour(page):
    page.evaluate(PATH)
    page.evaluate("window.formvis.engine.setBrush({ diameter: 5 }); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }")
    page.evaluate("window.formvis.commands.run('panel-paths')")
    page.locator(".cv-paths .cv-panel-foot [data-cmd='stroke-path-dialog']").click()               # the footer opens the dialog
    d = page.locator(DLG)
    f = d.locator(".cv-slider", has_text="Width").locator("input:not([type=range])")
    f.fill("20"); page.keyboard.press("Enter"); f.dispatch_event("change")
    d.locator("input[type=color]").evaluate("(i) => { i.value = '#dd1111'; }")
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    px = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data).slice(0, 3)"
    mid = page.evaluate(px, [100, 80])
    assert mid[0] > 180 and mid[1] < 60 and mid[2] < 60, mid                                         # red
    assert page.evaluate(px, [100, 88])[0] > 150 and page.evaluate(px, [100, 94]) == [255, 255, 255]   # 20 px wide, not 5
    assert page.evaluate("[window.formvis.engine.brush.diameter, window.formvis.engine.fg.r]") == [5, 0]   # left as they were
    page.evaluate("window.formvis.commands.run('panel-paths')")
