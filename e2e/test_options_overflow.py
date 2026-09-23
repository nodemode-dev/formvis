EDGES = "[...document.querySelectorAll('.cv-options-edge')].map((b) => !b.hidden)"
SCROLL = "document.querySelector('.cv-options').scrollLeft"


def test_an_overflowing_options_bar_can_be_scrolled_to_its_last_setting(page):
    page.set_viewport_size({"width": 1000, "height": 700})
    page.evaluate("(() => { const e = window.sonny.engine; e.newDocument(200, 100, 'O', 'white'); e.setTool('move'); })()")
    page.wait_for_timeout(200)
    assert page.evaluate(EDGES) == [False, True]              # settings lie past the right end only
    page.locator(".cv-options-edge.is-end").click()
    page.wait_for_timeout(600)
    assert page.evaluate(SCROLL) > 0 and page.evaluate(EDGES)[0]
    # a plain vertical wheel over the bar scrolls it sideways, to the end
    box = page.locator(".cv-options").bounding_box()
    page.mouse.move(box["x"] + 200, box["y"] + box["height"] / 2)
    for _ in range(10): page.mouse.wheel(0, 400)
    page.wait_for_timeout(300)
    assert page.evaluate(EDGES)[1] is False                   # at the end: no more to the right
    last = page.evaluate("(() => { const g = document.querySelector('.cv-opt-group:not([hidden])'), k = g.lastElementChild.getBoundingClientRect(); return k.right <= window.innerWidth; })()")
    assert last
    # a tool whose settings fit shows no chevrons
    page.evaluate("window.sonny.engine.setTool('hand')")
    page.wait_for_timeout(200)
    assert page.evaluate(EDGES) == [False, False]
