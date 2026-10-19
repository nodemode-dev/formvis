import pytest

SETUP = """async () => {
  const E = await import('/src/engine/index.ts');
  const e = window.formvis.engine;
  e.newDocument(160, 90, 'D', 'white');
  const p = e.current, bg = p.activeLayer, c = bg.raster.ctx;
  const g1 = c.createLinearGradient(0, 0, 160, 0); g1.addColorStop(0, 'rgb(10,200,60)'); g1.addColorStop(1, 'rgb(240,30,180)');
  c.fillStyle = g1; c.fillRect(0, 0, 160, 90); bg.raster.touch();
  e.addLayer(); const top = p.activeLayer; top.raster = new E.Raster(160, 90);
  const t = top.raster.ctx, g2 = t.createLinearGradient(0, 0, 0, 90); g2.addColorStop(0, 'rgba(255,220,0,1)'); g2.addColorStop(1, 'rgba(20,60,255,0.4)');
  t.fillStyle = g2; t.fillRect(20, 10, 120, 70); top.raster.touch();
  top.blend = 'multiply'; top.opacity = 0.85;
}"""

# The display's frame, offscreen through every display pass, against the stage's CPU path reproduced as it draws:
# the checkerboard, then the document composed through the view (nearest from 200% zoom up).
FRAME = """async ([zoom, ox, oy]) => {
  const E = await import('/src/engine/index.ts');
  const D = await import('/src/gpu/display.ts');
  const e = window.formvis.engine, W = 240, H = 160, dw = 160, dh = 90;
  const disp = await D.GpuDisplay.create(document.createElement('canvas'));
  if (!disp) return { error: 'no WebGPU display' };
  const x0 = Math.max(0, Math.floor(ox)), y0 = Math.max(0, Math.floor(oy)), x1 = Math.min(W, Math.ceil(ox + dw * zoom)), y1 = Math.min(H, Math.ceil(oy + dh * zoom));
  const A = [204, 204, 204], B = [255, 255, 255], cell = 8;
  const gl = e.gpuLayers();
  if (!('layers' in gl)) return { error: gl.reason };
  const gpu = await disp.renderToPixels(gl.layers, [zoom, 0, 0, zoom, ox, oy], zoom, [x0, y0, x1, y1], { a: A, b: B, cell, origin: [Math.round(ox), Math.round(oy)] }, W, H);
  disp.destroy();
  const s = E.createSurface(W, H), c = E.ctxOf(s);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const odd = (Math.floor((x - Math.round(ox)) / cell) + Math.floor((y - Math.round(oy)) / cell)) % 2 !== 0;
    c.fillStyle = `rgb(${(odd ? B : A).join(',')})`; c.fillRect(x, y, 1, 1);
  }
  const work = E.createSurface(1, 1);
  if (zoom >= 2) {
    E.sizeSurface(work, dw, dh); e.compose(work, [1, 0, 0, 1, 0, 0]);
    c.imageSmoothingEnabled = false; c.drawImage(work, 0, 0, dw, dh, ox, oy, dw * zoom, dh * zoom);
  } else {
    E.sizeSurface(work, x1 - x0, y1 - y0); e.compose(work, [zoom, 0, 0, zoom, ox - x0, oy - y0], 'high'); c.drawImage(work, x0, y0);
  }
  const cpu = c.getImageData(0, 0, W, H).data;
  let max = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let k = 0; k < 3; k++) { const i = (y * W + x) * 4 + k; max = Math.max(max, Math.abs(cpu[i] - gpu[i])); }
  return { max, area: (x1 - x0) * (y1 - y0) };
}"""


@pytest.mark.parametrize("zoom,ox,oy", [(1, 30, 20), (3, -60, -40)])
def test_the_display_frame_matches_the_cpu_path(page, zoom, ox, oy):
    page.evaluate(SETUP)
    r = page.evaluate(FRAME, [zoom, ox, oy])
    assert "error" not in r, r
    assert r["area"] > 1000 and r["max"] <= 4, r         # every visible pixel, checkerboard included


def test_choosing_webgpu_always_ends_with_a_drawn_canvas_and_a_true_status(page):
    try:
        page.evaluate("localStorage.setItem('formvis.prefs', JSON.stringify({ renderer: 'webgpu' }))")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
        page.evaluate(SETUP)
        # Either the GPU draws it, or (as on a software adapter, which cannot present to a canvas) the device is lost and
        # the CPU draws it, saying so; never a blank canvas or a status that claims the GPU.
        # Settled means the status and the canvas agree: the status names WebGPU as soon as the display starts, and its
        # canvas shows with the next frame, so a sample between the two is not a settled state.
        settled = """(() => { const s = document.querySelector('.cv-st-gpu'), c = document.querySelector('.cv-scene-gpu');
          return (s.textContent === 'GPU: WebGPU' && !c.hidden)
          || (s.textContent === 'GPU: CPU' && s.title.includes('could not start or was lost') && c.hidden); })()"""
        page.wait_for_function(settled, timeout=10000)
        page.wait_for_timeout(1000)                    # a device lost on its first frame (a software adapter) settles to the CPU
        page.wait_for_function(settled, timeout=10000)
        on_gpu = page.evaluate("document.querySelector('.cv-st-gpu').textContent === 'GPU: WebGPU'")
        assert page.evaluate("document.querySelector('.cv-scene-gpu').hidden") is (not on_gpu)
        if not on_gpu:
            # After a GPU reset the browser restores the 2D canvases blank; formvis redraws on contextrestored.
            page.wait_for_function("""(() => { const v = window.formvis.engine.current.viewport, c = document.querySelector('.cv-scene'),
              k = c.width / c.getBoundingClientRect().width, d = c.getContext('2d').getImageData(Math.round((v.panX + 5) * k), Math.round((v.panY + 45) * k), 1, 1).data;
              return d[3] === 255 && d[1] > 120; })()""", timeout=8000)   # the background gradient's green end, drawn by the CPU
    finally:
        page.evaluate("localStorage.removeItem('formvis.prefs')")
        page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")


def test_the_engine_names_what_the_gpu_cannot_draw_yet(page):
    page.evaluate(SETUP)
    assert len(page.evaluate("window.formvis.engine.gpuLayers().layers")) == 2
    assert page.evaluate("window.formvis.commands.run('add-mask')")
    assert page.evaluate("'layers' in window.formvis.engine.gpuLayers()")               # masks draw on the GPU since 1.22.0
    page.evaluate("window.formvis.engine.undo()")
    assert len(page.evaluate("window.formvis.engine.gpuLayers().layers")) == 2
    page.evaluate("window.formvis.engine.current.activeLayer.blend = 'negation'")
    assert page.evaluate("window.formvis.engine.gpuLayers().reason") == "a layer in Negation, Reflect, Glow or Xor mode"


def test_destroying_a_display_on_purpose_is_not_a_lost_device(page):
    # Switching renderers destroys the WebGPU display; before 1.22.0 that fired the lost handler and marked WebGPU as
    # failed for the rest of the session.
    lost = page.evaluate("""async () => {
      const D = await import('/src/gpu/display.ts');
      const d = await D.GpuDisplay.create(document.createElement('canvas'));
      if (!d) return 'no display';
      let fired = false; d.onLost = () => { fired = true; };
      d.destroy();
      await new Promise((r) => setTimeout(r, 300));
      return fired;
    }""")
    assert lost is False, lost
