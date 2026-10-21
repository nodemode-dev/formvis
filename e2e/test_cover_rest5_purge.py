def test_purge_working_files_forgets_closed_tabs_so_reopen_closed_tab_has_nothing_and_says_what_went(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(30, 30, 'Gone', 'white'); e.newDocument(30, 30, 'Stay', 'white'); }")
    n = page.evaluate("window.formvis.engine.projects.length")
    page.evaluate("window.formvis.commands.run('close-tab')")
    page.wait_for_timeout(800)
    dialog = page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button")
    if dialog.count():
        dialog.filter(has_text="Don't Save").or_(dialog.filter(has_text="Discard")).first.click()
        page.wait_for_timeout(600)
    assert page.evaluate("window.formvis.engine.projects.length") == n - 1
    can = "(() => { const c = window.formvis.commands.get('reopen-closed-tab'); return window.formvis.commands.enabled(c); })()"
    assert page.evaluate(can) is True
    page.evaluate("window.formvis.commands.run('clean-working-files')")
    page.wait_for_selector("text=/Cleaned \\d+ recovery cop(y|ies) and 1 closed tab/", timeout=4000)
    assert page.evaluate(can) is False
