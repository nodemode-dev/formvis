import json

PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"
OPEN = "async (c) => { await window.formvis.commands.run(c); }"
DIALOG = ".cv-scrim:not([hidden]) .cv-dialog"
SCR = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"
SET = """([label, v]) => { const d = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].pop();
  const i = [...d.querySelectorAll('input')].find((n) => n.getAttribute('aria-label') === label && n.getClientRects().length);
  if (!i) throw new Error('no control ' + label + ' in ' + [...d.querySelectorAll('input')].map((n) => n.getAttribute('aria-label')).join('|'));
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }"""
SMART = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(200, 200, 'W', 'white'); e.addLayer(); e.fg = { r: 255, g: 0, b: 0 };
  e.applySelection(E.SelectionMask.cropped(60, 60, 80, 80, new Uint8Array(6400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
  e.convertToSmartObject(); return !!e.current.activeLayer.smart; }"""


def press(page, text):
    page.locator(f"{DIALOG}-foot button", has_text=text).last.click()
    page.wait_for_timeout(600)


def test_a_perspective_warp_is_committed_on_a_smart_object_stays_live_reopens_and_reset_warp_restores_it(page):
    assert page.evaluate(SMART) is True
    page.evaluate("window.formvis.commands.run('perspective-warp')")
    page.wait_for_function("!!window.formvis.engine.perspectiveEdit", timeout=5000)
    page.evaluate("() => { const e = window.formvis.engine; const i = e.addPerspectivePlane({ x: 60, y: 60 }, { x: 140, y: 140 }); e.setPerspectivePhase('warp'); e.movePerspectiveCorner(i, 0, { x: 90, y: 60 }); e.movePerspectiveCorner(i, 3, { x: 90, y: 140 }); }")
    page.evaluate("window.formvis.engine.applyPerspectiveWarp()")
    page.wait_for_timeout(600)
    assert page.evaluate("window.formvis.engine.current.activeLayer.smart.deform.kind") == "perspective"
    assert page.evaluate("window.formvis.engine.current.history.steps.names.slice(-1)[0]") == "Perspective Warp"
    assert page.evaluate(PX, [65, 100]) == [255, 255, 255]
    assert page.evaluate(PX, [100, 100]) == [255, 0, 0]
    page.evaluate("window.formvis.commands.run('perspective-warp')")
    page.wait_for_function("!!window.formvis.engine.perspectiveEdit", timeout=5000)
    assert page.evaluate("[window.formvis.engine.perspectiveEdit.phase, window.formvis.engine.perspectiveEdit.planes.length]") == ["warp", 1]
    page.evaluate("window.formvis.engine.cancelPerspectiveWarp()")
    assert page.evaluate("window.formvis.commands.run('smart-warp-reset')") is True
    page.wait_for_timeout(500)
    assert page.evaluate("!!window.formvis.engine.current.activeLayer.smart.deform") is False
    assert page.evaluate(PX, [65, 100]) == [255, 0, 0]
    assert page.evaluate("!!window.formvis.engine.current.activeLayer.smart") is True


def test_replace_all_missing_fonts_sets_every_missing_family_to_the_default_in_one_step_and_the_dialog_lists_it(page):
    make = """async () => { const e = window.formvis.engine; e.newDocument(200, 100, 'T', 'white');
      await e.createTextLayer({ x: 10, y: 40 }, { ...e.textSettings, content: 'Hello', family: 'NoSuchFontXYZ', size: 30, color: { r: 0, g: 0, b: 0 }, direction: 'horizontal' });
      return e.textLayerInfo().map((l) => l.family); }"""
    assert page.evaluate(make) == ["NoSuchFontXYZ"]
    page.evaluate(OPEN, "resolve-missing-fonts")
    page.locator(DIALOG).last.wait_for()
    assert "NoSuchFontXYZ (1 layer)" in page.locator(DIALOG).last.inner_text()
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    page.evaluate(OPEN, "replace-missing-fonts")
    page.wait_for_timeout(1200)
    assert page.evaluate("window.formvis.engine.textLayerInfo().map((l) => l.family)") == ["Inter"]
    assert page.evaluate("window.formvis.engine.current.history.steps.names.slice(-1)[0]") == "Replace All Missing Fonts"
    assert "1 type layer set to the default font." in page.evaluate("[...document.querySelectorAll('.cv-toast')].map((n) => n.textContent).join('|')")
    page.evaluate(OPEN, "replace-missing-fonts")
    page.wait_for_timeout(800)
    assert "No missing fonts in the type layers." in page.evaluate("[...document.querySelectorAll('.cv-toast')].map((n) => n.textContent).join('|')")


def test_the_interpolation_segment_in_free_transform_sets_the_layer_sampling_and_nearest_keeps_the_edge_hard(page):
    distinct = """() => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(28, 40, 30, 1).data; const s = new Set(); for (let i = 0; i < d.length; i += 4) s.add(d[i]); return s.size; }"""
    found = {}
    for label in ("Nearest neighbor", "Bicubic"):
        page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(60, 60, 'S', 'white'); e.addLayer(); e.fg = { r: 0, g: 0, b: 0 };
          e.applySelection(E.SelectionMask.cropped(20, 20, 10, 10, new Uint8Array(100).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); e.setTool('move');
          return e.beginTransform({ kind: 'resize', handle: 0 }, { x: 0, y: 0 }); }""")
        page.wait_for_timeout(400)
        page.get_by_role("button", name=label).first.click()
        page.wait_for_timeout(300)
        page.evaluate("() => { const e = window.formvis.engine; const t = e.current.activeLayer.transform; e.setLayerTransform({ w: t.w * 1.7, h: t.h * 1.7 }); e.applyPendingTransform(); }")
        page.wait_for_timeout(500)
        found[label] = (page.evaluate("window.formvis.engine.current.activeLayer.transform.sampling"), page.evaluate(distinct))
    assert found["Nearest neighbor"][0] == "nearest" and found["Bicubic"][0] == "high", found
    assert found["Nearest neighbor"][1] <= 3 and found["Bicubic"][1] > found["Nearest neighbor"][1], found


