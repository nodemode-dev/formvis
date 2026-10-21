import re

DIM = "(() => { const d = window.formvis.engine.current.doc; return [d.width, d.height]; })()"
SCENE = """([w, h, x, y, bw, bh]) => {
  const e = window.formvis.engine; e.newDocument(w, h, 'S', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = '#000'; c.fillRect(x, y, bw, bh); l.raster.touch(); e.refresh();
}"""
PX = "([x, y]) => window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[0]"
LAST = "window.formvis.engine.historySteps.names.slice(-1)[0]"
OK = ".cv-scrim:not([hidden]) .cv-dialog-foot button:has-text('OK')"


def menu(page, *path):
    page.locator(".cv-menu-btn", has_text=path[0]).first.click()
    for i, label in enumerate(path[1:]):
        item = page.locator(".cv-menu:not([hidden]) > *", has_text=re.compile("^" + re.escape(label) + "(?![A-Za-z ])")).first
        item.hover() if i < len(path) - 2 else item.click()


def dialog(page):
    return page.locator(".cv-scrim:not([hidden]) .cv-dialog")


def px(page, *pts):
    return [page.evaluate(PX, list(p)) for p in pts]


def test_canvas_size_relative_adds_the_typed_amounts(page):
    # SC-ED-0127 PC-UI-0166 PC-UI-0922 PC-EN-0004
    page.evaluate(SCENE, [200, 100, 0, 0, 20, 10])
    menu(page, "Image", "Canvas Size")
    d = dialog(page)
    d.locator("input[type=checkbox]").nth(0).uncheck()
    d.locator("input[type=checkbox]").nth(1).check()
    d.locator("input").nth(0).fill("50")
    d.locator("input").nth(1).fill("-20")
    page.click(OK)
    page.wait_for_function("window.formvis.engine.current.doc.width === 250")
    assert page.evaluate(DIM) == [250, 80]
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(DIM) == [200, 100]


def test_trim_by_top_left_colour_and_with_a_side_left_out(page):
    # PC-UI-0174 PC-EN-0007
    page.evaluate(SCENE, [200, 100, 50, 30, 41, 41])
    menu(page, "Image", "Trim")
    dialog(page).locator("select").first.select_option(label="Top left pixel color")
    page.click(OK)
    page.wait_for_function("window.formvis.engine.current.doc.width === 41")
    assert page.evaluate(DIM) == [41, 41]
    assert px(page, (20, 20), (0, 0)) == [0, 0]
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate(DIM) == [200, 100]
    menu(page, "Image", "Trim")
    d = dialog(page)
    d.locator("select").first.select_option(label="Top left pixel color")
    d.locator("input[type=checkbox]").nth(2).uncheck()
    page.click(OK)
    page.wait_for_function("window.formvis.engine.current.doc.width === 91")
    assert page.evaluate(DIM) == [91, 41]


def test_image_rotation_menu_turns_and_flips_the_canvas(page):
    # SC-ED-0116 PC-EN-0009
    for item, size, hit, miss in (
        ("90° Clockwise", [100, 200], (95, 5), (5, 5)),
        ("180°", [200, 100], (195, 95), (5, 5)),
        ("Flip Canvas Horizontal", [200, 100], (195, 5), (5, 5)),
    ):
        page.evaluate(SCENE, [200, 100, 0, 0, 20, 10])
        menu(page, "Image", "Image Rotation", item)
        page.wait_for_function("([w, h]) => { const d = window.formvis.engine.current.doc; return d.width === w && d.height === h; }", arg=size)
        assert px(page, hit, miss) == [0, 255], (item, px(page, hit, miss))


def test_edit_transform_rotates_and_flips_the_layer(page):
    # PC-UI-0086 PC-UI-0087 PC-UI-0089 PC-UI-0090 PC-EN-0205 PC-EN-0206
    cases = (
        ("Rotate 180°", [10, 5, 20, 10], (180, 90), (20, 10)),
        ("Flip Layer Horizontal", [10, 5, 20, 10], (180, 10), (20, 90)),
        ("Flip Layer Vertical", [10, 5, 20, 10], (20, 90), (20, 10)),
        ("Rotate 90° Clockwise", [110, 45, 20, 10], (100, 70), (120, 50)),
    )
    for item, rect, black, white in cases:
        page.evaluate(SCENE, [200, 100, *rect])
        assert page.evaluate(PX, [rect[0] + 5, rect[1] + 5]) == 0
        menu(page, "Edit", "Transform", item)
        page.wait_for_function(f"{LAST} === {item!r}")
        assert page.evaluate(DIM) == [200, 100]
        assert px(page, black, white)[0] == 0 and px(page, black, white)[1] == 255, (item, px(page, black, white))
        page.evaluate("window.formvis.engine.undo()")
        assert page.evaluate(PX, [rect[0] + 5, rect[1] + 5]) == 0


def test_free_transform_a_copy_keeps_the_original(page):
    # PC-EN-0209
    page.evaluate(SCENE, [200, 100, 0, 0, 20, 10])
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == 1
    page.keyboard.press("Alt+Control+t")
    page.wait_for_function("window.formvis.engine.current.doc.layers.length === 2")
    assert page.evaluate(LAST) == "Duplicate Layer"
    page.keyboard.press("Enter")
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == 1
