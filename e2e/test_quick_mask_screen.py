SEL = "(([x, y]) => { const s = window.sonny.engine.current.selection; if (!s) return null; return x < s.x || y < s.y || x >= s.x + s.w || y >= s.y + s.h ? 0 : s.data[(y - s.y) * s.w + (x - s.x)]; })"
TINT = """(([x, y]) => { const e = window.sonny.engine, v = e.current.viewport, o = document.querySelector('.cv-overlay-canvas'), d = o.width / o.clientWidth, p = v.toScreen(x, y);
  return Array.from(o.getContext('2d').getImageData(Math.round(p.x * d), Math.round(p.y * d), 1, 1).data); })"""


def test_quick_mask_paints_the_selection_and_undoes(page):
    page.evaluate("window.sonny.engine.newDocument(300, 200, 'Q', 'white'); window.sonny.engine.deselect()")
    page.keyboard.press("q")
    assert page.evaluate("window.sonny.engine.quickMask") is True
    assert "is-on" in page.locator(".cv-rail [data-cmd='quick-mask']").get_attribute("class")
    page.evaluate("""() => { const e = window.sonny.engine; e.setTool('brush'); e.setBrushMode('paint'); e.fg = { r: 0, g: 0, b: 0 }; e.setBrush({ diameter: 30, hardness: 1 });
      e.beginStroke({ x: 20, y: 100 }, false, 1); for (let i = 1; i <= 26; i++) e.strokeTo({ x: 20 + i * 10, y: 100 }, 1); e.endStroke(); }""")
    assert page.evaluate(SEL, [150, 100]) == 0 and page.evaluate(SEL, [150, 20]) == 255       # black took the stroke away
    page.wait_for_timeout(200)
    tint = page.evaluate(TINT, [150, 100])
    assert tint[0] > 100 and tint[1] < 60 and tint[3] > 60, tint                            # shown red where not selected
    assert page.evaluate("window.sonny.engine.historySteps.names.slice(-1)[0]") == "Quick Mask"
    page.keyboard.press("Control+z")
    assert page.evaluate("window.sonny.engine.current.selection") is None                    # the stroke undone
    page.keyboard.press("q")
    assert page.evaluate("window.sonny.engine.quickMask") is False


def test_screen_modes_tab_and_the_two_column_rail(page):
    try:
        page.evaluate("window.sonny.engine.newDocument(300, 200, 'S', 'white')")
        stage0 = page.evaluate("document.querySelector('.cv-stage').getBoundingClientRect().width")
        page.keyboard.press("f")
        assert not page.locator(".cv-doc-tabs").is_visible() and page.locator(".cv-titlebar").is_visible()
        page.keyboard.press("f")
        assert not page.locator(".cv-titlebar").is_visible() and not page.locator(".cv-layers").is_visible()
        page.keyboard.press("Escape")
        assert page.locator(".cv-titlebar").is_visible() and page.locator(".cv-doc-tabs").is_visible()
        page.keyboard.press("Tab")
        page.wait_for_timeout(200)
        assert not page.locator(".cv-layers").is_visible() and not page.locator(".cv-rail").is_visible()
        assert page.evaluate("document.querySelector('.cv-stage').getBoundingClientRect().width") > stage0 + 300   # the canvas takes the room
        page.keyboard.press("Tab")
        assert page.locator(".cv-layers").is_visible()
        w0 = page.evaluate("document.querySelector('.cv-rail').getBoundingClientRect().width")
        page.locator(".cv-rail-toggle").click()
        assert page.evaluate("document.querySelector('.cv-rail').getBoundingClientRect().width") > w0 + 20
        page.locator(".cv-rail-toggle").click()
        assert abs(page.evaluate("document.querySelector('.cv-rail').getBoundingClientRect().width") - w0) < 1
    finally:
        page.evaluate("localStorage.removeItem('sonny.railDouble')")
