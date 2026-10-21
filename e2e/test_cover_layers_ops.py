PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
LAYERS = "window.formvis.engine.current.doc.layers.map((l) => [l.name, l.blend])"
RED_SQUARE = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.fg = { r: 200, g: 40, b: 40 };
  e.applySelection(E.SelectionMask.cropped(10, 10, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""


def test_background_from_layer_moves_the_layer_to_the_bottom_and_puts_white_behind_it(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'B', 'transparent'); window.formvis.engine.addLayer()")
    assert page.evaluate("window.formvis.engine.backgroundLayer() === null || !window.formvis.engine.backgroundLayer()")
    assert page.evaluate("window.formvis.commands.run('background-from-layer')") is True
    assert page.evaluate(LAYERS)[0][0] == "Background" and page.evaluate("!!window.formvis.engine.backgroundLayer()")
    assert page.evaluate(PX, [5, 5]) == [255, 255, 255, 255]
    assert page.evaluate("window.formvis.commands.enabled(window.formvis.commands.get('background-from-layer'))") is False


def test_dodge_and_burn_layer_is_a_soft_light_layer_filled_with_mid_grey_that_changes_nothing(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'D', 'white')")
    assert page.evaluate("window.formvis.commands.run('new-dodge-burn-layer')") is True
    assert page.evaluate(LAYERS) == [["Background", "normal"], ["Dodge & Burn", "soft-light"]]
    assert page.evaluate("window.formvis.engine.current.activeLayer.raster.ctx.getImageData(5, 5, 1, 1).data.join()") == "128,128,128,255"
    assert page.evaluate(PX, [5, 5]) == [255, 255, 255, 255]


def test_shift_plus_and_minus_step_through_the_blend_modes_and_back(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'C', 'white'); window.formvis.engine.addLayer()")
    page.locator(".cv-stage").click()
    seen = []
    for _ in range(3):
        page.keyboard.press("Shift+=")
        seen.append(page.evaluate("window.formvis.engine.activeLayer.blend"))
    assert seen == ["dissolve", "darken", "multiply"], seen
    page.keyboard.press("Shift+-")
    assert page.evaluate("window.formvis.engine.activeLayer.blend") == "darken"
    page.keyboard.press("Shift+-")
    page.keyboard.press("Shift+-")
    assert page.evaluate("window.formvis.engine.activeLayer.blend") == "normal"


def test_delete_layer_is_refused_on_a_fully_locked_layer(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'L', 'white'); window.formvis.engine.addLayer()")
    page.locator(".cv-lock-btn[data-lock='all']").click()
    assert page.evaluate("window.formvis.engine.activeLayer.locks") == {"all": True}
    page.evaluate("window.formvis.commands.run('delete-layer')")
    page.wait_for_timeout(400)
    assert [n for n, _ in page.evaluate(LAYERS)] == ["Background", "Layer 1"]
    page.locator(".cv-lock-btn[data-lock='all']").click()
    page.evaluate("window.formvis.commands.run('delete-layer')")
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 1")


def test_stamp_down_copies_the_layer_into_the_one_below_and_keeps_the_original(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'S', 'white'); window.formvis.engine.addLayer()")
    page.evaluate(RED_SQUARE)
    assert page.evaluate("window.formvis.commands.run('stamp-down')") is True
    assert len(page.evaluate(LAYERS)) == 2
    assert page.evaluate("window.formvis.engine.current.doc.layers[0].raster.ctx.getImageData(20, 20, 1, 1).data.join()") == "200,40,40,255"


def test_rasterize_layer_style_bakes_the_stroke_into_the_pixels_and_clears_the_style(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(60, 40, 'R', 'white'); e.addLayer();
      e.fg = { r: 30, g: 160, b: 30 };
      e.applySelection(E.SelectionMask.cropped(20, 10, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      const fx = E.defaultEffects(); Object.assign(fx.stroke, { enabled: true, size: 4, color: { r: 0, g: 0, b: 0 } }); e.setLayerEffects(e.current.activeLayer.id, fx); }""")
    own = "(() => { const l = window.formvis.engine.activeLayer, t = l.transform; return Array.from(l.raster.ctx.getImageData(Math.floor(18 - t.x), Math.floor(20 - t.y), 1, 1).data); })()"
    assert page.evaluate(PX, [18, 20]) == [0, 0, 0, 255]
    assert page.evaluate("window.formvis.engine.activeLayer.raster.ctx.getImageData(18, 20, 1, 1).data[3]") == 0
    assert page.evaluate("window.formvis.commands.run('rasterize-style')") is True
    page.wait_for_function("!window.formvis.engine.activeLayer.effects")
    assert page.evaluate(PX, [18, 20]) == [0, 0, 0, 255]
    assert page.evaluate(own) == [0, 0, 0, 255]
