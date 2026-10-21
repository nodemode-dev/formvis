FLAT = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
VAL = "([x, y]) => { const s = window.formvis.engine.current.selection; return s ? s.valueAt(x, y) : 0; }"
SELECT = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(100, 60, 'K', 'white'); e.fg = { r: 200, g: 30, b: 30 };
  e.fill('fg'); e.applySelection(E.SelectionMask.cropped(20, 10, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); }"""


def test_a_mask_made_with_a_selection_keeps_only_the_selected_pixels(page):
    page.evaluate(SELECT)
    page.evaluate("window.formvis.commands.run('add-mask')")
    assert page.evaluate("!!window.formvis.engine.activeLayer.mask")
    assert page.evaluate(FLAT, [40, 30]) == [200, 30, 30, 255]
    assert page.evaluate(FLAT, [5, 30])[3] == 0 and page.evaluate(FLAT, [90, 30])[3] == 0
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "Add Layer Mask"
    page.keyboard.press("Control+z")
    assert page.evaluate(FLAT, [5, 30]) == [200, 30, 30, 255]


def test_the_mask_loads_back_as_a_selection(page):
    page.evaluate(SELECT)
    page.evaluate("window.formvis.commands.run('add-mask')")
    page.evaluate("window.formvis.engine.deselect()")
    page.evaluate("window.formvis.engine.loadSelection({ channel: 'mask' })")
    assert page.evaluate(VAL, [40, 30]) == 255 and page.evaluate(VAL, [5, 30]) == 0 and page.evaluate(VAL, [90, 30]) == 0


def test_load_luminosity_selects_the_light_pixels_in_proportion(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(90, 30, 'L', 'white'); e.deselect(); const c = e.activeLayer.raster.ctx;
      c.fillStyle = 'rgb(0,0,0)'; c.fillRect(0, 0, 30, 30); c.fillStyle = 'rgb(128,128,128)'; c.fillRect(30, 0, 30, 30); e.activeLayer.raster.touch(); }""")
    page.evaluate("window.formvis.commands.run('load-luminosity')")
    black, grey, white = page.evaluate(VAL, [10, 15]), page.evaluate(VAL, [45, 15]), page.evaluate(VAL, [75, 15])
    assert black <= 2 and 120 <= grey <= 136 and white >= 253, (black, grey, white)
