PATCH = """(opts) => {
  const e = window.sonny.engine;
  e.newDocument(200, 100, 'P', 'white');
  const l = e.current.activeLayer, c = l.raster.ctx;
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 200, 100);
  for (let y = 20; y < 80; y += 4) for (let x = 112; x < 192; x += 4) { c.fillStyle = ((x + y) / 4) % 2 ? 'rgb(100,100,100)' : 'rgb(156,156,156)'; c.fillRect(x, y, 4, 4); }
  c.fillStyle = '#000'; c.fillRect(38, 48, 5, 5);
  l.raster.touch(); e.refresh();
  Object.assign(e.retouch, { patchMode: 'normal', patchFrom: 'source', patchTransparent: false }, opts);
  const from = opts.patchFrom === 'destination';
  e.applySelection(window.__sel(from ? 120 : 20, 30, 40, 40), 'replace', 'Sel');
  e.patchSelection(from ? -100 : 100, 0);
  const d = l.raster.read(0, 0, 200, 100).data, at = (x, y) => d[(y * 200 + x) * 4];
  const std = (x0, y0, w, h) => { let s = 0, s2 = 0, n = w * h; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const v = at(x, y); s += v; s2 += v * v; } return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)); };
  const sel = e.current.selection;
  return { step: e.historySteps.names.slice(-1)[0], texA: std(24, 34, 12, 12), dot: at(40, 50), texB: std(124, 34, 12, 12), selX: sel ? sel.x : null };
}"""
SETUP = "async () => { const E = await import('/src/engine/index.ts'); window.__sel = (x, y, w, h) => E.SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)); }"


def run(page, opts):
    page.evaluate(SETUP)
    return page.evaluate(PATCH, opts)


def test_source_mode_brings_texture_into_the_selection(page):
    r = run(page, {})
    assert r["step"] == "Patch" and r["texA"] > 15 and r["dot"] > 60 and r["texB"] > 15 and r["selX"] == 20, r


def test_destination_mode_copies_the_selection_onto_the_drop(page):
    r = run(page, {"patchFrom": "destination"})
    # the checker area was selected and dropped on the grey area: grey gains texture, the checker stays, the selection moves
    assert r["step"] == "Patch" and r["texA"] > 15 and r["texB"] > 15 and r["selX"] == 20, r


def test_transparent_keeps_what_was_underneath(page):
    normal, transparent = run(page, {}), run(page, {"patchTransparent": True})
    assert normal["dot"] > 60, normal
    assert transparent["dot"] < 60 and transparent["texA"] > 15, transparent


def test_content_aware_patch_runs_as_one_step(page):
    r = run(page, {"patchMode": "contentAware"})
    assert r["step"] == "Patch" and r["texA"] > 10, r
    assert page.evaluate("window.sonny.engine.historySteps.names.filter((n) => n === 'Patch').length") == 1
