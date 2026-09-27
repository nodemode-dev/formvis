H = "(id) => Math.round(document.querySelector('.cv-' + id).getBoundingClientRect().height)"
CARD = "document.querySelector('.cv-nav-card').getBoundingClientRect().height"


def drag(page, target, dy):
    s = page.locator(f".cv-dock-split[data-target='{target}']").bounding_box()
    page.mouse.move(s["x"] + s["width"] / 2, s["y"] + s["height"] / 2); page.mouse.down()
    page.mouse.move(s["x"] + s["width"] / 2, s["y"] + s["height"] / 2 + dy, steps=8); page.mouse.up()


def test_groups_resize_by_their_splitters_and_keep_their_size(page):
    try:
        page.evaluate("window.sonny.engine.newDocument(300, 200, 'R', 'white')")
        nav0, card0, lay0 = page.evaluate(H, "navigator"), page.evaluate(CARD), page.evaluate(H, "layers-panel")
        drag(page, "navigator", 80)                                                            # a taller Navigator
        nav1 = page.evaluate(H, "navigator")
        assert abs(nav1 - (nav0 + 80)) <= 4, (nav0, nav1)
        assert page.evaluate(CARD) > card0 + 60                                                # its preview grows
        assert page.evaluate(H, "layers-panel") < lay0                                         # Layers takes what is left
        drag(page, "swatches", -40)                                                            # a shorter Swatches
        sw = page.evaluate(H, "swatches")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
        page.evaluate("window.sonny.engine.newDocument(300, 200, 'R2', 'white')")
        assert abs(page.evaluate(H, "navigator") - nav1) <= 2 and abs(page.evaluate(H, "swatches") - sw) <= 2   # remembered
        page.locator(".cv-dock-split[data-target='navigator']").dblclick()                    # its own height again
        assert abs(page.evaluate(H, "navigator") - nav0) <= 2
    finally:
        page.evaluate("localStorage.removeItem('sonny.dock.heights')")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
