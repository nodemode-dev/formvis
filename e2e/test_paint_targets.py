# Which layers the tools take (1.50.2, the owner's walkthrough: the Paint Bucket refused a selected layer).
DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def notices(page):
    page.evaluate("window.__n = []; window.formvis.engine.on('notice', (n) => window.__n.push(n.text)); 0")


def test_an_empty_layer_fills_and_the_wand_sees_it_transparent(page):
    page.evaluate("window.formvis.engine.newDocument(200, 120, 'E', 'white'); window.formvis.engine.addLayer(); window.formvis.engine.fg = { r: 30, g: 150, b: 60 }")
    page.evaluate("window.formvis.engine.setBucket({ source: 'fg', mode: 'normal' }); window.formvis.engine.paintBucket({ x: 100, y: 60 })")
    assert page.evaluate("Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(100, 60, 1, 1).data)") == [30, 150, 60, 255]
    page.evaluate("window.formvis.engine.addLayer(); window.formvis.engine.setWand({ sampleAll: false }); window.formvis.engine.magicWand({ x: 50, y: 50 }, 'replace')")
    s = page.evaluate("(() => { const s = window.formvis.engine.current.selection; return [s.x, s.y, s.w, s.h]; })()")
    assert s == [0, 0, 200, 120], s                                                           # the whole (transparent) layer


def test_a_type_layer_asks_to_rasterize_first(page):
    page.evaluate("""async () => { const e = window.formvis.engine; e.newDocument(300, 120, 'T', 'white'); e.fg = { r: 0, g: 0, b: 0 };
      await e.createTextLayer({ x: 20, y: 70 }, { ...e.textSettings, content: 'Type', size: 48, color: e.fg, box: null, direction: 'horizontal' }); e.fg = { r: 200, g: 30, b: 30 }; }""")
    page.evaluate("window.formvis.engine.paintBucket({ x: 150, y: 60 })")
    page.locator(DLG, has_text="Rasterize this type layer?").wait_for()
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Cancel").click()
    assert page.evaluate("!!window.formvis.engine.activeLayer.text && window.formvis.engine.activeLayer.text.rendered === window.formvis.engine.activeLayer.raster.id + ':' + window.formvis.engine.activeLayer.raster.version")   # untouched
    page.evaluate("window.formvis.engine.paintBucket({ x: 150, y: 60 })")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Rasterize").click()
    page.wait_for_function("!window.formvis.engine.activeLayer.text")                            # a pixel layer now
    page.evaluate("window.formvis.engine.paintBucket({ x: 290, y: 110 })")
    assert page.evaluate("Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(290, 110, 1, 1).data).slice(0, 3)") == [200, 30, 30]


def test_an_adjustment_layer_paints_its_mask_and_a_group_says_why(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(200, 120, 'A', 'white'); e.addAdjustmentLayer('hsv'); e.setTool('brush'); e.setBrushMode('paint');
      e.fg = { r: 0, g: 0, b: 0 }; e.setBrush({ diameter: 20, hardness: 1 }); e.beginStroke({ x: 20, y: 60 }, false, 1); for (let i = 1; i <= 10; i++) e.strokeTo({ x: 20 + i * 16, y: 60 }, 1); e.endStroke(); }""")
    m = page.evaluate("(() => { const l = window.formvis.engine.activeLayer; return [!!l.adjustment, !!(l.mask && l.mask.raster), l.mask.raster.ctx.getImageData(100, 60, 1, 1).data[3], l.mask.raster.ctx.getImageData(100, 10, 1, 1).data[3]]; })()")
    assert m == [True, True, 0, 255], m                                                       # black hid it along the stroke; the rest shows
    notices(page)
    page.evaluate("window.formvis.engine.addLayer(); window.formvis.engine.groupLayers(); window.formvis.engine.paintBucket({ x: 100, y: 60 })")
    assert any("is a group" in n for n in page.evaluate("window.__n")), page.evaluate("window.__n")
