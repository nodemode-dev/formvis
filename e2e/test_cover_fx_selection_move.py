PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
RECT = "(() => { const s = window.formvis.engine.current.selection; return s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null; })()"
SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 160, 'M', 'white'); const k = e.activeLayer.raster.ctx; k.fillStyle = 'rgb(220,30,30)'; k.fillRect(40, 40, 40, 40); e.activeLayer.raster.touch(); e.refresh();
  e.setTool('marquee'); e.selectionMode = 'replace'; const v = e.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect(); return [b.left + v.panX, b.top + v.panY, v.zoom]; }"""


def start(page):
    s = page.evaluate(SETUP)
    at = lambda x, y: (s[0] + x * s[2], s[1] + y * s[2])
    page.mouse.move(*at(40, 40)); page.mouse.down(); page.mouse.move(*at(80, 80), steps=8); page.mouse.up()
    page.wait_for_function("window.formvis.engine.current.selection")
    return at


def drag(page, at, a, b, alt=False):
    if alt:
        page.keyboard.down("Alt")
    page.mouse.move(*at(*a)); page.mouse.down(); page.mouse.move(*at(*b), steps=10); page.mouse.up(); page.wait_for_timeout(400)
    if alt:
        page.keyboard.up("Alt")


def test_marquee_drag_inside_a_selection_moves_the_outline_and_leaves_the_pixels(page):
    # CO-0074
    at = start(page)
    before = page.evaluate(RECT)
    drag(page, at, (60, 60), (100, 90))
    after = page.evaluate(RECT)
    assert abs(after["x"] - before["x"] - 40) <= 3 and abs(after["y"] - before["y"] - 30) <= 3, (before, after)
    assert page.evaluate(PX, [60, 60])[:3] == [220, 30, 30]
    assert page.evaluate(PX, [100, 90])[:3] == [255, 255, 255]
    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)
    assert page.evaluate(RECT) == before


def test_float_selected_pixels_then_move_tool_drag_carries_them_and_drop_commits_one_undo_step(page):
    # CO-0075, PC-EN-0139
    at = start(page)
    assert page.evaluate("window.formvis.commands.run('select-float')")
    assert page.evaluate("window.formvis.engine.floatingSelection")
    assert page.evaluate("window.formvis.engine.tool") == "move"
    drag(page, at, (60, 60), (110, 60))
    if page.evaluate("window.formvis.engine.floatingSelection"):
        assert page.evaluate("window.formvis.commands.run('select-drop')")
    page.wait_for_timeout(400)
    assert not page.evaluate("window.formvis.engine.floatingSelection")
    assert page.evaluate(PX, [110, 60])[:3] == [220, 30, 30]
    assert page.evaluate(PX, [50, 60])[3] == 0 or page.evaluate(PX, [50, 60])[:3] == [255, 255, 255]
    page.keyboard.press("Control+z")
    page.wait_for_timeout(400)
    assert page.evaluate(PX, [50, 60])[:3] == [220, 30, 30]
    assert page.evaluate(PX, [110, 60])[:3] == [255, 255, 255]


def test_selection_to_work_path_matches_the_selection_bounds_and_convert_to_shape_adds_a_shape_layer(page):
    # PC-EN-0140, PC-UI-0401
    start(page)
    assert page.evaluate("window.formvis.commands.run('selection-to-work-path')")
    page.wait_for_function("window.formvis.engine.workPath")
    pts = page.evaluate("() => JSON.stringify(window.formvis.engine.workPath).match(/-?\\d+(\\.\\d+)?/g).map(Number)")
    assert min(pts) >= 0 and max(pts) <= 200 and 40 in [round(v) for v in pts] and 80 in [round(v) for v in pts], pts[:20]
    before = page.evaluate("window.formvis.engine.current.doc.layers.length")
    assert page.evaluate("window.formvis.commands.run('convert-to-shape')")
    page.wait_for_function(f"window.formvis.engine.current.doc.layers.length === {before + 1}")
    page.keyboard.press("Control+z")
    page.wait_for_function(f"window.formvis.engine.current.doc.layers.length === {before}")
