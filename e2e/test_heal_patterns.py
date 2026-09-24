SETUP = """async () => {
  const E = await import('/src/engine/index.ts');
  const e = window.sonny.engine;
  e.newDocument(200, 100, 'P', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 100);
  l.raster.touch(); e.refresh();
  const s = E.createSurface(8, 8), sc = E.ctxOf(s); sc.fillStyle = 'rgb(200,40,40)'; sc.fillRect(0, 0, 8, 8);
  window.__pat = E.addPattern('Test Red', s).id;
  window.__sel = (x, y, w, h) => E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255));
}"""
CENTRE = "(() => { const d = window.sonny.engine.current.activeLayer.raster.read(0, 0, 200, 100).data, i = (50 * 200 + 40) * 4; return [d[i], d[i + 1], d[i + 2]]; })()"
HEAL = """(diffusion) => {
  const e = window.sonny.engine;
  e.cloneSource = null;
  e.setTool('healingBrush');
  Object.assign(e.brush, { diameter: 50, hardness: 1, opacity: 1 });
  Object.assign(e.retouch, { healSource: 'pattern', healPattern: window.__pat, healDiffusion: diffusion, healSample: 'current', healBlendMode: 'normal' });
  const began = e.beginRetouchStroke('healBrush', { x: 40, y: 50 }, false);
  e.strokeTo({ x: 41, y: 50 }); e.endStroke();
  Object.assign(e.retouch, { healSource: 'sampled', healDiffusion: 7 });
  return began;
}"""
PATCH = """(diffusion) => {
  const e = window.sonny.engine;
  Object.assign(e.retouch, { patchMode: 'normal', patchPattern: window.__pat, patchDiffusion: diffusion });
  e.applySelection(window.__sel(20, 30, 40, 40), 'replace', 'Sel');
  e.patchWithPattern();
  e.retouch.patchDiffusion = 7;
  return e.historySteps.names.slice(-1)[0];
}"""
RED = lambda p: p[0] > 170 and p[1] < 80
GREY = lambda p: abs(p[0] - 128) < 25 and abs(p[1] - 128) < 25


def test_the_healing_brush_heals_from_a_pattern_without_a_source_point(page):
    page.evaluate(SETUP)
    assert page.evaluate(HEAL, 1) is True                    # no Alt-click needed with Source: Pattern
    assert RED(page.evaluate(CENTRE)), page.evaluate(CENTRE) # low diffusion keeps the pattern's colour inside
    page.evaluate(SETUP)
    page.evaluate(HEAL, 7)
    assert GREY(page.evaluate(CENTRE)), page.evaluate(CENTRE) # full diffusion adapts it to the grey around


def test_patch_use_pattern_heals_the_selection_from_the_pattern(page):
    page.evaluate(SETUP)
    assert page.evaluate(PATCH, 1) == "Patch"                # one undo step
    assert RED(page.evaluate(CENTRE)), page.evaluate(CENTRE)
    page.evaluate(SETUP)
    page.evaluate(PATCH, 7)
    assert GREY(page.evaluate(CENTRE)), page.evaluate(CENTRE)


def test_the_bars_offer_the_pattern_and_use_pattern_applies(page):
    page.evaluate(SETUP)
    page.evaluate("window.sonny.engine.setTool('healingBrush')")
    bar = page.locator(".cv-opt-group:not([hidden])")
    bar.get_by_role("button", name="Pattern", exact=True).click()
    bar.locator(".cv-opt:not([hidden])", has_text="Pattern").locator("select").first.wait_for()   # the bar's next frame
    assert page.evaluate("window.sonny.engine.retouch.healSource") == "pattern"
    bar.get_by_role("button", name="Sampled", exact=True).click()
    page.evaluate("(() => { const e = window.sonny.engine; e.setTool('patch'); Object.assign(e.retouch, { patchMode: 'normal', patchPattern: window.__pat, patchDiffusion: 1 }); e.applySelection(window.__sel(20, 30, 40, 40), 'replace', 'Sel'); e.emit('options', null); })()")
    button = bar.get_by_role("button", name="Use Pattern")
    button.wait_for()
    button.click()
    assert RED(page.evaluate(CENTRE)), page.evaluate(CENTRE)
    page.evaluate("window.sonny.engine.retouch.patchDiffusion = 7")
