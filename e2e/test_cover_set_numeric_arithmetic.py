import pytest

DLG = ".cv-scrim:not([hidden]) .cv-newdoc"
SIZE = "[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]"


def make_with(page, width, height):
    page.evaluate("window.formvis.commands.run('new')")
    page.wait_for_selector(DLG)
    d = page.locator(DLG)
    keep = d.locator("button[title='Keep the proportions']")
    if keep.get_attribute("aria-pressed") == "true":
        keep.click()
    for label, text in (("Width", width), ("Height", height)):
        f = d.locator(f"input[aria-label='{label}']")
        f.click()
        page.keyboard.press("Control+a")
        page.keyboard.type(text)
        page.keyboard.press("Tab")
    d.locator("select[aria-label='Unit']").select_option("px")
    shown = [d.locator(f"input[aria-label='{x}']").input_value() for x in ("Width", "Height")]
    d.locator(".cv-dialog-foot button", has_text="Create").click()
    page.wait_for_selector(DLG, state="detached")
    return shown


@pytest.mark.parametrize("w,h,want", [("100+20", "300/4", [120, 75]), ("(10+5)*8", "200-50*2", [120, 100]), ("2*-30+100", "-(-80)", [40, 80])])
def test_a_number_field_takes_arithmetic_and_shows_and_uses_the_result(page, w, h, want):
    shown = make_with(page, w, h)
    assert shown == [str(want[0]), str(want[1])], shown
    assert page.evaluate(SIZE) == want


def test_a_number_field_leaves_its_value_when_the_text_is_not_arithmetic(page):
    shown = make_with(page, "64", "48")
    assert page.evaluate(SIZE) == [64, 48]
    page.evaluate("window.formvis.commands.run('new')")
    page.wait_for_selector(DLG)
    f = page.locator(DLG).locator("input[aria-label='Width']")
    f.click()
    page.keyboard.press("Control+a")
    page.keyboard.type("abc+")
    page.keyboard.press("Tab")
    assert f.input_value() == "64"
    assert shown == ["64", "48"]
    page.keyboard.press("Escape")

