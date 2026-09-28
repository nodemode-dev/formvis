PX = "([x, y]) => { const l = window.formvis.engine.activeLayer, t = l.transform; return Array.from(l.raster.ctx.getImageData(Math.floor(x - t.x), Math.floor(y - t.y), 1, 1).data); }"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def draw(page, a, b):
    x0, y0 = scr(page, *a); x1, y1 = scr(page, *b)
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=8); page.mouse.up()


def setup(page, **s):
    page.evaluate("window.formvis.engine.newDocument(300, 200, 'S', 'white'); window.formvis.engine.fg = { r: 200, g: 30, b: 30 }; window.formvis.engine.setTool('shape')")
    page.evaluate("(s) => { Object.assign(window.formvis.engine.shapeSettings, { kind: 'rectangle', mode: 'shape', fill: 'fg', stroke: 'none', strokeWidth: 3, cornerRadius: 0 }, s); }", s)


def test_the_triangle_and_a_stroked_shape(page):
    setup(page, kind='triangle')
    draw(page, (40, 40), (140, 140))
    assert page.evaluate("window.formvis.engine.activeLayer.name").startswith("Triangle")
    assert page.evaluate(PX, [90, 60])[3] == 255 and page.evaluate(PX, [90, 136])[3] == 255          # the apex region and the base
    assert page.evaluate(PX, [45, 45])[3] == 0                                                         # the box's corner: empty
    setup(page, kind='rectangle', fill='none', stroke='fg', strokeWidth=6)
    draw(page, (60, 40), (200, 160))
    assert page.evaluate("!!window.formvis.engine.activeLayer.vector && !!window.formvis.engine.activeLayer.vector.stroke")
    assert page.evaluate(PX, [60, 100])[3] > 200 and page.evaluate(PX, [130, 100])[3] == 0            # the edge, and an empty inside
    setup(page, kind='rectangle')
    draw(page, (60, 40), (200, 160))
    assert page.evaluate("!!window.formvis.engine.activeLayer.shape")                                   # filled, unstroked: still a live shape


def test_path_mode_adds_to_the_work_path(page):
    setup(page, mode='path')
    n = page.evaluate("window.formvis.engine.current.doc.layers.length")
    draw(page, (40, 40), (140, 120))
    assert page.evaluate("window.formvis.engine.workPath.subpaths.map((s) => s.anchors.length)") == [4]
    page.evaluate("window.formvis.engine.shapeSettings.kind = 'ellipse'")
    draw(page, (160, 40), (260, 160))
    assert page.evaluate("window.formvis.engine.workPath.subpaths.map((s) => s.anchors.length)") == [4, 4]
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == n                        # no layer
    page.keyboard.press("Control+z")
    assert page.evaluate("window.formvis.engine.workPath.subpaths.length") == 1                          # the second undone


def test_pixels_mode_paints_the_active_layer(page):
    setup(page, kind='ellipse', mode='pixels')
    n = page.evaluate("window.formvis.engine.current.doc.layers.length")
    draw(page, (60, 40), (240, 160))
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == n                        # no new layer
    assert page.evaluate(PX, [150, 100])[:3] == [200, 30, 30] and page.evaluate(PX, [62, 42])[:3] == [255, 255, 255]
    page.keyboard.press("Control+z")
    assert page.evaluate(PX, [150, 100])[:3] == [255, 255, 255]


def test_justify_in_the_paragraph_panel_and_the_mask_kept_on_the_canvas(page):
    page.evaluate("window.formvis.engine.newDocument(300, 120, 'P', 'white')")
    page.locator("section.cv-paragraph [data-align='justify']").click()
    assert page.evaluate("window.formvis.engine.textSettings.align") == "justify"
    page.evaluate("""async () => { const e = window.formvis.engine; await e.createTextSelection({ x: 20, y: 110 }, { ...e.textSettings, align: 'left', direction: 'horizontal', size: 90, content: 'Mg', box: null }); }""")
    s = page.evaluate("(() => { const s = window.formvis.engine.current.selection; return [s.x, s.y, s.x + s.w, s.y + s.h]; })()")
    assert s[0] >= 0 and s[1] >= 0 and s[2] <= 300 and s[3] <= 120, s                                  # within the canvas
