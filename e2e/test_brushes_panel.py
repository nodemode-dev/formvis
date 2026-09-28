PANEL = ".cv-props-col .cv-brushes"


def test_a_preset_applies_and_is_marked(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'B', 'white')")
    tiles = page.locator(f"{PANEL} .cv-brush-grid .cv-brush-tile")
    assert tiles.count() >= 3
    name = tiles.nth(1).get_attribute("aria-label")
    want = page.evaluate("async (n) => (await import('/src/engine/brush-dynamics.ts')).allBrushPresets().find((p) => p.name === n)", name)
    tiles.nth(1).click()
    got = page.evaluate("({ d: window.formvis.engine.brush.diameter, h: window.formvis.engine.brush.hardness })")
    assert got == {"d": want["diameter"], "h": want["hardness"]}, (got, want)
    assert "is-on" in tiles.nth(1).get_attribute("class")
    assert tiles.nth(1).locator(".cv-brush-size").inner_text() == f"{want['diameter']} px"


def test_search_list_view_and_its_memory(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'B', 'white')")             # the start screen gives way
    try:
        search = page.locator(f"{PANEL} .cv-brush-find input")
        first = page.locator(f"{PANEL} .cv-brush-tile").first.get_attribute("aria-label")
        search.fill(first[:4])
        names = page.locator(f"{PANEL} .cv-brush-tile").evaluate_all("(ts) => ts.map((t) => t.getAttribute('aria-label'))")
        assert names and all(first[:4].lower() in n.lower() for n in names), names
        search.fill("no brush is called this")
        assert page.locator(f"{PANEL} .cv-brush-none").is_visible()
        search.fill("")
        page.locator(f"{PANEL} [data-view='list']").click()
        assert page.locator(f"{PANEL} .cv-brush-list .cv-brush-name").first.is_visible()
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.locator(f"{PANEL} .cv-brush-list").count() == 1                      # remembered
    finally:
        page.evaluate("localStorage.removeItem('formvis.brushView')")


def test_the_brush_settings_tab_sets_the_tip(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'B', 'white')")             # the start screen gives way
    page.locator(".cv-props-col .cv-group-tab", has_text="Brush Settings").click()
    shape = page.locator(".cv-props-col .cv-brush-shape")
    for label, value in [("Spacing", "60"), ("Roundness", "40")]:
        f = shape.locator(f"input[aria-label='{label}'][type='text']")
        f.fill(value); f.press("Enter")
    got = page.evaluate("({ s: window.formvis.engine.brushShape.spacing, r: window.formvis.engine.brushShape.roundness })")
    assert got == {"s": 60, "r": 40}, got
    page.locator(".cv-props-col .cv-group-tab", has_text="Brushes").first.click()
    assert page.locator(f"{PANEL} [data-act='load']").is_visible()
    assert page.locator(f"{PANEL} input[type=file]").get_attribute("accept") == ".abr"   # Photoshop brushes
