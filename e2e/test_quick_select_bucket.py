SEL = "(([x, y]) => { const s = window.formvis.engine.current.selection; return s ? s.valueAt(x, y) : 0; })"
STEPS = "window.formvis.engine.current.history.past.length"


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def stroke(page, a, b, alt=False):
    x0, y0 = scr(page, *a); x1, y1 = scr(page, *b)
    if alt: page.keyboard.down("Alt")
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=8); page.mouse.up()
    if alt: page.keyboard.up("Alt")


def mode(page, v=None):
    return page.evaluate("""async (v) => { const R = await import('/src/extensions/registry.ts'), o = R.getTool('quickSelect').options(window.formvis.engine).find((x) => x.label === 'Selection'); if (v) o.set(v); return o.get(); }""", v)


def test_quick_selection_new_add_and_subtract(page):
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(240, 120, 'Q', 'white'); const c = e.activeLayer.raster.ctx;
      c.fillStyle = 'rgb(210,40,40)'; c.fillRect(0, 0, 120, 120); c.fillStyle = 'rgb(40,60,210)'; c.fillRect(120, 0, 120, 120); e.activeLayer.raster.touch(); e.setTool('quickSelect'); e.setBrush({ diameter: 20 }); }""")
    mode(page, 'new')
    n = page.evaluate(STEPS)
    stroke(page, (30, 60), (90, 60))
    assert page.evaluate(SEL, [60, 20]) > 128 and page.evaluate(SEL, [180, 60]) == 0             # the red, not the blue
    assert mode(page) == "add"                                                                   # New turns to Add
    stroke(page, (150, 60), (210, 60))
    assert page.evaluate(SEL, [180, 60]) > 128 and page.evaluate(SEL, [60, 60]) > 128            # added
    mode(page, 'subtract')
    stroke(page, (150, 60), (210, 60))
    assert page.evaluate(SEL, [180, 60]) == 0 and page.evaluate(SEL, [60, 60]) > 128             # taken away
    mode(page, 'add')
    stroke(page, (150, 60), (210, 60)); stroke(page, (150, 60), (210, 60), alt=True)
    assert page.evaluate(SEL, [180, 60]) == 0                                                    # Alt subtracts from Add
    assert page.evaluate(STEPS) == n + 5                                                         # a step a stroke
    mode(page, 'new')


def test_the_paint_bucket_fills_a_pattern_and_blends(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'B', 'white'); window.formvis.engine.setTool('bucket')")
    page.evaluate("window.formvis.engine.setBucket({ source: 'pattern', pattern: null, mode: 'normal', tolerance: 10 })")
    x, y = scr(page, 50, 50); page.mouse.click(x, y)
    got = page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), pat = E.allPatterns()[0].surface, c = document.createElement('canvas'); c.width = pat.width; c.height = pat.height; const g = c.getContext('2d'); g.drawImage(pat, 0, 0);
      const r = window.formvis.engine.activeLayer.raster.ctx, out = []; for (const [x, y] of [[13, 7], [77, 41], [150, 90]]) out.push([Array.from(r.getImageData(x, y, 1, 1).data).slice(0, 3), Array.from(g.getImageData(x % pat.width, y % pat.height, 1, 1).data).slice(0, 3)]); return out; }""")
    for a, b in got:
        assert all(abs(u - v) <= 3 for u, v in zip(a, b)), got                                    # the pattern, tiled from the corner
    page.evaluate("""() => { const e = window.formvis.engine; e.newDocument(200, 100, 'M', 'white'); const c = e.activeLayer.raster.ctx; c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 100); e.activeLayer.raster.touch();
      e.fg = { r: 200, g: 100, b: 50 }; e.setBucket({ source: 'fg', mode: 'multiply', tolerance: 10 }); }""")
    x, y = scr(page, 50, 50); page.mouse.click(x, y)
    px = page.evaluate("Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(50, 50, 1, 1).data).slice(0, 3)")
    assert all(abs(u - v) <= 3 for u, v in zip(px, [100, 50, 25])), px                          # 128 x fg / 255: multiplied
    page.evaluate("window.formvis.engine.setBucket({ source: 'fg', mode: 'normal' })")
