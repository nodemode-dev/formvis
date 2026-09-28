OPEN = "[...document.querySelectorAll('.cv-menu')].filter((m) => !m.hidden).length"


def test_submenus_open_beside_and_run_their_commands(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'M', 'white')")
    page.locator(".cv-menu-btn", has_text="Layer").click()
    menu = page.locator(".cv-menu:not([hidden])").first
    menu.locator(".cv-menu-sub", has_text="New Adjustment Layer").hover()
    assert page.evaluate(OPEN) == 2
    rects = page.evaluate("[...document.querySelectorAll('.cv-menu')].filter((m) => !m.hidden).map((m) => m.getBoundingClientRect().left)")
    assert rects[1] > rects[0]                                  # the submenu opens to the right of its menu
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has_text="New Levels Layer").click()
    assert page.evaluate(OPEN) == 0                             # choosing closes the whole chain
    assert page.evaluate("window.formvis.engine.current.activeLayer.adjustment.kind") == "levels"
    # the command opens its settings dialog, as its ellipsis says; cancel it before going on
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="Cancel").click()
    # hovering a plain row closes an open submenu
    page.locator(".cv-menu-btn", has_text="Layer").click()
    page.locator(".cv-menu:not([hidden]) .cv-menu-sub", has_text="Arrange").hover()
    assert page.evaluate(OPEN) == 2
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has_text="Duplicate Layer").hover()
    assert page.evaluate(OPEN) == 1
    page.keyboard.press("Escape")
    assert page.evaluate(OPEN) == 0


def test_a_tall_menu_scrolls_within_a_short_window(page):
    page.set_viewport_size({"width": 1000, "height": 420})
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'M', 'white')")
    page.locator(".cv-menu-btn", has_text="Layer").click()
    m = page.evaluate("(() => { const m = [...document.querySelectorAll('.cv-menu')].find((x) => !x.hidden), r = m.getBoundingClientRect(); return { bottom: r.bottom, h: window.innerHeight, scroll: m.scrollHeight > m.clientHeight, bar: getComputedStyle(m).scrollbarWidth }; })()")
    assert m["bottom"] <= m["h"] and m["scroll"] and m["bar"] == "none", m
    page.mouse.move(300, 200)
    page.mouse.wheel(0, 400)
    page.wait_for_timeout(200)
    assert page.evaluate("[...document.querySelectorAll('.cv-menu')].find((x) => !x.hidden).scrollTop") > 0


def test_the_layer_context_menu_closes_on_a_click_outside(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'M', 'white')")
    page.locator(".cv-layer").first.click(button="right")
    assert page.evaluate(OPEN) == 1
    page.mouse.click(600, 400)
    assert page.evaluate(OPEN) == 0
