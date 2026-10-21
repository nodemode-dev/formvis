DLG = ".cv-scrim:not([hidden]) .cv-dialog"
STORED = "(() => { const p = JSON.parse(localStorage.getItem('formvis.prefs') || '{}'); return [p.historyStates, p.shiftToolSwitch]; })()"


def open_section(page, name):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(f"{DLG} .cv-prefs-railtab[data-section='{name}']").click()
    page.wait_for_timeout(300)


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(500)


def reset(page):
    page.evaluate("for (const k of Object.keys(localStorage)) if (k.startsWith('formvis.')) localStorage.removeItem(k)")
    reload(page)


def layer_count_after_undoing_everything(page):
    page.evaluate("window.formvis.engine.newDocument(100, 80, 'H', 'white')")
    page.evaluate("for (let i = 0; i < 6; i++) window.formvis.engine.addLayer({ name: 'L' + i })")
    page.evaluate("for (let i = 0; i < 12; i++) window.formvis.engine.undo()")
    return page.evaluate("window.formvis.engine.current.doc.layers.length")


def test_history_states_limits_how_many_steps_undo_keeps_and_is_kept_after_a_reload(page):
    try:
        assert layer_count_after_undoing_everything(page) == 1
        open_section(page, "History & Cache")
        box = page.locator(f"{DLG} input[aria-label='History States value']")
        box.fill("3")
        box.press("Tab")
        page.keyboard.press("Escape")
        assert page.evaluate(STORED)[0] == 3
        assert layer_count_after_undoing_everything(page) == 4
        reload(page)
        assert page.evaluate(STORED)[0] == 3
        assert layer_count_after_undoing_everything(page) == 4
        open_section(page, "History & Cache")
        assert page.locator(f"{DLG} input[aria-label='History States value']").input_value() == "3"
        page.keyboard.press("Escape")
    finally:
        reset(page)


def test_use_shift_key_for_tool_switch_changes_which_key_cycles_a_tool_group_and_is_kept_after_a_reload(page):
    try:
        page.evaluate("window.formvis.engine.newDocument(100, 80, 'T', 'white')")
        page.keyboard.press("b")
        first = page.evaluate("window.formvis.engine.tool")
        page.keyboard.press("b")
        assert page.evaluate("window.formvis.engine.tool") == first
        page.keyboard.press("Shift+b")
        cycled = page.evaluate("window.formvis.engine.tool")
        assert cycled != first
        open_section(page, "Tools")
        row = page.locator(f"{DLG} label:has-text('Use Shift Key for Tool Switch') input")
        assert row.is_checked()
        row.uncheck()
        page.keyboard.press("Escape")
        assert page.evaluate(STORED)[1] is False
        page.evaluate("window.formvis.engine.setTool('move')")
        page.keyboard.press("b")
        start = page.evaluate("window.formvis.engine.tool")
        page.keyboard.press("b")
        assert page.evaluate("window.formvis.engine.tool") != start
        page.keyboard.press("Shift+b")
        reload(page)
        assert page.evaluate(STORED)[1] is False
        open_section(page, "Tools")
        assert not page.locator(f"{DLG} label:has-text('Use Shift Key for Tool Switch') input").is_checked()
        page.keyboard.press("Escape")
    finally:
        reset(page)
