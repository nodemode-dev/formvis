SLOT = ".cv-rail-tools .cv-tool[aria-label='{}']"
FLY = "[...document.querySelectorAll('.cv-flyout:not([hidden]) .cv-flyout-label')].map((x) => x.textContent)"


def test_rail_groups_tools_with_flyouts_and_keys(page):
    page.evaluate("window.sonny.engine.newDocument(200, 100, 'R', 'white')")
    slots = page.evaluate("[...document.querySelectorAll('.cv-rail-tools .cv-tool')].map((b) => [b.getAttribute('aria-label'), b.getBoundingClientRect().bottom <= window.innerHeight])")
    assert len(slots) == 18 and all(ok for _, ok in slots), slots
    assert page.evaluate("document.querySelector(\"" + SLOT.format("Spot Healing") + "\").classList.contains('has-group')")
    # right-click opens the group; choosing one switches to it and the slot shows it
    page.locator(SLOT.format("Pen")).click(button="right")
    assert page.evaluate(FLY) == ["Pen", "Freeform Pen", "Curvature Pen"]
    page.locator(".cv-flyout-item", has_text="Curvature Pen").click()
    assert page.evaluate("window.sonny.engine.tool") == "curvaturePen"
    assert page.evaluate("document.querySelectorAll('.cv-flyout:not([hidden])').length") == 0
    assert page.locator(SLOT.format("Curvature Pen")).count() == 1
    # the key picks the slot's last tool; Shift with it cycles the group
    page.keyboard.press("b")
    page.keyboard.press("p")
    assert page.evaluate("window.sonny.engine.tool") == "curvaturePen"
    page.keyboard.press("Shift+P")
    assert page.evaluate("window.sonny.engine.tool") == "pen"
    # press and hold opens the flyout without choosing the slot's tool
    before = page.evaluate("window.sonny.engine.tool")
    box = page.locator(SLOT.format("Gradient")).bounding_box()
    page.mouse.move(box["x"] + 10, box["y"] + 10); page.mouse.down(); page.wait_for_timeout(500); page.mouse.up()
    assert page.evaluate(FLY) == ["Gradient", "Paint Bucket"]
    assert page.evaluate("window.sonny.engine.tool") == before
    page.keyboard.press("Escape")
    assert page.evaluate("document.querySelectorAll('.cv-flyout:not([hidden])').length") == 0
    # the choice is kept: after a reload the Pen slot still shows the Pen chosen last
    page.reload()
    page.wait_for_function("window.sonny && window.sonny.engine")
    assert page.locator(SLOT.format("Pen")).count() == 1


def test_the_rail_scrolls_in_a_short_window(page):
    page.set_viewport_size({"width": 1000, "height": 460})
    page.evaluate("window.sonny.engine.newDocument(200, 100, 'R', 'white')")
    r = page.evaluate("(() => { const b = document.querySelector('.cv-rail-tools'); return [b.scrollHeight > b.clientHeight, getComputedStyle(b).scrollbarWidth, b.getBoundingClientRect().bottom <= window.innerHeight]; })()")
    assert r == [True, "none", True], r
