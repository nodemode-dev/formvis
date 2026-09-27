WIDTH = "Math.round(document.querySelector('.cv-props-col').getBoundingClientRect().width)"


def test_the_column_collapses_to_icons_opens_a_flyout_and_expands(page):
    try:
        page.evaluate("window.sonny.engine.newDocument(300, 200, 'S', 'white')")
        assert page.evaluate(WIDTH) == 284
        page.locator(".cv-group-collapse").click()
        page.wait_for_function(f"{WIDTH} === 46")
        assert page.locator(".cv-props-strip").is_visible() and not page.locator(".cv-props-col > .cv-brushes").is_visible()
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
        page.evaluate("window.sonny.engine.newDocument(300, 200, 'S2', 'white')")
        assert page.evaluate(WIDTH) == 46                                                   # remembered
        page.locator(".cv-strip-btn[data-group='brushes']").click()
        fly = page.locator(".cv-props-fly")
        assert fly.is_visible() and fly.locator(".cv-brush-tip").is_visible()               # the group, beside the strip
        page.keyboard.press("Escape")
        assert not fly.is_visible()
        assert page.evaluate("!!document.querySelector('.cv-props-col > .cv-brushes')")    # back in its place
        page.locator(".cv-strip-expand").click()
        page.wait_for_function(f"{WIDTH} === 284")
        assert page.locator(".cv-props-col > .cv-brushes").is_visible()
    finally:
        page.evaluate("localStorage.removeItem('sonny.propsColCollapsed')")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
