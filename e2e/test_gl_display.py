import io

import pytest
from PIL import Image, ImageChops

BLENDS = ["normal", "dissolve", "darken", "multiply", "color-burn", "linear-burn", "darker-color", "lighten", "screen", "color-dodge",
          "linear-dodge", "lighter-color", "overlay", "soft-light", "hard-light", "vivid-light", "linear-light", "pin-light", "hard-mix",
          "difference", "exclusion", "subtract", "divide", "hue", "saturation", "color", "luminosity"]

DOC = """async ([mode, w, h]) => {
  const E = await import('/src/engine/index.ts');
  const e = window.sonny.engine;
  e.newDocument(w, h, 'G', 'white');
  const p = e.current, bg = p.activeLayer, c = bg.raster.ctx;
  const g1 = c.createLinearGradient(0, 0, w, 0); g1.addColorStop(0, 'rgb(10,200,60)'); g1.addColorStop(1, 'rgb(240,30,180)');
  c.fillStyle = g1; c.fillRect(0, 0, w, h); bg.raster.touch();
  e.addLayer(); const top = p.activeLayer; top.raster = new E.Raster(w, h);
  const t = top.raster.ctx, g2 = t.createLinearGradient(0, 0, 0, h); g2.addColorStop(0, 'rgba(255,220,0,1)'); g2.addColorStop(1, 'rgba(20,60,255,0.35)');
  t.fillStyle = g2; t.fillRect(0, 0, w, h); top.raster.touch();
  top.blend = mode; top.opacity = 0.8;
}"""

# Every blend mode: the WebGL2 display at 100% over the whole document, against the CPU renderer.
MODES = """async () => {
  const E = await import('/src/engine/index.ts'), R = await import('/src/engine/renderer.ts'), G = await import('/src/gpu/gl-display.ts');
  const e = window.sonny.engine, p = e.current;
  const cpu = E.ctxOf(R.renderDoc(new R.Renderer(), p.doc, null)).getImageData(0, 0, 64, 32).data;
  const d = G.GlDisplay.create(document.createElement('canvas'));
  if (!d) return { error: 'no WebGL2' };
  // The document's own layers, in document space (the view is the identity), so Dissolve is compared too; on screen
  // the engine keeps Dissolve on the CPU, as its pattern is fixed to document pixels.
  const layers = p.doc.layers.filter((l) => l.visible && l.raster).map((l) => ({ image: l.raster.canvas, version: l.raster.version, width: l.raster.width, height: l.raster.height,
    matrix: E.placement(l.transform, l.raster.width, l.raster.height), opacity: l.opacity, blend: l.blend }));
  const gpu = await d.renderToPixels(layers, [1, 0, 0, 1, 0, 0], 1, [0, 0, 64, 32], { a: [0, 0, 0], b: [0, 0, 0], cell: 8, origin: [0, 0] }, 64, 32);
  d.destroy();
  let max = 0; for (let i = 0; i < cpu.length; i++) if (i % 4 !== 3) max = Math.max(max, Math.abs(cpu[i] - gpu[i]));
  return { max };
}"""

# The display frame through the view, against the stage's CPU path (checkerboard, then the document).
FRAME = """async ([zoom, ox, oy]) => {
  const E = await import('/src/engine/index.ts'), G = await import('/src/gpu/gl-display.ts');
  const e = window.sonny.engine, W = 240, H = 160, dw = 160, dh = 90;
  const x0 = Math.max(0, Math.floor(ox)), y0 = Math.max(0, Math.floor(oy)), x1 = Math.min(W, Math.ceil(ox + dw * zoom)), y1 = Math.min(H, Math.ceil(oy + dh * zoom));
  const A = [204, 204, 204], B = [255, 255, 255], cell = 8;
  const d = G.GlDisplay.create(document.createElement('canvas'));
  const gl = e.gpuLayers();
  const gpu = await d.renderToPixels(gl.layers, [zoom, 0, 0, zoom, ox, oy], zoom, [x0, y0, x1, y1], { a: A, b: B, cell, origin: [Math.round(ox), Math.round(oy)] }, W, H);
  d.destroy();
  const s = E.createSurface(W, H), c = E.ctxOf(s);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const odd = (Math.floor((x - Math.round(ox)) / cell) + Math.floor((y - Math.round(oy)) / cell)) % 2 !== 0;
    c.fillStyle = `rgb(${(odd ? B : A).join(',')})`; c.fillRect(x, y, 1, 1);
  }
  const work = E.createSurface(1, 1);
  if (zoom >= 2) { E.sizeSurface(work, dw, dh); e.compose(work, [1, 0, 0, 1, 0, 0]); c.imageSmoothingEnabled = false; c.drawImage(work, 0, 0, dw, dh, ox, oy, dw * zoom, dh * zoom); }
  else { E.sizeSurface(work, x1 - x0, y1 - y0); e.compose(work, [zoom, 0, 0, zoom, ox - x0, oy - y0], 'high'); c.drawImage(work, x0, y0); }
  const cpu = c.getImageData(0, 0, W, H).data;
  let max = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let k = 0; k < 3; k++) { const i = (y * W + x) * 4 + k; max = Math.max(max, Math.abs(cpu[i] - gpu[i])); }
  return { max, area: (x1 - x0) * (y1 - y0) };
}"""


@pytest.mark.parametrize("mode", BLENDS)
def test_webgl2_matches_the_cpu_renderer(page, mode):
    page.evaluate(DOC, [mode, 64, 32])
    r = page.evaluate(MODES)
    assert "error" not in r, r
    assert r["max"] <= 3, r


@pytest.mark.parametrize("zoom,ox,oy", [(1, 30, 20), (3, -60, -40)])
def test_the_webgl2_frame_matches_the_cpu_path(page, zoom, ox, oy):
    page.evaluate(DOC, ["multiply", 160, 90])
    r = page.evaluate(FRAME, [zoom, ox, oy])
    assert r["area"] > 1000 and r["max"] <= 4, r


def test_the_canvas_drawn_by_webgl2_matches_the_cpu_on_screen(page):
    box = """() => { const v = window.sonny.engine.current.viewport, b = document.querySelector('.cv-stage').getBoundingClientRect();
      return { x: b.left + v.panX, y: b.top + v.panY, width: 160, height: 90 }; }"""
    def shot(renderer):
        page.evaluate(f"localStorage.setItem('sonny.prefs', JSON.stringify({{ renderer: '{renderer}' }}))")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
        page.evaluate(DOC, ["multiply", 160, 90])
        page.evaluate("window.sonny.engine.zoomTo(1)")
        page.wait_for_function(f"document.querySelector('.cv-st-gpu').textContent === '{'GPU: WebGL2' if renderer == 'webgl2' else 'GPU: CPU'}'")
        page.wait_for_timeout(400)
        return Image.open(io.BytesIO(page.screenshot(clip=page.evaluate(box)))).convert("RGB")
    try:
        gl = shot("webgl2")
        assert page.evaluate("!document.querySelector('.cv-scene-gl').hidden")          # the WebGL2 canvas draws it
        cpu = shot("cpu")
        worst = max(hi for _, hi in ImageChops.difference(gl, cpu).getextrema())
        assert worst <= 4, worst
    finally:
        page.evaluate("localStorage.removeItem('sonny.prefs')")
        page.reload(); page.wait_for_function("window.sonny && window.sonny.engine")
