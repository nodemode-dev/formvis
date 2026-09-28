MENU = "[...document.querySelectorAll('.cv-menu')].find((m) => !m.hidden)"


def items(page):
    return page.evaluate(f"(() => {{ const m = {MENU}; return m ? [...m.querySelectorAll('.cv-menu-label')].map((l) => l.textContent) : []; }})()")


def choose(page, label):
    page.locator(".cv-menu:not([hidden]) .cv-menu-item", has_text=label).first.click()


def test_navigator_and_swatches_menus_run_their_commands(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(800, 600, 'M', 'white'); window.formvis.engine.zoomTo(2)")
        page.locator(".cv-navigator .cv-group-more").click()
        assert {"Zoom In", "Zoom Out", "Fit on Screen"} <= set(items(page)), items(page)
        choose(page, "Fit on Screen")
        assert page.evaluate("window.formvis.engine.current.viewport.fitted") is True
        n = page.locator(".cv-swatch-grid .cv-sw-tile:not(.cv-sw-add)").count()
        page.evaluate("window.formvis.engine.setColors({ r: 17, g: 34, b: 51 }, undefined)")
        page.locator(".cv-swatches .cv-group-more").click()
        choose(page, "Add Foreground Color to Swatches")
        assert page.locator(".cv-swatch-grid .cv-sw-tile:not(.cv-sw-add)").count() == n + 1
        page.locator(".cv-swatches .cv-group-more").click()
        choose(page, "Reset Swatches")
        assert page.locator(".cv-swatch-grid .cv-sw-tile:not(.cv-sw-add)").count() == 47
    finally:
        page.evaluate("localStorage.removeItem('formvis.swatches')")


def test_the_layers_menu_follows_its_tab_and_groups_without_commands_have_none(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'L', 'white')")
    n = page.evaluate("window.formvis.engine.current.doc.layers.length")
    page.locator(".cv-layers-panel > .cv-panel-head .cv-group-more").click()
    choose(page, "New Layer")
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == n + 1
    page.locator(".cv-layers-panel .cv-group-tab[data-tab='paths']").click()
    page.locator(".cv-layers-panel > .cv-panel-head .cv-group-more").click()
    assert "New Path" in items(page) and "New Layer" not in items(page)
    page.keyboard.press("Escape")
    page.locator(".cv-layers-panel .cv-group-tab[data-tab='layers']").click()
    assert not page.locator(".cv-paragraph .cv-group-more").is_visible()