def limit_matte(page, setup, mode_label, fields):
    page.evaluate(setup)
    page.evaluate("window.formvis.commands.run('edit-adjustment')")
    page.locator(DIALOG).last.wait_for()
    page.wait_for_timeout(800)
    sel = page.locator(f"{DIALOG} select").filter(has=page.locator("option", has_text="Color range")).last
    sel.select_option(label=mode_label, force=True)
    page.wait_for_timeout(300)
    for k, v in fields:
        page.evaluate(SET, [k, v])
        page.wait_for_timeout(200)
    data = page.evaluate("window.formvis.engine.current.activeLayer.adjustment.data.limit")
    page.locator(f"{DIALOG} label:has-text('Show the effect') input").last.check()
    page.wait_for_timeout(700)
    out = (data, page.evaluate(PX, [20, 20]), page.evaluate(PX, [80, 20]))
    page.locator(f"{DIALOG} label:has-text('Show the effect') input").last.uncheck()
    page.wait_for_timeout(300)
    page.locator(f"{DIALOG}-foot button", has_text="Cancel").last.click()
    page.wait_for_timeout(300)
    return out


def test_limit_by_depth_and_by_colour_range_confine_a_filter_layer_and_the_matte_view_shows_them(page):
    depth = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(100, 40, 'D', 'white');
      e.addLayer({ name: 'Depth Map' }); e.fg = { r: 255, g: 255, b: 255 }; e.selectAll(); e.fill('fg'); e.deselect(); e.fg = { r: 0, g: 0, b: 0 };
      e.applySelection(E.SelectionMask.cropped(0, 0, 50, 40, new Uint8Array(2000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect();
      e.addLayer({ name: 'Pic' }); e.fg = { r: 200, g: 60, b: 60 }; e.selectAll(); e.fill('fg'); e.deselect(); e.addAdjustmentLayer('exposure'); }"""
    data, left, right = limit_matte(page, depth, "Depth", [("From (%)", 60)])
    assert data["mode"] == "depth" and data["lo"] == 60
    assert right[0] > 200 and left[0] < 50, (left, right)
    colour = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(100, 40, 'C', 'white');
      e.fg = { r: 255, g: 0, b: 0 }; e.selectAll(); e.fill('fg'); e.deselect(); e.fg = { r: 0, g: 0, b: 255 };
      e.applySelection(E.SelectionMask.cropped(50, 0, 50, 40, new Uint8Array(2000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); e.addAdjustmentLayer('exposure'); }"""
    data, left, right = limit_matte(page, colour, "Color range", [("Hue (degrees)", 240), ("Width (degrees)", 60)])
    assert data["mode"] == "color" and data["hue"] == 240 and data["width"] == 60
    assert right[0] > 200 and left[0] < 50, (left, right)
    data, left, right = limit_matte(page, colour, "Color range", [("Hue (degrees)", 0), ("Width (degrees)", 60)])
    assert left[0] > 200 and right[0] < 50, (left, right)


def test_paste_lands_centred_in_the_visible_part_when_the_copied_place_is_off_screen_and_paste_in_place_keeps_it(page):
    got = page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.newDocument(3000, 3000, 'P', 'white'); e.addLayer(); e.fg = { r: 255, g: 0, b: 0 };
      e.applySelection(E.SelectionMask.cropped(50, 50, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.copySelection(false); e.deselect();
      const v = e.current.viewport; v.zoomAt(1, 0, 0); v.panBy(-2000, -2000);
      const a = v.toDoc(0, 0), z = v.toDoc(v.width, v.height);
      e.pasteClipboard(false); const t = e.current.activeLayer.transform;
      return { view: [a.x, a.y, z.x, z.y], x: t.x, y: t.y, name: e.current.activeLayer.name }; }""")
    assert got["name"] == "Pasted Layer"
    assert got["view"][0] < got["x"] and got["x"] + 40 < got["view"][2] and got["view"][1] < got["y"] and got["y"] + 40 < got["view"][3], got
    assert (got["x"], got["y"]) != (50, 50)
    assert page.evaluate("() => { window.formvis.engine.pasteClipboard(true); const t = window.formvis.engine.current.activeLayer.transform; return [t.x, t.y]; }") == [50, 50]


def test_a_flat_jpeg_export_reports_what_it_drops_and_a_recorded_action_keeps_the_save_step(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(60, 60, 'X', 'transparent'); e.addLayer(); }")
    page.evaluate("window.formvis.commands.run('export-jpg')")
    page.locator(DIALOG).last.wait_for()
    page.wait_for_timeout(2500)
    page.evaluate("() => [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog .cv-dialog-foot button')].find((b) => b.textContent === 'Export...').click()")
    page.wait_for_timeout(2000)
    text = page.evaluate("[...document.querySelectorAll('.cv-toast')].map((n) => n.textContent).join(' ')")
    assert "JPEG keeps no transparency here; clear areas are laid on white." in text, text
    assert "JPEG is lossy; written at quality" in text, text
    page.evaluate("window.formvis.commands.run('panel-actions')")
    page.wait_for_function("(() => { const p = document.querySelector('.cv-actions-panel'); return !!p && !!p.offsetParent; })()", timeout=10000)
    page.fill(".cv-actions-panel .cv-actions-name", "SaveRec")
    page.click(".cv-actions-panel [data-act=record]")
    page.evaluate("window.formvis.commands.run('export-png')")
    page.wait_for_timeout(1500)
    page.click(".cv-actions-panel [data-act=stop]")
    page.wait_for_timeout(300)
    stored = json.loads(page.evaluate("localStorage.getItem('formvis.actions') || '[]'"))
    mine = [a for a in stored if a["name"] == "SaveRec"]
    assert mine and mine[0]["steps"][0]["kind"] == "save" and mine[0]["steps"][0]["format"] == "png", stored


def test_files_dropped_on_the_canvas_become_layers_with_control_a_new_document_and_on_the_tab_strip_a_document_at_the_drop_position(page):
    drop = """async ([sel, mods, rel]) => { const c = document.createElement('canvas'); c.width = 20; c.height = 20; const g = c.getContext('2d'); g.fillStyle = '#0f0'; g.fillRect(0, 0, 20, 20);
      const bl = await new Promise((r) => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([bl], 'drop.png', { type: 'image/png' }));
      const t = document.querySelector(sel), r = t.getBoundingClientRect();
      t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width * rel, clientY: r.top + r.height / 2, ...mods }));
      await new Promise((res) => setTimeout(res, 1800)); const e = window.formvis.engine;
      return [e.projects.length, e.current.name, e.current.doc.layers.map((l) => l.name)]; }"""
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(100, 100, 'One', 'white'); e.newDocument(100, 100, 'Two', 'white'); }")
    n = page.evaluate("window.formvis.engine.projects.length")
    plain = page.evaluate(drop, [".cv-stage", {}, 0.5])
    assert plain[0] == n and "drop" in plain[2], plain
    ctrl = page.evaluate(drop, [".cv-stage", {"ctrlKey": True}, 0.5])
    assert ctrl[0] == n + 1 and ctrl[2] == ["drop"], ctrl
    names_before = page.evaluate("window.formvis.engine.projects.map((p) => p.name)")
    tabs = page.evaluate(drop, [".cv-doc-tabs", {}, 0.02])
    assert tabs[0] == n + 2, tabs
    names = page.evaluate("window.formvis.engine.projects.map((p) => p.name)")
    assert len(names) == len(names_before) + 1 and names[1:] == names_before and names[0] not in names_before, (names_before, names)


def test_a_wasm_plug_in_runs_as_a_smart_filter_on_a_smart_object_and_stays_in_its_filter_list(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(40, 30, 'Wasm', 'white'); e.fg = { r: 200, g: 40, b: 40 }; e.selectAll(); e.fill('fg'); e.deselect(); e.convertToSmartObject(); }")
    page.evaluate("window.formvis.commands.run('wasm-plugin-example')")
    page.wait_for_function("window.formvis.commands.all().some((c) => c.id.startsWith('wasm-run-'))", timeout=15000)
    ids = page.evaluate("window.formvis.commands.all().map((c) => c.id).filter((i) => i.startsWith('wasm-run-'))")
    page.evaluate("(id) => window.formvis.commands.run(id)", ids[0])
    page.wait_for_timeout(2000)
    page.locator(f"{DIALOG}-foot button", has_text="OK").last.click()
    page.wait_for_timeout(1500)
    assert page.evaluate("window.formvis.engine.current.activeLayer.smart.filters.map((f) => f.kind)") == ["wasm:tint-mix"]
    assert all(abs(a - b) <= 2 for a, b in zip(page.evaluate(PX, [10, 10]), [222, 80, 24]))
    assert page.evaluate("!!window.formvis.engine.current.activeLayer.smart") is True


def test_glass_offers_the_sheen_reeded_ribbed_wavy_and_pebbled_textures_and_runs_as_a_smart_filter(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(80, 80, 'G', 'white'); e.fg = { r: 0, g: 0, b: 0 }; e.selectAll(); e.fill('fg'); e.deselect(); e.convertToSmartObject(); }")
    kinds = page.evaluate("""async () => { const e = window.formvis.engine;
      for (const t of ['sheen', 'reeded', 'ribbed', 'wavy', 'pebbled']) e.addSmartFilter('glass', { distortion: 15, smoothness: 3, texture: t, scaling: 100, invert: false });
      await new Promise((r) => setTimeout(r, 1500)); return e.current.activeLayer.smart.filters.map((f) => [f.kind, f.settings.texture]); }""")
    assert [k[1] for k in kinds] == ["sheen", "reeded", "ribbed", "wavy", "pebbled"] and all(k[0] == "glass" for k in kinds), kinds


def test_slice_select_selects_moves_resizes_by_an_edge_and_divides_a_slice(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(200, 200, 'Sl', 'white'); e.addSlice({ x: 20, y: 20, w: 60, h: 60 }); e.setTool('slice'); }")
    page.evaluate("async () => { const m = await import('/src/extensions/tools/slice.ts'); m.sliceTool.variants(window.formvis.engine)[1].pick(); }")
    page.mouse.click(*page.evaluate(SCR, [50, 50]))
    page.wait_for_timeout(200)
    assert page.evaluate("window.formvis.engine.activeSlice") == page.evaluate("window.formvis.engine.current.doc.slices[0].id")
    page.mouse.move(*page.evaluate(SCR, [50, 50]))
    page.mouse.down()
    page.mouse.move(*page.evaluate(SCR, [70, 60]), steps=5)
    page.mouse.up()
    page.wait_for_timeout(300)
    assert page.evaluate("(() => { const s = window.formvis.engine.current.doc.slices[0]; return [s.x, s.y, s.w, s.h]; })()") == [40, 30, 60, 60]
    page.mouse.move(*page.evaluate(SCR, [100, 90]))
    page.mouse.down()
    page.mouse.move(*page.evaluate(SCR, [130, 110]), steps=5)
    page.mouse.up()
    page.wait_for_timeout(300)
    assert page.evaluate("(() => { const s = window.formvis.engine.current.doc.slices[0]; return [s.x, s.y, s.w, s.h]; })()") == [40, 30, 90, 80]
    assert page.evaluate("() => { const e = window.formvis.engine; return [e.divideSlice(e.activeSlice, 2, 1), e.current.doc.slices.length]; }") == [True, 2]


def test_ctrl_drag_and_ctrl_alt_arrows_move_the_text_being_typed_and_the_text_commits_where_it_was_moved(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(300, 300, 'T2', 'white'); e.setTool('type'); e.fg = { r: 0, g: 0, b: 0 }; }")
    x, y = page.evaluate(SCR, [10, 10])
    x2, y2 = page.evaluate(SCR, [130, 100])
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x2, y2, steps=5)
    page.mouse.up()
    ed = page.locator(".cv-type-editor")
    ed.fill("Teh quick brown")
    box = "() => { const r = document.querySelector('.cv-type-editor').getBoundingClientRect(); return [r.left, r.top]; }"
    b0 = page.evaluate(box)
    page.keyboard.press("Control+Alt+ArrowRight")
    page.keyboard.press("Control+Alt+Shift+ArrowDown")
    page.wait_for_timeout(300)
    b1 = page.evaluate(box)
    assert b1[0] > b0[0] and b1[1] > b0[1] + 5, (b0, b1)
    page.keyboard.down("Control")
    page.mouse.move(b1[0] + 30, b1[1] + 10)
    page.mouse.down()
    page.mouse.move(b1[0] + 80, b1[1] + 40, steps=6)
    page.mouse.up()
    page.keyboard.up("Control")
    page.wait_for_timeout(300)
    b2 = page.evaluate(box)
    assert 40 < b2[0] - b1[0] < 60 and 20 < b2[1] - b1[1] < 40, (b1, b2)
    page.keyboard.press("Control+Enter")
    page.wait_for_timeout(500)
    assert page.evaluate("window.formvis.engine.current.activeLayer.text.content") == "Teh quick brown"
    assert page.evaluate("window.formvis.engine.current.activeLayer.transform.x") > 20


def test_add_font_files_takes_a_font_file_from_the_chooser_and_lists_its_family(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'F', 'white')")
    with page.expect_file_chooser() as fc:
        page.evaluate("window.formvis.commands.run('add-font-files')")
    fc.value.set_files("/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf")
    page.wait_for_function("[...document.querySelectorAll('.cv-toast')].some((n) => n.textContent.includes('to the font menus'))", timeout=8000)
    assert "Added LiberationSerif Italic to the font menus." in page.evaluate("[...document.querySelectorAll('.cv-toast')].map((n) => n.textContent).join('|')")


def test_the_type_editor_has_spell_check_on_and_a_range_can_carry_its_own_language(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(300, 100, 'T', 'white'); e.setTool('type'); e.fg = { r: 0, g: 0, b: 0 }; }")
    x, y = page.evaluate(SCR, [10, 10])
    x2, y2 = page.evaluate(SCR, [130, 60])
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x2, y2, steps=5)
    page.mouse.up()
    page.locator(".cv-type-editor").fill("Hello world")
    assert page.evaluate("document.querySelector('.cv-type-editor').spellcheck") is True
    page.keyboard.press("Control+Enter")
    page.wait_for_timeout(500)
    assert page.evaluate("window.formvis.commands.run('type-range-style', { language: 'fr', start: 0, end: 5 })") is not None
    page.wait_for_timeout(600)
    runs = page.evaluate("JSON.stringify(window.formvis.engine.current.activeLayer.text.runs)")
    assert '"language":"fr"' in runs, runs
    assert page.evaluate("window.formvis.engine.current.activeLayer.text.language") in (None, "")


def test_the_show_extension_panels_preference_is_in_general_preferences_and_is_kept(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'P', 'white')")
    page.evaluate(OPEN, "prefs-general")
    page.locator(DIALOG).last.wait_for()
    row = page.locator(f"{DIALOG} label", has_text="Show Extension Panels").first
    was = row.locator("input").is_checked()
    row.locator("input").set_checked(not was, force=True)
    page.wait_for_timeout(400)
    stored = page.evaluate("Object.keys(localStorage).filter((k) => /pref/i.test(k)).map((k) => localStorage.getItem(k)).join('')")
    assert f'"showExtPanels":{"true" if not was else "false"}' in stored
    row.locator("input").set_checked(was, force=True)
    page.wait_for_timeout(300)
    page.keyboard.press("Escape")


def test_load_files_into_stack_takes_a_folder_of_pictures_in_name_order_with_the_align_option(page, tmp_path):
    for name, rgb in (("a_red.png", (255, 0, 0)), ("b_blue.png", (0, 0, 255))):
        page.evaluate("""([n, rgb]) => { const e = window.formvis.engine; e.newDocument(30, 20, n, 'white'); e.fg = { r: rgb[0], g: rgb[1], b: rgb[2] }; e.selectAll(); e.fill('fg'); e.deselect(); }""", [name, rgb])
    import base64
    png = page.evaluate("""() => { const c = document.createElement('canvas'); c.width = 30; c.height = 20; const g = c.getContext('2d'); g.fillStyle = '#f00'; g.fillRect(0, 0, 30, 20); return c.toDataURL('image/png').split(',')[1]; }""")
    folder = tmp_path / "shots"
    folder.mkdir()
    (folder / "a_one.png").write_bytes(base64.b64decode(png))
    png2 = page.evaluate("""() => { const c = document.createElement('canvas'); c.width = 30; c.height = 20; const g = c.getContext('2d'); g.fillStyle = '#00f'; g.fillRect(0, 0, 30, 20); return c.toDataURL('image/png').split(',')[1]; }""")
    (folder / "b_two.png").write_bytes(base64.b64decode(png2))
    before = page.evaluate("window.formvis.engine.projects.length")
    page.evaluate(OPEN, "load-files-stack")
    page.locator(DIALOG).last.wait_for()
    with page.expect_file_chooser() as fc:
        page.locator(f"{DIALOG} button", has_text="Folder...").last.click()
    fc.value.set_files(str(folder))
    page.wait_for_function("document.querySelector('.cv-scrim:not([hidden]) .cv-dialog')?.innerText.includes('a_one.png')", timeout=8000)
    text = page.locator(DIALOG).last.inner_text()
    assert text.index("a_one.png") < text.index("b_two.png")
    page.locator(f"{DIALOG} label", has_text="Attempt to Automatically Align").locator("input").first.check(force=True)
    press(page, "OK")
    page.wait_for_function(f"window.formvis.engine.projects.length >= {before + 1}", timeout=30000)
    page.wait_for_timeout(1500)
    names = page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.name)")
    assert len(names) >= 2 and any("a_one" in n for n in names) and any("b_two" in n for n in names), names


def test_the_adjustment_dialog_has_a_slider_with_a_number_field_live_preview_and_cancel_puts_the_picture_back(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(60, 40, 'A', 'white'); e.fg = { r: 100, g: 100, b: 100 }; e.selectAll(); e.fill('fg'); e.deselect(); e.addAdjustmentLayer('exposure'); }""")
    before = page.evaluate(PX, [10, 10])
    page.evaluate("window.formvis.commands.run('edit-adjustment')")
    page.locator(DIALOG).last.wait_for()
    page.wait_for_timeout(800)
    info = page.evaluate("""() => { const d = [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog')].pop();
      const r = [...d.querySelectorAll('input[type=range]')].filter((n) => n.getClientRects().length), n = [...d.querySelectorAll('input:not([type=range]):not([type=checkbox])')].filter((q) => q.getClientRects().length);
      return { ranges: r.length, numbers: n.map((q) => q.getAttribute('aria-label')), modal: !!document.querySelector('.cv-scrim:not([hidden])'), buttons: [...d.querySelectorAll('.cv-dialog-foot button')].map((b) => b.textContent) }; }""")
    assert info["ranges"] >= 1 and info["numbers"] and info["modal"], info
    assert "Cancel" in info["buttons"] and "OK" in info["buttons"], info
    label = info["numbers"][0]
    page.evaluate(SET, [label, 1.5])
    page.wait_for_timeout(700)
    live = page.evaluate(PX, [10, 10])
    assert live != before, (before, live)
    page.locator(f"{DIALOG}-foot button", has_text="Cancel").last.click()
    page.wait_for_timeout(600)
    assert page.evaluate(PX, [10, 10]) == before


