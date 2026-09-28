BAR = ".cv-opt-group:not([hidden])"


def test_the_move_bar_is_the_targets_and_the_transform_fields_wait_for_a_transform(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'M', 'white'); window.formvis.engine.setTool('move')")
    bar = page.locator(BAR)
    text = bar.inner_text()
    for label in ["Auto-Select", "Auto-Select Target", "Show Transform Controls", "Snap"]:
        assert label in text, text
    assert bar.locator(".cv-opt-tool").get_attribute("aria-label") == "Move"               # the tool chip
    assert bar.locator(".cv-opt-icon[aria-label='Align Left Edges']").count() == 1
    assert "Scale" not in text and not bar.get_by_text("Keep proportions").is_visible()   # until a transform starts


def test_an_align_button_aligns_the_selected_layers(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(300, 200, 'A', 'white');
      for (const x of [40, 150]) { e.addLayer(); const l = e.current.activeLayer; l.raster = new E.Raster(40, 40); l.raster.ctx.fillRect(0, 0, 40, 40); l.raster.touch(); e.current.updateLayer(l.id, { transform: { ...l.transform, x, y: 60, w: 40, h: 40 } }); }
      const ids = e.current.doc.layers.filter((l) => l.raster && l.transform.w === 40).map((l) => l.id); e.selectLayer(ids[0]); e.selectLayer(ids[1], 'toggle'); e.setTool('move'); }""")
    page.locator(f"{BAR} .cv-opt-icon[aria-label='Align Left Edges']").click()
    xs = page.evaluate("window.formvis.engine.current.doc.layers.filter((l) => l.raster && l.transform.w === 40).map((l) => Math.round(l.transform.x))")
    assert len(set(xs)) == 1, xs


def test_auto_select_target_group_selects_the_folder(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(300, 200, 'G', 'white');
      e.addLayer(); const l = e.current.activeLayer; l.raster = new E.Raster(300, 200); l.raster.ctx.fillRect(100, 50, 100, 100); l.raster.touch();
      e.groupLayers(); e.setTool('move'); e.update({ autoSelect: true, autoSelectTarget: 'group' }); e.selectLayer(e.current.doc.layers[0].id); }""")
    box = page.locator(".cv-stage").bounding_box()
    at = page.evaluate("(() => { const v = window.formvis.engine.current.viewport; return v.toScreen(150, 100); })()")
    page.mouse.move(box["x"] + at["x"], box["y"] + at["y"]); page.mouse.down(); page.mouse.up()
    assert page.evaluate("window.formvis.engine.activeLayer.isGroup") is True
    page.evaluate("window.formvis.engine.update({ autoSelect: false, autoSelectTarget: 'layer' })")
