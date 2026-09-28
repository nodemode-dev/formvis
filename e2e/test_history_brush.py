PX = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data).slice(0, 3)"
FILL = """async (c) => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.fg = c;
  e.applySelection(E.SelectionMask.cropped(0, 0, 300, 200, new Uint8Array(60000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""
STROKE = """() => { const e = window.formvis.engine; e.setTool('historyBrush'); e.setBrush({ diameter: 30, hardness: 1 });
  const ok = e.beginRetouchStroke('historyBrush', { x: 20, y: 100 }, false); if (ok) { for (let i = 1; i <= 26; i++) e.strokeTo({ x: 20 + i * 10, y: 100 }); e.endStroke(); } return ok; }"""


def test_the_history_brush_paints_back_the_opening_state_and_undoes(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'H', 'white')")
    assert [s["name"] for s in page.evaluate("window.formvis.engine.snapshots")] == ["H"]       # the opening snapshot
    page.evaluate(FILL, {"r": 220, "g": 20, "b": 20})
    assert page.evaluate(STROKE) is True
    assert page.evaluate(PX, [150, 100]) == [255, 255, 255] and page.evaluate(PX, [150, 20]) == [220, 20, 20]
    assert page.evaluate("window.formvis.engine.historySteps.names.slice(-1)[0]") == "History Brush"
    page.keyboard.press("Control+z")
    assert page.evaluate(PX, [150, 100]) == [220, 20, 20]


def test_a_chosen_snapshot_is_the_source_and_a_new_layer_is_refused(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'S', 'white')")
    page.evaluate(FILL, {"r": 220, "g": 20, "b": 20})
    page.evaluate("window.formvis.engine.takeSnapshot()")                                       # red, as Snapshot 1
    page.evaluate(FILL, {"r": 20, "g": 20, "b": 220})
    page.evaluate("window.formvis.commands.run('panel-history')")
    try:
        if page.locator(".cv-history-toggle").get_attribute("aria-expanded") != "true": page.locator(".cv-history-toggle").click()   # unfold it, as a user would
        page.locator(".cv-history-row", has_text="Snapshot 1").locator(".cv-hb-source").click()   # the brush column
        assert "is-on" in page.locator(".cv-history-row", has_text="Snapshot 1").locator(".cv-hb-source").get_attribute("class")
        assert page.evaluate(STROKE) is True
        assert page.evaluate(PX, [150, 100]) == [220, 20, 20] and page.evaluate(PX, [150, 20]) == [20, 20, 220]
        page.evaluate("window.__n = []; window.formvis.engine.on('notice', (n) => window.__n.push(n.text)); window.formvis.engine.addLayer()")
        assert page.evaluate(STROKE) is False
        assert any("no layer matching" in n for n in page.evaluate("window.__n"))
    finally:
        page.evaluate("window.formvis.commands.run('panel-history')")
