DLG = ".cv-scrim:not([hidden]) .cv-dialog"
GUIDES = "window.formvis.engine.current.doc.guides.map((g) => [g.axis, Math.round(g.at)]).sort((a, b) => (a[0] + String(1000 + a[1])).localeCompare(b[0] + String(1000 + b[1])))"


def fill(page, name, value):
    f = page.locator(f"{DLG} input[name='{name}']")
    f.fill(str(value))
    f.press("Tab")


def open_layout(page):
    page.evaluate("window.formvis.commands.run('guide-layout')")
    page.locator(f"{DLG} input[name='columns']").wait_for()
    page.locator(f"{DLG} select[name='units']").select_option("px")


def test_new_guide_layout_lays_out_columns_with_gutters_and_margins_and_one_undo_removes_them(page):
    page.evaluate("window.formvis.engine.newDocument(400, 300, 'G', 'white'); window.formvis.engine.addGuide('x', 5)")
    open_layout(page)
    fill(page, "columns", 4)
    fill(page, "gutterX", 20)
    fill(page, "rows", 0)
    fill(page, "left", 10)
    fill(page, "right", 10)
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="OK").click()
    page.locator(".cv-scrim:not([hidden]) .cv-dialog").wait_for(state="detached")
    got = page.evaluate(GUIDES)
    xs = sorted(at for axis, at in got if axis == "x")
    assert xs == [10, 90, 110, 190, 210, 290, 310, 390], got
    assert not [g for g in got if g[0] == "y"]
    assert page.evaluate("window.formvis.engine.view.guides") is True
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(GUIDES) == [["x", 5]]


def test_new_guide_layout_rows_and_keeping_existing_guides(page):
    page.evaluate("window.formvis.engine.newDocument(400, 300, 'G', 'white'); window.formvis.engine.addGuide('x', 5)")
    open_layout(page)
    fill(page, "columns", 0)
    fill(page, "rows", 3)
    fill(page, "gutterY", 0)
    page.locator(f"{DLG} input[name='clear']").uncheck()
    page.locator(f"{DLG} .cv-dialog-foot button", has_text="OK").click()
    page.locator(".cv-scrim:not([hidden]) .cv-dialog").wait_for(state="detached")
    got = page.evaluate(GUIDES)
    assert ["x", 5] in got
    assert sorted(at for axis, at in got if axis == "y") == [0, 100, 200, 300] or sorted(at for axis, at in got if axis == "y") == [100, 200], got
