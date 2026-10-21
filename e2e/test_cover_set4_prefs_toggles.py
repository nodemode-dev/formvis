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


@pytest.fixture()
def clean(page):
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)
    yield
    page.evaluate("localStorage.removeItem('formvis.prefs')")
    reload(page)


BOXES = [
    ("General", "Animated Zoom", "animatedZoom"),
    ("General", "Zoom Resizes Windows", "zoomResizes"),
    ("General", "Use the system color picker", "systemPicker"),
    ("Workspace", "Auto-Show Hidden Panels", "autoShowPanels"),
    ("Workspace", "Enable Floating Document Window Docking", "floatDocking"),
    ("Interface", "Enable animations", "animations"),
    ("Tools", "Use tablet pressure", "usePressure"),
]


@pytest.mark.parametrize("section,label,key", BOXES)
def test_a_box_flips_its_preference_and_the_dialog_shows_it_again_after_a_reload(page, clean, section, label, key):
    open_section(page, section)
    cb = page.locator(f"{DLG} label", has_text=label).locator("input[type=checkbox]").first
    before = cb.is_checked()
    cb.click()
    page.wait_for_timeout(250)
    close(page)
    assert stored(page)[key] is (not before)
    reload(page)
    open_section(page, section)
    assert page.locator(f"{DLG} label", has_text=label).locator("input[type=checkbox]").first.is_checked() is (not before)
    close(page)


def test_enable_animations_off_adds_the_disabled_class_to_the_page_and_on_removes_it(page, clean):
    assert not page.evaluate("document.body.classList.contains('animations-disabled')")
    open_section(page, "Interface")
    cb = page.locator(f"{DLG} label", has_text="Enable animations").locator("input[type=checkbox]").first
    cb.click()
    page.wait_for_timeout(250)
    assert page.evaluate("document.body.classList.contains('animations-disabled')")
    cb.click()
    page.wait_for_timeout(250)
    assert not page.evaluate("document.body.classList.contains('animations-disabled')")
    close(page)


def test_global_pen_pressure_curve_choice_changes_the_curve_the_engine_uses(page, clean):
    open_section(page, "Tools")
    sel = page.locator(f"{DLG} label", has_text="Pen Pressure Curve").locator("select").first
    sel.select_option("linear")
    page.wait_for_timeout(250)
    linear = page.evaluate("JSON.stringify(window.formvis.engine.pressureCurve)")
    sel.select_option("s")
    page.wait_for_timeout(250)
    assert stored(page)["pressureCurve"] == "s"
    assert page.evaluate("JSON.stringify(window.formvis.engine.pressureCurve)") == "[0,0.1,0.5,0.9,1]"
    assert linear != "[0,0.1,0.5,0.9,1]"
    close(page)
    reload(page)
    assert stored(page)["pressureCurve"] == "s"


@pytest.mark.parametrize("label,key,value", [("Column Width", "colWidth", 22), ("Gutter", "gutter", 6)])
def test_units_and_rulers_column_width_and_gutter_are_stored_and_shown_again_after_a_reload(page, clean, label, key, value):
    open_section(page, "Units & Rulers")
    n = page.locator(f"{DLG} label.cv-field", has_text=label).locator("input").first
    n.fill(str(value))
    n.press("Tab")
    page.wait_for_timeout(250)
    close(page)
    assert stored(page)[key] == value
    reload(page)
    open_section(page, "Units & Rulers")
    assert page.locator(f"{DLG} label.cv-field", has_text=label).locator("input").first.input_value() == str(value)
    close(page)


def test_choosing_german_translates_the_menu_bar_and_is_kept_after_a_reload(page, clean):
    open_section(page, "Interface")
    page.locator(f"{DLG} label", has_text="Language").locator("select").first.select_option("de")
    page.wait_for_timeout(1200)
    close(page)
    assert stored(page)["language"] == "de"
    assert "Datei" in page.locator(".cv-menubar").first.inner_text()
    reload(page)
    assert "Datei" in page.locator(".cv-menubar").first.inner_text()


def test_recent_fonts_listed_first_slider_is_stored(page, clean):
    open_section(page, "Type")
    r = page.locator(f"{DLG} .cv-slider", has_text="Recent fonts listed first").locator("input[type=range]").first
    r.evaluate("e => { e.value = '7'; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }")
    page.wait_for_timeout(300)
    close(page)
    assert stored(page)["recentFontCount"] == 7
