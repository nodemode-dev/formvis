import { describe, expect, it } from 'vitest';
import { bandPlan } from './band-pool';
import { deepBandRows, deepBandRun, deepBandable } from './deep-bands';
import { boxBlurDeep } from './deep-filters';
import { blurDeep } from './deep';
import type { FilterKind, FilterSettings } from './filter-jobs';
import type { DeepPixels } from './types';

function picture(w: number, h: number, n: 3 | 4): DeepPixels {
  const S = n + 1, data = new Float32Array(w * h * S);
  let seed = 5;
  for (let i = 0; i < data.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = (seed / 4294967296) * (i % S === n ? 1 : 3.2); }
  return { mode: 'rgb', n, width: w, height: h, data };
}

function banded(kind: FilterKind, s: FilterSettings, p: DeepPixels, apron: number): Float32Array {
  const S = p.n + 1, W = p.width, out = new Float32Array(p.data.length);
  for (const b of bandPlan(p.height, apron, deepBandRows(kind, apron))) {
    const band = { ...p, height: b.a1 - b.a0, data: p.data.slice(b.a0 * W * S, b.a1 * W * S) };
    const got = deepBandRun(kind, s, 7, Infinity, b.a0 * W, band)!;
    out.set(got.data.subarray((b.y0 - b.a0) * W * S, (b.y1 - b.a0) * W * S), b.y0 * W * S);
  }
  return out;
}

describe('deep bands', () => {
  it('Box Blur in aligned bands gives the whole layer\'s floats', () => {
    const p = picture(37, 1700, 3), r = 11, s = { lib: { boxBlur: { radius: r } } } as unknown as FilterSettings;
    expect(deepBandable('boxBlur')).toBe(true);
    const whole = boxBlurDeep(p, r).data, parts = banded('boxBlur', s, p, r + 1);
    expect(parts.length).toBe(whole.length);
    for (let i = 0; i < whole.length; i++) if (!Object.is(parts[i], whole[i])) throw new Error(`float ${i} differs: ${parts[i]} against ${whole[i]}`);
  });

  it('Gaussian Blur in bands gives the whole layer\'s floats', () => {
    const p = picture(41, 1300, 4), sigma = 3, s = { radius: sigma } as unknown as FilterSettings, whole = blurDeep(p, sigma).data, parts = banded('gaussianBlur', s, p, 3 * Math.ceil(sigma) + 4);
    for (let i = 0; i < whole.length; i++) if (!Object.is(parts[i], whole[i])) throw new Error(`float ${i} differs`);
  });

  it('keeps Box Blur bands on whole 512-row blocks', () => {
    expect(deepBandRows('boxBlur', 20)).toBe(512);
    expect(deepBandRows('boxBlur', 700)).toBe(1024);
    expect(deepBandRows('gaussianBlur', 700)).toBe(700);
  });
});
