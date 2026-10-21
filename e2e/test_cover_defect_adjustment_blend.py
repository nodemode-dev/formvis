# D03: an adjustment layer's blend mode was stored but never rendered. Invert over mid grey 128 gives 127 in Normal,
# Multiply with the grey below gives about 64 and Screen about 191.

SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  e.newDocument(60, 40, 'A', 'white'); e.fg = { r: 128, g: 128, b: 128 };
  e.applySelection(E.SelectionMask.cropped(0, 0, 60, 40, new Uint8Array(2400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.addAdjustmentLayer('invert'); }"""
PX = "() => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(10, 10, 1, 1).data)"
SET = "(mode) => { const e = window.formvis.engine; e.current.updateLayer(e.current.activeId, { blend: mode }); }"


def test_an_adjustment_layer_is_drawn_in_its_blend_mode(page):
    page.evaluate(SETUP)
    assert page.evaluate("!!window.formvis.engine.activeLayer.adjustment")
    assert page.evaluate(PX) == [127, 127, 127, 255]
    page.evaluate(SET, "multiply")
    assert all(abs(v - 64) <= 2 for v in page.evaluate(PX)[:3]), page.evaluate(PX)
    page.evaluate(SET, "screen")
    assert all(abs(v - 191) <= 2 for v in page.evaluate(PX)[:3]), page.evaluate(PX)
    page.evaluate(SET, "normal")
    assert page.evaluate(PX) == [127, 127, 127, 255]