def test_merge_to_hdr_takes_the_open_documents_and_makes_a_32_bit_document(page):
    for name, k in (("Dark", 0.25), ("Mid", 0.6), ("Light", 1.0)):
        page.evaluate("""async ([n, k]) => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(96, 64, n, 'white');
          for (let i = 0; i < 12; i++) for (let j = 0; j < 8; j++) { const v = Math.round(Math.min(255, k * (15 + ((i * 37 + j * 71) % 240)))); e.fg = { r: v, g: v, b: v };
            e.applySelection(E.SelectionMask.cropped(i * 8, j * 8, 8, 8, new Uint8Array(64).fill(255)), 'replace', 's'); e.fill('fg'); }
          e.deselect(); }""", [name, k])
        page.wait_for_timeout(200)
    before = page.evaluate("window.formvis.engine.projects.length")
    page.evaluate(OPEN, "merge-hdr")
    page.locator(DIALOG).last.wait_for()
    page.locator(f"{DIALOG} button", has_text="Open documents").last.click()
    page.wait_for_function("document.querySelector('.cv-scrim:not([hidden]) .cv-dialog')?.innerText.includes('Dark')", timeout=8000)
    text = page.locator(DIALOG).last.inner_text()
    assert "Remove ghosts" in text and "Mode" in text
    press(page, "OK")
    page.wait_for_function(f"window.formvis.engine.projects.length >= {before + 1}", timeout=60000)
    page.wait_for_timeout(1500)
    assert page.evaluate("window.formvis.engine.current.doc.depth") == 32


