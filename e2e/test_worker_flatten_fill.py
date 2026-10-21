"""Flatten Image and Merge Visible on the composite workers give the same pixels as the main thread (partly transparent
layers included) and undo exactly; the Paint Bucket's region found on the wand worker fills the same pixels as the main
thread's."""
BUILD = """async () => {
  const e = window.formvis.engine, W = 2200, H = 1600;
  e.newDocument(W, H, 'Flat', 'white');
  let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 4; k++) {
    e.addLayer({ name: 'L' + k }); e.givePixels();
    const l = e.current.activeLayer, img = new ImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if ((x >> 7) % 2 === k % 2 && (y >> 7) % 3 !== k) { d[i] = (x * (k + 3) + y) & 255; d[i + 1] = (rnd() * 255) | 0; d[i + 2] = (y >> 2) & 255; d[i + 3] = k === 3 ? 20 + ((x + y) % 200) : k === 2 ? 128 : 255; }
    }
    l.raster.ctx.putImageData(img, 0, 0); l.raster.touch();
    e.current.updateLayer(l.id, { blend: k === 1 ? 'multiply' : 'normal', opacity: k === 1 ? 0.8 : k === 2 ? 0.6 : 1 });
  }
  e.current.updateLayer(e.current.doc.layers[2].id, { visible: false });
  return e.current.doc.layers.length;
}"""

MERGE = """async (op) => {
  const e = window.formvis.engine, WK = window.formvis.workers, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const px = (r) => r.ctx.getImageData(0, 0, r.width, r.height).data;
  const cmp = (a, b) => { let n = a.length === b.length ? 0 : -1; if (n === 0) for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  const snap = e.current.doc.layers.map((l) => [l.id, l.visible, px(l.raster).slice()]);
  const run = async (on) => {
    WK.setComposite(on);
    const r0 = WK.compositeStats().runs;
    if (op === 'flatten') e.flattenImage(); else e.mergeVisible();
    for (let i = 0; i < 200 && (e.busyWith || e.current.doc.layers.length === snap.length); i++) await sleep(50);
    const merged = px(e.current.doc.layers.find((l) => l.name === 'Background').raster).slice(), layers = e.current.doc.layers.length, runs = WK.compositeStats().runs - r0;
    e.undo();
    let undo = e.current.doc.layers.length === snap.length ? 0 : -1;
    e.current.doc.layers.forEach((l, i) => { if (undo >= 0 && (l.id !== snap[i][0] || l.visible !== snap[i][1] || cmp(px(l.raster), snap[i][2]) !== 0)) undo++; });
    WK.setComposite(false);
    return { merged, layers, runs, undo };
  };
  const off = await run(false), on = await run(true);
  return { diff: cmp(off.merged, on.merged), offLayers: off.layers, onLayers: on.layers, offRuns: off.runs, onRuns: on.runs, undoOff: off.undo, undoOn: on.undo };
}"""


def test_flatten_and_merge_visible_on_workers_match_the_main_thread(page):
    assert page.evaluate(BUILD) == 5
    for op in ("flatten", "merge"):
        r = page.evaluate(MERGE, op)
        assert r["diff"] == 0, (op, r)
        assert r["offRuns"] == 0 and r["onRuns"] > 0, (op, r)   # the preference decided the route
        assert r["undoOff"] == 0 and r["undoOn"] == 0, (op, r)
        assert r["offLayers"] == r["onLayers"], (op, r)


BUCKET = """async () => {
  const e = window.formvis.engine, F = await import('/src/engine/wand-jobs.ts'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const W = 2600, H = 1700;
  e.newDocument(W, H, 'Bucket', 'white'); e.addLayer({ name: 'P' }); e.givePixels();
  const l = e.current.activeLayer, img = new ImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, v = ((x >> 6) + (y >> 6)) % 5; d[i] = 40 * v + (x % 7); d[i + 1] = 90 + (y % 5); d[i + 2] = 200 - 30 * v; d[i + 3] = v === 4 ? 90 : 255; }
  l.raster.ctx.putImageData(img, 0, 0); l.raster.touch();
  e.setBucket({ tolerance: 30, contiguous: true, antiAlias: true, sampleAll: false, opacity: 1 });
  const px = () => { const r = e.current.activeLayer.raster; return r.ctx.getImageData(0, 0, r.width, r.height).data.slice(); };
  const cmp = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  const before = px();
  e.paintBucket({ x: 70, y: 10 });
  for (let i = 0; i < 100 && e.busyWith; i++) await sleep(50);
  await sleep(100);
  const worker = px();
  e.undo();
  const undo = cmp(px(), before);
  const mask = F.findRegion(before, W, H, 70, 10, 30, true, true);
  e.bucketFill(e.current, W, H, mask);
  const main = px();
  return { changed: cmp(worker, before), diff: cmp(worker, main), undo };
}"""


def test_paint_bucket_region_on_the_wand_worker_matches_the_main_thread(page):
    r = page.evaluate(BUCKET)
    assert r["changed"] > 0 and r["diff"] == 0 and r["undo"] == 0, r
