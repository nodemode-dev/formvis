from e2e.files2_support import start, steady

RUN = """async () => {
  const e = window.formvis.engine, cat = window.formvis.catalogue;
  const served = await (await fetch('/src/engine/filters.ts')).text();
  const spec = (served.match(/["'](\\/src\\/engine\\/wasm-kernels\\.ts[^"']*)["']/) || [])[1] || '/src/engine/wasm-kernels.ts';
  const K = await import(spec), F = await import('/src/engine/filters.ts');
  await Promise.all(['tone', 'blur', 'resample'].map((n) => K.warmKernels(n)));
  const W = 1200, H = 900, noise = new ImageData(W, H);
  let s = 424242;
  for (let i = 0; i < noise.data.length; i += 4) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; noise.data[i] = s >>> 24; noise.data[i + 1] = (s >>> 16) & 255; noise.data[i + 2] = (s >>> 8) & 255; noise.data[i + 3] = (i / 4) % 89 === 0 ? 0 : 255; }
  const raster = () => e.activeLayer.raster;
  const hash = async () => { const r = raster(), d = r.ctx.getImageData(0, 0, r.width, r.height); const h = await crypto.subtle.digest('SHA-256', d.data.buffer); return d.width + 'x' + d.height + ':' + Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join(''); };
  const reset = () => { e.newDocument(W, H, 'Wasm', 'white'); raster().ctx.putImageData(noise, 0, 0); raster().touch(); };
  const knots = [{ x: 0, y: 0 }, { x: 64, y: 90 }, { x: 180, y: 150 }, { x: 255, y: 255 }];
  const ops = {
    levels: () => cat.runCommand('adjust.apply', { kind: 'levels', black: 20, white: 230, gamma: 1.3 }),
    curves: () => cat.runCommand('adjust.apply', { kind: 'curves', data: { curves: { channel: 'RGB', channels: [knots, knots, knots, knots, knots] } } }),
    imageSize: async () => ({ ok: e.resampleImage(500, 375, 'bilinear', 72) }),
  };
  const out = { on: {}, off: {}, calls: {}, blur: {} };
  for (const mode of ['on', 'off']) {
    K.setKernelsEnabled(mode === 'on');
    for (const [name, run] of Object.entries(ops)) {
      reset();
      const before = K.kernelStats().chunks;
      const r = await run();
      const after = K.kernelStats().chunks;
      out[mode][name] = { ok: r.ok, hash: await hash() };
      if (mode === 'on') out.calls[name] = (after.tone.calls - before.tone.calls) + (after.resample.calls - before.resample.calls);
    }
    const img = new ImageData(new Uint8ClampedArray(noise.data), W, H);
    const before = K.kernelStats().chunks.blur.calls;
    const blurred = F.gaussianBlur(img, 5).data;
    const h = await crypto.subtle.digest('SHA-256', blurred.buffer);
    out.blur[mode] = Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
    if (mode === 'on') out.calls.gaussian = K.kernelStats().chunks.blur.calls - before;
  }
  K.setKernelsEnabled(true);
  return out;
}"""


@steady
def test_the_webassembly_kernels_are_used_and_give_the_typescript_bytes(page, tmp_path):
    start(page)
    r = page.evaluate(RUN)
    for name in ("levels", "curves", "imageSize"):
        assert r["on"][name]["ok"] and r["off"][name]["ok"], name
        assert r["on"][name]["hash"] == r["off"][name]["hash"], name
        assert r["calls"][name] >= 1, name
    assert r["on"]["imageSize"]["hash"].startswith("500x375:")
    assert r["blur"]["on"] == r["blur"]["off"]
    assert r["calls"]["gaussian"] >= 1
