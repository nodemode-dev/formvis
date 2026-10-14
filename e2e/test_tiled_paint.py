"""Painting on a giant layer kept in tiles (1.62.5, DEV_PLAN 26.6d). A stroke across tile edges on a 30,000 by 20,000
document lands exactly as the same stroke on an ordinary layer (both through the stroke's window), shows while it is
painted, undoes and redoes exactly, and undo brings back tiles that went to disk; what needs the whole layer (the Mixer
Brush) declines before any step opens."""
import urllib.request

import pytest

SETUP = """async () => {
  const e = window.formvis.engine;
  window.__hash = (d) => { const u = new Uint32Array(d.buffer); let h = 2166136261; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); return h >>> 0; };
  window.__stroke = (finish = true) => {
    e.setTool('brush'); e.brush = { ...e.brush, diameter: 60, hardness: 0.8 }; e.setBrushMode('paint'); e.fg = { r: 200, g: 40, b: 90 };
    e.beginStroke({ x: 1500, y: 1800 }, false);
    for (let i = 1; i <= 30; i++) e.strokeTo({ x: 1500 + i * 100, y: 1800 + i * 17 });   // across 2,048 and 4,096
    if (finish) e.endStroke();
  };
  window.__region = (read) => window.__hash(read(1000, 1300, 4000, 1500).data);
}"""


def _engine_up() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8190/api/version", timeout=2) as r:
            return r.status == 200
    except OSError:
        return False


def test_a_stroke_on_a_tiled_layer_lands_exactly_as_on_an_ordinary_one(page):
    page.evaluate(SETUP)
    r = page.evaluate("""() => {
      const e = window.formvis.engine;
      e.newDocument(6000, 5000, 'Ordinary', 'white'); window.__stroke();
      const ordinary = window.__region((x, y, w, h) => e.current.doc.layers[0].raster.read(x, y, w, h));
      e.newDocument(30000, 20000, 'Giant', 'white'); const t = e.current.doc.layers[0].tiled;
      window.__stroke();
      const giant = window.__region((x, y, w, h) => t.read(x, y, w, h));
      return { ordinary, giant, steps: e.current.history.steps.names, raster: !!e.current.doc.layers[0].raster, tiles: t.tileCount };
    }""")
    assert r["giant"] == r["ordinary"], r                                  # every byte of the painted region
    assert r["steps"] == ["Brush"] and not r["raster"], r                 # one step; never given a full-size canvas
    assert r["tiles"] >= 2, r


def test_it_shows_while_painted_and_undoes_and_redoes_exactly(page):
    page.evaluate(SETUP)
    r = page.evaluate("""async () => {
      const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
      e.newDocument(30000, 20000, 'Giant', 'white'); const t = e.current.doc.layers[0].tiled, white = window.__region((x, y, w, h) => t.read(x, y, w, h));
      window.__stroke(false);                                              // in progress
      const s = E.createSurface(400, 300), c = E.ctxOf(s);
      e.compose(s, [1, 0, 0, 1, -2700, -1888], 'high');                    // centred on (2,900, 2,038), on the stroke's line
      const mid = Array.from(c.getImageData(200, 150, 1, 1).data.slice(0, 3));
      const unwritten = Array.from(t.read(2900, 2038, 1, 1).data.slice(0, 3)); // the layer itself not yet painted
      e.endStroke();
      const painted = window.__region((x, y, w, h) => t.read(x, y, w, h));
      const settle = async (n) => { for (let i = 0; i < 100 && (e.draining || e.current.history.steps.current !== n); i++) await new Promise((r) => setTimeout(r, 30)); };
      const n = e.current.history.steps.current;
      e.undo(); await settle(n - 1); const undone = window.__region((x, y, w, h) => t.read(x, y, w, h));
      e.redo(); await settle(n); const redone = window.__region((x, y, w, h) => t.read(x, y, w, h));
      return { mid, unwritten, changed: painted !== white, undoneWhite: undone === white, redoneSame: redone === painted };
    }""")
    assert r["unwritten"] == [255, 255, 255] and r["mid"] != [255, 255, 255], r   # shown from the stroke before it is written
    assert r["changed"] and r["undoneWhite"] and r["redoneSame"], r


