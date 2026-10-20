DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def field(page, label):
    return page.locator(DLG).locator(".cv-prefs-page:not([hidden]) .cv-field", has_text=label).first


def test_preferences_performance_settings_take_effect_and_persist(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(100, 60, 'P', 'white')")
        page.locator(".cv-stage").click()
        page.keyboard.press("Control+Comma")
        assert page.locator(DLG + " .cv-dialog-title").inner_text().strip() == "Preferences"
        page.locator(DLG + " .cv-prefs-tab", has_text="History & Cache").click()   # History States moved here (1.48.1)
        states = field(page, "History States").locator("input.cv-num, input[data-numtext]")
        states.fill("3"); states.press("Tab")
        assert page.evaluate("window.formvis.engine.historyLimits.states") == 3
        page.locator(DLG + " .cv-prefs-tab", has_text="Performance").click()
        field(page, "Redraw only").locator("input").uncheck()
        assert page.evaluate("window.formvis.engine.dirtyRendering") is False
        page.locator(DLG + " .cv-dialog-foot button", has_text="Done").click()
        # six steps, but undo keeps only three
        page.evaluate("(() => { const e = window.formvis.engine; for (let i = 0; i < 6; i++) e.addLayer(); })()")
        undos = page.evaluate("(() => { const e = window.formvis.engine, p = e.current; let n = 0; while (p.history.canUndo && n < 20) { e.undo(); n++; } return n; })()")
        assert undos == 3, undos
        # kept on this device: after a reload the limit is back in effect
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        assert page.evaluate("window.formvis.engine.historyLimits.states") == 3
        assert page.evaluate("window.formvis.engine.dirtyRendering") is False
    finally:
        page.evaluate("localStorage.removeItem('formvis.prefs')")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
