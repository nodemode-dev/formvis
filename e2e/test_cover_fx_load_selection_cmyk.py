VAL = "([x, y]) => { const s = window.formvis.engine.current.selection; return s ? s.valueAt(x, y) : 0; }"
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
SET = """([label, v]) => {
  const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) input, .cv-scrim:not([hidden]) select')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label);
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
}"""


def two_layers(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(120, 80, 'L', 'white'); e.addLayer(); e.fg = { r: 30, g: 160, b: 60 }; e.applySelection(E.SelectionMask.cropped(20, 20, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); return e.current.doc.layers.length; }""")


def test_ctrl_click_on_a_layer_thumbnail_loads_its_pixels_as_the_selection_and_shift_adds_another_layer(page):
    # CO-0060
    two_layers(page)
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == 2
    thumb = page.locator(".cv-layers .cv-layer-thumb").first
    thumb.click(modifiers=["Control"])
    page.wait_for_function("window.formvis.engine.current.selection")
    assert page.evaluate(VAL, [40, 35]) > 0
    assert page.evaluate(VAL, [5, 5]) == 0
    assert page.evaluate(VAL, [100, 70]) == 0
    page.keyboard.press("Control+z")
    page.wait_for_timeout(400)
    assert not page.evaluate("window.formvis.engine.current.selection")


def test_load_selection_inverse_from_layer_pixels_selects_everything_but_the_shape(page):
    # CO-0060
    two_layers(page)
    page.evaluate("window.formvis.engine.loadSelection({ channel: 'transparency' }, true, 'replace')")
    page.wait_for_function("window.formvis.engine.current.selection")
    assert page.evaluate(VAL, [40, 35]) == 0
    assert page.evaluate(VAL, [5, 5]) > 0


def test_levels_and_hue_saturation_work_on_a_cmyk_picture_and_lab_picture(page):
    # PC-EN-0221
    for mode, cmd in (("mode-cmyk", "mode-cmyk"), ("mode-lab", "mode-lab")):
        page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(60, 40, 'F', 'white'); const k = e.activeLayer.raster.ctx; k.fillStyle = 'rgb(100,100,100)'; k.fillRect(0, 0, 60, 40); e.activeLayer.raster.touch(); e.refresh(); }""")
        assert page.evaluate(f"window.formvis.commands.run('{cmd}')")
        page.wait_for_timeout(1500)
        for _ in range(3):
            if not page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").count():
                break
            page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
            page.wait_for_timeout(1200)
        before = page.evaluate(PX, [30, 20])
        assert page.evaluate("window.formvis.commands.run('adj-levels')")
        page.wait_for_timeout(800)
        page.evaluate(SET, ["Input white", 150])
        page.wait_for_timeout(900)
        page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
        page.wait_for_timeout(1500)
        after = page.evaluate(PX, [30, 20])
        assert after[0] > before[0] + 30, (mode, before, after)
