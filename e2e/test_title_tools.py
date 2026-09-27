ORDER = "[...document.querySelectorAll('.cv-layers > section')].filter((s) => !s.hidden).map((s) => s.className.split(' ')[0].replace('cv-', ''))"
THEME = "JSON.parse(localStorage.getItem('nodemode_ui_settings') || '{}').theme"


def test_the_theme_toggle_switches_light_and_back(page):
    try:
        tools = page.locator(".cv-title-tools")
        tools.locator("button[aria-label='Light or dark']").click()
        assert page.evaluate(THEME) == "light"
        assert page.evaluate("document.body.classList.contains('theme-light')")
        tools.locator("button[aria-label='Light or dark']").click()
        assert page.evaluate(THEME) == "studio"
    finally:
        page.evaluate("localStorage.removeItem('nodemode_ui_settings')")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")


def test_search_finds_and_runs_a_command(page):
    page.evaluate("window.sonny.engine.newDocument(800, 600, 'S', 'white')")
    page.evaluate("window.sonny.engine.zoomTo(2)")
    page.locator(".cv-title-tools button[aria-label='Search commands']").click()
    field = page.locator(".cv-search-input")
    assert field.is_visible()
    field.fill("fit on")
    assert page.locator(".cv-search-item.is-picked").inner_text().startswith("Fit on Screen")
    field.press("Enter")
    assert page.evaluate("window.sonny.engine.current.viewport.fitted") is True        # it ran
    assert not field.is_visible()                                                      # and closed
    page.locator(".cv-title-tools button[aria-label='Search commands']").click()
    page.keyboard.press("Escape")
    assert not field.is_visible()


def test_workspaces_arrange_the_panels_and_the_lock_holds_them(page):
    try:
        page.evaluate("window.sonny.engine.newDocument(200, 100, 'W', 'white')")
        def choose(label):                                                           # through the target's menu, as a user
            page.locator(".cv-title-tools .cv-dd-btn").click()
            page.locator(".cv-dd-pop:not([hidden]) .cv-dd-item", has_text=label).click()
        heads = None
        page.locator(".cv-title-tools .cv-dd-btn").click()
        heads = page.locator(".cv-dd-pop:not([hidden]) .cv-dd-head").all_inner_texts()
        items = page.locator(".cv-dd-pop:not([hidden]) .cv-dd-item").all_inner_texts()
        page.keyboard.press("Escape")
        assert heads == ["BUILT-IN"] and items == ["Essentials", "Photography", "Painting", "Graphic and Web", "Motion"], (heads, items)
        choose("Photography")
        assert "swatches" not in page.evaluate(ORDER)
        choose("Essentials")
        assert page.evaluate(ORDER) == ["navigator", "swatches", "layers-panel", "timeline", "history"]
        # Locked, a drag does not move a panel; unlocked, it does.
        lock = page.locator(".cv-title-tools button[aria-label='Lock the workspace']")
        lock.click()
        assert page.locator(".cv-title-tools button[aria-label='Unlock the workspace']").count() == 1

        def drag_history_up():
            h = page.locator(".cv-history .cv-panel-head").bounding_box()
            t = page.locator(".cv-timeline .cv-panel-head").bounding_box()
            page.mouse.move(h["x"] + 60, h["y"] + h["height"] / 2); page.mouse.down()
            page.mouse.move(t["x"] + 60, t["y"] + 2, steps=12); page.mouse.up()
        drag_history_up()
        assert page.evaluate(ORDER)[-2:] == ["timeline", "history"]                   # held
        page.locator(".cv-title-tools button[aria-label='Unlock the workspace']").click()
        drag_history_up()
        assert page.evaluate(ORDER)[-2:] == ["history", "timeline"]                   # moved
    finally:
        page.evaluate("localStorage.removeItem('sonny.dock'); localStorage.removeItem('sonny.lock'); localStorage.removeItem('sonny.workspace')")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")


def test_the_blend_list_is_grouped_searchable_and_sets_the_mode(page):
    page.evaluate("window.sonny.engine.newDocument(200, 100, 'B', 'white'); window.sonny.engine.addLayer()")
    page.locator(".cv-layer-blendrow .cv-dd-btn").click()
    pop = page.locator(".cv-dd-pop:not([hidden])")
    assert pop.locator(".cv-dd-head").all_inner_texts() == ["BASIC", "DARKEN", "LIGHTEN", "CONTRAST", "INVERSION", "COMPONENT"]   # small capitals, as shown
    assert pop.locator(".cv-dd-item.is-chosen").inner_text() == "Normal"
    page.keyboard.type("multi")
    page.keyboard.press("Enter")
    assert page.evaluate("window.sonny.engine.activeLayer.blend") == "multiply"
    assert page.locator(".cv-layer-blendrow .cv-dd-btn").inner_text() == "Multiply"
