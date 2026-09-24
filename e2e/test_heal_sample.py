SETUP = """async () => {
  const E = await import('/src/engine/index.ts');
  const e = window.sonny.engine;
  e.newDocument(200, 100, 'S', 'white');
  const p = e.current, bg = p.activeLayer, c = bg.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 100);
  c.fillStyle = 'rgb(200,40,40)'; c.fillRect(105, 15, 70, 70);
  c.fillStyle = '#000'; c.fillRect(38, 48, 5, 5);
  bg.raster.touch();
  e.addLayer(); const work = p.activeLayer; work.raster = new E.Raster(200, 100);   // empty: fully transparent
  e.addLayer(); const top = p.activeLayer; top.raster = new E.Raster(200, 100);
  const t = top.raster.ctx; t.fillStyle = 'rgb(40,40,200)'; t.fillRect(105, 15, 70, 70); top.raster.touch();
  p.activeId = work.id; p.selectedIds = new Set([work.id]); e.refresh();
  window.__work = work;
}"""
HEAL = """(sample) => {
  const e = window.sonny.engine;
  e.setTool('healingBrush');
  Object.assign(e.brush, { diameter: 40, hardness: 1, opacity: 1 });
  Object.assign(e.retouch, { healDiffusion: 1, healBlendMode: 'normal', healSample: sample });
  e.setCloneSource({ x: 140, y: 50 });
  e.beginRetouchStroke('healBrush', { x: 60, y: 50 }, false); e.strokeTo({ x: 61, y: 50 }); e.endStroke();
  const d = window.__work.raster.read(0, 0, 200, 100).data, i = (50 * 200 + 60) * 4;
  e.retouch.healSample = 'current'; e.retouch.healDiffusion = 7;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}"""
SPOT = """(all) => {
  const e = window.sonny.engine;
  e.setTool('spotHealing');
  Object.assign(e.brush, { diameter: 16, hardness: 1, opacity: 1 });
  e.retouch.spotSampleAll = all;
  e.beginRetouchStroke('heal', { x: 40, y: 50 }, false); e.strokeTo({ x: 41, y: 50 }); e.endStroke();
  const d = window.__work.raster.read(0, 0, 200, 100).data, i = (50 * 200 + 40) * 4;
  e.retouch.spotSampleAll = false;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}"""


def test_the_healing_brush_samples_what_its_menu_says(page):
    page.evaluate(SETUP)
    assert page.evaluate(HEAL, "current")[3] < 10                       # the empty layer has nothing to sample
    page.evaluate(SETUP)
    below = page.evaluate(HEAL, "below")
    assert below[3] > 245 and below[0] > 170 and below[2] < 80, below   # the red under it; the blue layer above ignored
    page.evaluate(SETUP)
    everything = page.evaluate(HEAL, "all")
    assert everything[3] > 245 and everything[2] > 170 and everything[0] < 80, everything   # what is shown: blue


def test_spot_healing_sample_all_layers_repairs_onto_an_empty_layer(page):
    page.evaluate(SETUP)
    assert page.evaluate(SPOT, False)[3] < 10                           # alone, the empty layer stays empty
    page.evaluate(SETUP)
    fixed = page.evaluate(SPOT, True)
    assert fixed[3] > 245 and all(abs(v - 128) < 30 for v in fixed[:3]), fixed   # the dot covered with the grey around it
