"""Worker pool with the shared arena: banded filters and the export composite give the same bytes on the pool as on the
main thread, the shared arena is the route used while the page is cross-origin isolated, and a viewport composite runs
ahead of an export asked for earlier."""
BUILD = """async () => {
  const e = window.formvis.engine, W = 2600, H = 1800;
  e.newDocument(W, H, 'Arena', 'white');
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 3; k++) {
    e.addLayer({ name: 'L' + k }); e.givePixels();
    const l = e.current.activeLayer, img = new ImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if ((x >> 7) % 2 === k % 2 && (y >> 7) % 3 !== k) { d[i] = (x * (k + 3) + y) & 255; d[i + 1] = (rnd() * 255) | 0; d[i + 2] = (y >> 2) & 255; d[i + 3] = 255; }
    }
    l.raster.ctx.putImageData(img, 0, 0); l.raster.touch();
    if (k) e.current.updateLayer(l.id, { blend: k === 1 ? 'multiply' : 'normal', opacity: k === 1 ? 0.8 : 0.6 });
  }
  e.bandFrom = 1_000_000;
  return [W, H];
}"""

FILTER = """async () => {
  const e = window.formvis.engine, WK = window.formvis.workers, FP = await import('/src/ui/panels/filter-panel.ts');
  const r = e.current.activeLayer.raster, W = r.width, H = r.height, snap = () => r.ctx.getImageData(0, 0, W, H).data.slice();
  const before = snap(), s = { ...FP.defaultFilterSettings(), radius: 4 }, apron = FP.bandApron('gaussianBlur', s);
  const run = (src, frame) => FP.runFilter('gaussianBlur', s, 1, src, 1, frame);
  const b0 = WK.bandStats(), ret = e.bandedFilterPool('Gaussian Blur', { kind: 'gaussianBlur', settings: s, seed: 1 }, run, apron, 0);
  if (!ret || typeof ret !== 'object') return { ret: String(ret) };
  const ok = await ret, b1 = WK.bandStats(), pooled = snap();
  e.undo();
  const restored = snap(); let undo = 0; for (let i = 0; i < restored.length; i++) if (restored[i] !== before[i]) undo++;
  const main = e.bandedFilter('Gaussian Blur', run, apron, 0), single = snap();
  let diff = 0, changed = 0; for (let i = 0; i < pooled.length; i++) { if (pooled[i] !== single[i]) diff++; if (pooled[i] !== before[i]) changed++; }
  return { ok, main, diff, changed, undo, shared: b1.shared - b0.shared, copied: b1.copied - b0.copied };
}"""

EXPORT = """async () => {
  const e = window.formvis.engine, WK = window.formvis.workers, bytes = async (b) => new Uint8Array(await b.arrayBuffer());
  WK.setComposite(false);
  const off = await bytes(await e.exportBlob('image/png'));
  const s0 = WK.compositeStats().sharedMB;
  WK.setComposite(true);
  const on = await bytes(await e.exportBlob('image/png'));
  const s1 = WK.compositeStats();
  WK.setComposite(false);
  let diff = off.length === on.length ? 0 : -1;
  if (diff === 0) for (let i = 0; i < off.length; i++) if (off[i] !== on[i]) diff++;
  return { size: off.length, diff, sharedMB: s1.sharedMB - s0, runs: s1.runs, workers: s1.workers };
}"""

ORDER = """async () => {
  const e = window.formvis.engine, WK = window.formvis.workers, done = [];
  WK.setComposite(true);
  const a = e.exportBlob('image/png').then(() => done.push('export first'));
  const b = e.exportBlob('image/png').then(() => done.push('export second'));
  const c = WK.compositeOnWorkers(e.current.doc, 1200, 800, [1, 0, 0, 1, 0, 0]).then(() => done.push('viewport'));
  await Promise.all([a, b, c]);
  WK.setComposite(false);
  return done;
}"""


def test_arena_filter_and_export_match_the_main_thread(page):
    page.evaluate(BUILD)
    iso = page.evaluate("({ isolated: self.crossOriginIsolated, sab: typeof SharedArrayBuffer, shared: window.formvis.workers.bandsShared() })")
    assert iso["isolated"] is True and iso["sab"] == "function" and iso["shared"] is True, iso
    f = page.evaluate(FILTER)
    assert f.get("ok") is True and f["main"] is True, f
    assert f["changed"] > 0 and f["diff"] == 0 and f["undo"] == 0, f
    assert f["shared"] > 0 and f["copied"] == 0, f   # the arena, not copies, carried the bands
    x = page.evaluate(EXPORT)
    assert x["workers"] > 0 and x["runs"] > 0 and x["sharedMB"] > 0, x   # the export went through the workers and the arena
    assert x["diff"] == 0, x


def test_viewport_composite_runs_before_a_waiting_export(page):
    page.evaluate(BUILD)
    done = page.evaluate(ORDER)
    assert sorted(done) == ["export first", "export second", "viewport"], done
    assert done.index("viewport") < done.index("export second"), done   # asked for last, run before the export that was waiting
