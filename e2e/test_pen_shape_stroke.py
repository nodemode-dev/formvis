# The tool audit's last items (1.52.8): the Pen's Shape mode and Auto Add/Delete; the shape stroke's type and alignment.
def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def fresh(page, w=200, h=150):
    page.evaluate(f"window.formvis.engine.newDocument({w}, {h}, 'S', 'transparent')")
    page.wait_for_function("(() => { const v = window.formvis.engine.current.viewport; return v.fitted && v.width > 0; })()")
    page.wait_for_timeout(50)


def click(page, x, y):
    page.mouse.click(*scr(page, x, y))


def test_the_pen_in_shape_mode_and_auto_add_delete(page):
    fresh(page)
    page.evaluate("() => { const e = window.formvis.engine; e.setTool('pen'); e.fg = { r: 220, g: 20, b: 20 }; Object.assign(e.shapeSettings, { fill: 'fg', stroke: 'none' }); e.penSettings.mode = 'shape'; }")
    for x, y in ((40, 120), (100, 30), (160, 120), (40, 120)):
        click(page, x, y)
    got = page.evaluate("(() => { const e = window.formvis.engine, l = e.activeLayer; return [!!l.vector, (e.workPath?.subpaths ?? []).length, Array.from(e.flattened().getContext('2d').getImageData(100, 90, 1, 1).data)]; })()")
    assert got == [True, 0, [220, 20, 20, 255]], got                                             # a shape layer; the work path left empty
    fresh(page)
    page.evaluate("() => { const e = window.formvis.engine; e.setTool('pen'); e.penSettings.mode = 'path'; e.penSettings.autoAddDelete = true; }")
    for x, y in ((40, 75), (160, 75)):
        click(page, x, y)
    page.keyboard.press("Enter")                                                                 # the open path finished
    count = "(() => { const s = window.formvis.engine.workPath.subpaths; return [s.length, s[0].anchors.length]; })()"
    click(page, 100, 75)
    assert page.evaluate(count) == [1, 3], page.evaluate(count)                                  # on: a point added to the path
    page.evaluate("window.formvis.engine.penSettings.autoAddDelete = false")
    page.keyboard.press("Enter")
    click(page, 70, 75)
    assert page.evaluate(count) == [2, 3], page.evaluate(count)                                  # off: a new path starts, the old one untouched
    page.evaluate("window.formvis.engine.penSettings.autoAddDelete = true")


def test_the_stroke_aligns_inside_centre_or_outside_and_dashes(page):
    def box(align, dash="solid"):
        fresh(page)
        page.evaluate("""([align, dash]) => { const e = window.formvis.engine; e.fg = { r: 0, g: 0, b: 0 };
          Object.assign(e.shapeSettings, { kind: 'rectangle', mode: 'shape', fill: 'none', stroke: 'fg', strokeWidth: 10, strokeAlign: align, strokeDash: dash, cornerRadius: 0 });
          e.drawShape({ x: 50, y: 40 }, { x: 150, y: 110 }, { x: 50, y: 40, w: 100, h: 70 }); }""", [align, dash])
        a = lambda x, y: page.evaluate("([x, y]) => window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data[3]", [x, y])
        return a(100, 37), a(100, 43), [a(x, 40) for x in range(55, 145)]
    out, inn, _ = box("center")
    assert out > 200 and inn > 200, (out, inn)
    out, inn, _ = box("inside")
    assert out == 0 and inn > 200, (out, inn)
    out, inn, _ = box("outside")
    assert out > 200 and inn == 0, (out, inn)
    _, _, solid = box("inside", "solid")
    _, _, dashed = box("inside", "dashed")
    assert min(solid) > 200 and sum(1 for v in dashed if v == 0) > 10, (min(solid), dashed[:30])     # gaps along the edge
    page.evaluate("Object.assign(window.formvis.engine.shapeSettings, { stroke: 'none', strokeAlign: 'center', strokeDash: 'solid', fill: 'fg' })")
