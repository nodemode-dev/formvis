SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 160, 'F', 'white'); e.fg = { r: 220, g: 20, b: 20 };
  const c = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y }); e.setWorkPath({ subpaths: [{ closed: true, anchors: [c(40, 40), c(160, 40), c(160, 120), c(40, 120)] }] }); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def field(page, label):
    return page.locator(DLG).locator(".cv-field", has_text=label).first


def test_fill_path_opens_its_settings_and_uses_them(page):
    page.evaluate(SETUP)
    assert page.evaluate("window.formvis.commands.run('fill-path-dialog')") is True
    assert page.locator(DLG + " .cv-dialog-title").inner_text().strip() == "Fill Path"
    assert field(page, "Feather Radius").is_visible() and field(page, "Anti-aliased").is_visible()
    assert page.evaluate("document.querySelector('.cv-scrim:not([hidden]) option[value=\"contentAware\"]').disabled")
    field(page, "Opacity").locator("input[type=number]").fill("50")
    field(page, "Opacity").locator("input[type=number]").press("Enter")
    page.locator(DLG + " .cv-dialog-foot button", has_text="OK").click()
    mid, out = page.evaluate(PX, [100, 80]), page.evaluate(PX, [20, 80])
    assert abs(mid[0] - 238) <= 3 and abs(mid[1] - 138) <= 3 and out == [255, 255, 255], (mid, out)
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Fill Path"
    # feathered by 20 px at full opacity: the middle full, the edge part way, just outside tinted
    page.evaluate("window.formvis.engine.undo()")
    page.evaluate("window.formvis.commands.run('fill-path-dialog')")
    field(page, "Opacity").locator("input[type=number]").fill("100"); field(page, "Opacity").locator("input[type=number]").press("Enter")
    field(page, "Feather Radius").locator("input[type=number]").fill("20"); field(page, "Feather Radius").locator("input[type=number]").press("Enter")
    page.locator(DLG + " .cv-dialog-foot button", has_text="OK").click()
    mid, edge, near = page.evaluate(PX, [100, 80]), page.evaluate(PX, [40, 80]), page.evaluate(PX, [34, 80])
    assert mid[1] < 40 and 60 < edge[1] < 200 and near[1] < 250, (mid, edge, near)
    # Edit > Fill keeps its own rows only
    page.evaluate("window.formvis.commands.run('fill-dialog')")
    assert page.locator(DLG + " .cv-dialog-title").inner_text().strip() == "Fill"
    assert not field(page, "Feather Radius").is_visible()
