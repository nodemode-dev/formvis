SCENE = """() => { const e = window.formvis.engine; e.newDocument(100, 100, 'M', 'white'); e.deselect(); const c = e.activeLayer.raster.ctx;
  c.fillStyle = 'rgb(255,0,0)'; c.fillRect(0, 0, 100, 100); e.activeLayer.raster.touch(); e.addMask(true, false); e.refresh(); }"""
ALPHA = "([x, y]) => window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[3]"
WAIT = "([x, y, lo, hi]) => { const a = window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[3]; return a >= lo && a <= hi; }"


def field(page, label, value):
    i = page.locator(f"input[aria-label='{label}']")
    i.fill(str(value))
    i.press("Enter")
    i.dispatch_event("change")


def test_mask_density_in_properties_lets_a_hidden_layer_show_through(page):
    # PC-EN-0081, PC-UI-0866
    page.evaluate(SCENE)
    assert page.evaluate(ALPHA, [50, 50]) == 0
    field(page, "Mask Density", 50)
    page.wait_for_function(WAIT, arg=[50, 50, 100, 160], timeout=5000)
    field(page, "Mask Density", 0)
    page.wait_for_function(WAIT, arg=[50, 50, 250, 255], timeout=5000)
    field(page, "Mask Density", 100)
    page.wait_for_function(WAIT, arg=[50, 50, 0, 5], timeout=5000)


def test_mask_feather_in_properties_softens_the_mask_edge(page):
    # PC-EN-0081, PC-UI-0866
    page.evaluate(SCENE)
    page.evaluate("""() => { const e = window.formvis.engine; const l = e.activeLayer; const c = l.mask.raster.ctx; c.fillStyle = 'white'; c.fillRect(0, 0, 50, 100); l.mask.raster.touch(); e.refresh(); }""")
    page.wait_for_function(WAIT, arg=[20, 50, 250, 255], timeout=5000)
    assert page.evaluate(ALPHA, [48, 50]) > 250 and page.evaluate(ALPHA, [52, 50]) == 0
    field(page, "Mask Feather", 10)
    page.wait_for_function(WAIT, arg=[48, 50, 100, 240], timeout=5000)
    inner, edge, outer = page.evaluate(ALPHA, [30, 50]),page.evaluate(ALPHA, [50, 50]), page.evaluate(ALPHA, [90, 50])
    assert inner > 240 and outer < 5 and 60 < edge < 200, (inner, edge, outer)
