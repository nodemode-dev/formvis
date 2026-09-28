import pytest

DOC = """async ([blend, opacity]) => {
  const E = await import('/src/engine/index.ts'), T = await import('/src/engine/types.ts');
  const e = window.formvis.engine;
  e.newDocument(160, 90, 'S', 'white');
  const p = e.current, bg = p.activeLayer, c = bg.raster.ctx;
  const g1 = c.createLinearGradient(0, 0, 160, 0); g1.addColorStop(0, 'rgb(10,200,60)'); g1.addColorStop(1, 'rgb(240,30,180)');
  c.fillStyle = g1; c.fillRect(0, 0, 160, 90); bg.raster.touch();
  e.addLayer(); const top = p.activeLayer; top.raster = new E.Raster(160, 90);
  const t = top.raster.ctx; t.fillStyle = 'rgba(255,200,40,0.9)'; t.beginPath(); t.arc(80, 45, 26, 0, Math.PI * 2); t.fill(); t.fillRect(30, 20, 20, 50); top.raster.touch();
  top.blend = blend; top.opacity = opacity;
  // A real multi-effect style, each effect from its defaults.
  top.effects = T.effectsFromData({ dropShadow: { enabled: true }, stroke: { enabled: true }, outerGlow: { enabled: true }, bevel: { enabled: true }, innerShadow: { enabled: true } });
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
  return { max, share: within / n, layers: gl.layers.length };
}"""


@pytest.mark.parametrize("blend,opacity", [("normal", 1), ("multiply", 0.8)])
def test_layer_styles_draw_on_the_gpu_as_the_cpu_draws_them(page, blend, opacity):
    page.evaluate(DOC, [blend, opacity])
    for mod, cls in (("/src/gpu/gl-display.ts", "GlDisplay"), ("/src/gpu/display.ts", "GpuDisplay")):
        r = page.evaluate(FRAME, [mod, cls])
        assert "error" not in r, (cls, r)
        assert r["layers"] > 2, (cls, r)                  # the effect parts went to the GPU with the layer
        assert r["share"] >= 0.99, (cls, r)
