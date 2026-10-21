"""16 and 32 bit layers: the banded filters (Gaussian Blur, Box Blur, Unsharp Mask, Add Noise, Motion Blur) run in bands on
the worker pool and give exactly the floats the whole layer gives on the main thread, undo restores the layer, and a
filter without a deep band kernel stays on the main thread."""
import pytest

RUN = """async ([depth, cases]) => {
  const e = window.formvis.engine, cat = window.formvis.catalogue, WK = window.formvis.workers, W = 2600, H = 1800;
  e.newDocument(W, H, 'Deep', 'white');
  e.addLayer({ name: 'Art' }); e.givePixels();
  const l0 = e.current.activeLayer, img = new ImageData(W, H), d = img.data;
  let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (((x >> 7) + (y >> 7)) % 3 !== 0) { d[i] = (x * 3 + y) & 255; d[i + 1] = (rnd() * 255) | 0; d[i + 2] = (y >> 2) & 255; d[i + 3] = (x + y) % 977 < 40 ? 90 : 255; }
  }
  l0.raster.ctx.putImageData(img, 0, 0); l0.raster.touch();
  e.setDepth(depth);
  const ch = () => e.current.activeLayer.channels;
  if (depth === 32) { const a = ch().data; for (let i = 0; i < a.length; i += 997) a[i] = a[i] * 3.5; }
  const out = { depth: e.current.doc.depth, isolated: self.crossOriginIsolated, shared: WK.bandsShared(), rows: [] };
  for (const [kind, params] of cases) {
    const before = ch().data.slice(), row = { kind };
    for (const mode of ['pool', 'main']) {
      e.bandFrom = mode === 'pool' ? 1_000_000 : 1_000_000_000;
      const b0 = WK.bandStats(), r = await cat.runCommand('filter.apply', { kind, ...params }), b1 = WK.bandStats();
      row[mode + 'Ok'] = r.ok; row[mode + 'Bands'] = (b1.shared - b0.shared) + (b1.copied - b0.copied); row[mode + 'Shared'] = b1.shared - b0.shared;
      row[mode] = ch().data.slice();
      e.undo();
      let u = 0; const c = ch().data; for (let i = 0; i < c.length; i++) if (c[i] !== before[i]) u++;
      row[mode + 'Undo'] = u;
    }
    let diff = 0, changed = 0;
    for (let i = 0; i < row.pool.length; i++) { if (!Object.is(row.pool[i], row.main[i])) diff++; if (row.pool[i] !== before[i]) changed++; }
    delete row.pool; delete row.main; row.diff = diff; row.changed = changed;
    out.rows.push(row);
  }
  e.bandFrom = 16_000_000;
  return out;
}"""

CASES = [
    ["gaussianBlur", {"radius": 6}],
    ["boxBlur", {"settings": {"lib": {"boxBlur": {"radius": 9}}}}],
    ["unsharpMask", {"amount": 120, "radius": 3, "threshold": 2}],
    ["addNoise", {"settings": {"lib": {}, "amount": 12, "gaussian": True, "monochromatic": False, "seed": 4242}}],
    ["motionBlur", {"angle": 30, "distance": 14}],
]


@pytest.mark.parametrize("depth", [16, 32])
def test_banded_deep_filters_match_the_main_thread(page, depth):
    res = page.evaluate(RUN, [depth, CASES])
    assert res["depth"] == depth and res["isolated"] is True and res["shared"] is True, res
    for row in res["rows"]:
        assert row["poolOk"] is True and row["mainOk"] is True, row
        assert row["changed"] > 0, row
        assert row["diff"] == 0, row   # the very same floats, bit for bit
        assert row["poolUndo"] == 0 and row["mainUndo"] == 0, row
        assert row["poolShared"] > 0 and row["mainBands"] == 0, row   # the pool read the shared arena; the main run sent no band


def test_a_deep_filter_without_a_band_kernel_stays_on_the_main_thread(page):
    res = page.evaluate(RUN, [16, [["radialBlur", {"settings": {"gallery": {"radialAmount": 10, "radialMethod": "spin"}}}]]])
    row = res["rows"][0]
    assert row["poolOk"] is True and row["poolBands"] == 0 and row["diff"] == 0, row
