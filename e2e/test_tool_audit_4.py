# The tool audit (1.50.7): Protect Tones, Vibrance, the Eyedropper's Sample, Zoom's 100% and Fill Screen.
import colorsys


def tone(page, kind, colour, passes=4, **settings):
    return page.evaluate("""([kind, c, st, n]) => { const e = window.formvis.engine; e.newDocument(120, 60, 'T', 'white'); const x = e.activeLayer.raster.ctx;
      x.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; x.fillRect(0, 0, 120, 60); e.activeLayer.raster.touch();
      e.setTool(kind); e.setTone(st); e.setBrush({ diameter: 50, hardness: 1, opacity: 1 });
      for (let k = 0; k < n; k++) { e.beginRetouchStroke(kind, { x: 20, y: 30 }, false); for (let i = 1; i <= 16; i++) e.strokeTo({ x: 20 + i * 5, y: 30 }, 1); e.endStroke(); }
      return Array.from(e.activeLayer.raster.ctx.getImageData(60, 30, 1, 1).data).slice(0, 3); }""", [kind, colour, settings, passes])


def hue(c):
    return colorsys.rgb_to_hsv(*(v / 255 for v in c))[0] * 360


def sat(c):
    return colorsys.rgb_to_hsv(*(v / 255 for v in c))[1]


def test_protect_tones_keeps_the_colour(page):
    # Measured first: without Protect Tones a dodged orange washes toward white; with it, it keeps its colour.
    orange = [230, 120, 40]
    off = tone(page, 'dodge', orange, range='midtones', exposure=0.6, protectTones=False, passes=1)
    on = tone(page, 'dodge', orange, range='midtones', exposure=0.6, protectTones=True, passes=1)
    assert sat(on) > sat(off) + 0.05 and abs(hue(on) - hue(orange)) <= 2 and sum(on) > sum(orange), (off, on)


def test_vibrance_keeps_vivid_colours_from_clipping(page):
    vivid, dull = [200, 80, 70], [150, 120, 110]
    off = tone(page, 'sponge', vivid, spongeMode='saturate', flow=0.8, vibrance=False, passes=1)
    on = tone(page, 'sponge', vivid, spongeMode='saturate', flow=0.8, vibrance=True, passes=1)
    assert max(off) == 255 and max(on) < 250 and sat(on) > sat(vivid), (off, on)                 # clipped without; clear with
    d_off = tone(page, 'sponge', dull, spongeMode='saturate', flow=0.8, vibrance=False, passes=1)
    d_on = tone(page, 'sponge', dull, spongeMode='saturate', flow=0.8, vibrance=True, passes=1)
    assert sat(d_on) > sat(dull) + 0.05 and abs(sat(d_on) - sat(d_off)) < 0.05, (d_off, d_on)      # the dull one saturates alike


def test_the_eyedropper_samples_current_below_or_all(page):
    page.evaluate("""async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine; e.newDocument(100, 60, 'E', 'white'); e.fg = { r: 200, g: 30, b: 30 }; e.setBucket({ source: 'fg', mode: 'normal', tolerance: 0 }); e.paintBucket({ x: 5, y: 5 });
      window.__bottom = e.activeLayer.id; e.addLayer(); window.__top = e.activeLayer.id; e.fg = { r: 30, g: 60, b: 210 };
      e.applySelection(E.SelectionMask.cropped(0, 0, 50, 60, new Uint8Array(3000).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); e.current.activeId = window.__bottom; }""")
    read = lambda s, x: page.evaluate("([s, x]) => { const e = window.formvis.engine; e.eyedropperSample = s; return e.sampleColor({ x, y: 30 }); }", [s, x])
    assert read('current', 20) == {"r": 200, "g": 30, "b": 30} and read('below', 20) == {"r": 200, "g": 30, "b": 30}
    assert read('all', 20) == {"r": 30, "g": 60, "b": 210}
    page.evaluate("window.formvis.engine.current.activeId = window.__top")
    assert read('current', 80) is None and read('current', 20) == {"r": 30, "g": 60, "b": 210}   # the top layer is empty at the right
    page.evaluate("window.formvis.engine.eyedropperSample = 'all'")


def test_zoom_100_and_fill_screen(page):
    page.evaluate("window.formvis.engine.newDocument(300, 100, 'Z', 'white'); window.formvis.engine.setTool('zoom')")
    page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'); R.getTool('zoom').options(window.formvis.engine).find((o) => o.label === '100%').run(); }""")
    assert page.evaluate("window.formvis.engine.current.viewport.zoom") == 1
    page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'); R.getTool('zoom').options(window.formvis.engine).find((o) => o.label === 'Fill Screen').run(); }""")
    v = page.evaluate("(async () => { const V = (await import('/src/engine/viewport.ts')).Viewport, v = window.formvis.engine.current.viewport; return [v.zoom * 300, v.zoom * 100, v.width - V.insetRight, v.height]; })()")
    assert v[0] >= v[2] - 1 and v[1] >= v[3] - 1 and (abs(v[0] - v[2]) <= 1 or abs(v[1] - v[3]) <= 1), v
