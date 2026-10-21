NAMES = "window.formvis.engine.current.doc.layers.map((l) => l.name)"
ROWS = "[...document.querySelectorAll('.cv-layer')].filter((r) => r.getClientRects().length).map((r) => r.querySelector('.cv-layer-label').textContent)"
SELECTED = "window.formvis.engine.current.selectedIds.size"


def make_doc(page):
    page.evaluate("window.formvis.engine.newDocument(200, 150, 'P', 'white'); window.formvis.engine.addLayer(); window.formvis.engine.addLayer()")
    page.wait_for_function("document.querySelectorAll('.cv-layer').length === 3")


def group_two(page):
    page.locator(".cv-layer").nth(1).click()
    page.locator(".cv-layer").nth(0).click(modifiers=["Control"])
    assert page.evaluate(SELECTED) == 2
    page.keyboard.press("Control+g")
    page.wait_for_function("document.querySelector('.cv-layer.is-group')")


def test_ctrl_and_shift_click_select_several_layer_rows(page):
    make_doc(page)
    page.locator(".cv-layer").nth(2).click()
    assert page.evaluate(SELECTED) == 1
    page.locator(".cv-layer").nth(0).click(modifiers=["Control"])
    assert page.evaluate(SELECTED) == 2
    assert page.evaluate("[...document.querySelectorAll('.cv-layer.is-selected')].length") == 2
    page.locator(".cv-layer").nth(0).click()
    page.locator(".cv-layer").nth(2).click(modifiers=["Shift"])
    assert page.evaluate(SELECTED) == 3


def test_group_disclosure_collapses_and_reopens_the_rows_inside(page):
    make_doc(page)
    group_two(page)
    assert page.evaluate(ROWS) == ["Folder 1", "Layer 2", "Layer 1", "Background"]
    page.locator(".cv-layer.is-group .cv-layer-disclose").click()
    page.wait_for_function("document.querySelector('.cv-layer.is-group.is-collapsed')")
    assert page.evaluate(ROWS) == ["Folder 1", "Background"]
    assert page.evaluate("window.formvis.engine.current.collapsed.size") == 1
    page.locator(".cv-layer.is-group .cv-layer-disclose").click()
    page.wait_for_function("!document.querySelector('.cv-layer.is-collapsed')")
    assert page.evaluate(ROWS) == ["Folder 1", "Layer 2", "Layer 1", "Background"]
    assert page.evaluate("window.formvis.engine.current.collapsed.size") == 0


def test_right_click_selects_the_row_and_the_context_menu_deletes_it(page):
    make_doc(page)
    page.locator(".cv-layer").nth(1).click(button="right")
    page.wait_for_function("[...document.querySelectorAll('.cv-menu')].some((m) => m.getClientRects().length && m.innerText.includes('Duplicate Layer'))")
    assert page.evaluate("window.formvis.engine.current.activeLayer.name") == "Layer 1"
    menu = page.locator(".cv-menu", has_text="Duplicate Layer").locator(":scope >> text=Delete Layer").first
    menu.click()
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 2")
    assert page.evaluate(NAMES) == ["Background", "Layer 2"]


def test_trash_button_asks_first_and_cancel_keeps_the_layer(page):
    make_doc(page)
    page.locator(".cv-panel-foot [data-cmd=delete-layer-ask]").click()
    dlg = page.locator(".cv-dialog", has_text="Delete layer?")
    dlg.wait_for(state="visible")
    assert "Delete Layer 2?" in dlg.inner_text()
    dlg.get_by_role("button", name="Cancel").click()
    dlg.wait_for(state="hidden")
    assert page.evaluate(NAMES) == ["Background", "Layer 1", "Layer 2"]
    page.locator(".cv-panel-foot [data-cmd=delete-layer-ask]").click()
    dlg.wait_for(state="visible")
    dlg.locator(".cv-btn-danger").click()
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 2")
    assert page.evaluate(NAMES) == ["Background", "Layer 1"]
    page.keyboard.press("Control+z")
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 3")
