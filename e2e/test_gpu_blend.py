import pytest

BLENDS = ["normal", "dissolve", "darken", "multiply", "color-burn", "linear-burn", "darker-color", "lighten", "screen", "color-dodge",
          "linear-dodge", "lighter-color", "overlay", "soft-light", "hard-light", "vivid-light", "linear-light", "pin-light", "hard-mix",
          "difference", "exclusion", "subtract", "divide", "hue", "saturation", "color", "luminosity"]

COMPARE = """async (mode) => {
  const E = await import('/src/engine/index.ts');
  const R = await import('/src/engine/renderer.ts');
  const G = await import('/src/gpu/blender.ts');
  const e = window.sonny.engine;
  e.newDocument(64, 32, 'G', 'white');
  const p = e.current, bg = p.activeLayer, c = bg.raster.ctx;
  const g1 = c.createLinearGradient(0, 0, 64, 0); g1.addColorStop(0, 'rgb(10,200,60)'); g1.addColorStop(1, 'rgb(240,30,180)');
  c.fillStyle = g1; c.fillRect(0, 0, 64, 32); bg.raster.touch();
  e.addLayer(); const top = p.activeLayer; top.raster = new E.Raster(64, 32);
  const t = top.raster.ctx, g2 = t.createLinearGradient(0, 0, 0, 32); g2.addColorStop(0, 'rgba(255,220,0,1)'); g2.addColorStop(1, 'rgba(20,60,255,0.35)');
  t.fillStyle = g2; t.fillRect(0, 0, 64, 32); top.raster.touch();
  top.blend = mode; top.opacity = 0.8;
  const cpu = E.ctxOf(R.renderDoc(new R.Renderer(), p.doc, null)).getImageData(0, 0, 64, 32).data;
  const comp = await G.GpuBlender.create();
  if (!comp) return { error: 'no WebGPU adapter' };
  const layers = p.doc.layers.filter((l) => l.visible && l.raster).map((l) => ({ image: l.raster.canvas, width: l.raster.width, height: l.raster.height,
    matrix: E.placement(l.transform, l.raster.width, l.raster.height), opacity: l.opacity, blend: l.blend }));
  const gpu = await comp.composite(64, 32, layers, null);
  comp.destroy();
  let max = 0, at = -1;
  for (let i = 0; i < cpu.length; i++) { const d = Math.abs(cpu[i] - gpu[i]); if (d > max) { max = d; at = i; } }
  return { max, at, cpu: Array.from(cpu.subarray(at - (at % 4), at - (at % 4) + 4)), gpu: Array.from(gpu.subarray(at - (at % 4), at - (at % 4) + 4)) };
}"""


@pytest.mark.parametrize("mode", BLENDS)
def test_the_gpu_blender_matches_the_cpu_renderer(page, mode):
    r = page.evaluate(COMPARE, mode)
    assert "error" not in r, r
    assert r["max"] <= 3, r            # 8-bit premultiplied canvas storage against float shader maths
