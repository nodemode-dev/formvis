import { describe, expect, it } from 'vitest';
import './setup';
import { lensBlur, smartSharpen, sharpenSample, type SmartSharpenSettings } from '../src/engine/filters-more';
import { gaussianBlur } from '../src/engine/filters';

const W = 48;
const image = (f: (x: number, y: number) => number): ImageData => {
  const img = new ImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const v = f(x, y); img.data.set([v, v, v, 255], (y * W + x) * 4); }
  return img;
};
const at = (img: ImageData, x: number, y: number): number => img.data[(y * W + x) * 4];
const step = (): ImageData => image((x) => (x < W / 2 ? 40 : 210));
const ss = (p: Partial<SmartSharpenSettings>): SmartSharpenSettings => ({ amount: 100, radius: 2, noise: 0, remove: 'gaussian', angle: 0, shadows: 0, highlights: 0, ...p });

describe('Lens Blur', () => {
  it('leaves a flat interior unchanged', () => {
    expect(at(lensBlur(image(() => 128), 6, 0, 255), 24, 24)).toBe(128);
  });

  it('spreads one bright pixel over a disc of the radius, evenly', () => {
    const out = lensBlur(image((x, y) => (x === 24 && y === 24 ? 255 : 0)), 5, 0, 255);
    const inside = [at(out, 24, 24), at(out, 29, 24), at(out, 24, 19), at(out, 27, 27)];
    expect(new Set(inside).size).toBe(1);
    expect(inside[0]).toBeGreaterThan(0);
    expect(at(out, 31, 24)).toBe(0);
    expect(at(out, 29, 29)).toBe(0);
  });

  it('specular brightness makes highlights bloom brighter than a plain disc', () => {
    const src = image((x, y) => (Math.abs(x - 24) < 2 && Math.abs(y - 24) < 2 ? 250 : 20));
    expect(at(lensBlur(src, 6, 80, 240), 24, 24)).toBeGreaterThan(at(lensBlur(src, 6, 0, 255), 24, 24) + 20);
  });
});

describe('Smart Sharpen', () => {
  it('leaves flat images alone in every removal mode', () => {
    for (const remove of ['gaussian', 'lens', 'motion'] as const) expect(at(smartSharpen(image(() => 90), ss({ remove, amount: 300 })), 20, 20)).toBe(90);
  });

  it('raises contrast across an edge', () => {
    const out = smartSharpen(step(), ss({ remove: 'gaussian', amount: 200 }));
    expect(at(out, W / 2 - 1, 10)).toBeLessThan(40);
    expect(at(out, W / 2, 10)).toBeGreaterThan(210);
  });

  it('lens removal makes a Gaussian-blurred edge rise over a shorter distance', () => {
    const blurred = gaussianBlur(step(), 2), fixed = smartSharpen(blurred, ss({ remove: 'lens', radius: 4, amount: 100 }));
    const rise = (a: ImageData): number => {
      const cross = (level: number): number => { for (let x = 8; x < W - 8; x++) { const v0 = at(a, x, 24), v1 = at(a, x + 1, 24); if (v0 < level && v1 >= level) return x + (level - v0) / (v1 - v0); } return NaN; };
      return cross(40 + 0.9 * 170) - cross(40 + 0.1 * 170);
    };
    expect(rise(fixed)).toBeLessThan(rise(blurred) * 0.8);
  });

  it('the shadows fade leaves dark tones nearly untouched', () => {
    const src = image((x) => (x < W / 2 ? 10 : 60));
    const plain = smartSharpen(src, ss({ amount: 300 })), faded = smartSharpen(src, ss({ amount: 300, shadows: 100 }));
    expect(Math.abs(at(faded, W / 2 - 1, 10) - 10)).toBeLessThan(Math.abs(at(plain, W / 2 - 1, 10) - 10));
  });

  it('reduce noise gates out faint grain but keeps strong edges', () => {
    const grain = image((x, y) => 128 + ((x * 7 + y * 13) % 3) - 1);
    const kept = smartSharpen(grain, ss({ amount: 300, noise: 100 }));
    for (let x = 10; x < 20; x++) expect(Math.abs(at(kept, x, 20) - at(grain, x, 20))).toBeLessThanOrEqual(1);
    expect(at(smartSharpen(step(), ss({ amount: 200, noise: 100 })), W / 2, 10)).toBeGreaterThan(210);
  });

  it('keeps alpha', () => {
    const src = step();
    for (let i = 3; i < src.data.length; i += 4) src.data[i] = 77;
    const out = sharpenSample(src, 1.5);
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(77);
  });
});
