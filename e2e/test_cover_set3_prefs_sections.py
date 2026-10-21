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


def close(page):
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)


def number(page, label):
    return page.locator(f"{DLG} input.cv-num[aria-label^='{label}']").first


def select(page, label):
    return page.locator(f"{DLG} label", has_text=label).locator("select").first


@pytest.fixture()
def clean(page):
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)
    yield
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)


CHECKS = [
    ("Enhanced Controls", "Trackpad Pinch Zoom", "pinchZoom"),
    ("Enhanced Controls", "Trackpad Rotate Gesture", "trackpadRotate"),
    ("Enhanced Controls", "Touch Gestures", "touchGestures"),
    ("Plugins", "Show Extension Panels", "showExtPanels"),
    ("Cursors", "Show Only Crosshair While Painting", "cursorOnlyCross"),
    ("Camera Raw Defaults", "Show the Camera Raw dialog on open", "rawAsk"),
    ("Camera Raw Defaults", "Apply Auto Tone", "rawAutoTone"),
    ("Camera Raw Defaults", "Open as a Smart Object", "rawSmart"),
]


@pytest.mark.parametrize("section,label,key", CHECKS)
def test_a_box_in_the_section_changes_its_preference_and_is_kept_after_a_reload(page, clean, section, label, key):
    open_section(page, section)
    cb = page.locator(f"{DLG} label", has_text=label).locator("input[type=checkbox]").first
    before = cb.is_checked()
    cb.click()
    page.wait_for_timeout(250)
    close(page)
    assert stored(page)[key] is (not before)
    reload(page)
    assert stored(page)[key] is (not before)
    open_section(page, section)
    assert page.locator(f"{DLG} label", has_text=label).locator("input[type=checkbox]").first.is_checked() is (not before)
    close(page)


NUMBERS = [
    ("Performance", "Layer effect cache", "effectCacheMB", 512),
    ("Performance", "Cache levels", "cacheLevels", 3),
    ("Enhanced Controls", "Scrubby Slider Acceleration", "scrubAccel", 40),
    ("Camera Raw Defaults", "Resolution (ppi", "rawPpi", 300),
    ("File Handling", "Recent File List", "recentFileCount", 7),
]


@pytest.mark.parametrize("section,label,key,value", NUMBERS)
def test_a_number_in_the_section_is_stored_and_the_dialog_shows_it_again_after_a_reload(page, clean, section, label, key, value):
    open_section(page, section)
    n = number(page, label)
    n.fill(str(value))
    n.press("Tab")
    page.wait_for_timeout(250)
    close(page)
    assert stored(page)[key] == value
    reload(page)
    assert stored(page)[key] == value
    open_section(page, section)
    assert number(page, label).input_value() == str(value)
    close(page)


CHOICES = [
    ("Camera Raw Defaults", "Default White Balance", "daylight", "rawWb", "daylight"),
    ("Camera Raw Defaults", "Default Depth", "16", "rawBits", 16),
    ("Camera Raw Defaults", "Sharpen For", "glossy", "rawSharpen", "glossy"),
    ("Cursors", "Other Cursors", "precise", "cursorOther", "precise"),
    ("Transparency & Gamut", "Grid Size", "large", "checkerSize", "large"),
]


@pytest.mark.parametrize("section,label,choice,key,saved", CHOICES)
def test_a_choice_in_the_section_is_stored_and_the_dialog_shows_it_again_after_a_reload(page, clean, section, label, choice, key, saved):
    open_section(page, section)
    select(page, label).select_option(choice)
    page.wait_for_timeout(250)
    close(page)
    assert stored(page)[key] == saved
    reload(page)
    assert stored(page)[key] == saved
    open_section(page, section)
    assert select(page, label).input_value() == choice
    close(page)


def new_doc(page):
    page.evaluate("window.formvis.engine.newDocument(400, 300, 'E', 'white')")
    page.wait_for_timeout(600)


def test_transparency_grid_size_none_makes_both_checker_colours_the_same_and_large_restores_two(page, clean):
    css = "[getComputedStyle(document.documentElement).getPropertyValue('--cv-checker-a'), getComputedStyle(document.documentElement).getPropertyValue('--cv-checker-b')]"
    a, b = page.evaluate(css)
    assert a != b
    open_section(page, "Transparency & Gamut")
    select(page, "Grid Size").select_option("none")
    page.wait_for_timeout(300)
    close(page)
    a, b = page.evaluate(css)
    assert a == b
    reload(page)
    a, b = page.evaluate(css)
    assert a == b
    open_section(page, "Transparency & Gamut")
    select(page, "Grid Size").select_option("large")
    page.wait_for_timeout(300)
    close(page)
    a, b = page.evaluate(css)
    assert a != b
