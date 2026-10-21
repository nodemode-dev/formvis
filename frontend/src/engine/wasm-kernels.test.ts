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
  const ok = await Promise.all((['tone', 'blur', 'resample', 'dither'] as const).map((n) => wasm.warmKernels(n)));
  expect(ok).toEqual([true, true, true, true]);
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

  it('applies a lookup table like the loop does, on 60 random images', () => {
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
});
