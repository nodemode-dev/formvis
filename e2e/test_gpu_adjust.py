import pytest

DOC = """async ([kind]) => {
  const E = await import('/src/engine/index.ts');
  const e = window.sonny.engine;
  e.newDocument(160, 90, 'A', 'white');
  const p = e.current, bg = p.activeLayer, c = bg.raster.ctx;
  const g1 = c.createLinearGradient(0, 0, 160, 0); g1.addColorStop(0, 'rgb(10,200,60)'); g1.addColorStop(1, 'rgb(240,30,180)');
  c.fillStyle = g1; c.fillRect(0, 0, 160, 90); bg.raster.touch();
  e.addLayer(); const top = p.activeLayer; top.raster = new E.Raster(160, 90);
  const t = top.raster.ctx, g2 = t.createLinearGradient(0, 0, 0, 90); g2.addColorStop(0, 'rgba(255,220,0,1)'); g2.addColorStop(1, 'rgba(20,60,255,0.4)');
  t.fillStyle = g2; t.fillRect(20, 10, 120, 70); top.raster.touch();
  top.blend = 'multiply'; top.opacity = 0.85;
  e.addAdjustmentLayer(kind);
  const a = p.activeLayer, d = a.adjustment.data;
  // Real, non-identity settings for every kind (several default to no change).
  if (kind === 'levels') { d.levels.ranges[0] = { black: 30, gamma: 1.4, white: 220, outputBlack: 10, outputWhite: 245 }; d.levels.ranges[1].black = 25; }
  if (kind === 'curves') { d.curves.channels[0] = [{ x: 0, y: 0 }, { x: 90, y: 140 }, { x: 255, y: 255 }]; d.curves.channels[3] = [{ x: 0, y: 20 }, { x: 255, y: 230 }]; }
  if (kind === 'exposure') d.exposureSettings = { exposure: 0.6, offset: -0.02, gamma: 1.2 };
  if (kind === 'brightnessContrast') d.params = { brightness: 25, contrast: 30, legacy: false };
  if (kind === 'posterize') d.params = { levels: 5 };
  if (kind === 'hsv') Object.assign(d, { hue: 40, saturation: 30, lightness: 5 });
  a.opacity = 0.8;
  e.refresh();
}"""

FRAME = """async ([mod, cls]) => {
  const E = await import('/src/engine/index.ts'), D = await import(mod);
  const e = window.sonny.engine, W = 200, H = 130, ox = 20, oy = 20, dw = 160, dh = 90;
  const A = [204, 204, 204], B = [255, 255, 255], cell = 8, rect = [ox, oy, ox + dw, oy + dh];
  const gl = e.gpuLayers();
  if (!('layers' in gl)) return { error: gl.reason };
  const disp = await D[cls].create(document.createElement('canvas'));
  if (!disp) return { error: 'no display' };
  const gpu = await disp.renderToPixels(gl.layers, [1, 0, 0, 1, ox, oy], 1, rect, { a: A, b: B, cell, origin: [ox, oy] }, W, H);
  // The GPU's own backdrop (everything below the adjustment), and the CPU's formula applied to it with the table:
  // src + (table(src) - src) * opacity, rounded as the CPU's Uint8ClampedArray rounds.
  const table = gl.layers[gl.layers.length - 1], below = await disp.renderToPixels(gl.layers.slice(0, -1), [1, 0, 0, 1, ox, oy], 1, rect, { a: A, b: B, cell, origin: [ox, oy] }, W, H);
  disp.destroy();
  // For a 3D table the stage is checked against the real CPU kernel run on the GPU's own backdrop, not the table.
  let exact = null;
  if (table.lut3) {
    const A2 = await import('/src/engine/adjust.ts'), K = await import('/src/engine/kernels.ts'), adj = e.current.activeLayer.adjustment;
    const kern = adj.kind === 'hsv' ? A2.hsvKernel(A2.hsvFromData(adj.data)) : K.adjustmentKernel(adj);
    exact = new Uint8ClampedArray(below);
    kern(exact, { width: W, height: H, originX: 0, originY: 0, unitsPerPixel: 1 });
  }
  let stage = 0;
  for (let y = oy; y < oy + dh; y++) for (let x = ox; x < ox + dw; x++) for (let k = 0; k < 3; k++) {
    const i = (y * W + x) * 4 + k, s = below[i], adjusted = exact ? exact[i] : table.lut[s * 4 + k], want = Math.round(s + (adjusted - s) * table.opacity);
    stage = Math.max(stage, Math.abs(gpu[i] - want));
  }
  const s = E.createSurface(W, H), c = E.ctxOf(s);
  for (let y = oy; y < oy + dh; y++) for (let x = ox; x < ox + dw; x++) {
    const odd = (Math.floor((x - ox) / cell) + Math.floor((y - oy) / cell)) % 2 !== 0;
    c.fillStyle = `rgb(${(odd ? B : A).join(',')})`; c.fillRect(x, y, 1, 1);
  }
  const work = E.createSurface(dw, dh); e.compose(work, [1, 0, 0, 1, 0, 0], 'high'); c.drawImage(work, ox, oy);
  const cpu = c.getImageData(0, 0, W, H).data;
  let max = 0, n = 0, within = 0;
  for (let y = oy; y < oy + dh; y++) for (let x = ox; x < ox + dw; x++) for (let k = 0; k < 3; k++) { const i = (y * W + x) * 4 + k, dd = Math.abs(cpu[i] - gpu[i]); max = Math.max(max, dd); n++; if (dd <= 4) within++; }
  return { stage, max, share: within / n, layers: gl.layers.length, lut: !!gl.layers[gl.layers.length - 1].lut };
}"""

