W = "Math.round(document.querySelector('.cv-layers').getBoundingClientRect().width)"


def test_the_right_column_collapses_to_icons_and_expands(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'D', 'white')")
        assert page.evaluate(W) == 288
        page.locator(".cv-dock-collapse").click()
        page.wait_for_function(f"{W} === 46")
        assert page.locator(".cv-dock-strip").is_visible() and not page.locator(".cv-layers > .cv-navigator").is_visible()
        page.locator(".cv-dock-strip .cv-strip-btn[data-group='layers']").click()
        fly = page.locator(".cv-dock-fly")
        assert fly.is_visible() and fly.locator(".cv-layer").count() >= 1                 # Layers, beside the strip
        page.keyboard.press("Escape")
        assert not fly.is_visible() and page.evaluate("!!document.querySelector('.cv-layers > .cv-layers-panel')")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'D2', 'white')")
        assert page.evaluate(W) == 46                                                        # remembered
        page.locator(".cv-dock-strip .cv-strip-expand").click()
        page.wait_for_function(f"{W} === 288")
        assert page.locator(".cv-layers > .cv-navigator").is_visible()
    finally:
        page.evaluate("localStorage.removeItem('formvis.dockCollapsed')")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
