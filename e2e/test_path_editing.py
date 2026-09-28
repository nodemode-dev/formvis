SETUP = """(smooth) => { const e = window.formvis.engine; e.newDocument(300, 200, 'E', 'white');
  const c = (x, y) => ({ x, y, inX: x, inY: y, outX: x, outY: y }), s = (x, y) => ({ x, y, inX: x - 20, inY: y, outX: x + 20, outY: y });
  e.setWorkPath({ subpaths: [{ closed: false, anchors: [c(40, 60), c(100, 60), smooth ? s(160, 120) : c(160, 120), c(240, 120)] }] }); }"""
A = "(i) => { const a = window.formvis.engine.workPath.subpaths[0].anchors[i]; return [Math.round(a.x), Math.round(a.y), Math.round(a.inX), Math.round(a.inY), Math.round(a.outX), Math.round(a.outY)]; }"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def drag(page, a, b, alt=False):
    x0, y0 = scr(page, *a); x1, y1 = scr(page, *b)
    if alt: page.keyboard.down("Alt")
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=8); page.mouse.up()
    if alt: page.keyboard.up("Alt")


def test_direct_selection_box_selects_moves_together_nudges_and_undoes(page):
    page.evaluate(SETUP, False); page.evaluate("window.formvis.engine.setTool('directSelect')")
    drag(page, [20, 40], [120, 80])                                                              # a box around the first two
    zoom = page.evaluate("window.formvis.engine.current.viewport.zoom")
    drag(page, [40, 60], [40 + 30, 60 + 20])                                                     # drag one: both move
    a0, a1, a2 = page.evaluate(A, 0), page.evaluate(A, 1), page.evaluate(A, 2)
    assert abs(a0[0] - 70) <= 1 and abs(a0[1] - 80) <= 1 and abs(a1[0] - 130) <= 1 and abs(a1[1] - 80) <= 1, (a0, a1)
    assert a2[:2] == [160, 120]                                                                   # the others stay
    page.keyboard.press("ArrowRight"); page.keyboard.press("Shift+ArrowDown")
    assert page.evaluate(A, 0)[:2] == [a0[0] + 1, a0[1] + 10]
    x, y = scr(page, 160, 120); page.keyboard.down("Shift"); page.mouse.click(x, y); page.keyboard.up("Shift")   # Shift adds
    page.keyboard.press("ArrowLeft")
    assert page.evaluate(A, 2)[:2] == [159, 120]
    for _ in range(3): page.keyboard.press("Control+z")                                          # the three nudges, one step each
    assert page.evaluate(A, 0)[:2] == [a0[0], a0[1]] and page.evaluate(A, 2)[:2] == [160, 120]
    page.keyboard.press("Control+z")                                                            # the drag
    assert page.evaluate(A, 0)[:2] == [40, 60] and page.evaluate(A, 1)[:2] == [100, 60]


def test_alt_pulls_handles_from_a_point_and_breaks_a_handle(page):
    page.evaluate(SETUP, True); page.evaluate("window.formvis.engine.setTool('directSelect')")
    drag(page, [100, 60], [130, 60], alt=True)                                                   # a corner: handles pulled out
    a = page.evaluate(A, 1)
    assert abs(a[4] - 130) <= 1 and abs(a[2] - 70) <= 1 and a[3] == 60 and a[5] == 60, a          # mirrored
    drag(page, [180, 120], [180, 150], alt=True)                                                 # a smooth point's out handle, broken
    s = page.evaluate(A, 2)
    assert abs(s[5] - 150) <= 1 and s[2:4] == [140, 120], s                                       # the in handle stays


def test_convert_point_makes_corners_and_smooth_points(page):
    page.evaluate(SETUP, True); page.evaluate("window.formvis.engine.setTool('convertPoint')")
    x, y = scr(page, 160, 120); page.mouse.click(x, y)
    assert page.evaluate(A, 2) == [160, 120, 160, 120, 160, 120]                                  # a click: a corner
    drag(page, [100, 60], [100, 90])                                                             # a drag: smooth handles
    a = page.evaluate(A, 1)
    assert abs(a[5] - 90) <= 1 and abs(a[3] - 30) <= 1, a
    idx = page.evaluate("(async () => { const { toolGroups } = await import('/src/ui/tool-groups.ts'); return toolGroups().findIndex((g) => g.tools.some((t) => t.id === 'pen')); })()")
    page.locator(".cv-rail-tools .cv-tool").nth(idx).click(button="right")
    assert "Convert Point" in page.locator(".cv-flyout:not([hidden]) .cv-flyout-label").all_inner_texts()
    page.keyboard.press("Escape")