def test_a_new_layer_on_a_giant_document_gets_tiles_and_paints(page):
    # 1.62.8: a fresh layer has no pixels; painting gave it a full-size canvas, which the browser cannot make past
    # 268 MP (and the canvas guard refused). It is given tiles at its first stroke instead.
    page.evaluate(SETUP)
    r = page.evaluate("""async () => {
      const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
      (await import('/src/engine/types.ts')).setPixelBudget(100_000_000);   // 120 MP is giant only on the smallest budget
      e.newDocument(20000, 6000, 'Giant', 'white'); const bg = e.current.doc.layers[0];
      e.addLayer({ name: 'Paint' }); const id = e.current.activeLayer.id;
      window.__stroke();
      const l = e.current.layer(id), s = E.createSurface(400, 300), c = E.ctxOf(s);
      const at = () => { e.compose(s, [1, 0, 0, 1, -2700, -1888], 'high'); return Array.from(c.getImageData(200, 150, 1, 1).data.slice(0, 3)); };
      const painted = at(), steps = e.current.history.steps.names.slice();
      const settle = async (n) => { for (let i = 0; i < 100 && (e.draining || e.current.history.steps.current !== n); i++) await new Promise((r) => setTimeout(r, 30)); };
      const n = e.current.history.steps.current; e.undo(); await settle(n - 1);
      return { tiled: !!l.tiled, raster: !!l.raster, layerTiles: l.tiled ? l.tiled.tileCount : 0, bgTiles: bg.tiled.tileCount, painted, steps, undone: at() };
    }""")
    assert r["tiled"] and not r["raster"] and r["layerTiles"] >= 2, r       # tiles, never a full-size canvas
    assert r["bgTiles"] == 0, r                                             # the background untouched
    assert r["painted"] != [255, 255, 255] and r["steps"][-1] == "Brush", r # the stroke over the white background
    assert r["undone"] == [255, 255, 255], r                               # and undone


def test_what_needs_the_whole_layer_declines_before_any_step(page):
    page.evaluate(SETUP)
    r = page.evaluate("""() => {
      const e = window.formvis.engine, notes = []; e.on('notice', (n) => notes.push(n.text));
      e.newDocument(30000, 20000, 'Giant', 'white');
      e.setTool('mixer'); const began = e.beginStroke({ x: 500, y: 500 }, false);
      return { began, steps: e.current.history.steps.names.length, note: notes[notes.length - 1] ?? '' };
    }""")
    assert r["began"] is False and r["steps"] == 0, r
    assert "Mixer Brush on a layer kept in tiles" in r["note"], r


def test_undo_brings_back_tiles_that_went_to_disk(page):
    if not _engine_up():
        pytest.skip("needs the engine on 8190 (the store)")
    page.wait_for_function("window.formvis.engine.undoStore", timeout=30000)
    page.evaluate(SETUP)
    r = page.evaluate("""async () => {
      const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
      e.newDocument(30000, 20000, 'Giant', 'white'); const t = e.current.doc.layers[0].tiled, white = window.__region((x, y, w, h) => t.read(x, y, w, h));
      window.__stroke();
      e.tileShareOverride = 1;                                             // nothing out of view may stay
      const far = E.createSurface(600, 400); e.compose(far, [1, 0, 0, 1, -20000, -15000], 'high');   // the view far from the stroke
      await e.pageTiles();
      const pagedBefore = t.pagedCount, n = e.current.history.steps.current;
      e.undo(); for (let i = 0; i < 200 && (e.draining || e.current.history.steps.current !== n - 1); i++) await new Promise((r) => setTimeout(r, 30));
      return { pagedBefore, undone: e.current.history.steps.current === n - 1, white: window.__region((x, y, w, h) => t.read(x, y, w, h)) === white };
    }""")
    assert r["pagedBefore"] >= 2, r                                         # the stroke's tiles went to disk
    assert r["undone"] and r["white"], r                                    # undo brought them back and restored them
