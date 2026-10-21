# D06: Tab through the Brush options bar focused a hidden Preset select that escaped the bar; the whole window scrolled
# sideways and strokes landed off the document.


def test_tabbing_through_the_brush_bar_never_scrolls_the_window_sideways(page):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'B', 'white'); window.formvis.engine.setTool('brush')")
    page.wait_for_timeout(500)
    page.locator(".cv-opt-group:not([hidden]) input").first.focus()
    for _ in range(16):
        page.keyboard.press("Tab")
    assert page.evaluate("document.scrollingElement.scrollLeft") == 0
    assert page.evaluate("[...document.querySelectorAll('*')].filter((n) => n.scrollLeft > 0).length") == 0
