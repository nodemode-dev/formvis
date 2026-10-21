import re

SCR = "([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }"
SL = "window.formvis.engine.current.doc.slices.map((s) => [s.x, s.y, s.w, s.h])"


def menu(page, *path):
    if page.locator(".cv-menu:not([hidden])").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(100)
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def drag(page, a, b):
    x, y = page.evaluate(SCR, a)
    x2, y2 = page.evaluate(SCR, b)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x2, y2, steps=6)
    page.mouse.up()


def test_lock_slices_stops_the_slice_tool_and_unlock_lets_it_draw_again(page):
    # PC-UI-0567 PC-EN-0534
    page.evaluate("window.formvis.engine.newDocument(400, 300, 'S', 'white'); window.formvis.engine.setTool('slice')")
    drag(page, [20, 20], [120, 90])
    assert page.evaluate(SL) == [[20, 20, 100, 70]]
    menu(page, "View", "Show", "Lock Slices")
    assert page.evaluate("window.formvis.engine.view.slicesLocked") is True
    drag(page, [200, 20], [300, 90])
    assert page.evaluate(SL) == [[20, 20, 100, 70]]
    menu(page, "View", "Show", "Unlock Slices")
    drag(page, [200, 20], [300, 90])
    assert page.evaluate(SL) == [[20, 20, 100, 70], [200, 20, 100, 70]]


def test_artboard_tool_drag_makes_an_artboard_of_the_dragged_size(page):
    # PC-UI-0701
    page.evaluate("window.formvis.engine.newDocument(600, 400, 'A', 'white'); window.formvis.engine.setTool('artboard')")
    drag(page, [30, 30], [230, 180])
    boards = page.evaluate("window.formvis.engine.current.doc.layers.filter((l) => l.artboard).map((l) => l.artboard)")
    assert len(boards) == 1 and (boards[0]["x"], boards[0]["y"], boards[0]["w"], boards[0]["h"]) == (30, 30, 200, 150), boards


def test_status_bar_shows_the_document_size_and_follows_a_new_one(page):
    # CO-0021
    page.evaluate("window.formvis.engine.newDocument(400, 300, 'S', 'white')")
    assert page.locator(".cv-st-dims").inner_text() == "400 × 300 px"
    page.evaluate("window.formvis.engine.newDocument(123, 77, 'S2', 'white')")
    page.wait_for_function("document.querySelector('.cv-st-dims').textContent === '123 × 77 px'")
