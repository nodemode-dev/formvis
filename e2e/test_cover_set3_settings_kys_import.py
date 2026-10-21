import json

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
LOCKED = "window.formvis.engine.view.guidesLocked"


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(600)


def prefs(page):
    return json.loads(page.evaluate("localStorage.getItem('formvis.prefs') || '{}'"))


def import_file(page, name, text):
    page.evaluate("window.formvis.commands.run('shortcuts')")
    page.wait_for_timeout(400)
    with page.expect_file_chooser() as chooser:
        page.locator(f"{DLG} button", has_text="Import KYS").click()
    chooser.value.set_files(files=[{"name": name, "mimeType": "text/plain", "buffer": text.encode("utf-8")}])
    page.wait_for_timeout(800)


def test_importing_a_kys_file_maps_its_shortcuts_makes_them_work_and_keeps_them_after_a_reload(page):
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)
    try:
        import_file(page, "my_keys.kys", "Lock Guides\tCtrl+Alt+7\n")
        saved = prefs(page)
        assert saved["shortcuts"]["lock-guides"] == ["Alt+Mod+7"]
        assert len(saved["shortcutSets"]) == 1
        assert list(saved["shortcutSets"].values())[0]["lock-guides"] == ["Alt+Mod+7"]
        assert "Imported" in page.locator(DLG).inner_text()
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'K', 'white')")
        page.wait_for_timeout(500)
        before = page.evaluate(LOCKED)
        page.keyboard.press("Control+Alt+7")
        page.wait_for_timeout(300)
        assert page.evaluate(LOCKED) is not before
        page.keyboard.press("Control+Alt+7")
        page.wait_for_timeout(300)
        assert page.evaluate(LOCKED) is before
        reload(page)
        assert prefs(page)["shortcuts"]["lock-guides"] == ["Alt+Mod+7"]
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'K', 'white')")
        page.wait_for_timeout(500)
        page.keyboard.press("Control+Alt+7")
        page.wait_for_timeout(300)
        assert page.evaluate(LOCKED) is not before
    finally:
        page.evaluate("localStorage.removeItem('formvis.prefs')")
        reload(page)


def test_a_kys_file_with_no_matching_command_imports_nothing_and_says_so(page):
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)
    try:
        import_file(page, "nothing.kys", "Not A Real Command\tCtrl+Alt+8\n")
        assert "shortcutSets" not in prefs(page) or prefs(page)["shortcutSets"] == {}
        assert "No command in that file matched" in page.locator(DLG).inner_text()
        page.keyboard.press("Escape")
    finally:
        page.evaluate("localStorage.removeItem('formvis.prefs')")
        reload(page)