def test_the_gradient_tool_with_live_on_makes_a_gradient_fill_layer_whose_end_drags_and_a_click_adds_a_stop_on_the_canvas(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(200, 200, 'G', 'white'); e.fg = { r: 255, g: 0, b: 0 }; e.bg = { r: 0, g: 0, b: 255 }; e.gradientSettings = { ...e.gradientSettings, live: true }; e.setTool('gradient'); }""")

    def drag(a, b):
        page.mouse.move(*page.evaluate(SCR, a))
        page.mouse.down()
        page.mouse.move(*page.evaluate(SCR, b), steps=6)
        page.mouse.up()
        page.wait_for_timeout(500)

    drag([20, 100], [180, 100])
    fill = "(() => { const l = window.formvis.engine.current.activeLayer; return l.fillContent ? [l.fillContent.kind, l.fillContent.stops.length, l.fillContent.angle] : null; })()"
    first = page.evaluate(fill)
    assert first and first[0] == "gradient" and first[1] == 2, first
    left, right = page.evaluate(PX, [30, 100]), page.evaluate(PX, [170, 100])
    assert left[0] > 200 and left[2] < 60 and right[2] > 200 and right[1] > 200, (left, right)
    drag([180, 100], [100, 20])
    moved = page.evaluate(fill)
    assert moved[2] != first[2], (first, moved)
    names = page.evaluate("window.formvis.engine.current.history.steps.names")
    assert any("Gradient" in n or "Fill" in n for n in names), names
    n_before = len(names)
    line = page.evaluate("(() => { const t = window.formvis.engine.gradientFillTarget(); return [t.start, t.end]; })()")
    mid = [(line[0]["x"] + line[1]["x"]) / 2, (line[0]["y"] + line[1]["y"]) / 2]
    page.mouse.click(*page.evaluate(SCR, mid))
    page.wait_for_timeout(500)
    after = page.evaluate(fill)
    assert after[1] == 3, (moved, after)
    assert len(page.evaluate("window.formvis.engine.current.history.steps.names")) > n_before


def test_blur_gallery_field_blur_pins_are_added_dragged_and_deleted_on_the_canvas_and_the_dialog_fields_follow(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(200, 200, 'B', 'white'); e.fg = { r: 0, g: 0, b: 0 }; e.selectAll(); e.fill('fg'); e.deselect(); }""")
    page.evaluate("window.formvis.commands.run('filter-fieldBlur')")
    page.wait_for_function("[...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog input')].some((n) => n.getAttribute('aria-label') === 'Pins value')", timeout=15000)
    page.wait_for_timeout(800)
    read = "() => Object.fromEntries([...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog input')].filter((n) => n.getAttribute('aria-label')).map((n) => [n.getAttribute('aria-label'), n.value]))"
    assert page.evaluate(read)["Pins value"] == "2"
    page.mouse.click(*page.evaluate(SCR, [100, 160]))
    page.wait_for_timeout(600)
    v = page.evaluate(read)
    assert v["Pins value"] == "3" and v["Pin 3 X (%) value"] == "50" and v["Pin 3 Y (%) value"] == "80", v
    page.mouse.move(*page.evaluate(SCR, [100, 160]))
    page.mouse.down()
    page.mouse.move(*page.evaluate(SCR, [140, 120]), steps=5)
    page.mouse.up()
    page.wait_for_timeout(500)
    v = page.evaluate(read)
    assert v["Pin 3 X (%) value"] == "70" and v["Pin 3 Y (%) value"] == "60", v
    page.keyboard.press("Delete")
    page.wait_for_timeout(500)
    assert page.evaluate(read)["Pins value"] == "2"
    page.locator(f"{DIALOG}-foot button", has_text="Cancel").last.click()


