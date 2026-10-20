HEAL = """([mode, hardness]) => {
  const e = window.formvis.engine;
  e.newDocument(200, 100, 'H', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 100);
  c.fillStyle = 'rgb(200,40,40)'; c.fillRect(105, 15, 70, 70);
  l.raster.touch(); e.refresh();
  e.setTool('healingBrush');
  Object.assign(e.brush, { diameter: 50, hardness, opacity: 1 });
  Object.assign(e.retouch, { healDiffusion: 1, healBlendMode: mode });
  e.setCloneSource({ x: 140, y: 50 });
  e.beginRetouchStroke('healBrush', { x: 40, y: 50 }, false);
  e.strokeTo({ x: 41, y: 50 });
  e.endStroke();
  const d = l.raster.read(0, 0, 200, 100).data, px = (x, y) => Array.from(d.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 3));
  let ring = 0, same = 0;
  for (let y = 25; y < 76; y++) for (let x = 15; x < 67; x++) {
    const r = Math.hypot(x - 40.5, y - 50); if (r < 4 || r > 11) continue;   // measured: the soft heal fades over r 4 to 12
    ring++; const i = (y * 200 + x) * 4; if (d[i] === 128 && d[i + 1] === 128 && d[i + 2] === 128) same++;
  }
  Object.assign(e.retouch, { healDiffusion: 7, healBlendMode: 'normal' });
  return { centre: px(40, 50), untouched: same / ring };
}"""
BAR = ":is(.cv-opt-group:not([hidden]), .cv-opt-pop-sect[style*=contents])"
near = lambda p, q: all(abs(a - b) <= 6 for a, b in zip(p, q))


def more(page):
    page.evaluate("document.querySelector('.cv-opt-more:not([hidden])[aria-expanded=false]')?.click()")


def test_each_mode_composes_the_heal_as_its_formula_says(page):
    heal = page.evaluate(HEAL, ["normal", 1])["centre"]
    assert near(heal, [200, 40, 40]), heal
    assert near(page.evaluate(HEAL, ["lighten", 1])["centre"], [200, 128, 128])
    assert near(page.evaluate(HEAL, ["darken", 1])["centre"], [128, 40, 40])
    assert near(page.evaluate(HEAL, ["multiply", 1])["centre"], [100, 20, 20])


def test_replace_never_averages_at_a_soft_edge(page):
    normal = page.evaluate(HEAL, ["normal", 0])["untouched"]
    replace = page.evaluate(HEAL, ["replace", 0])["untouched"]
    assert normal < 0.05, normal          # Normal mixes nearly every ring pixel
    assert replace > 0.2, replace         # Replace leaves whole pixels untouched instead


def test_both_bars_offer_the_mode(page):
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(100, 60, 'B', 'white'); e.setTool('healingBrush'); })()")
    more(page)
    bar = page.locator(BAR)
    row = bar.locator(".cv-opt:not([hidden])", has_text="Mode").first
    row.wait_for()
    row.locator("select").select_option(label="Replace")
    assert page.evaluate("window.formvis.engine.retouch.healBlendMode") == "replace"
    page.evaluate("window.formvis.engine.setTool('spotHealing')")
    more(page)
    row = bar.locator(".cv-opt:not([hidden])", has_text="Mode").first
    page.wait_for_function("[...document.querySelectorAll(':is(.cv-opt-group:not([hidden]), .cv-opt-pop-sect[style*=contents]) .cv-opt:not([hidden])')].some((o) => o.textContent.includes('Proximity Match'))")
    row.locator("select").select_option(label="Lighten")
    assert page.evaluate("window.formvis.engine.retouch.spotBlendMode") == "lighten"
    page.evaluate("Object.assign(window.formvis.engine.retouch, { healBlendMode: 'normal', spotBlendMode: 'normal' })")
