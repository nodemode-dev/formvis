OPACITY = "Math.round(window.formvis.engine.activeLayer.opacity * 100)"
ROWS = "[...document.querySelectorAll('.cv-layer-rows .cv-layer')].map((r) => r.textContent.trim())"
SCENE = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(200, 120, 'K', 'white');
  e.addLayer(); const p = e.current, a = p.layer(p.activeId); a.raster = new E.Raster(200, 120); p.updateLayer(a.id, { name: 'Paint' });
  e.addAdjustmentLayer('levels'); }"""   # Background and Paint (pixel), then a Levels adjustment (active)


def test_the_kind_filter_shows_only_the_chosen_kinds(page):
    page.evaluate(SCENE)
    page.evaluate("window.formvis.engine.current.updateLayer(window.formvis.engine.current.activeId, { name: 'Tone' })")
    page.wait_for_function("document.querySelectorAll('.cv-layer-rows .cv-layer').length >= 3")   # rows draw on the next frame
    everyone = page.evaluate(ROWS)
    assert len(everyone) >= 3, everyone
    page.locator(".cv-kind-btn[data-kind='adjustment']").click()
    shown = page.evaluate(ROWS)
    assert len(shown) == 1 and "Tone" in shown[0], shown
    assert page.locator("select.cv-kind").input_value() == "adjustment"                  # the dropdown agrees
    page.locator(".cv-kind-btn[data-kind='pixel']").click()                         # two kinds at once
    assert len(page.evaluate(ROWS)) == len(everyone)
    assert page.locator("select.cv-kind").input_value() == "all"
    page.locator("select.cv-kind").select_option("pixel")                                 # the dropdown picks one kind
    assert all("Tone" not in r for r in page.evaluate(ROWS))
    page.locator("select.cv-kind").select_option("all")
    assert len(page.evaluate(ROWS)) == len(everyone)


def test_the_opacity_field_commits_one_step_steps_and_clamps(page):
    page.evaluate(SCENE)
    field = page.locator(".cv-opacity-field")
    field.fill("40"); field.press("Enter")
    assert page.evaluate(OPACITY) == 40
    field.focus(); field.press("ArrowUp")
    assert page.evaluate(OPACITY) == 41
    field.press("Shift+ArrowDown")
    assert page.evaluate(OPACITY) == 31
    field.fill("250"); field.press("Enter")
    assert page.evaluate(OPACITY) == 100 and field.input_value() == "100"          # clamped
    page.keyboard.press("Control+z")
    assert page.evaluate(OPACITY) == 31                                             # the Enter was one undo step


def test_paths_is_a_tab_of_the_layers_group(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(200, 120, 'P', 'white')")
        panel = page.locator(".cv-layers-panel")
        assert page.locator(".cv-layer-list").is_visible() and not page.locator(".cv-paths").is_visible()
        panel.locator(".cv-group-tab", has_text="Paths").click()
        assert page.locator(".cv-paths").is_visible() and not page.locator(".cv-layer-list").is_visible()
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        page.evaluate("window.formvis.engine.newDocument(200, 120, 'P', 'white')")
        assert page.locator(".cv-paths").is_visible()                                   # remembered
        panel.locator(".cv-group-tab", has_text="Layers").click()
        assert page.locator(".cv-layer-list").is_visible()
        assert page.evaluate("window.formvis.commands.run('panel-paths')")               # Window > Paths opens the tab
        assert page.locator(".cv-paths").is_visible()
    finally:
        page.evaluate("localStorage.removeItem('formvis.groups')")
