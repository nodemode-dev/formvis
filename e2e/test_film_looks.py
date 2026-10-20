# Film looks (1.51.6): Split Toning, Halation and Glow adjustments, grain presets, and the Light Leak and Frame layers.
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3)"


def adjust(page, kind, params, scene):
    page.evaluate("""([kind, params, scene]) => { const e = window.formvis.engine; e.newDocument(120, 80, 'F', 'white'); const c = e.activeLayer.raster.ctx;
      if (scene === 'greys') { c.fillStyle = 'rgb(50,50,50)'; c.fillRect(0, 0, 60, 80); c.fillStyle = 'rgb(210,210,210)'; c.fillRect(60, 0, 60, 80); }
      else { c.fillStyle = '#000'; c.fillRect(0, 0, 120, 80); c.fillStyle = '#fff'; c.fillRect(50, 30, 20, 20); }
      e.activeLayer.raster.touch(); e.addAdjustmentLayer(kind); e.current.activeLayer.adjustment.data.params = params; e.emit('render', null); }""", [kind, params, scene])


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def test_split_toning_tints_shadows_and_highlights_keeping_brightness(page):
    adjust(page, "splitToning", {"shadowHue": 210, "shadowSat": 100, "highlightHue": 30, "highlightSat": 100, "balance": 0}, "greys")
    dark, light = page.evaluate(PX, [20, 40]), page.evaluate(PX, [100, 40])
    assert dark[2] > dark[0] + 10 and light[0] > light[2] + 10, (dark, light)                   # blue shadows, orange highlights
    assert abs(lum(dark) - 50) <= 8 and abs(lum(light) - 210) <= 8, (dark, light)               # brightness kept


def test_halation_fringes_red_and_glow_fringes_neutral(page):
    adjust(page, "halation", {"amount": 100, "radius": 20, "threshold": 50}, "square")
    near, far = page.evaluate(PX, [45, 40]), page.evaluate(PX, [3, 3])
    assert near[0] > near[1] > near[2] and near[0] > 25 and far == [0, 0, 0], (near, far)
    adjust(page, "glow", {"amount": 100, "radius": 20, "threshold": 50}, "square")
    g = page.evaluate(PX, [45, 40])
    assert g[0] > 25 and abs(g[0] - g[1]) <= 3 and abs(g[1] - g[2]) <= 3, g                     # its own (white) colour


def test_grain_presets_set_the_three_and_show_custom_after(page):
    page.evaluate("window.formvis.engine.newDocument(60, 40, 'G', 'white'); window.formvis.engine.addAdjustmentLayer('grain'); window.formvis.commands.run('edit-adjustment')")   # the controls are in Edit Adjustment
    sel = page.locator("select[aria-label='Grain preset']:visible")
    sel.select_option("iso1600")
    got = page.evaluate("(() => { const g = window.formvis.engine.current.activeLayer.adjustment.data.grainSettings; return [g.amount, g.size, g.roughness]; })()")
    assert got == [50, 2.8, 70], got
    slider = page.locator(".cv-panel-section:visible", has=sel).locator("input[type=number]").nth(1)
    slider.fill("51"); slider.press("Tab")
    page.wait_for_function("() => [...document.querySelectorAll('select[aria-label=\"Grain preset\"]')].some((s) => s.offsetParent && s.value === 'custom')")


def test_light_leak_and_frame_layers(page):
    page.evaluate("window.formvis.engine.newDocument(200, 120, 'L', 'white'); window.formvis.engine.fg = { r: 0, g: 0, b: 0 }; window.formvis.engine.fill('fg')")   # black, which Screen can brighten
    assert page.evaluate("window.formvis.engine.addFilmLayer({ kind: 'leak', color: 'amber', from: 'left', size: 60 })")
    l = page.evaluate("(() => { const l = window.formvis.engine.activeLayer; return [l.name, l.blend]; })()")
    left, right = page.evaluate(PX, [5, 55]), page.evaluate(PX, [195, 60])
    assert l == ["Light Leak", "screen"] and left[0] > right[0] + 40 and left[0] > left[2], (l, left, right)
    page.evaluate("window.formvis.engine.newDocument(200, 120, 'R', 'white'); window.formvis.engine.addFilmLayer({ kind: 'frame', style: 'film', width: 10 })")
    a = page.evaluate("([x, y]) => window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data[3]", [3, 60])
    mid = page.evaluate("([x, y]) => window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data[3]", [100, 60])
    corner = page.evaluate("([x, y]) => window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data[3]", [13, 13])
    assert (a, mid, corner) == (255, 0, 255), (a, mid, corner)                                     # border, clear middle, rounded inner corner
