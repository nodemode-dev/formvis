NAMES = "window.formvis.engine.current.doc.layers.map((l) => l.name)"
ACT = "window.formvis.engine.activeLayer.name"


def test_alt_brackets_walk_the_active_layer_down_and_up_and_stop_at_the_ends(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'N', 'white'); window.formvis.engine.addLayer(); window.formvis.engine.addLayer()")
    page.locator(".cv-stage").click()
    walked = []
    for key in ["Alt+[", "Alt+[", "Alt+[", "Alt+]", "Alt+]", "Alt+]", "Alt+]"]:
        page.keyboard.press(key)
        walked.append(page.evaluate(ACT))
    assert walked == ["Layer 1", "Background", "Background", "Layer 1", "Layer 2", "Layer 2", "Layer 2"], walked


def test_copy_layers_then_paste_layers_adds_a_copy_with_its_pixels_and_style_in_one_undo_step(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'N', 'white'); window.formvis.engine.addLayer()")
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.fg = { r: 30, g: 160, b: 30 };
      e.applySelection(E.SelectionMask.cropped(10, 10, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      const fx = E.defaultEffects(); Object.assign(fx.stroke, { enabled: true, size: 3, color: { r: 0, g: 0, b: 0 } }); e.setLayerEffects(e.current.activeLayer.id, fx); }""")
    assert page.evaluate("window.formvis.commands.run('copy-layers')") is True
    assert page.evaluate("window.formvis.commands.run('paste-layers')") is True
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 3")
    assert page.evaluate("!!window.formvis.engine.activeLayer.effects?.stroke.enabled")
    assert page.evaluate("window.formvis.engine.activeLayer.raster.ctx.getImageData(15, 15, 1, 1).data.join()") == "30,160,30,255"
    page.evaluate("window.formvis.engine.undo()")
    assert len(page.evaluate(NAMES)) == 2
