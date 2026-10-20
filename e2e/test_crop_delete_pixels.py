SETUP = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(200, 100, 'C', 'white');
  e.fg = { r: 220, g: 20, b: 20 }; e.applySelection(E.SelectionMask.cropped(0, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg');
  e.fg = { r: 20, g: 40, b: 220 }; e.applySelection(E.SelectionMask.cropped(100, 0, 100, 100, new Uint8Array(10000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.setTool('crop'); }"""
LAYER = "(() => { const p = window.formvis.engine.current, l = p.doc.layers[0]; return [p.doc.width, l.raster.width, Math.round(l.transform.x)]; })()"
OPT = ":is(.cv-opt-group:not([hidden]), .cv-opt-pop-sect[style*=contents]) .cv-opt"


def test_delete_cropped_pixels_trims_or_keeps(page):
    page.evaluate(SETUP)
    page.evaluate("document.querySelector('.cv-opt-more:not([hidden])[aria-expanded=false]')?.click()")
    box = page.locator(OPT, has_text="Delete Cropped Pixels").locator("input")
    assert box.is_checked()                                               # on by default
    page.evaluate("window.formvis.engine.straightenCrop({ x: 50, y: 0, w: 100, h: 100 }, 0, false)")
    assert page.evaluate(LAYER) == [100, 100, 0]                          # trimmed to the canvas
    assert page.evaluate("window.formvis.engine.revealAll()") is False      # nothing left beyond it
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(LAYER) == [200, 200, 0]
    box.uncheck()
    page.evaluate("window.formvis.engine.straightenCrop({ x: 50, y: 0, w: 100, h: 100 }, 0, false)")
    assert page.evaluate(LAYER) == [100, 200, -50]                        # kept whole, past the canvas
    assert page.evaluate("window.formvis.engine.revealAll()") is True
    px = page.evaluate("Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(10, 50, 1, 1).data).slice(0, 3)")
    assert page.evaluate("window.formvis.engine.current.doc.width") == 200 and px == [220, 20, 20], px
