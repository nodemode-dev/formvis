# The tool audit (1.50.6): the Clone Stamp's Sample, Flow and Mode; the Gradient's Transparency and Method.
FLAT = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"   # a live gradient shows in the composite
PX = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster ? window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data : [0, 0, 0, 0])"


def opt(page, tool, label, value):
    page.evaluate("""async ([t, l, v]) => { const R = await import('/src/extensions/registry.ts'); R.getTool(t).options(window.formvis.engine).find((x) => x.label === l).set(v); }""", [tool, label, value])


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.formvis.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def clone_scene(page, sample, flow=100, mode='normal', base=None):
    page.evaluate("""(base) => { const e = window.formvis.engine; e.newDocument(200, 100, 'C', 'white'); e.fg = { r: 210, g: 30, b: 30 }; e.setBucket({ source: 'fg', mode: 'normal', tolerance: 0 }); e.paintBucket({ x: 5, y: 5 });
      e.addLayer(); const middle = e.activeLayer.id; if (base) { e.fg = base; e.paintBucket({ x: 5, y: 5 }); }
      e.addLayer(); e.fg = { r: 30, g: 60, b: 210 }; e.activeLayer.raster = null; e.paintBucket({ x: 5, y: 5 }); e.current.activeId = middle; e.emit('active', null);
      e.setTool('cloneStamp'); e.setBrush({ diameter: 16, hardness: 1, opacity: 1 }); }""", base)
    opt(page, 'cloneStamp', 'Sample', sample); opt(page, 'cloneStamp', 'Flow', flow); opt(page, 'cloneStamp', 'Mode', mode)
    x, y = scr(page, 30, 50); page.keyboard.down("Alt"); page.mouse.click(x, y); page.keyboard.up("Alt")     # the source
    x, y = scr(page, 140, 50); page.mouse.click(x, y)
    return page.evaluate(PX, [140, 50])


def test_the_clone_stamp_samples_current_below_or_all(page):
    assert clone_scene(page, 'current')[3] == 0                                                   # the active layer is empty
    assert clone_scene(page, 'below')[:3] == [210, 30, 30]                                        # the Background, not the blue above
    assert clone_scene(page, 'all')[:3] == [30, 60, 210]                                          # what shows
    a = clone_scene(page, 'below', flow=20)[3]
    assert 0 < a < 255, a                                                                         # Flow: a partial dab
    got = clone_scene(page, 'all', mode='multiply', base={"r": 128, "g": 128, "b": 128})
    assert all(abs(u - v) <= 3 for u, v in zip(got[:3], [15, 30, 105])), got                     # grey x blue
    opt(page, 'cloneStamp', 'Sample', 'current'); opt(page, 'cloneStamp', 'Flow', 100); opt(page, 'cloneStamp', 'Mode', 'normal')


def test_the_gradient_method_and_transparency(page):
    mids = {}
    for method in ('classic', 'linear', 'perceptual'):
        page.evaluate("window.formvis.engine.newDocument(256, 40, 'G', 'white'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }; window.formvis.engine.bg = { r: 255, g: 255, b: 255 }; window.formvis.engine.setTool('gradient')")
        page.evaluate("(m) => Object.assign(window.formvis.engine.gradientSettings, { shape: 'linear', style: 'background', reversed: false, method: m, transparency: true, blend: 'normal', opacity: 1, dither: false })", method)
        a = scr(page, 0, 20); b = scr(page, 255, 20)
        page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b, steps=6); page.mouse.up()
        page.keyboard.press("Enter")                                                            # a drag leaves an adjustable gradient; Enter applies it
        mids[method] = page.evaluate(FLAT, [128, 20])[0]
    assert 118 <= mids["classic"] <= 138 and mids["linear"] >= 175 and 88 <= mids["perceptual"] <= 110, mids
    for transparency, want in ((True, 0), (False, 255)):
        page.evaluate("window.formvis.engine.newDocument(256, 40, 'T', 'transparent'); window.formvis.engine.addLayer(); window.formvis.engine.setTool('gradient')")
        page.evaluate("(t) => Object.assign(window.formvis.engine.gradientSettings, { style: 'transparent', method: 'classic', transparency: t })", transparency)
        a = scr(page, 0, 20); b = scr(page, 255, 20)
        page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b, steps=6); page.mouse.up()
        page.keyboard.press("Enter")                                                            # a drag leaves an adjustable gradient; Enter applies it
        assert abs(page.evaluate(FLAT, [254, 20])[3] - want) <= 8, (transparency, page.evaluate(FLAT, [254, 20]))
    page.evaluate("Object.assign(window.formvis.engine.gradientSettings, { style: 'background', transparency: true })")
