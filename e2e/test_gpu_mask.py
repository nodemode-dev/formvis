import pytest

DOC = """async ([mode]) => {
  const E = await import('/src/engine/index.ts');
  const e = window.formvis.engine;
  e.newDocument(160, 90, 'M', 'white');
  const p = e.current, bg = p.activeLayer, c = bg.raster.ctx;
  const g1 = c.createLinearGradient(0, 0, 160, 0); g1.addColorStop(0, 'rgb(10,200,60)'); g1.addColorStop(1, 'rgb(240,30,180)');
  c.fillStyle = g1; c.fillRect(0, 0, 160, 90); bg.raster.touch();
  e.addLayer(); const top = p.activeLayer; top.raster = new E.Raster(160, 90);
  const t = top.raster.ctx, g2 = t.createLinearGradient(0, 0, 0, 90); g2.addColorStop(0, 'rgba(255,220,0,1)'); g2.addColorStop(1, 'rgba(20,60,255,0.6)');
  t.fillStyle = g2; t.fillRect(0, 0, 160, 90); top.raster.touch();
  top.blend = 'multiply'; top.opacity = 0.9;
  if (mode === 'adjust') { e.addAdjustmentLayer('levels'); p.activeLayer.adjustment.data.levels.ranges[0] = { black: 30, gamma: 1.4, white: 220, outputBlack: 10, outputWhite: 245 }; }
  window.formvis.commands.run('add-mask');
  const m = p.activeLayer.mask;
  if (!m.raster) { m.raster = new E.Raster(160, 90); const r0 = m.raster.ctx; r0.fillStyle = '#fff'; r0.fillRect(0, 0, 160, 90); }   // reveal all
  const mc = m.raster.ctx, W = m.raster.width, H = m.raster.height;
  // A hard hole and a soft ramp: alpha is coverage.
  mc.clearRect(W * 0.1, H * 0.2, W * 0.2, H * 0.5);
  const fade = mc.createLinearGradient(W * 0.45, 0, W * 0.9, 0); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  mc.globalCompositeOperation = 'destination-out'; mc.fillStyle = fade; mc.fillRect(W * 0.45, 0, W * 0.55, H); mc.globalCompositeOperation = 'source-over';
  m.raster.touch();
  if (mode === 'placed') m.placement = { x: 40, y: 20, w: 60, h: 40, rotation: 0, flipX: false, flipY: false, sampling: 'high' };
  if (mode === 'disabled') m.enabled = false;
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
  return { max, share: within / n, masked: gl.layers.filter((l) => l.mask).length };
}"""


@pytest.mark.parametrize("mode", ["layer", "placed", "adjust", "disabled"])
def test_masks_draw_on_the_gpu_as_the_cpu_draws_them(page, mode):
    page.evaluate(DOC, [mode])
    for mod, cls in (("/src/gpu/gl-display.ts", "GlDisplay"), ("/src/gpu/display.ts", "GpuDisplay")):
        r = page.evaluate(FRAME, [mod, cls])
        assert "error" not in r, (cls, r)
        assert r["masked"] == (0 if mode == "disabled" else 1), (cls, r)      # a disabled mask is not sent
        assert r["share"] >= 0.99, (cls, r)
