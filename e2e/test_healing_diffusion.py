HEAL = """(diffusion) => {
  const e = window.formvis.engine;
  e.newDocument(200, 100, 'H', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 100);
  c.fillStyle = 'rgb(200,40,40)'; c.fillRect(105, 15, 70, 70);
  l.raster.touch(); e.refresh();
  e.setTool('healingBrush');
  Object.assign(e.brush, { diameter: 50, hardness: 1, opacity: 1 });
  e.retouch.healDiffusion = diffusion;
  e.setCloneSource({ x: 140, y: 50 });
  e.beginRetouchStroke('healBrush', { x: 40, y: 50 }, false);
  e.strokeTo({ x: 41, y: 50 });
  e.endStroke();
  const d = l.raster.read(0, 0, 200, 100).data, i = (50 * 200 + 40) * 4;
  return [d[i], d[i + 1], d[i + 2], e.historySteps.names.slice(-1)[0]];
}"""
RED = lambda p: p[0] > 170 and p[1] < 80
GREY = lambda p: abs(p[0] - 128) < 25 and abs(p[1] - 128) < 25


def test_healing_brush_diffusion_fades_the_colour_correction(page):
    full = page.evaluate(HEAL, 7)
    assert GREY(full), full                         # the default: full adaptation, as before
    kept = page.evaluate(HEAL, 1)
    assert RED(kept), kept                          # low diffusion keeps the source's own colour inside
    assert kept[3] == full[3]                       # one step either way


def test_the_healing_brush_bar_sets_diffusion(page):
    page.evaluate("(() => { const e = window.formvis.engine; e.newDocument(100, 60, 'B', 'white'); e.setTool('healingBrush'); })()")
    page.evaluate("document.querySelector('.cv-opt-more:not([hidden])[aria-expanded=false]')?.click()")
    bar = page.locator(":is(.cv-opt-group:not([hidden]), .cv-opt-pop-sect[style*=contents])")
    row = bar.locator(".cv-opt:not([hidden])", has_text="Diffusion").first
    row.wait_for()                                  # the bar updates on its next frame
    box = row.locator("input[type=number]")
    box.fill("2"); page.keyboard.press("Tab")
    assert page.evaluate("window.formvis.engine.retouch.healDiffusion") == 2
    page.evaluate("window.formvis.engine.retouch.healDiffusion = 7")
