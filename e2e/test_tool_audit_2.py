# The tool audit (1.50.4): the Brush's Airbrush; Type's Anti-aliasing, Color, and the bar restyling the selected type
# layer; the Magic Wand's sample sizes and buttons.
def opt(page, tool, label, value=None):
    return page.evaluate("""async ([t, l, v]) => { const R = await import('/src/extensions/registry.ts'), o = R.getTool(t).options(window.sonny.engine).find((x) => x.label === l); if (!o) return null; if (v !== null) (o.set ?? o.run)(v); return o.get ? o.get() : true; }""", [tool, label, value])


def scr(page, x, y):
    return page.evaluate("([x, y]) => { const v = window.sonny.engine.current.viewport, s = document.querySelector('.cv-stage').getBoundingClientRect(), q = v.toScreen(x, y); return [s.left + q.x, s.top + q.y]; }", [x, y])


def test_the_airbrush_builds_up_while_still(page):
    alpha = {}
    for on in (False, True):
        page.evaluate("window.sonny.engine.newDocument(200, 100, 'A', 'transparent'); window.sonny.engine.addLayer(); window.sonny.engine.setTool('brush'); window.sonny.engine.setBrushBlend('normal'); window.sonny.engine.fg = { r: 0, g: 0, b: 0 }; window.sonny.engine.setBrush({ diameter: 30, hardness: 1, opacity: 1 }); window.sonny.engine.brushFlow = 0.1")
        opt(page, 'brush', 'Airbrush', on)
        x, y = scr(page, 100, 50)
        page.mouse.move(x, y); page.mouse.down(); page.wait_for_timeout(700); page.mouse.up()
        alpha[on] = page.evaluate("window.sonny.engine.activeLayer.raster.ctx.getImageData(100, 50, 1, 1).data[3]")
    opt(page, 'brush', 'Airbrush', False); page.evaluate("window.sonny.engine.brushFlow = 1")
    assert alpha[True] > alpha[False] + 80, alpha                                                  # built up while still


def test_type_anti_aliasing_colour_and_the_selected_layer(page):
    partial = {}
    for how in ("smooth", "sharp", "none"):
        page.evaluate("""async (how) => { const e = window.sonny.engine; e.newDocument(300, 120, 'T', 'white'); e.fg = { r: 0, g: 0, b: 0 };
          await e.createTextLayer({ x: 10, y: 80 }, { ...e.textSettings, content: 'Asgw', size: 60, color: e.fg, box: null, direction: 'horizontal', antialias: how }); }""", how)
        partial[how] = page.evaluate("(() => { const r = window.sonny.engine.activeLayer.raster, d = r.ctx.getImageData(0, 0, r.width, r.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0 && d[i] < 255) n++; return n; })()")
    assert partial["none"] == 0 and partial["sharp"] < partial["smooth"], partial
    # The bar restyles the selected type layer (not being typed), and the swatch recolours it.
    page.evaluate("window.sonny.engine.setTool('type')")
    w0 = page.evaluate("window.sonny.engine.activeLayer.raster.width")
    opt(page, 'type', 'Size', 90)
    page.wait_for_function(f"window.sonny.engine.activeLayer.raster.width > {w0}")
    assert page.locator(".cv-options input[type='color']").count() == 1
    opt(page, 'type', 'Color', {"r": 200, "g": 30, "b": 30})
    page.wait_for_function("window.sonny.engine.activeLayer.text.color.r === 200")
    assert page.evaluate("window.sonny.engine.fg") == {"r": 200, "g": 30, "b": 30}
    opt(page, 'type', 'Size', 36)


def test_the_magic_wand_sizes_and_buttons(page):
    page.evaluate("window.sonny.engine.newDocument(100, 60, 'W', 'white')")
    labels = page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'), o = R.getTool('wand').options(window.sonny.engine); return [o.find((x) => x.label === 'Sample Size').choices.map((c) => c.label), o.map((x) => x.label)]; }""")
    assert labels[0][-1] == "101 by 101" and len(labels[0]) == 7, labels[0]
    assert "Select Subject" in labels[1] and "Select and Mask..." in labels[1]
    opt(page, 'wand', 'Sample Size', '50')
    assert page.evaluate("window.sonny.engine.wand.sampleSize") == 50
    opt(page, 'wand', 'Sample Size', '0')
