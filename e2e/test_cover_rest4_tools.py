PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"


def test_cycle_tool_mode_steps_the_marquee_shape_and_wraps_round(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(200, 150, 'F', 'white'); e.setTool('marquee'); }")
    page.wait_for_timeout(600)
    assert page.evaluate("window.formvis.engine.marqueeKind") == "rectangle"
    seen = []
    for _ in range(4):
        page.keyboard.press("Alt+Shift+M")
        page.wait_for_timeout(300)
        seen.append(page.evaluate("window.formvis.engine.marqueeKind"))
    assert seen == ["ellipse", "row", "column", "rectangle"]
    assert page.evaluate("window.formvis.commands.run('cycle-tool-mode')") is not None
    page.wait_for_timeout(300)
    assert page.evaluate("window.formvis.engine.marqueeKind") == "ellipse"


def test_a_click_with_the_shape_tool_opens_create_shape_and_ok_draws_it_at_the_chosen_size(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(300, 200, 'F', 'white'); e.setTool('shape'); }")
    page.wait_for_timeout(800)
    x, y = page.evaluate("""() => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(50, 40);
      return [s.left + q.x, s.top + q.y]; }""")
    layers = page.evaluate("window.formvis.engine.current.doc.layers.length")
    page.mouse.click(x, y)
    page.wait_for_timeout(800)
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog").last
    assert "Create Shape" in d.inner_text()
    d.get_by_label("Width (px)").fill("80")
    d.get_by_label("Height (px)").fill("60")
    page.wait_for_timeout(300)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(900)
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == layers + 1
    inside, far_x, far_y, before = (page.evaluate(PX, p)[0] for p in ([120, 90], [140, 95], [120, 110], [40, 30]))
    assert inside < 128 and far_x == 255 and far_y == 255 and before == 255


def test_clicking_a_channel_in_the_channels_panel_makes_fills_change_only_that_channel(page):
    layer = "([x, y]) => Array.from(window.formvis.engine.current.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data)"
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = 'rgb(100,100,100)'; k.fillRect(0, 0, 100, 60); e.activeLayer.raster.touch(); e.refresh(); }""")
    assert page.evaluate("window.formvis.commands.run('panel-channels')")
    page.wait_for_timeout(800)
    page.locator(".cv-ch-row[data-ch='r']").first.click()
    page.wait_for_timeout(500)
    assert page.evaluate("window.formvis.engine.rgbTarget") == [True, False, False]
    page.evaluate("() => { const e = window.formvis.engine; e.fg = { r: 255, g: 255, b: 255 }; e.fill('fg'); }")
    page.wait_for_timeout(400)
    assert page.evaluate(layer, [50, 30]) == [255, 100, 100, 255]
    page.locator(".cv-ch-row[data-ch='b']").first.click()
    page.wait_for_timeout(500)
    page.evaluate("() => { const e = window.formvis.engine; e.fg = { r: 0, g: 0, b: 0 }; e.fill('fg'); }")
    page.wait_for_timeout(400)
    assert page.evaluate(layer, [50, 30]) == [255, 100, 0, 255]
    page.locator(".cv-ch-row[data-ch='rgb']").first.click()
    page.wait_for_timeout(400)
    assert page.evaluate("window.formvis.engine.rgbTarget") is None


def test_color_match_beneath_adds_a_clipped_curves_layer_that_turns_a_grey_patch_to_the_background_colour(page):
    px = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(100, 60, 'F', 'white'); const k = e.activeLayer.raster.ctx;
      k.fillStyle = 'rgb(200,60,60)'; k.fillRect(0, 0, 100, 60); e.activeLayer.raster.touch();
      e.addLayer({ name: 'Top' }); e.fg = { r: 110, g: 110, b: 110 }; e.applySelection(E.SelectionMask.cropped(0, 0, 50, 60, new Uint8Array(3000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); e.refresh(); }""")
    assert page.evaluate(px, [25, 30])[:3] == [110, 110, 110]
    assert page.evaluate("window.formvis.commands.run('color-match')")
    page.wait_for_timeout(900)
    assert "Color Match" in page.locator(".cv-scrim:not([hidden]) .cv-dialog").last.inner_text()
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Apply").last.click()
    page.wait_for_timeout(1200)
    assert page.evaluate(px, [25, 30])[:3] == [200, 60, 60]
    assert page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.name)") == ["Background", "Top", "Color Match"]


def test_layer_content_options_reopens_a_solid_colour_fill_layer_and_a_new_colour_repaints_it(page):
    px = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
    page.evaluate("() => { window.formvis.engine.newDocument(60, 40, 'F', 'white'); }")
    assert page.evaluate("window.formvis.commands.run('new-fill-solid')")
    page.wait_for_timeout(900)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(900)
    assert page.evaluate(px, [30, 20])[:3] == [0, 0, 0]
    assert page.evaluate("window.formvis.commands.run('layer-content-options')")
    page.wait_for_timeout(900)
    page.evaluate("""() => { const i = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog input[type=color]')][0];
      i.value = '#ff0000'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }""")
    page.wait_for_timeout(500)
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(900)
    assert page.evaluate(px, [30, 20])[:3] == [255, 0, 0]
