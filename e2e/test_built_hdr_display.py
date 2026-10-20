"""PC-AU-0168: the WebGPU display presents in rgba16float with extended tone mapping when the screen reports a high dynamic range,
and goes back to the 8-bit format when it does not. SwiftShader has no HDR screen, so the media query is answered by a stand-in."""

HDR = """async (high) => {
  const D = await import('/src/gpu/display.ts');
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => /dynamic-range:\\s*high/.test(q) ? { matches: high, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : real(q);
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
  const disp = await D.GpuDisplay.create(canvas);
  if (!disp) return { error: 'no WebGPU display' };
  const cfg = () => { const c = disp.ctx.getConfiguration ? disp.ctx.getConfiguration() : null; return c ? { format: c.format, mode: c.toneMapping && c.toneMapping.mode } : null; };
  const out = { start: cfg() };
  out.high = disp.hdr(true); out.afterOn = cfg();
  out.again = disp.hdr(true);
  disp.hdrAllowed = false; out.refused = disp.hdr(true); out.afterRefused = cfg();
  disp.hdrAllowed = true; out.on2 = disp.hdr(true);
  const e = window.formvis.engine; e.newDocument(32, 24, 'D', 'white');
  const gl = e.gpuLayers();
  if ('layers' in gl) {
    const frame = () => disp.renderToPixels(gl.layers, [1, 0, 0, 1, 0, 0], 1, [0, 0, 32, 24], { a: [204, 204, 204], b: [255, 255, 255], cell: 8, origin: [0, 0] }, 32, 24);
    const inHdr = Array.from(await frame());
    disp.hdr(false);
    const inSdr = Array.from(await frame());
    disp.hdr(true);
    let diff = 0; for (let i = 0; i < inHdr.length; i++) diff = Math.max(diff, Math.abs(inHdr[i] - inSdr[i]));
    out.frameDiff = diff; out.frameSum = inHdr.reduce((s, v) => s + v, 0);
  }
  out.off = disp.hdr(false); out.afterOff = cfg();
  disp.destroy();
  return out;
}"""


def run(page, high):
    return page.evaluate(HDR, high)


def test_a_high_dynamic_range_screen_gets_half_float_with_extended_tone_mapping(page):
    out = run(page, True)
    assert "error" not in out, out
    assert out["start"] is None or out["start"]["format"] != "rgba16float"
    assert out["high"] is True and out["again"] is True
    assert out["afterOn"] == {"format": "rgba16float", "mode": "extended"}
    assert out["refused"] is False and out["afterRefused"]["format"] != "rgba16float", "Preferences can turn it off"
    assert out["on2"] is True
    assert out["frameSum"] > 0 and out["frameDiff"] <= 1, "the half-float frame reads back as the 8-bit frame"
    assert out["off"] is False and out["afterOff"]["format"] in ("bgra8unorm", "rgba8unorm")


def test_a_standard_screen_stays_in_the_8_bit_format(page):
    out = run(page, False)
    assert "error" not in out, out
    assert out["high"] is False
    assert out["afterOn"]["format"] in ("bgra8unorm", "rgba8unorm")
    assert out["frameSum"] > 0 and out["frameDiff"] <= 1, out
