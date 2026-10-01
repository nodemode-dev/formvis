import { describe, expect, it } from 'vitest';
import { blurDeep, composeDeep, deepFromU16, deepToned, linearToSrgb, noiseDeep, resampleDeep, srgbToLinear, strokeDeep, transferOf, unsharpDeep } from './deep';
import type { Adjustment, DeepPixels, Doc, Layer } from './types';

const W = 1024;
const layer = (over: Partial<Layer>): Layer => ({ id: over.id ?? 'l', name: 'L', raster: { width: W, height: 1 } as never, transform: { x: 0, y: 0, w: W, h: 1, rotation: 0, flipX: false, flipY: false, sampling: 'bilinear' as never }, visible: true, isGroup: false, opacity: 1, blend: 'normal', mask: null, clipId: null, adjustment: null, ...over } as Layer);
const ramp = (): Float32Array => { const u = new Uint16Array(W * 4); for (let x = 0; x < W; x++) { const v = Math.round((x / (W - 1)) * 65535); u.set([v, v, v, 65535], x * 4); } return deepFromU16(u, W, 1).data; };
const exposure = { kind: 'exposure', data: { exposureSettings: { exposure: 0.7, offset: 0, gamma: 1 } } } as unknown as Adjustment;
const rgb = (width: number, height: number, data: Float32Array): DeepPixels => ({ mode: 'rgb', n: 3, width, height, data });

describe('16-bit composing (1.53.6)', () => {
  it('keeps thousands of levels through an adjustment, where 8 bits keep at most 256', () => {
    const doc = { id: 'd', width: W, height: 1, resolution: 72, depth: 16, layers: [layer({ channels: rgb(W, 1, ramp()) }), layer({ id: 'a', raster: null, adjustment: exposure })] } as unknown as Doc;
    const out = composeDeep(doc);
    if ('error' in out) throw new Error(out.error);
    const levels = new Set<number>(); for (let x = 0; x < W; x++) levels.add(Math.round(out.data[x * 4] * 65535));
    // +0.7 EV clips above 0.616 linear, about 81 percent up the encoded ramp: some 830 of 1,024 inputs stay distinct.
    expect(levels.size).toBeGreaterThan(780);   // 8 bits would keep at most 256
  });

  it('evaluates the same transfer as the 8-bit table at whole levels', () => {
    const t = transferOf(exposure);
    expect(t).not.toBeNull();
    expect(Math.round((t as (c: number, l: number) => number)(0, 128))).toBeGreaterThan(128);   // brighter, as the 8-bit table
  });

  it('composes bottom first, and names what it cannot compose yet', () => {
    const red = new Float32Array([1, 0, 0, 1]), blue = new Float32Array([0, 0, 1, 1]);
    const one = (id: string, data: Float32Array): Layer => layer({ id, channels: rgb(1, 1, data), raster: { width: 1, height: 1 } as never, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, flipX: false, flipY: false, sampling: 'bilinear' as never } });
    const out = composeDeep({ id: 'd', width: 1, height: 1, resolution: 72, layers: [one('r', red), one('b', blue)] } as unknown as Doc);
    expect('error' in out ? out.error : Array.from(out.data)).toEqual([0, 0, 1, 1]);   // the top layer, blue, over red
    const styled = composeDeep({ id: 'd', width: 1, height: 1, resolution: 72, layers: [layer({ effects: {} as never })] } as unknown as Doc);   // masks compose since 1.55.5; a style still waits
    expect('error' in styled && styled.error).toMatch(/style/);
  });
});

describe('16-bit geometry and filters (1.53.7)', () => {
  const rampLayer = (flipX = false): Layer => layer({ channels: rgb(W, 1, ramp()), transform: { x: 0, y: 0, w: W, h: 1, rotation: 0, flipX, flipY: false, sampling: 'bilinear' as never } });

  it('a flipped layer composes as an exact mirror, no blur', () => {
    const out = composeDeep({ id: 'd', width: W, height: 1, resolution: 72, layers: [rampLayer(true)] } as unknown as Doc);
    if ('error' in out) throw new Error(out.error);
    const src = ramp();
    for (const x of [0, 1, 500, W - 1]) expect(out.data[x * 4]).toBe(src[(W - 1 - x) * 4]);
  });

  it('halving averages exactly; blur keeps its levels and softens an edge; noise is repeatable', () => {
    const half = resampleDeep(rgb(W, 1, ramp()), W / 2, 1), src = ramp();
    expect(half.data[0]).toBeCloseTo((src[0] + src[4]) / 2, 6);
    const blurred = blurDeep(rgb(W, 1, ramp()), 2), levels = new Set<number>();
    for (let x = 0; x < W; x++) levels.add(Math.round(blurred.data[x * 4] * 65535));
    expect(levels.size).toBeGreaterThan(900);
    const edge = new Float32Array(16 * 4); for (let x = 0; x < 16; x++) edge.set(x < 8 ? [0, 0, 0, 1] : [1, 1, 1, 1], x * 4);
    const soft = blurDeep(rgb(16, 1, edge), 1.5).data;
    expect(soft[7 * 4]).toBeGreaterThan(0.05); expect(soft[8 * 4]).toBeLessThan(0.95);
    const n1 = noiseDeep(rgb(W, 1, ramp()), 10, false, true, 7).data, n2 = noiseDeep(rgb(W, 1, ramp()), 10, false, true, 7).data;
    expect(Array.from(n1.slice(0, 40))).toEqual(Array.from(n2.slice(0, 40)));
    expect(n1.some((v, i) => i % 4 !== 3 && Math.abs(v - src[i]) > 1 / 255)).toBe(true);
    expect(unsharpDeep(rgb(16, 1, edge), 100, 1.5, 0).data[8 * 4]).toBeGreaterThanOrEqual(1 - 1e-6);   // sharpened: the bright side of the edge rises to white
  });
});

