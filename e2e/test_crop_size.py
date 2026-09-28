SETUP = """() => { const e = window.formvis.engine; e.newDocument(400, 300, 'S', 'white'); e.setTool('crop');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""
BAR = ".cv-opt-group:not([hidden])"
DOC = "(() => { const d = window.formvis.engine.current.doc; return [d.width, d.height, d.resolution]; })()"


def num(page, label, v):
    i = page.locator(f"{BAR} .cv-opt:not([hidden])", has_text=label).locator("input[type=number]").first
    i.fill(str(v)); i.press("Tab")


def test_crop_to_width_height_resolution_with_presets(page):
    try:
        s = page.evaluate(SETUP)
        page.locator(BAR).get_by_role("button", name="W × H × Res").click()
        page.wait_for_function("[...document.querySelectorAll('.cv-opt-group:not([hidden]) .cv-opt:not([hidden])')].some((o) => o.textContent.trim().startsWith('W') && o.querySelector('input') && o.querySelector('input').value === '400')")
        num(page, "W", 2); num(page, "H", 1)
        page.locator(BAR).get_by_role("button", name="in", exact=True).click()
        num(page, "Resolution", 100)
        at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
        page.mouse.move(*at(0, 0)); page.mouse.down(); page.mouse.move(*at(400, 300), steps=6); page.mouse.up()
        page.keyboard.press("Enter")
        assert page.evaluate(DOC) == [200, 100, 100], page.evaluate(DOC)       # 2 by 1 in at 100 ppi
        page.evaluate("window.formvis.engine.undo()")
        assert page.evaluate(DOC) == [400, 300, 72], page.evaluate(DOC)        # one undo step
        # save the size as a preset, change it, choose the preset back, then delete it
        page.locator(BAR).get_by_role("button", name="New Crop Preset").click()
        page.locator(BAR).get_by_role("button", name="px", exact=True).click()
        sel = page.locator(f"{BAR} .cv-opt", has_text="Preset").locator("select")
        page.wait_for_function("[...document.querySelectorAll('.cv-opt-group:not([hidden]) select option')].some((o) => o.textContent === '2 × 1 in at 100 ppi')")
        sel.select_option(label="2 × 1 in at 100 ppi")
        page.wait_for_function("[...document.querySelectorAll('.cv-opt-group:not([hidden]) .cv-seg button.is-active')].some((b) => b.textContent === 'in')")
        page.locator(BAR).get_by_role("button", name="Delete Crop Preset").click()
        page.wait_for_function("![...document.querySelectorAll('.cv-opt-group:not([hidden]) select option')].some((o) => o.textContent === '2 × 1 in at 100 ppi')")
    finally:
        page.evaluate("localStorage.removeItem('formvis.cropPresets')")
