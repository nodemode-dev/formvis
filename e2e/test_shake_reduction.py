SCENE = """async () => {
  const e = window.sonny.engine, E = await import('/src/engine/index.ts');
  e.newDocument(260, 180, 'K', 'white');
  const l = e.current.activeLayer, w = 260, h = 180;
  let s = 11; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const raw = Array.from({ length: w * h }, () => rnd() * 255), img = new ImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { a += raw[yy * w + xx]; n++; } } const v = Math.round(a / n); img.data.set([v, v, v, 255], (y * w + x) * 4); }
  l.raster.ctx.putImageData(E.motionBlur(img, 30, 14), 0, 0); l.raster.touch(); e.refresh();
}"""
ENERGY = "(() => { const d = window.sonny.engine.flattened().getContext('2d').getImageData(20, 20, 220, 140).data; let s = 0; for (let y = 0; y < 139; y++) for (let x = 0; x < 219; x++) { const i = (y * 220 + x) * 4; s += Math.abs(d[i + 4] - d[i]) + Math.abs(d[i + 220 * 4] - d[i]); } return s; })()"


def test_shake_reduction_estimates_the_trace_and_sharpens(page):
    page.evaluate(SCENE)
    before = page.evaluate(ENERGY)
    assert page.evaluate("window.sonny.commands.run('filter-shakeReduction')") is True
    d = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    d.locator(".cv-field", has_text="Trace angle").wait_for(state="visible")
    angle = float(d.locator(".cv-field", has_text="Trace angle").locator("input[type=number]").input_value())
    length = float(d.locator(".cv-field", has_text="Trace length").locator("input[type=number]").input_value())
    gap = abs(angle - 30) % 180
    assert min(gap, 180 - gap) <= 6 and abs(length - 14) <= 4, (angle, length)
    assert d.locator("p.cv-note", has_text="Estimated a straight").is_visible()
    d.locator(".cv-dialog-foot button", has_text="OK").click()
    page.wait_for_function("window.sonny.engine.historySteps.names.slice(-1)[0] === 'Shake Reduction'", timeout=20000)
    after = page.evaluate(ENERGY)
    assert after > before * 1.3, (before, after)
    page.evaluate("window.sonny.engine.undo()")
    assert abs(page.evaluate(ENERGY) - before) < before * 0.01
