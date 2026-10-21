import re

SCR = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"
TXT = "(() => { const l = window.formvis.engine.current.activeLayer; return l.text ? l.text.content : null; })()"
LAST = "window.formvis.engine.historySteps.names.slice(-1)[0]"
START = "the red fox and the Red hen"


def menu(page, *path):
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def type_layer(page):
    page.evaluate("window.formvis.engine.newDocument(400, 260, 'T', 'white'); window.formvis.engine.setTool('type')")
    x, y = page.evaluate(SCR, [40, 40])
    page.mouse.click(x, y)
    ed = page.locator(".cv-type-editor")
    ed.fill(START)
    ed.press("Control+Enter")
    page.wait_for_function("window.formvis.engine.current.activeLayer && window.formvis.engine.current.activeLayer.text")
    assert page.evaluate(TXT) == START


def test_paste_lorem_ipsum_appends_a_paragraph_and_undoes(page):
    # PC-UI-0394 PC-EN-0416
    type_layer(page)
    menu(page, "Layer", "Type", "Paste Lorem Ipsum")
    page.wait_for_function(f"({TXT}) !== {START!r}")
    t = page.evaluate(TXT)
    assert t.startswith(START + "\n" + "Lorem ipsum dolor sit amet") and len(t) == 259, t
    assert page.evaluate(LAST) == "Edit Type"
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(TXT) == START


def test_find_and_replace_text_change_all_and_case_sensitive(page):
    # PC-UI-0067 PC-EN-0414
    type_layer(page)
    menu(page, "Layer", "Type", "Find and Replace Text")
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.locator("input[type=text]").nth(0).fill("red")
    d.locator("input[type=text]").nth(1).fill("blue")
    d.get_by_role("button", name="Change All").click()
    page.wait_for_function(f"({TXT}) !== {START!r}")
    assert page.evaluate(TXT) == "the blue fox and the blue hen", page.evaluate(TXT)
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(TXT) == START
    d.locator("input[type=checkbox]").nth(0).check()
    d.get_by_role("button", name="Change All").click()
    page.wait_for_function(f"({TXT}) !== {START!r}")
    assert page.evaluate(TXT) == "the blue fox and the Red hen", page.evaluate(TXT)
