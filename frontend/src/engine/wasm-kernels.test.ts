import { beforeAll, describe, expect, it, vi } from 'vitest';

const nodeModule = (name: string): Promise<any> => import(/* @vite-ignore */ name);

class TestImageData {
  data: Uint8ClampedArray;
  constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
    if (typeof a === 'number') { this.data = new Uint8ClampedArray(a * b * 4); this.width = a; this.height = b; } else { this.data = a; this.width = b; this.height = c ?? a.length / 4 / b; }
  }
  width: number;
  height: number;
  colorSpace = 'srgb';
}

let seed = 12345;
const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const noise = (w: number, h: number): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 256;
  for (let i = 3; i < d.length; i += 4) if (rnd() < 0.1) d[i] = 0;
  return d;
};
const img = (w: number, h: number): ImageData => new TestImageData(noise(w, h), w, h) as unknown as ImageData;

let wasm: typeof import('./wasm-kernels');
let kernels: typeof import('./kernels');
let filters: typeof import('./filters');
let resample: typeof import('./resample');
let dither: typeof import('./filters-lib/dither');
let retouch: typeof import('./retouch');

beforeAll(async () => {
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('ImageData', TestImageData);
  const fs = await nodeModule('node:fs'), path = await nodeModule('node:path');
  vi.stubGlobal('fetch', async (url: string) => {
    const file = new URL('./kernels-wasm/' + path.basename(String(url)), import.meta.url);
    return new Response(fs.readFileSync(file), { status: 200 });
  });
  wasm = await import('./wasm-kernels');
  kernels = await import('./kernels');
  filters = await import('./filters');
  resample = await import('./resample');
  dither = await import('./filters-lib/dither');
  retouch = await import('./retouch');
  const ok = await Promise.all((['tone', 'blur', 'resample', 'dither', 'mask', 'heal', 'noise', 'patch'] as const).map((n) => wasm.warmKernels(n)));
  expect(ok).toEqual([true, true, true, true, true, true, true, true]);
});

const both = <T>(run: () => T): { fast: T; slow: T } => {
  wasm.setKernelsEnabled(true);
  const fast = run();
  wasm.setKernelsEnabled(false);
  const slow = run();
  wasm.setKernelsEnabled(true);
  return { fast, slow };
};

