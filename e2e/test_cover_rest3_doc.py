PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
STRIPES = """() => { const e = window.formvis.engine; e.newDocument(80, 40, 'F', 'white'); const k = e.activeLayer.raster.ctx;
  for (let x = 0; x < 80; x += 2) { k.fillStyle = x % 4 ? 'rgb(40,90,160)' : 'rgb(60,110,180)'; k.fillRect(x, 0, 2, 40); }
  k.fillStyle = 'rgb(200,30,30)'; k.fillRect(30, 10, 20, 20); e.activeLayer.raster.touch(); e.refresh();
  window.__orig = e.flattened().getContext('2d').getImageData(0, 0, 80, 40).data.slice(); }"""
DRIFT = """() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(0, 0, 80, 40).data, o = window.__orig; let m = 0;
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(d[i + c] - o[i + c])); return m; }"""


def menu(page, top, *labels):
    page.keyboard.press("Escape")
    page.get_by_text(top, exact=True).first.click()
    for label in labels:
        page.locator(f".cv-menu-item:has(.cv-menu-label:text-is('{label}'))").first.click()
        page.wait_for_timeout(250)


def ok(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(800)


def test_frequency_separation_from_the_image_menu_adds_low_and_linear_light_high_layers_that_rebuild_the_picture(page):
    page.evaluate(STRIPES)
    menu(page, "Image", "Frequency Separation...")
    ok(page)
    layers = page.evaluate("window.formvis.engine.current.doc.layers.map((l) => [l.name, l.blend])")
    assert layers == [["Background", "normal"], ["Low Frequency", "normal"], ["High Frequency", "linear-light"]], layers
    assert page.evaluate(DRIFT) <= 1


def test_hiding_the_high_frequency_layer_leaves_only_the_smooth_colour_of_the_low_layer(page):
    page.evaluate(STRIPES)
    page.evaluate("window.formvis.engine.frequencySeparation(4)")
    page.wait_for_timeout(600)
    before = [page.evaluate(PX, [x, 20])[0] for x in (10, 12, 14)]
    assert before[0] != before[1]
    page.evaluate("() => { const e = window.formvis.engine; e.setLayerVisible ? e.setLayerVisible(e.current.doc.layers[2].id, false) : e.current.updateLayer(e.current.doc.layers[2].id, { visible: false }); e.refresh(); }")
    page.wait_for_timeout(500)
    after = [page.evaluate(PX, [x, 20])[0] for x in (10, 12, 14)]
    assert max(after) - min(after) < max(before) - min(before), (before, after)


def test_artboard_from_group_turns_the_active_folder_into_a_named_artboard(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(100, 60, 'G', 'white'); e.groupLayers('Grp'); }")
    assert page.evaluate("window.formvis.engine.activeLayer.isGroup")
    assert page.evaluate("window.formvis.commands.run('artboard-from-group')")
    page.wait_for_timeout(500)
    assert "New Artboard from Group" in page.locator(".cv-scrim:not([hidden])").first.inner_text()
    ok(page)
    state = page.evaluate("window.formvis.engine.current.doc.layers.map((l) => [l.name, !!l.artboard, l.isGroup])")
    assert state == [["Background", False, False], ["Grp", True, True]], state
