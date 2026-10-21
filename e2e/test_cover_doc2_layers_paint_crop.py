E = "window.formvis.engine"
SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(300, 200, 'M', 'white'); e.deselect();
  const box = (x, y, w, h, r, g, bl, name) => { e.addLayer({ name }); e.fg = { r, g, b: bl }; e.applySelection(E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  box(20, 20, 60, 60, 255, 0, 0, 'Red'); box(200, 100, 60, 60, 0, 0, 255, 'Blue'); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
NAMES = E + ".current.doc.layers.map(l => l.name)"
OVERLAY_ALPHA = "([x, y]) => { const c = document.querySelector('.cv-overlay-canvas'), r = c.getBoundingClientRect(); return c.getContext('2d').getImageData((x - r.left) * c.width / r.width, (y - r.top) * c.height / r.height, 1, 1).data[3]; }"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def menu(page, top, item):
    page.locator(".cv-menu-btn", has_text=top).first.click()
    page.locator(".cv-menu:not([hidden]) > *", has_text=item).first.click()
    page.wait_for_timeout(400)


def test_image_layers_hold_painted_pixels_and_are_plain_raster_layers(page):
    # CO-0022
    page.evaluate(SETUP)
    kinds = page.evaluate(E + ".current.doc.layers.map(l => [l.name, !!l.raster, !!l.isGroup, !!l.adjustment, !!l.text, !!l.smart])")
    assert kinds[2] == ["Blue", True, False, False, False, False]
    page.evaluate(E + ".setTool('brush'); " + E + ".fg = { r: 0, g: 200, b: 0 }; " + E + ".setBrush({ diameter: 20, hardness: 1 })")
    page.mouse.move(*scr(page, 100, 40))
    page.mouse.down()
    page.mouse.move(*scr(page, 140, 40), steps=6)
    page.mouse.up()
    page.wait_for_timeout(300)
    assert page.evaluate(PX, [120, 40])[:3] == [0, 200, 0]
    assert page.evaluate(E + ".activeLayer.name") == "Blue"


def test_temporary_eyedropper_with_alt_samples_the_foreground_and_paints_nothing(page):
    # CO-0094
    page.evaluate(SETUP)
    page.evaluate(E + ".setTool('brush'); " + E + ".fg = { r: 0, g: 255, b: 0 }")
    before = page.evaluate(E + ".historySteps.current")
    page.keyboard.down("Alt")
    page.mouse.click(*scr(page, 50, 50))
    page.keyboard.up("Alt")
    page.wait_for_timeout(200)
    assert page.evaluate(E + ".fg") == {"r": 255, "g": 0, "b": 0}
    assert page.evaluate(E + ".historySteps.current") == before


def test_arrow_key_nudges_in_a_burst_are_one_history_step(page):
    # PC-UI-0952
    page.evaluate(SETUP)
    page.evaluate(E + ".setTool('move')")
    before = page.evaluate(E + ".historySteps.current")
    for _ in range(4):
        page.keyboard.press("ArrowRight")
    page.keyboard.press("Shift+ArrowDown")
    page.wait_for_timeout(300)
    assert page.evaluate(E + ".historySteps.current") == before + 1
    assert page.evaluate(E + ".historySteps.names.slice(-1)[0]") == "Nudge"
    t = page.evaluate(E + ".activeLayer.transform")
    assert (t["x"], t["y"]) == (4, 10)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)
    t = page.evaluate(E + ".activeLayer.transform")
    assert (t["x"], t["y"]) == (0, 0)


def test_crop_tool_starts_on_the_selection_and_enter_crops_to_it(page):
    # CO-0018
    page.evaluate(SETUP)
    page.evaluate("async () => { const E = await import('/src/engine/index.ts'); const e = window.formvis.engine; e.applySelection(E.SelectionMask.cropped(50, 40, 100, 80, new Uint8Array(8000).fill(255)), 'replace', 's'); e.setTool('crop'); }")
    page.wait_for_timeout(300)
    assert page.evaluate(OVERLAY_ALPHA, scr(page, 100, 80)) == 0
    assert page.evaluate(OVERLAY_ALPHA, scr(page, 10, 10)) > 0
    page.keyboard.press("Enter")
    page.wait_for_function(E + ".current.doc.width === 100 && " + E + ".current.doc.height === 80")


def test_crop_show_cropped_area_toggle_changes_the_shield_between_dim_and_solid(page):
    # PC-UI-0786
    page.evaluate(SETUP)
    page.evaluate("async () => { const E = await import('/src/engine/index.ts'); const e = window.formvis.engine; e.applySelection(E.SelectionMask.cropped(50, 40, 100, 80, new Uint8Array(8000).fill(255)), 'replace', 's'); e.setTool('crop'); }")
    page.wait_for_timeout(300)
    out = scr(page, 10, 10)
    dim = page.evaluate(OVERLAY_ALPHA, out)
    assert 0 < dim < 255
    page.locator(".cv-opt-more").click()
    page.get_by_text("Show Cropped Area").first.click()
    page.wait_for_timeout(300)
    assert page.evaluate(OVERLAY_ALPHA, out) == 255
    page.get_by_text("Show Cropped Area").first.click()
    page.wait_for_timeout(300)
    assert page.evaluate(OVERLAY_ALPHA, out) == dim


def test_layers_panel_fx_rows_hide_and_delete_effects_each_as_one_step(page):
    # PC-UI-0826
    page.evaluate(SETUP)
    page.evaluate("async () => { const T = await import('/src/engine/types.ts'), e = window.formvis.engine; const fx = T.defaultEffects(); fx.dropShadow.enabled = true; fx.stroke.enabled = true; e.setLayerEffects(e.activeLayer.id, fx); }")
    page.wait_for_timeout(400)
    page.locator(".cv-layer-rows [data-id] .cv-layer-fx").first.click()
    page.wait_for_timeout(300)
    rows = "[...document.querySelectorAll('.cv-fxrow:not([hidden])')].map(r => r.dataset.key)"
    assert page.evaluate(rows) == ["stroke", "dropShadow"]
    page.locator(".cv-fxrow[data-key=stroke] .cv-fx-eye").first.click()
    page.wait_for_timeout(300)
    assert page.evaluate(E + ".activeLayer.effects.stroke.enabled") is False
    assert page.evaluate(E + ".historySteps.names.slice(-1)[0]") == "Hide Effect"
    page.locator(".cv-fxrow[data-key=dropShadow] .cv-fx-del").first.click()
    page.wait_for_timeout(300)
    assert page.evaluate(E + ".historySteps.names.slice(-1)[0]") == "Delete Effect"
    assert page.evaluate(E + ".activeLayer.effects?.dropShadow?.enabled ?? false") is False


def test_canvas_right_click_lists_the_layers_under_the_pointer_and_picks_one(page):
    # PC-UI-0827
    page.evaluate(SETUP)
    page.evaluate("async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.addLayer({ name: 'Over' }); e.fg = { r: 0, g: 255, b: 0 }; e.applySelection(E.SelectionMask.cropped(220, 110, 60, 60, new Uint8Array(3600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); e.setTool('move'); }")
    assert page.evaluate(E + ".activeLayer.name") == "Over"
    page.mouse.click(*scr(page, 240, 130), button="right")
    page.wait_for_timeout(400)
    page.locator('.cv-menu:not([hidden]) :text-is("Blue")').first.click()
    page.wait_for_timeout(300)
    assert page.evaluate(E + ".activeLayer.name") == "Blue"


def test_brush_right_click_preference_opens_the_preset_picker_instead_of_resizing(page):
    # PC-UI-0779
    page.evaluate(SETUP)
    shown = "(() => { const p = document.querySelector('.cv-brush-picker'); return !!p && !p.hidden; })()"
    page.evaluate(E + ".setTool('brush'); " + E + ".brushRightClick = 'picker'")
    page.mouse.click(*scr(page, 150, 60), button="right")
    page.wait_for_timeout(400)
    assert page.evaluate(shown)
    page.keyboard.press("Escape")
    page.evaluate(E + ".brushRightClick = 'resize'")
    page.mouse.click(*scr(page, 150, 60), button="right")
    page.wait_for_timeout(300)
    assert not page.evaluate(shown)


def test_dragging_a_layer_onto_another_document_tab_copies_it_there(page):
    # CO-0044, PC-UI-0823, PC-EN-0022
    page.evaluate(SETUP)
    page.evaluate(E + ".newDocument(200, 100, 'B', 'white')")
    page.wait_for_timeout(300)
    keys = page.evaluate(E + ".projects.map(p => p.id)")
    page.evaluate(E + ".switchTo(" + repr(keys[0]) + "); " + E + ".setTool('move')")
    page.wait_for_timeout(300)
    box = page.locator('.cv-tab[data-key="%s"]' % keys[1]).first.bounding_box()
    page.mouse.move(*scr(page, 230, 130))
    page.mouse.down()
    page.mouse.move(*scr(page, 150, 60), steps=4)
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=8)
    page.wait_for_timeout(200)
    assert page.evaluate("document.querySelectorAll('.cv-tab.is-drop-target').length") == 1
    page.mouse.up()
    page.wait_for_timeout(500)
    assert page.evaluate(E + ".projects[1].doc.layers.map(l => l.name)") == ["Background", "Blue"]
    assert page.evaluate(E + ".projects[0].doc.layers.map(l => l.name)") == ["Background", "Red", "Blue"]
    assert page.evaluate(E + ".copyLayersToProject([...%s.projects[0].selectedIds], %r, true)" % (E, keys[1])) is True
    assert page.evaluate(E + ".projects[1].doc.layers.map(l => l.name)") == ["Background", "Blue", "Blue"]