KINDS = ["levels", "curves", "exposure", "brightnessContrast", "posterize", "invert", "hsv", "photoFilter", "blackWhite"]


@pytest.mark.parametrize("kind", KINDS)
def test_a_per_channel_adjustment_draws_on_the_gpu_as_the_cpu_does(page, kind):
    page.evaluate(DOC, [kind])
    three_d = kind in ("hsv", "photoFilter", "blackWhite")
    for mod, cls in (("/src/gpu/gl-display.ts", "GlDisplay"), ("/src/gpu/display.ts", "GpuDisplay")):
        r = page.evaluate(FRAME, [mod, cls])
        assert "error" not in r, (cls, r)
        assert r["layers"] == 3 and r["lut"], (cls, r)                     # the adjustment went to the GPU as its table
        # the table stage on the GPU's own backdrop: exact for a per-channel table; for a 3D table within the proof's
        # 1 level of the real kernel, plus 1 for the mixing rounding
        assert r["stage"] <= (2 if three_d else 1), (cls, r)
        # End to end against the CPU: the layers below differ by up to 3 levels between GPU and canvas compositing, and a
        # steep or stepped adjustment amplifies that (Posterize turns 1 level at a step boundary into a whole step), so
        # the bound is on the share of values, not the maximum.
        assert r["share"] >= 0.99, (cls, r)


def test_a_discontinuous_adjustment_keeps_the_document_on_the_cpu_by_name(page):
    page.evaluate(DOC, ["threshold"])
    assert page.evaluate("window.sonny.engine.gpuLayers().reason") == "a Threshold adjustment layer"


def test_on_screen_webgl2_draws_a_levels_document(page):
    try:
        page.evaluate("localStorage.setItem('sonny.prefs', JSON.stringify({ renderer: 'webgl2' }))")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
        page.evaluate(DOC, ["levels"])
        page.wait_for_function("document.querySelector('.cv-st-gpu').textContent === 'GPU: WebGL2'")
        page.wait_for_timeout(300)
        assert page.evaluate("!document.querySelector('.cv-scene-gl').hidden")
        assert page.evaluate("document.querySelector('.cv-st-gpu').textContent") == "GPU: WebGL2"   # not sent back to the CPU
    finally:
        page.evaluate("localStorage.removeItem('sonny.prefs')")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
