import pytest

DOC = """async ([mode]) => {
  const E = await import('/src/engine/index.ts');
  const e = window.formvis.engine;
  e.newDocument(160, 90, 'C', 'white');
  const p = e.current, bg = p.activeLayer, c = bg.raster.ctx;
  const g1 = c.createLinearGradient(0, 0, 160, 0); g1.addColorStop(0, 'rgb(10,200,60)'); g1.addColorStop(1, 'rgb(240,30,180)');
  c.fillStyle = g1; c.fillRect(0, 0, 160, 90); bg.raster.touch();
  const paint = (l, f) => { l.raster = new E.Raster(160, 90); f(l.raster.ctx); l.raster.touch(); };
  if (mode === 'clip') {
    // A clipping group: a soft circle base, a Multiply gradient and a Levels adjustment clipped to it.
    e.addLayer(); const base = p.activeLayer;
    paint(base, (x) => { x.fillStyle = 'rgba(40,40,200,0.8)'; x.beginPath(); x.arc(80, 45, 34, 0, Math.PI * 2); x.fill(); });
    base.opacity = 0.9;
    e.addLayer(); const top = p.activeLayer;
    paint(top, (x) => { const g = x.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, 'rgba(255,220,0,1)'); g.addColorStop(1, 'rgba(20,60,255,0.6)'); x.fillStyle = g; x.fillRect(0, 0, 160, 90); });
    top.blend = 'multiply'; top.opacity = 0.85;
    e.toggleClip(top.id);
    e.addAdjustmentLayer('levels'); const adj = p.activeLayer;
    adj.adjustment.data.levels.ranges[0] = { black: 30, gamma: 1.4, white: 220, outputBlack: 10, outputWhite: 245 };
    e.toggleClip(adj.id);
  } else {
    // A Multiply layer inside a folder (shown, or hidden with its folder).
    e.addLayer(); const top = p.activeLayer;
    paint(top, (x) => { const g = x.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, 'rgba(255,220,0,1)'); g.addColorStop(1, 'rgba(20,60,255,0.6)'); x.fillStyle = g; x.fillRect(20, 10, 120, 70); });
    top.blend = 'multiply'; top.opacity = 0.85;
    e.groupLayers();
    const folder = p.doc.layers.find((l) => l.isGroup);
    if (mode === 'hidden') folder.visible = false;
    const masked = (g, hx) => {
      g.mask = { raster: new E.Raster(160, 90), enabled: true, linked: true, placement: null };
      const mc = g.mask.raster.ctx; mc.fillStyle = '#fff'; mc.fillRect(0, 0, 160, 90); mc.clearRect(hx, 20, 30, 40);
      const fade = mc.createLinearGradient(80, 0, 150, 0); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      mc.globalCompositeOperation = 'destination-out'; mc.fillStyle = fade; mc.fillRect(80, 0, 80, 90); mc.globalCompositeOperation = 'source-over';
      g.mask.raster.touch();
    };
    if (mode === 'foldermask' || mode === 'nested') masked(folder, 15);
    if (mode === 'nested') { e.groupLayers(); masked(p.doc.layers.find((l) => l.isGroup && l.id !== folder.id), 50); }
  }
  e.refresh();
}"""

FRAME = """async ([mod, cls]) => {
  const E = await import('/src/engine/index.ts'), D = await import(mod);
  const e = window.formvis.engine, W = 200, H = 130, ox = 20, oy = 20, dw = 160, dh = 90;
  const A = [204, 204, 204], B = [255, 255, 255], cell = 8, rect = [ox, oy, ox + dw, oy + dh];
  const gl = e.gpuLayers();
  if (!('layers' in gl)) return { error: gl.reason };
  const disp = await D[cls].create(document.createElement('canvas'));
  if (!disp) return { error: 'no display' };
  const gpu = await disp.renderToPixels(gl.layers, [1, 0, 0, 1, ox, oy], 1, rect, { a: A, b: B, cell, origin: [ox, oy] }, W, H);
  disp.destroy();
  const s = E.createSurface(W, H), c = E.ctxOf(s);
  for (let y = oy; y < oy + dh; y++) for (let x = ox; x < ox + dw; x++) {
    const odd = (Math.floor((x - ox) / cell) + Math.floor((y - oy) / cell)) % 2 !== 0;
    c.fillStyle = `rgb(${(odd ? B : A).join(',')})`; c.fillRect(x, y, 1, 1);
  }
  const work = E.createSurface(dw, dh); e.compose(work, [1, 0, 0, 1, 0, 0], 'high'); c.drawImage(work, ox, oy);
  const cpu = c.getImageData(0, 0, W, H).data;
  let max = 0, n = 0, within = 0;
  for (let y = oy; y < oy + dh; y++) for (let x = ox; x < ox + dw; x++) for (let k = 0; k < 3; k++) { const i = (y * W + x) * 4 + k, d = Math.abs(cpu[i] - gpu[i]); max = Math.max(max, d); n++; if (d <= 4) within++; }
  return { max, share: within / n, layers: gl.layers.length, clipped: gl.layers.filter((l) => l.clip).length };
}"""


@pytest.mark.parametrize("mode,layers,clipped", [("clip", 4, 2), ("folder", 2, 0), ("hidden", 1, 0), ("foldermask", 2, 0), ("nested", 2, 0)])
def test_clipping_groups_and_folders_draw_on_the_gpu_as_the_cpu_draws_them(page, mode, layers, clipped):
    page.evaluate(DOC, [mode])
    for mod, cls in (("/src/gpu/gl-display.ts", "GlDisplay"), ("/src/gpu/display.ts", "GpuDisplay")):
        r = page.evaluate(FRAME, [mod, cls])
        assert "error" not in r, (cls, r)
        assert r["layers"] == layers and r["clipped"] == clipped, (cls, r)   # nothing fell back; the hidden folder's layer is gone
        assert r["share"] >= 0.99, (cls, r)
    if mode in ("foldermask", "nested"):                                     # the chain holds every folder's mask
        assert page.evaluate("window.formvis.engine.gpuLayers().layers[1].folders.length") == (2 if mode == "nested" else 1)


def test_a_clipped_layer_inside_a_masked_folder_still_draws_on_the_cpu_by_name(page):
    page.evaluate(DOC, ["clip"])
    page.evaluate("""(async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine, p = e.current;
      p.doc.layers.forEach((l) => { if (l.clipId) l.parentId = 'f'; });
      const f = { ...p.doc.layers[0], id: 'f', name: 'F', isGroup: true, raster: null, clipId: null, adjustment: null, parentId: null,
        mask: { raster: new E.Raster(160, 90), enabled: true, linked: true, placement: null } };
      p.doc.layers.splice(1, 0, f); })()""")
    assert page.evaluate("window.formvis.engine.gpuLayers().reason") == "a clipped layer with a vector mask or inside a masked folder"