def test_gradients_panel_adds_picks_and_deletes_a_custom_gradient(page):
    # PC-UI-0841
    page.evaluate(SETUP)
    menu(page, "Window", "Gradients")
    sec = page.locator("section.cv-gradients")
    grid = sec.locator(".cv-styles-grid > *")
    n0 = grid.count()
    sec.locator("[data-act=add]").click()
    page.wait_for_timeout(300)
    assert grid.count() == n0 + 1
    grid.nth(n0).click()
    page.wait_for_timeout(300)
    assert page.evaluate(E + ".gradientSettings.style").startswith("custom-")
    assert page.evaluate(E + ".tool") == "gradient"
    sec.locator("[data-act=delete]").click()
    page.wait_for_timeout(300)
    assert grid.count() == n0


def test_patterns_panel_picks_a_pattern_and_defines_one_from_the_selection(page):
    # PC-UI-0842
    page.evaluate(SETUP)
    page.evaluate("async () => { const E = await import('/src/engine/index.ts'); window.formvis.engine.applySelection(E.SelectionMask.cropped(20, 20, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); }")
    menu(page, "Window", "Patterns")
    sec = page.locator("section.cv-patterns")
    grid = sec.locator(".cv-styles-grid > *")
    n0 = grid.count()
    grid.nth(1).click()
    page.wait_for_timeout(300)
    assert page.evaluate(E + ".patternStampPattern").startswith("builtin:")
    sec.locator("[data-act=add]").click()
    page.wait_for_timeout(500)
    page.locator("input[type=text]:visible").last.fill("Covdoc2 Pat")
    page.get_by_role("button", name="OK").last.click()
    page.wait_for_function("document.querySelectorAll('section.cv-patterns .cv-styles-grid > *').length === %d" % (n0 + 1))


