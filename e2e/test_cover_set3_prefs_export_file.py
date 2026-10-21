import json

import pytest

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def reload(page):
    page.reload()
    page.wait_for_function("window.formvis && window.formvis.engine")
    page.wait_for_timeout(600)


def stored(page):
    return json.loads(page.evaluate("localStorage.getItem('formvis.prefs') || '{}'"))


def open_section(page, section):
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(f"{DLG} .cv-prefs-railtab[data-section='{section}']").click()
    page.wait_for_timeout(250)


def box(page, label):
    return page.locator(f"{DLG} label", has_text=label).locator("input[type=checkbox]").first


def flip(page, section, label):
    open_section(page, section)
    box(page, label).click()
    page.wait_for_timeout(250)
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)


@pytest.fixture()
def clean(page):
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)
    yield
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)


ROWS = [
    ("General", "Export Clipboard to the System", "exportClipboard", True),
    ("File Handling", "Write EXIF Color Space Tag", "exifColourTag", False),
    ("File Handling", "Ask Before Saving Layered TIFF Files", "askLayeredTiff", True),
    ("File Handling", "Use Lower Case Extension", "lowerExtension", True),
    ("File Handling", "Save in Background", "saveInBackground", True),
]


@pytest.mark.parametrize("section,label,key,default", ROWS)
def test_export_and_file_handling_boxes_change_the_saved_preference_and_are_kept_after_a_reload(page, clean, section, label, key, default):
    open_section(page, section)
    assert box(page, label).is_checked() is default
    page.keyboard.press("Escape")
    flip(page, section, label)
    assert stored(page)[key] is (not default)
    reload(page)
    assert stored(page)[key] is (not default)
    open_section(page, section)
    assert box(page, label).is_checked() is (not default)
    page.keyboard.press("Escape")


def export_name(page):
    page.evaluate("window.formvis.engine.newDocument(200, 120, 'E', 'white')")
    page.wait_for_timeout(600)
    with page.expect_download(timeout=15000) as d:
        page.evaluate("window.formvis.commands.run('export-png')")
    return d.value.suggested_filename


def test_use_lower_case_extension_names_the_exported_file_with_a_small_or_capital_extension(page, clean):
    assert export_name(page) == "E.png"
    flip(page, "File Handling", "Use Lower Case Extension")
    assert export_name(page) == "E.PNG"
    reload(page)
    assert export_name(page) == "E.PNG"


def test_export_clipboard_writes_a_copy_to_the_system_clipboard_only_when_the_box_is_on(page, clean):
    stub = """() => { window.__cw = 0; Object.defineProperty(navigator, 'clipboard', { value: { write: async () => { window.__cw++; }, writeText: async () => {}, read: async () => [] }, configurable: true });
      window.formvis.engine.newDocument(200, 120, 'E', 'white'); }"""
    page.evaluate(stub)
    page.wait_for_timeout(600)
    page.evaluate("window.formvis.commands.run('select-all'); window.formvis.commands.run('copy')")
    page.wait_for_timeout(400)
    assert page.evaluate("window.__cw") == 1
    flip(page, "General", "Export Clipboard to the System")
    page.evaluate("window.__cw = 0; window.formvis.commands.run('select-all'); window.formvis.commands.run('copy')")
    page.wait_for_timeout(400)
    assert page.evaluate("window.__cw") == 0