describe('WebAssembly kernels equal the TypeScript kernels byte for byte', () => {
  it('loads every module in Node and counts calls', () => {
    const before = wasm.kernelStats().chunks.tone.calls;
    const px = noise(100, 100);
    expect(wasm.wasmLut(px, new Uint8Array(768))).toBe(true);
    expect(wasm.kernelStats().chunks.tone.calls).toBe(before + 1);
  });

  it('applies a lookup table like the loop does, on 60 random images', { timeout: 30000 }, () => {
    for (let k = 0; k < 60; k++) {
      const w = 64 + Math.floor(rnd() * 90), h = 40 + Math.floor(rnd() * 70);
      const settings = k % 2
        ? { ranges: [{ black: Math.floor(rnd() * 100), white: 150 + Math.floor(rnd() * 105), gamma: 0.3 + rnd() * 3 }, {}, {}, {}, {}] }
        : { ranges: [{ black: 0, white: 255, gamma: 1 }, { black: 10, white: 240, gamma: 0.8 }, {}, { black: 5, white: 200, gamma: 1.7 }, {}] };
      const kernel = k % 3 === 0 ? kernels.invertKernel() : kernels.levelsKernel(settings);
      const src = noise(w, h);
      const { fast, slow } = both(() => { const d = new Uint8ClampedArray(src); kernel(d); return d; });
      expect(Array.from(fast)).toEqual(Array.from(slow));
    }
  });

  it('blurs like the three box blurs do, on random sigmas', () => {
    for (let k = 0; k < 12; k++) {
      const src = img(80 + Math.floor(rnd() * 60), 50 + Math.floor(rnd() * 50));
      const sigma = 0.5 + rnd() * 9;
      const { fast, slow } = both(() => filters.gaussianBlur(src, sigma).data);
      expect(Array.from(fast)).toEqual(Array.from(slow));
    }
  });

  it('resamples like the loops do, up and down, for each kernel method', () => {
    for (const method of ['bilinear', 'bicubic', 'smoother', 'sharper', 'lanczos'] as const) {
      for (const [w, h] of [[37, 29], [60, 50], [190, 130], [120, 100]]) {
        const src = img(110, 90);
        const calls = wasm.kernelStats().chunks.resample.calls;
        const { fast, slow } = both(() => resample.kernelResample(src, w, h, method).data);
        expect(Array.from(fast)).toEqual(Array.from(slow));
        expect(wasm.kernelStats().chunks.resample.calls - calls).toBe(w * h * 5 > 110 * 90 * 3 ? 0 : 1);
      }
    }
  });

  it('dithers like the loop does, in grey and colour', () => {
    const ink: [number, number, number] = [10, 20, 30], paper: [number, number, number] = [240, 230, 220];
    for (const pattern of ['bayer4', 'bayer8']) {
      for (const colour of [false, true]) {
        const src = img(96, 80);
        const { fast, slow } = both(() => dither.ditherImage(src, pattern, 4, 2, colour, 80, ink, paper, 3, 5).data);
        expect(Array.from(fast)).toEqual(Array.from(slow));
      }
    }
  });

  const photo = (w: number, h: number): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, blob = Math.sin(x / 17) + Math.cos(y / 23);
      d[i] = 120 + blob * 50 + rnd() * 6; d[i + 1] = 100 + Math.sin(x / 31) * 60 + rnd() * 6; d[i + 2] = 90 + blob * 30 + rnd() * 6; d[i + 3] = 255;
    }
    return d;
  };

  it('selects like the Magic Wand loop does, contiguous or not, over random seeds, tolerances and sample sizes', () => {
    for (let k = 0; k < 24; k++) {
      const w = 70 + Math.floor(rnd() * 90), h = 50 + Math.floor(rnd() * 70), src = k % 4 === 0 ? noise(w, h) : photo(w, h);
      const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h), tol = Math.floor(rnd() * 70), radius = k % 3;
      const calls = wasm.kernelStats().chunks.mask.calls;
      const { fast, slow } = both(() => kernels.wandMask(src, w, h, x, y, tol, k % 2 === 0, radius));
      expect(Array.from(fast)).toEqual(Array.from(slow));
      expect(wasm.kernelStats().chunks.mask.calls - calls).toBe(1);
    }
  });

  it('adds uniform noise like the loop does and leaves Gaussian noise to the loop', () => {
    for (let k = 0; k < 12; k++) {
      const src = img(60 + Math.floor(rnd() * 80), 40 + Math.floor(rnd() * 60)), amount = rnd() * 100, mono = k % 2 === 0, seedValue = Math.floor(rnd() * 4294967296);
      const calls = wasm.kernelStats().chunks.noise.calls;
      const { fast, slow } = both(() => filters.addNoise(src, amount, false, mono, seedValue).data);
      expect(Array.from(fast)).toEqual(Array.from(slow));
      expect(wasm.kernelStats().chunks.noise.calls - calls).toBe(1);
      const g = wasm.kernelStats().chunks.noise.calls;
      filters.addNoise(src, amount, true, mono, seedValue);
      expect(wasm.kernelStats().chunks.noise.calls).toBe(g);
    }
  });

  it('corrects a patch like the loop does (Diffusion, Color, opacity, a separate source)', () => {
    for (let k = 0; k < 16; k++) {
      const w = 80 + Math.floor(rnd() * 60), h = 60 + Math.floor(rnd() * 50), before = photo(w, h), heal = photo(w, h), cov = new Uint8Array(w * h);
      const cx = 20 + Math.floor(rnd() * (w - 40)), cy = 15 + Math.floor(rnd() * (h - 30)), r = 6 + Math.floor(rnd() * 12);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - cx, y - cy); cov[y * w + x] = d <= r ? 255 : d <= r + 3 ? Math.floor(rnd() * 255) : 0; }
      const dx = Math.floor(rnd() * 40) - 20, dy = Math.floor(rnd() * 30) - 15, diff = 1 + Math.floor(rnd() * 6), col = rnd(), op = 0.3 + rnd() * 0.7, source = k % 2 ? photo(w, h) : undefined;
      const calls = wasm.kernelStats().chunks.patch.calls;
      const { fast, slow } = both(() => { const out = new Uint8ClampedArray(heal); retouch.scaleHealCorrection(out, before, cov, w, h, dx, dy, diff, col, op, source); return out; });
      expect(Array.from(fast)).toEqual(Array.from(slow));
      expect(wasm.kernelStats().chunks.patch.calls - calls).toBe(1);
    }
  });

  it('heals like the loop does: the membrane under Healing Brush, Patch, Spot Healing and Fill Transparent', () => {
    for (let k = 0; k < 5; k++) {
      const w = 90 + Math.floor(rnd() * 70), h = 70 + Math.floor(rnd() * 50), src = photo(w, h), cov = new Uint8Array(w * h);
      const cx = 30 + Math.floor(rnd() * (w - 60)), cy = 25 + Math.floor(rnd() * (h - 50)), r = 5 + Math.floor(rnd() * 14);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - cx, y - cy); cov[y * w + x] = d <= r ? 255 : d <= r + 2 ? 120 : 0; }
      const calls = wasm.kernelStats().chunks.heal.calls;
      const strength = 0.4 + rnd() * 0.6;
      const from = both(() => { const px = new Uint8ClampedArray(src); retouch.healFromSource(px, cov, w, h, strength, 25, -12); return px; });
      expect(Array.from(from.fast)).toEqual(Array.from(from.slow));
      expect(wasm.kernelStats().chunks.heal.calls - calls).toBeGreaterThanOrEqual(1);
      for (const mode of ['contentAware', 'createTexture', 'proximityMatch'] as const) {
        const spot = both(() => { const px = new Uint8ClampedArray(src); retouch.spotHeal(px, cov, w, h, 0.9, mode, 77 + k); return px; });
        expect(Array.from(spot.fast)).toEqual(Array.from(spot.slow));
      }
      const hole = both(() => { const im = new TestImageData(new Uint8ClampedArray(src), w, h); for (let i = 0; i < cov.length; i++) if (cov[i] === 255) im.data[i * 4 + 3] = 0; retouch.fillTransparent(im as unknown as ImageData); return im.data; });
      expect(Array.from(hole.fast)).toEqual(Array.from(hole.slow));
    }
  }, 60000);

  it('solves the membrane like the loop does on random holes, and refuses small or odd grids', () => {
    for (let k = 0; k < 8; k++) {
      const w = 70 + Math.floor(rnd() * 60), h = 60 + Math.floor(rnd() * 40), src = noise(w, h);
      for (let i = 0; i < w * h; i++) if (rnd() < 0.002 * k) { src[i * 4 + 3] = 0; }
      for (let y = 10; y < 10 + 5 * k; y++) for (let x = 12; x < 12 + 7 * k && x < w; x++) src[(y * w + x) * 4 + 3] = 0;
      const calls = wasm.kernelStats().chunks.heal.calls;
      const { fast, slow } = both(() => { const im = new TestImageData(new Uint8ClampedArray(src), w, h); retouch.fillTransparent(im as unknown as ImageData); return im.data; });
      expect(Array.from(fast)).toEqual(Array.from(slow));
      expect(wasm.kernelStats().chunks.heal.calls - calls).toBeGreaterThanOrEqual(k > 0 ? 1 : 0);
    }
    expect(wasm.wasmMembrane(new Float32Array(16), new Uint8Array(4), 2, 2)).toBe(false);
    expect(wasm.wasmMembrane(new Float32Array(16), new Uint8Array(4), 4, 1)).toBe(false);
  });
});
