"""A document past one canvas (1.62.3, DEV_PLAN 26.6b): 30,000 by 20,000 (600 MP) opens with its layer in tiles, shows
without seams at any zoom and exactly at actual size, and declines, out loud and with the page alive, what is not yet
taught tiles (filters, the rest of 26.6e; painting is taught at 1.62.5, e2e/test_tiled_paint.py, and export at 1.62.6,
e2e/test_large_document.py, opt-in)."""

GIANT = """async () => {
  const e = window.formvis.engine; window.__notes = []; e.on('notice', (n) => window.__notes.push(n.text));
  const used0 = e.memoryUse(), p = e.newDocument(30000, 20000, 'Giant', 'white');
  const l = e.current.doc.layers[0];
  return { made: !!p, raster: !!l.raster, tiled: !!l.tiled, grid: l.tiled ? l.tiled.cols * l.tiled.rows : 0, tiles: l.tiled ? l.tiled.tileCount : -1,
    usedMB: Math.round((e.memoryUse() - used0) / 1048576), gpu: e.gpuLayers().reason ?? 'gpu', note: window.__notes[0] ?? '',
    gpuView: (() => { const g = e.gpuLayers({ matrix: [0.05, 0, 0, 0.05, 0, 0], width: 1500, height: 1000 }); return 'layers' in g ? g.layers.length : g.reason; })() };
}"""


def test_a_600_megapixel_document_opens_in_tiles_and_costs_nothing_until_drawn(page):
    r = page.evaluate(GIANT)
    assert r["made"] and r["tiled"] and not r["raster"], r              # before 1.62.3 refused
    assert r["grid"] == 150 and r["tiles"] == 0 and r["usedMB"] == 0, r   # a white background is its base colour
    assert r["gpu"] == "a layer past 268 megapixels, asked without a view", r   # without a view, the CPU (the bench)
    assert r["gpuView"] == 150, r                                        # with one, the GPU per tile (1.62.9): all 150 in a whole view
    assert "kept in tiles" in r["note"], r


def test_it_shows_without_seams_at_any_zoom_and_exactly_at_actual_size(page):
    page.evaluate(GIANT)
    r = page.evaluate("""async () => {
      const E = await import('/src/engine/index.ts'), e = window.formvis.engine, t = e.current.doc.layers[0].tiled;
      t.drawOn(1500, 1500, 4000, 3000, (c) => { c.fillStyle = '#2050c0'; c.fillRect(1500, 1500, 4000, 3000); });   // across 2,048 and 4,096
      const z = 0.0437, W = Math.ceil(30000 * z), H = Math.ceil(20000 * z), s = E.createSurface(W, H), c = E.ctxOf(s);
      e.compose(s, [z, 0, 0, z, 0, 0], 'high');
      const d = c.getImageData(0, 0, W, H).data; let inside = 0, off = 0;
      for (let y = Math.ceil(1500 * z) + 2; y < Math.floor(4500 * z) - 2; y++) for (let x = Math.ceil(1500 * z) + 2; x < Math.floor(5500 * z) - 2; x++) {
        const i = (y * W + x) * 4; inside++; if (Math.abs(d[i] - 0x20) > 2 || Math.abs(d[i + 1] - 0x50) > 2 || Math.abs(d[i + 2] - 0xc0) > 2) off++; }
      const s1 = E.createSurface(400, 300), c1 = E.ctxOf(s1);
      e.compose(s1, [1, 0, 0, 1, -3950, -3990], 'high');                // across the tile corner at (4,096, 4,096)
      const a = c1.getImageData(0, 0, 400, 300).data, b = t.read(3950, 3990, 400, 300).data;
      let same = true; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { same = false; break; }
      return { tiles: t.tileCount, inside, off, same };
    }""")
    assert r["tiles"] == 9, r                                            # only the tiles drawn into
    assert r["inside"] > 20000 and r["off"] == 0, r                     # no seam pixel anywhere inside the rectangle
    assert r["same"], r


def test_what_is_not_yet_taught_tiles_declines_out_loud_and_the_page_lives(page):
    page.evaluate(GIANT)
    r = page.evaluate("""() => {
      const e = window.formvis.engine; window.__notes = [];
      // The brush paints a tiled layer since 1.62.5 (e2e/test_tiled_paint.py); a filter still declines until 26.6e.
      e.applyImageEdit('Gaussian Blur', (src) => src, 0);
      const l = e.current.doc.layers[0];
      return { steps: e.current.history.steps.names.length, raster: !!l.raster, tiled: !!l.tiled, notes: window.__notes.slice() };
    }""")
    assert r["steps"] == 0 and not r["raster"] and r["tiled"], r        # declined: no step, never a full-size canvas
    # The true reason, never a memory figure (an identical notice back to back is shown once, by design).
    assert r["notes"] and all("kept in tiles" in n for n in r["notes"]), r
    # Export PNG works on a giant document since 1.62.6 (bands sized from the width, tiles brought back first); a
    # 600 MP run takes minutes, so it is tested opt-in in e2e/test_large_document.py.
    assert page.evaluate("1 + 1") == 2                                   # the page lives
