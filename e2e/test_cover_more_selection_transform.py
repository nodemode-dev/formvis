RECT = "(() => { const s = window.formvis.engine.current.selection; return s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null; })()"
SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 160, 'M', 'white'); e.setTool('marquee'); if (e.tool !== 'marquee') throw new Error('tool');
  const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""


def drag_marquee(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(60, 50))
    page.mouse.down()
    page.mouse.move(*at(90, 80), steps=6)
    page.mouse.move(*at(100, 90), steps=6)
    page.mouse.up()
    page.wait_for_function("window.formvis.engine.current.selection")


def pick(page, menu, item):
    page.locator(".cv-menu-btn", has_text=menu).click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has_text=item).first.click()


def test_transform_selection_numerically_moves_and_scales_the_outline_and_one_undo_restores_it(page):
    drag_marquee(page)
    before = page.evaluate(RECT)
    assert before["w"] > 20 and before["h"] > 15
    pick(page, "Select", "Transform Selection Numerically")
    dlg = page.locator(".cv-dialog", has_text="Transform Selection").filter(has=page.locator("input[type=number]"))
    dlg.wait_for(state="visible")
    for label, value in (("Move X (px)", "25"), ("Width (%)", "200")):
        dlg.locator(f"xpath=.//*[normalize-space(text())='{label}']/following::input[1]").fill(value)
    dlg.get_by_role("button", name="OK").click()
    dlg.wait_for(state="hidden")
    after = page.evaluate(RECT)
    assert abs(after["w"] - before["w"] * 2) <= 2, (before, after)
    assert abs(after["h"] - before["h"]) <= 2, (before, after)
    assert abs((after["x"] + after["w"] / 2) - (before["x"] + before["w"] / 2 + 25)) <= 2, (before, after)
    cx, cy = int(after["x"] + after["w"] / 2), int(after["y"] + after["h"] / 2)
    assert page.evaluate("([x, y]) => window.formvis.engine.current.selection.valueAt(x, y)", [cx, cy]) > 0
    page.keyboard.press("Control+z")
    assert page.evaluate(RECT) == before


def test_transform_selection_from_the_select_menu_shows_handles_and_escape_leaves_the_outline_unchanged(page):
    drag_marquee(page)
    before = page.evaluate(RECT)
    pick(page, "Select", "Transform Selection")
    page.wait_for_function("window.formvis.engine.floatSel")
    page.keyboard.press("Escape")
    page.wait_for_function("!window.formvis.engine.floatSel")
    assert page.evaluate(RECT) == before
