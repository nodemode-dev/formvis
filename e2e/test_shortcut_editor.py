# Edit > Keyboard Shortcuts (1.53.4): rebinding by pressing keys, a conflict named and reassigned, Reset All, kept.
from e2e.conftest import open_app

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
KEYS = "(id) => window.formvis.commands.get(id).keys"


def open_editor(page):
    page.evaluate("window.formvis.commands.run('shortcuts')")
    page.locator(DLG, has_text="Keyboard Shortcuts").wait_for()


def change(page, command, combo):
    page.locator(f"{DLG} .cv-keys-row[data-command='{command}'] button", has_text="Change").click()
    page.keyboard.press(combo)


def test_rebind_conflict_reset_and_keep(context):
    page = context.new_page()
    open_app(page)
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'K', 'white')")
    open_editor(page)
    change(page, "duplicate", "Control+Shift+D")
    assert page.evaluate(KEYS, "duplicate") == ["Shift+Mod+D"]
    assert page.evaluate("JSON.parse(localStorage.getItem('formvis.prefs')).shortcuts.duplicate") == ["Shift+Mod+D"]   # saved
    page.keyboard.press("Escape")
    page.locator(DLG).wait_for(state="hidden")
    n = page.evaluate("window.formvis.engine.current.doc.layers.length")
    page.keyboard.press("Control+Shift+D")
    page.wait_for_function(f"window.formvis.engine.current.doc.layers.length === {n + 1}")      # the new keys work
    open_editor(page)
    change(page, "duplicate", "Control+z")
    note = page.locator(f"{DLG} .cv-shortcuts-note")
    assert "is used by Undo" in note.inner_text()
    note.get_by_role("button", name="Reassign").click()
    assert page.evaluate(KEYS, "duplicate") == ["Mod+Z"] and "Mod+Z" not in page.evaluate(KEYS, "undo")
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="Reset All").click()
    assert page.evaluate(KEYS, "duplicate") == ["Mod+J"] and "Mod+Z" in page.evaluate(KEYS, "undo")
    change(page, "flatten", "Control+Alt+F")
    page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
    assert page.evaluate(KEYS, "flatten") == ["Alt+Mod+F"]                                        # kept across a reload
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    page.close()   # not left open to share saved settings with the tests after it