def test_new_brush_preset_dialog_names_and_creates_a_preset(page):
    # PC-UI-0857
    page.evaluate(SETUP)
    menu(page, "Window", "Brush Settings")
    page.get_by_role("button", name="New Brush Preset").first.click()
    page.wait_for_timeout(500)
    d = page.locator(".cv-dialog:visible", has=page.locator("canvas.cv-brush-preview")).first
    assert d.locator("canvas.cv-brush-preview").count() == 1
    d.locator("input[aria-label=Name]").fill("Covdoc2 Brush")
    d.get_by_role("button", name="Create").click()
    page.wait_for_function("[...document.querySelectorAll('.cv-toast')].some(t => t.innerText.includes('Covdoc2 Brush'))", timeout=5000)
    assert not d.is_visible()


def test_alt_drag_of_a_layer_row_duplicates_it_to_the_drop_place_in_one_step(page):
    # CO-0033
    page.evaluate(SETUP)
    page.evaluate(E + ".setTool('brush')")
    rows = page.locator(".cv-layer-rows [data-id]")
    find = "name => Array.from(document.querySelectorAll('.cv-layer-rows [data-id]')).findIndex(r => r.textContent.includes(name))"
    src = rows.nth(page.evaluate(find, "Red")).bounding_box()
    dst = rows.nth(page.evaluate(find, "Background")).bounding_box()
    before = page.evaluate(E + ".historySteps.current")
    page.keyboard.down("Alt")
    page.mouse.move(src["x"] + 60, src["y"] + src["height"] / 2)
    page.mouse.down()
    page.mouse.move(dst["x"] + 60, dst["y"] + dst["height"] * 0.3, steps=8)
    page.mouse.up()
    page.keyboard.up("Alt")
    page.wait_for_timeout(400)
    assert page.evaluate(NAMES) == ["Background", "Red copy", "Red", "Blue"]
    assert page.evaluate(E + ".historySteps.current") == before + 1
    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)
    assert page.evaluate(NAMES) == ["Background", "Red", "Blue"]
    assert page.evaluate(PX, [50, 50])[:3] == [255, 0, 0]
    page.keyboard.press("Control+Shift+z")
    page.wait_for_timeout(300)
    assert page.evaluate(NAMES) == ["Background", "Red copy", "Red", "Blue"]
