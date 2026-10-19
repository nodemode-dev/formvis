# The tool audit of the option bars (1.50.3): the Eraser's Block, Flow and Erase to History; the Brush's Smoothing
# and Angle; Type's Font Style and Warp Text; Select and Mask on the selection tools.
PX = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data)"


def opt(page, tool, label, value=None):
    return page.evaluate("""async ([t, l, v]) => { const R = await import('/src/extensions/registry.ts'), o = R.getTool(t).options(window.formvis.engine).find((x) => x.label === l); if (!o) return null; if (v !== null) (o.set ?? o.run)(v); return o.get ? o.get() : true; }""", [tool, label, value])


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def test_the_eraser_block_flow_and_erase_to_history(page):
    page.evaluate("window.formvis.engine.newDocument(200, 120, 'E', 'white'); window.formvis.engine.fg = { r: 200, g: 30, b: 30 }; window.formvis.engine.setBucket({ source: 'fg', mode: 'normal', tolerance: 0 }); window.formvis.engine.addLayer(); window.formvis.engine.paintBucket({ x: 5, y: 5 })")
    page.evaluate("window.formvis.engine.setTool('eraser')")
    opt(page, 'eraser', 'Mode', 'block')
    z = page.evaluate("window.formvis.engine.current.viewport.zoom")
    x, y = scr(page, 100, 60); page.mouse.click(x, y)
    half = 8 / z                                                                                 # 16 screen pixels
    assert page.evaluate(PX, [int(100 + half * 0.85), int(60 + half * 0.85)])[3] == 0              # a square's corner, erased
    opt(page, 'eraser', 'Mode', 'brush'); opt(page, 'eraser', 'Flow', 20)
    page.evaluate("window.formvis.engine.setBrush({ diameter: 20, hardness: 1, opacity: 1 })")
    x, y = scr(page, 40, 60); page.mouse.click(x, y)
    a = page.evaluate(PX, [40, 60])[3]
    assert 0 < a < 255, a                                                                        # low flow: part erased
    opt(page, 'eraser', 'Flow', 100)
    # Erase to History on the Background: back to the white it opened with, not transparency.
    page.evaluate("window.formvis.engine.newDocument(200, 120, 'H', 'white'); window.formvis.engine.fg = { r: 200, g: 30, b: 30 }; window.formvis.engine.paintBucket({ x: 5, y: 5 }); window.formvis.engine.setTool('eraser')")
    opt(page, 'eraser', 'Erase to History', True)
    a = scr(page, 60, 60); b = scr(page, 140, 60)
    page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b, steps=8); page.mouse.up()
    opt(page, 'eraser', 'Erase to History', False)
    assert page.evaluate(PX, [100, 60]) == [255, 255, 255, 255] and page.evaluate(PX, [100, 5])[:3] == [200, 30, 30]


def test_brush_smoothing_steadies_a_zigzag_and_angle_turns_the_tip(page):
    swing = {}
    for s in (0, 90):
        page.evaluate("window.formvis.engine.newDocument(300, 200, 'S', 'transparent'); window.formvis.engine.addLayer(); window.formvis.engine.setTool('brush'); window.formvis.engine.setBrushBlend('normal'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }; window.formvis.engine.setBrush({ diameter: 4, hardness: 1, opacity: 1 })")
        opt(page, 'brush', 'Smoothing', s)
        pts = [(30 + i * 12, 100 + (40 if i % 2 else -40)) for i in range(20)]
        page.mouse.move(*scr(page, 30, 100)); page.mouse.down()
        for (x, y) in pts: page.mouse.move(*scr(page, x, y), steps=2)
        page.mouse.up()
        swing[s] = page.evaluate("""(() => { const r = window.formvis.engine.activeLayer.raster, d = r.ctx.getImageData(0, 0, r.width, r.height).data; let lo = 1e9, hi = -1;
          for (let y = 0; y < r.height; y++) for (let x = 100; x < 200; x++) if (d[(y * r.width + x) * 4 + 3] > 100) { lo = Math.min(lo, y); hi = Math.max(hi, y); } return hi - lo; })()""")
    opt(page, 'brush', 'Smoothing', 0)
    assert swing[90] < swing[0] * 0.6, swing                                                     # steadied
    opt(page, 'brush', 'Angle', 45)
    assert page.evaluate("window.formvis.engine.brushShape.angle") == 45
    opt(page, 'brush', 'Angle', 0)


def test_type_font_style_warp_and_select_and_mask(page):
    page.evaluate("window.formvis.engine.newDocument(100, 60, 'T', 'white')")
    opt(page, 'type', 'Font Style', 'bold-italic')
    assert page.evaluate("[window.formvis.engine.textSettings.bold, window.formvis.engine.textSettings.italic]") == [True, True]
    opt(page, 'type', 'Font Style', 'regular')
    assert opt(page, 'type', 'Warp Text...') is True
    for t in ['marquee', 'lasso', 'quickSelect', 'objectSelect']:
        assert page.evaluate("""async (t) => { const R = await import('/src/extensions/registry.ts'); return R.getTool(t).options(window.formvis.engine).some((o) => o.label === 'Select and Mask...'); }""", t), t
