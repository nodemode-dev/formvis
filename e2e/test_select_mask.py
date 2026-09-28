SCENE = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 140, 'M', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = '#222'; c.fillRect(60, 30, 80, 80); l.raster.touch(); e.refresh();
  e.applySelection(E.SelectionMask.cropped(60, 30, 80, 80, new Uint8Array(6400).fill(255)), 'replace', 's');
  window.formvis.commands.run('select-and-mask');
}"""


def dialog(page):
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.locator("canvas").wait_for(state="visible")
    return d


def set_slider(d, label, value):
    d.locator(".cv-field", has_text=label).locator("input[type=number]").fill(str(value))
    d.locator(".cv-field", has_text=label).locator("input[type=number]").press("Enter")


def test_output_selection_feathered(page):
    page.evaluate(SCENE)
    d = dialog(page)
    set_slider(d, "Feather", 10)
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(400)
    r = page.evaluate("(() => { const s = window.formvis.engine.current.selection; return [s.valueAt(60, 70), s.valueAt(100, 70), s.valueAt(45, 70), window.formvis.engine.historySteps.names.slice(-1)[0]]; })()")
    assert 60 < r[0] < 200 and r[1] > 240 and r[2] < r[0] and r[3] == "Select and Mask", r


def test_output_layer_mask_and_new_layer_with_mask(page):
    page.evaluate(SCENE)
    d = dialog(page)
    d.locator(".cv-field", has_text="Output To").locator("select").select_option("mask")
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(400)
    r = page.evaluate("(() => { const e = window.formvis.engine, l = e.current.activeLayer; return [!!l.mask, e.current.selection === null, e.historySteps.names.slice(-1)[0], e.current.doc.layers.length]; })()")
    assert r == [True, True, "Select and Mask", 1], r
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("!!window.formvis.engine.current.activeLayer.mask") is False
    page.evaluate(SCENE)
    d = dialog(page)
    d.locator(".cv-field", has_text="Output To").locator("select").select_option("layerMask")
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_timeout(400)
    r = page.evaluate("(() => { const e = window.formvis.engine, ls = e.current.doc.layers; return [ls.length, !!e.current.activeLayer.mask, ls.filter((l) => !l.visible).length]; })()")
    assert r == [2, True, 1], r
