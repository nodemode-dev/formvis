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


TOOLS = """async () => {
  const e = window.formvis.engine;
  const served = await (await fetch('/src/engine/filters.ts')).text();
  const spec = (served.match(/["'](\\/src\\/engine\\/wasm-kernels\\.ts[^"']*)["']/) || [])[1] || '/src/engine/wasm-kernels.ts';
  const K = await import(spec), F = await import('/src/engine/filters.ts'), E = await import('/src/engine/index.ts');
  await Promise.all(['mask', 'heal', 'noise', 'patch'].map((n) => K.warmKernels(n)));
  const W = 1200, H = 900, photo = new ImageData(W, H);
  let s = 77;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const i = (y * W + x) * 4, r = (s >>> 24) / 40;
    photo.data[i] = 90 + 60 * Math.sin(x / 90) + y / 12 + r; photo.data[i + 1] = 110 + 50 * Math.cos(y / 70) + r; photo.data[i + 2] = 130 + 40 * Math.sin((x + y) / 120) + r; photo.data[i + 3] = 255;
  }
  const hash = async (u8) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const layer = async () => { const r = e.activeLayer.raster; return hash(r.ctx.getImageData(0, 0, r.width, r.height).data); };
  const reset = () => { e.newDocument(W, H, 'Tools', 'white'); e.activeLayer.raster.ctx.putImageData(photo, 0, 0); e.activeLayer.raster.touch(); e.refresh(); };
  const out = { on: {}, off: {}, calls: {} };
  const calls = () => { const c = K.kernelStats().chunks; return { mask: c.mask.calls, heal: c.heal.calls, patch: c.patch.calls, noise: c.noise.calls }; };
  for (const mode of ['on', 'off']) {
    K.setKernelsEnabled(mode === 'on');
    const before = calls();
    reset();
    e.wand.tolerance = 40; e.wand.contiguous = true; e.wand.antialias = true; e.wand.sampleSize = 1;
    await e.magicWand({ x: 300, y: 200 }, 'replace');
    out[mode].wand = await hash(e.current.selection.data);
    reset();
    e.setTool('healingBrush');
    Object.assign(e.brush, { diameter: 60, hardness: 0.6, opacity: 1 });
    e.retouch.healBlendMode = 'replace';
    e.setCloneSource({ x: 300, y: 300 });
    e.beginRetouchStroke('healBrush', { x: 700, y: 500 }, false);
    for (let i = 1; i <= 8; i++) e.strokeTo({ x: 700 + i * 12, y: 500 + i * 5 });
    e.endStroke();
    e.retouch.healBlendMode = 'normal';
    out[mode].heal = await layer();
    reset();
    Object.assign(e.retouch, { patchMode: 'normal', patchFrom: 'source', patchDiffusion: 4, patchColor: 10 });
    e.applySelection(E.SelectionMask.cropped(100, 100, 120, 120, new Uint8Array(120 * 120).fill(255)), 'replace', 'Sel');
    e.patchSelection(400, 300);
    out[mode].patch = await layer();
    out[mode].noise = await hash(F.addNoise(photo, 18, false, false, 4242).data);
    const after = calls();
    if (mode === 'on') for (const k of Object.keys(after)) out.calls[k] = after[k] - before[k];
  }
  K.setKernelsEnabled(true);
  return out;
}"""


@steady
def test_the_wand_healing_patch_and_noise_kernels_are_used_and_give_the_typescript_bytes(page, tmp_path):
    start(page)
    r = page.evaluate(TOOLS)
    for name in ("wand", "heal", "patch", "noise"):
        assert r["on"][name] == r["off"][name], name
    assert r["calls"]["mask"] >= 1
    assert r["calls"]["heal"] >= 2
    assert r["calls"]["patch"] >= 1
    assert r["calls"]["noise"] >= 1
