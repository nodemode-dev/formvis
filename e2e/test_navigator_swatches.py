NEW_DOC = "window.sonny.engine.newDocument(800, 600, 'N', 'white')"
ZOOM = "window.sonny.engine.current.viewport.zoom"


def test_the_navigator_zooms_and_moves_the_view(page):
    page.evaluate(NEW_DOC)
    nav = page.locator(".cv-navigator")
    nav.locator("button", has_text="100%").click()
    assert page.evaluate(ZOOM) == 1
    nav.locator("button", has_text="200%").click()
    assert page.evaluate(ZOOM) == 2
    nav.locator("button", has_text="Fit").click()
    assert page.evaluate("window.sonny.engine.current.viewport.fitted") is True
    # The slider: its middle is well above the fitted zoom here.
    before = page.evaluate(ZOOM)
    page.locator(".cv-navigator input[type=range]").evaluate("(s) => { s.value = '800'; s.dispatchEvent(new Event('input', { bubbles: true })); }")
    assert page.evaluate(ZOOM) > before * 2
    # A click in the preview moves the view: its centre goes to that point of the document.
    page.wait_for_timeout(300)
    box = page.locator(".cv-nav-preview").bounding_box()
    pan = page.evaluate("[window.sonny.engine.current.viewport.panX, window.sonny.engine.current.viewport.panY]")
    page.mouse.click(box["x"] + box["width"] * 0.2, box["y"] + box["height"] * 0.3)
    assert page.evaluate("[window.sonny.engine.current.viewport.panX, window.sonny.engine.current.viewport.panY]") != pan


def test_swatches_lay_out_as_a_grid_and_set_the_colours(page):
    try:
        page.evaluate("localStorage.removeItem('sonny.swatches')")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
        page.evaluate(NEW_DOC)
        tiles = page.locator(".cv-swatches .cv-sw-tile:not(.cv-sw-add)")
        assert tiles.count() == 47
        lefts = page.evaluate("[...document.querySelectorAll('.cv-swatches .cv-sw-tile')].map((t) => Math.round(t.getBoundingClientRect().left))")
        assert len(set(lefts)) > 10, lefts                              # laid out in a grid, not stacked in one place
        page.locator(".cv-swatches .cv-sw-tile[title='#ea3323']").click()
        assert page.evaluate("window.sonny.engine.fg") == {"r": 234, "g": 51, "b": 35}
        page.locator(".cv-swatches .cv-sw-tile[title='#377ef7']").click(modifiers=["Alt"])
        assert page.evaluate("window.sonny.engine.bg") == {"r": 55, "g": 126, "b": 247}
        page.evaluate("window.sonny.engine.setColors({ r: 1, g: 2, b: 3 })")
        page.locator(".cv-swatches .cv-sw-add").click()
        assert tiles.count() == 48 and page.locator(".cv-swatches .cv-sw-tile[title='#010203']").count() == 1
        page.locator(".cv-swatches .cv-sw-tile[title='#010203']").click(button="right")
        assert tiles.count() == 47
        # Color: a drag in the square sets the foreground.
        page.locator(".cv-swatches .cv-group-tab", has_text="Color").click()
        page.wait_for_timeout(100)
        box = page.locator(".cv-color-sv").bounding_box()
        page.mouse.click(box["x"] + box["width"] * 0.9, box["y"] + box["height"] * 0.1)
        assert page.evaluate("window.sonny.engine.fg") != {"r": 1, "g": 2, "b": 3}
        page.locator(".cv-swatches .cv-group-tab", has_text="Swatches").click()
    finally:
        page.evaluate("localStorage.removeItem('sonny.swatches'); localStorage.removeItem('sonny.groups')")