def test_free_transform_path_scales_the_work_path_by_its_box_handle_and_distort_moves_a_corner_on_its_own(page):
    bbox = """() => { const vp = window.formvis.engine.workPath, xs = [], ys = []; for (const s of vp.subpaths) for (const a of s.anchors) { xs.push(a.x); ys.push(a.y); }
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round); }"""
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(120, 120, 'P', 'white');
      e.applySelection(E.SelectionMask.cropped(40, 40, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); await window.formvis.commands.run('selection-to-work-path'); e.deselect(); e.setTool('pathSelect'); }""")
    start = page.evaluate(bbox)
    assert start == [40, 40, 80, 80], start
    assert page.evaluate("window.formvis.engine.pathTarget") is True
    page.evaluate("window.formvis.commands.run('transform')")
    assert page.evaluate("!!window.formvis.engine.pathTransform") is True
    page.evaluate("() => { const e = window.formvis.engine, b = e.pathTransform.box; e.continuePathTransform({ kind: 'resize', handle: 4 }, { x: b.x + b.w, y: b.y + b.h }); e.updatePathTransform({ x: b.x + b.w + 40, y: b.y + b.h + 40 }, false, false); }")
    page.evaluate("window.formvis.engine.applyPathTransform()")
    scaled = page.evaluate(bbox)
    assert scaled[0] == 40 and scaled[1] == 40 and scaled[2] > 100 and scaled[3] > 100, scaled
    page.evaluate("window.formvis.engine.setTool('pathSelect')")
    assert page.evaluate("window.formvis.engine.beginPathDistort('distort')") is True
    page.evaluate("() => { const e = window.formvis.engine; e.moveDistortHandle(0, e.pathTransform.corners.map((c) => ({ ...c })), -15, 0); e.applyPathTransform(); }")
    after = page.evaluate(bbox)
    assert after[0] < scaled[0], (scaled, after)



def test_hovering_a_choice_in_a_filter_menu_previews_it_on_the_picture_and_closing_puts_the_chosen_value_back(page):
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts'); e.newDocument(120, 120, 'H', 'white'); e.fg = { r: 0, g: 0, b: 0 };
      for (let i = 0; i < 12; i++) { e.applySelection(E.SelectionMask.cropped(0, i * 10, 120, 5, new Uint8Array(600).fill(255)), 'replace', 's'); e.fill('fg'); } e.deselect(); }""")
    page.evaluate("window.formvis.commands.run('filter-ripple')")
    page.locator(DIALOG).last.wait_for()
    page.wait_for_timeout(1500)
    def shot():
        box = page.evaluate("() => { const r = document.querySelector('.cv-stage').getBoundingClientRect(); const v = window.formvis.engine.current.viewport; const a = v.toScreen(0, 0), b = v.toScreen(120, 120); return { x: r.left + a.x, y: r.top + a.y, width: b.x - a.x, height: b.y - a.y }; }")
        return page.screenshot(clip=box)

    chosen = shot()
    btn = page.locator(f"{DIALOG} .cv-field button.cv-dd-btn:visible").first
    label = btn.inner_text().strip()
    btn.click()
    page.wait_for_timeout(300)
    other = "Large" if label != "Large" else "Small"
    page.locator(".cv-dd-item", has_text=other).last.hover()
    page.wait_for_timeout(1500)
    hovered = shot()
    assert hovered != chosen, label
    page.locator(".cv-dd-item", has_text=label).last.hover()
    page.wait_for_timeout(300)
    btn.click()
    page.wait_for_timeout(1800)
    import io
    from PIL import Image, ImageChops

    def spread(a, b):
        return sum(ImageChops.difference(Image.open(io.BytesIO(a)).convert("RGB"), Image.open(io.BytesIO(b)).convert("RGB")).convert("L").point(lambda v: 255 if v > 24 else 0).histogram()[255:])

    back, away = shot(), hovered
    assert spread(back, chosen) < spread(away, chosen) / 4, (spread(back, chosen), spread(away, chosen))
    assert btn.inner_text().strip() == label
    page.locator(f"{DIALOG}-foot button", has_text="Cancel").last.click()
