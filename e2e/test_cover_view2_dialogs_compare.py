E = "window.formvis.engine"
DLG = ".cv-scrim:not([hidden]) .cv-dialog"
INPUTS = f"{DLG} input[type=text], {DLG} input[type=number], {DLG} input[data-numtext]"


def cmd(page, name):
    page.evaluate(f"window.formvis.commands.run('{name}')")
    page.wait_for_timeout(300)


def open_size(page):
    page.evaluate(f"{E}.newDocument(400, 300, 'D', 'white')")
    page.wait_for_timeout(800)
    cmd(page, "image-size")
    page.wait_for_timeout(500)
    return page.locator(DLG).locator("input[type=text], input[data-numtext], input[type=number]")


def test_a_numeric_field_takes_arithmetic_and_shows_the_result(page):
    fields = open_size(page)
    w = fields.nth(0)
    w.click()
    w.fill("100+50")
    w.press("Tab")
    page.wait_for_timeout(300)
    assert w.input_value() == "150"
    page.keyboard.press("Escape")


def test_tab_moves_through_the_fields_and_ctrl_z_undoes_a_settled_value(page):
    fields = open_size(page)
    w = fields.nth(2)
    before = w.input_value()
    w.click()
    w.fill("222")
    page.keyboard.press("Tab")
    page.wait_for_timeout(300)
    assert page.evaluate("document.activeElement.tagName") == "INPUT"
    focused_second = page.evaluate("(() => { const a = document.activeElement; return [...document.querySelectorAll('.cv-scrim:not([hidden]) .cv-dialog input')].indexOf(a); })()")
    assert focused_second > 0
    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)
    assert w.input_value() == before
    page.keyboard.press("Escape")


def test_ctrl_z_on_a_linked_width_restores_both_width_and_height_and_redo_reapplies_them(page):
    fields = open_size(page)
    w, h = fields.nth(0), fields.nth(1)
    assert (w.input_value(), h.input_value()) == ("400", "300")
    w.click()
    w.fill("222")
    page.keyboard.press("Tab")
    page.wait_for_timeout(300)
    assert (w.input_value(), h.input_value()) == ("222", "167")
    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)
    assert (w.input_value(), h.input_value()) == ("400", "300")
    page.keyboard.press("Control+Shift+z")
    page.wait_for_timeout(300)
    assert (w.input_value(), h.input_value()) == ("222", "167")
    page.keyboard.press("Escape")


def test_alt_click_on_cancel_resets_the_dialog_and_keeps_it_open(page):
    fields = open_size(page)
    w = fields.nth(0)
    w.click()
    w.fill("333")
    w.press("Tab")
    page.wait_for_timeout(300)
    assert w.input_value() == "333"
    page.locator(DLG).get_by_role("button", name="Cancel").click(modifiers=["Alt"])
    page.wait_for_timeout(300)
    assert page.locator(DLG).is_visible()
    assert w.input_value() == "400"
    page.keyboard.press("Escape")


def test_show_opening_state_and_split_compare_toggle_while_a_snapshot_is_kept(page):
    page.evaluate(f"{E}.newDocument(400, 300, 'C', 'white')")
    page.wait_for_timeout(800)
    cmd(page, "new-snapshot")
    state = lambda n: page.evaluate(f"window.formvis.commands.get('{n}').checked()")
    cmd(page, "peek-original")
    assert state("peek-original") is True
    cmd(page, "peek-original")
    assert state("peek-original") is False
    cmd(page, "compare-split")
    assert state("compare-split") is True
    cmd(page, "compare-split")
    assert state("compare-split") is False
