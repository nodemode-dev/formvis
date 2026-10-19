# The Brush's Mode (1.50.3, the tool audit): blend modes, Behind and Clear; only modes that truly draw.
SETUP = """(mode) => { const e = window.formvis.engine; e.newDocument(200, 60, 'M', 'transparent'); e.addLayer(); const c = e.activeLayer.raster ? e.activeLayer.raster.ctx : null;
  e.fg = { r: 90, g: 140, b: 200 }; e.setBucket({ source: 'fg', mode: 'normal', tolerance: 0 }); e.paintBucket({ x: 10, y: 10 });                 // the layer mid-blue
  e.activeLayer.raster.ctx.clearRect(150, 0, 50, 60); e.activeLayer.raster.touch();                                                              // but empty at the right
  e.setTool('brush'); e.setBrushMode('paint'); e.setBrushBlend(mode); e.fg = { r: 200, g: 100, b: 50 }; e.setBrush({ diameter: 20, hardness: 1, opacity: 1 });
  e.beginStroke({ x: 10, y: 30 }, false, 1); for (let i = 1; i <= 20; i++) e.strokeTo({ x: 10 + i * 9, y: 30 }, 1); e.endStroke(); }"""
PX = "([x, y]) => Array.from(window.formvis.engine.activeLayer.raster.ctx.getImageData(x, y, 1, 1).data)"


def near(a, b, t=3):
    return all(abs(u - v) <= t for u, v in zip(a, b))


def test_multiply_behind_and_clear(page):
    page.evaluate(SETUP, "multiply")
    assert near(page.evaluate(PX, [80, 30]), [71, 55, 39, 255]), page.evaluate(PX, [80, 30])            # 200x90, 100x140, 50x200 / 255
    page.evaluate(SETUP, "behind")
    assert near(page.evaluate(PX, [80, 30]), [90, 140, 200, 255]) and near(page.evaluate(PX, [180, 30]), [200, 100, 50, 255])   # only where empty
    page.evaluate(SETUP, "clear")
    assert page.evaluate(PX, [80, 30])[3] == 0 and page.evaluate(PX, [80, 5])[3] == 255                  # erased along the stroke


def test_every_listed_mode_truly_draws(page):
    modes = page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'); return R.getTool('brush').options(window.formvis.engine).find((o) => o.label === 'Mode').choices.map((c) => c.id); }""")
    assert modes[:3] == ["normal", "behind", "clear"] and "linear-burn" not in modes and "hard-mix" not in modes, modes
    page.evaluate(SETUP, "normal"); normal = page.evaluate(PX, [80, 30])
    same = []
    for m in modes[3:]:
        page.evaluate(SETUP, m)
        if page.evaluate(PX, [80, 30]) == normal: same.append(m)
    assert same == [], same                                                                              # none falls back to Normal
    bucket = page.evaluate("""async () => { const R = await import('/src/extensions/registry.ts'); return R.getTool('bucket').options(window.formvis.engine).find((o) => o.label === 'Mode').choices.map((c) => c.id); }""")
    assert "linear-burn" not in bucket and "divide" not in bucket and "multiply" in bucket, bucket
    page.evaluate("window.formvis.engine.setBrushBlend('normal')")