describe('16-bit painting (1.53.8)', () => {
  const N = 1024, a = 0.5, red = { r: 255, g: 0, b: 0 }, white = { r: 255, g: 255, b: 255 };
  const img = (d: Uint8ClampedArray): ImageData => ({ width: N, height: 1, data: d, colorSpace: 'srgb' } as ImageData);

  it('a half-strength stroke over a 16-bit ramp keeps its 16 bits', () => {
    const deep = rgb(N, 1, ramp()), before = new Uint8ClampedArray(N * 4), after = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N * 4; i++) before[i] = Math.round(deep.data[i] * 255);
    for (let x = 0; x < N; x++) { const o = x * 4; after[o] = Math.round(255 * a + before[o] * (1 - a)); after[o + 1] = Math.round(before[o + 1] * (1 - a)); after[o + 2] = Math.round(before[o + 2] * (1 - a)); after[o + 3] = 255; }
    const out = strokeDeep(deep, img(before), img(after), 0, 0, red, white).data;
    let worst = 0; const levels = new Set<number>(), eight = new Set<number>();
    for (let x = 0; x < N; x++) {
      const o = x * 4, want = deep.data[o + 1] * (1 - a);
      worst = Math.max(worst, Math.abs(out[o + 1] - want));
      levels.add(Math.round(out[o + 1] * 65535)); eight.add(after[o + 1]);
    }
    expect(worst).toBeLessThan(1.5 / 255);             // better than 8 bits
    expect(eight.size).toBeLessThanOrEqual(256);
    expect(levels.size).toBeGreaterThan(3 * eight.size);   // the ramp's 16 bits under the paint, well past the 8-bit copy's
  });

  it('erasing to half alpha halves the 16-bit alpha', () => {
    const deep = rgb(N, 1, ramp()), before = new Uint8ClampedArray(N * 4), after = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N * 4; i++) before[i] = Math.round(deep.data[i] * 255);
    after.set(before); for (let x = 0; x < N; x++) after[x * 4 + 3] = 128;
    const out = strokeDeep(deep, img(before), img(after), 0, 0, null, white).data;
    expect(out[3]).toBeCloseTo(128 / 255, 6); expect(out[500 * 4 + 1]).toBe(deep.data[500 * 4 + 1]);   // colour untouched
  });
});

describe('32-bit documents (1.53.9)', () => {
  it('converts sRGB to linear and back', () => {
    for (const v of [0, 0.002, 0.04, 0.2, 0.5, 0.9, 1]) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
  });

  it('applies Exposure in linear light, unclamped, and HDR Toning brings it in', () => {
    const lin = new Float32Array([0.25, 2, 8, 1]);
    const layerOf = (): Layer => layer({ channels: rgb(1, 1, lin), raster: { width: 1, height: 1 } as never, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, flipX: false, flipY: false, sampling: 'bilinear' as never } });
    const up = { kind: 'exposure', data: { exposureSettings: { exposure: 1, offset: 0, gamma: 1 } } } as unknown as Adjustment;
    const out = composeDeep({ id: 'd', width: 1, height: 1, resolution: 72, depth: 32, layers: [layerOf(), layer({ id: 'x', raster: null, adjustment: up })] } as unknown as Doc);
    if ('error' in out) throw new Error(out.error);
    expect(Array.from(out.data.slice(0, 3))).toEqual([0.5, 4, 16]);                        // doubled, past white kept
    const toned = deepToned(rgb(1, 1, lin), -1, 1).data;
    expect(toned[0]).toBeCloseTo(linearToSrgb(0.125), 6); expect(toned[2]).toBe(1);      // halved then encoded; 4 still clips
    const lv = { kind: 'levels', data: {} } as unknown as Adjustment;
    const refused = composeDeep({ id: 'd', width: 1, height: 1, resolution: 72, depth: 32, layers: [layerOf(), layer({ id: 'y', raster: null, adjustment: lv })] } as unknown as Doc);
    expect('error' in refused && refused.error).toMatch(/Exposure does/);
  });
});
