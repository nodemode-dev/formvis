IN = "(sel) => { const s = document.querySelector(sel); return s ? (s.closest('.cv-props-col') ? 'side' : s.closest('.cv-layers') ? 'dock' : 'elsewhere') : null; }"
RESET = "localStorage.removeItem('sonny.dock'); localStorage.removeItem('sonny.propsOpenW'); localStorage.removeItem('sonny.dock.heights')"


def drag_head(page, sel, to_x, to_y):
    h = page.locator(f"{sel} > .cv-panel-head").bounding_box()
    page.mouse.move(h["x"] + 40, h["y"] + h["height"] / 2); page.mouse.down()
    page.mouse.move(to_x, to_y, steps=12); page.mouse.up()


def test_panels_move_between_the_columns_and_stay(page):
    try:
        page.evaluate("window.sonny.engine.newDocument(300, 200, 'D', 'white')")
        assert page.evaluate(IN, "section.cv-brushes") == "side" and page.evaluate(IN, "section.cv-navigator") == "dock"
        lay = page.locator(".cv-layers-panel").bounding_box()
        drag_head(page, "section.cv-brushes", lay["x"] + 80, lay["y"] + 2)                    # into the dock, above Layers
        assert page.evaluate(IN, "section.cv-brushes") == "dock"
        side = page.locator(".cv-props-col").bounding_box()
        drag_head(page, "section.cv-navigator", side["x"] + 100, side["y"] + side["height"] - 30)   # into the side column
        assert page.evaluate(IN, "section.cv-navigator") == "side"
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
        assert page.evaluate(IN, "section.cv-brushes") == "dock" and page.evaluate(IN, "section.cv-navigator") == "side"   # remembered
    finally:
        page.evaluate(RESET); page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")


def test_merge_and_separate_the_columns(page):
    try:
        page.evaluate("window.sonny.engine.newDocument(300, 200, 'M', 'white'); window.sonny.commands.run('merge-columns')")
        page.wait_for_timeout(200)
        assert not page.locator(".cv-props-col").is_visible()
        assert all(page.evaluate(IN, f"section.cv-{g}") == "dock" for g in ["properties", "brushes", "paragraph", "character"])
        page.evaluate("window.sonny.commands.run('merge-columns')")                          # separate
        page.wait_for_timeout(200)
        assert page.locator(".cv-props-col").is_visible() and page.evaluate(IN, "section.cv-brushes") == "side"
    finally:
        page.evaluate(RESET); page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")


def test_the_side_column_is_as_wide_as_dragged(page):
    try:
        page.evaluate("window.sonny.engine.newDocument(300, 200, 'W', 'white')")
        w0 = page.locator(".cv-props-col").bounding_box()["width"]
        g = page.locator(".cv-props-resize").bounding_box()
        page.mouse.move(g["x"] + 3, g["y"] + 200); page.mouse.down(); page.mouse.move(g["x"] - 57, g["y"] + 200, steps=6); page.mouse.up()
        w1 = page.locator(".cv-props-col").bounding_box()["width"]
        assert abs(w1 - (w0 + 60)) <= 3, (w0, w1)
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
        page.evaluate("window.sonny.engine.newDocument(300, 200, 'W2', 'white')")
        assert abs(page.locator(".cv-props-col").bounding_box()["width"] - w1) <= 3               # remembered
    finally:
        page.evaluate(RESET); page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
