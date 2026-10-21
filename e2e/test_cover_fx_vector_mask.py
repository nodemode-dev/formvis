PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
GREEN = [30, 160, 60]


def setup(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(120, 80, 'V', 'white'); e.addLayer(); e.fg = { r: 30, g: 160, b: 60 };
      e.applySelection(E.SelectionMask.cropped(20, 20, 60, 40, new Uint8Array(2400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }""")
    page.wait_for_timeout(400)
    assert page.evaluate(PX, [40, 40])[:3] == GREEN


def run(page, cmd):
    assert page.evaluate(f"window.formvis.commands.run('{cmd}')"), cmd
    page.wait_for_timeout(500)


def test_vector_mask_hide_all_hides_the_layer_invert_brings_it_back_and_enable_toggles_it(page):
    # PC-EN-0087
    setup(page)
    run(page, "vmask-hide-all")
    assert page.evaluate(PX, [40, 40])[:3] == [255, 255, 255]
    run(page, "vmask-invert")
    assert page.evaluate(PX, [40, 40])[:3] == GREEN
    run(page, "vmask-invert")
    assert page.evaluate(PX, [40, 40])[:3] == [255, 255, 255]
    run(page, "vmask-enable")
    assert page.evaluate(PX, [40, 40])[:3] == GREEN
    run(page, "vmask-enable")
    assert page.evaluate(PX, [40, 40])[:3] == [255, 255, 255]
    for _ in range(5):
        page.keyboard.press("Control+z")
    page.wait_for_timeout(500)
    assert page.evaluate(PX, [40, 40])[:3] == GREEN


def test_vector_mask_reveal_all_keeps_the_layer_and_delete_removes_the_mask(page):
    # PC-EN-0087
    setup(page)
    run(page, "vmask-reveal-all")
    assert page.evaluate(PX, [40, 40])[:3] == GREEN
    assert page.evaluate("!!window.formvis.engine.activeLayer.vectorMask")
    run(page, "vmask-delete")
    assert not page.evaluate("!!window.formvis.engine.activeLayer.vectorMask")
    assert page.evaluate(PX, [40, 40])[:3] == GREEN
