# Layer > Color Match (1.51.3): a layer matched to what is beneath or around it, as a clipped Curves layer.
SCENE = """(o) => { const e = window.formvis.engine; e.newDocument(200, 160, 'M', 'white');
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const paint = (c, x0, y0, w, h, mean, sd) => { const img = c.getImageData(x0, y0, w, h); for (let i = 0; i < w * h; i++) { const n = (rnd() - 0.5) * 2 * sd; for (let k = 0; k < 3; k++) img.data[i * 4 + k] = Math.max(0, Math.min(255, mean[k] + n)); img.data[i * 4 + 3] = 255; } c.putImageData(img, x0, y0); };
  const bg = e.activeLayer.raster.ctx; paint(bg, 0, 0, 200, 160, [90, 110, 150], 15);
  if (o.redUnder) paint(bg, 60, 50, 80, 60, [200, 40, 40], 10);   // exactly under the patch, so the band around it is blue alone
  e.activeLayer.raster.touch();
  e.addLayer(); e.fg = { r: 0, g: 0, b: 0 }; e.paintBucket({ x: 1, y: 1 }); const r = e.activeLayer.raster.ctx; r.clearRect(0, 0, 200, 160); paint(r, 60, 50, 80, 60, [170, 120, 80], 35); e.activeLayer.raster.touch();
  window.__patch = e.activeLayer.id; return e.activeLayer.id; }"""
MEAN = """([x0, y0, w, h]) => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(x0, y0, w, h).data, s = [0, 0, 0], q = [0, 0, 0], n = w * h;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { s[k] += d[i * 4 + k]; q[k] += d[i * 4 + k] ** 2; } return s.map((v, k) => [Math.round(v / n), Math.round(Math.sqrt(q[k] / n - (v / n) ** 2))]); }"""


def test_matched_to_what_is_beneath_without_touching_the_pixels(page):
    pid = page.evaluate(SCENE, {})
    before = page.evaluate("(id) => Array.from(window.formvis.engine.current.layer(id).raster.ctx.getImageData(60, 50, 80, 60).data.slice(0, 4000))", pid)
    n = page.evaluate("window.formvis.engine.current.history.past.length")
    assert page.evaluate("(id) => window.formvis.engine.colorMatch(id, 'beneath', 1)", pid)
    got = page.evaluate(MEAN, [60, 50, 80, 60])
    for (m, sd), want in zip(got, [(90, 15 * 0.58), (110, 15 * 0.58), (150, 15 * 0.58)]):
        assert abs(m - want[0]) <= 6 and abs(sd - want[1]) <= 5, got                             # the background's mean and spread
    layer = page.evaluate("(id) => { const l = window.formvis.engine.current.doc.layers.find((x) => x.name === 'Color Match'); return [l.clipId === id, l.adjustment.kind, l.opacity]; }", pid)
    assert layer == [True, "curves", 1]
    assert page.evaluate("(id) => Array.from(window.formvis.engine.current.layer(id).raster.ctx.getImageData(60, 50, 80, 60).data.slice(0, 4000))", pid) == before   # untouched
    assert page.evaluate("(id) => window.formvis.engine.colorMatch(id, 'beneath', 0.4)", pid)
    part = page.evaluate(MEAN, [60, 50, 80, 60])
    assert 170 - 10 > part[0][0] > 90 + 10 and page.evaluate("window.formvis.engine.current.doc.layers.filter((x) => x.name === 'Color Match').length") == 1   # partway; updated, not stacked
    page.keyboard.press("Control+z"); page.keyboard.press("Control+z")
    assert page.evaluate("window.formvis.engine.current.history.past.length") == n and not page.evaluate("window.formvis.engine.current.doc.layers.some((x) => x.name === 'Color Match')")


def test_matched_to_what_is_around_takes_the_surroundings(page):
    pid = page.evaluate(SCENE, {"redUnder": True})
    assert page.evaluate("(id) => window.formvis.engine.colorMatch(id, 'around', 1)", pid)
    r, g, b = [m for m, _ in page.evaluate(MEAN, [60, 50, 80, 60])]
    assert b > r + 20 and abs(b - 150) <= 12, (r, g, b)                                           # the blue around, not the red beneath
