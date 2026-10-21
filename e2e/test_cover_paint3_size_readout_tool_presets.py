import re

SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(300, 200, 'M', 'transparent'); e.deselect();
  e.addLayer({ name: 'Box' }); e.fg = { r: 255, g: 0, b: 0 }; e.applySelection(E.SelectionMask.cropped(20, 20, 60, 40, new Uint8Array(2400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""
SIZES = "[...document.querySelectorAll('.cv-layer-size')].map(n => n.textContent)"
BRUSH = "[window.formvis.engine.brush.diameter, window.formvis.engine.brush.hardness]"
OPTIONS = "[...document.querySelectorAll('select[aria-label=\"Tool presets\"] option')].map(o => o.textContent)"


def test_active_layer_row_shows_its_size_and_the_scale_once_it_is_not_100_percent(page):
    # CO-0045
    page.evaluate(SETUP)
    page.wait_for_function(f"{SIZES}[0] === '300 x 200'", timeout=5000)
    assert page.evaluate("[...document.querySelectorAll('.cv-layer')].map(n => n.getAttribute('title'))")[0] == "Box (300 x 200)"
    page.evaluate("() => { const e = window.formvis.engine, l = e.activeLayer, t = l.transform; e.edit('scale', (q) => { q.updateLayer(l.id, { transform: { ...t, w: t.w / 2, h: t.h / 2 } }); return true; }); }")
    page.wait_for_function(f"{SIZES}[0] === '150 x 100 50%'", timeout=5000)


def test_tool_preset_saves_the_brush_options_and_apply_brings_them_back(page):
    # PC-EN-0540
    page.evaluate(SETUP)
    page.evaluate("window.formvis.engine.setTool('brush'); window.formvis.engine.setBrush({ diameter: 37, hardness: 0.8 })")
    page.locator(".cv-menu-btn", has_text="Window").first.click()
    page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^Tool Presets")).first.click()
    dlg = page.locator(".cv-scrim:not([hidden])").last
    dlg.locator("button", has_text="New Preset...").click()
    page.wait_for_timeout(300)
    page.keyboard.type("Thirty-seven")
    page.keyboard.press("Enter")
    page.wait_for_function(f"{OPTIONS}.includes('Thirty-seven')", timeout=5000)
    page.evaluate("window.formvis.engine.setBrush({ diameter: 5, hardness: 0.1 })")
    page.locator("select[aria-label='Tool presets'] option").first.click()
    page.locator(".cv-scrim:not([hidden]) button", has_text="Apply").last.click()
    page.wait_for_function(f"{BRUSH}[0] === 37", timeout=5000)
    assert page.evaluate(BRUSH) == [37, 0.8]
    page.locator(".cv-scrim:not([hidden]) button", has_text="Delete").last.click()
    page.wait_for_function(f"{OPTIONS}.length === 0", timeout=5000)
