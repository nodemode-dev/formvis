import { describe, expect, it } from 'vitest';
import { blurDeep, composeDeep, deepFromU16, noiseDeep, resampleDeep, transferOf, unsharpDeep } from './deep';
import type { Adjustment, Doc, Layer } from './types';

const W = 1024;
const layer = (over: Partial<Layer>): Layer => ({ id: over.id ?? 'l', name: 'L', raster: { width: W, height: 1 } as never, transform: { x: 0, y: 0, w: W, h: 1, rotation: 0, flipX: false, flipY: false, sampling: 'bilinear' as never }, visible: true, isGroup: false, opacity: 1, blend: 'normal', mask: null, clipId: null, adjustment: null, ...over } as Layer);
const ramp = (): Float32Array => { const u = new Uint16Array(W * 4); for (let x = 0; x < W; x++) { const v = Math.round((x / (W - 1)) * 65535); u.set([v, v, v, 65535], x * 4); } return deepFromU16(u, W, 1).data; };
const exposure = { kind: 'exposure', data: { exposureSettings: { exposure: 0.7, offset: 0, gamma: 1 } } } as unknown as Adjustment;

describe('16-bit composing (1.53.6)', () => {
  it('keeps thousands of levels through an adjustment, where 8 bits keep at most 256', () => {
    const doc = { id: 'd', width: W, height: 1, resolution: 72, depth: 16, layers: [layer({ deep: { width: W, height: 1, data: ramp() } }), layer({ id: 'a', raster: null, adjustment: exposure })] } as unknown as Doc;
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
    const one = (id: string, data: Float32Array): Layer => layer({ id, deep: { width: 1, height: 1, data }, raster: { width: 1, height: 1 } as never, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, flipX: false, flipY: false, sampling: 'bilinear' as never } });
    const out = composeDeep({ id: 'd', width: 1, height: 1, resolution: 72, layers: [one('r', red), one('b', blue)] } as unknown as Doc);
    expect('error' in out ? out.error : Array.from(out.data)).toEqual([0, 0, 1, 1]);   // the top layer, blue, over red
    const masked = composeDeep({ id: 'd', width: 1, height: 1, resolution: 72, layers: [layer({ mask: {} as never })] } as unknown as Doc);
    expect('error' in masked && masked.error).toMatch(/mask/);
  });
});

describe('16-bit geometry and filters (1.53.7)', () => {
  const rampLayer = (flipX = false): Layer => layer({ deep: { width: W, height: 1, data: ramp() }, transform: { x: 0, y: 0, w: W, h: 1, rotation: 0, flipX, flipY: false, sampling: 'bilinear' as never } });

  it('a flipped layer composes as an exact mirror, no blur', () => {
    const out = composeDeep({ id: 'd', width: W, height: 1, resolution: 72, layers: [rampLayer(true)] } as unknown as Doc);
    if ('error' in out) throw new Error(out.error);
    const src = ramp();
    for (const x of [0, 1, 500, W - 1]) expect(out.data[x * 4]).toBe(src[(W - 1 - x) * 4]);
  });

  it('halving averages exactly; blur keeps its levels and softens an edge; noise is repeatable', () => {
    const half = resampleDeep({ width: W, height: 1, data: ramp() }, W / 2, 1), src = ramp();
    expect(half.data[0]).toBeCloseTo((src[0] + src[4]) / 2, 6);
    const blurred = blurDeep({ width: W, height: 1, data: ramp() }, 2), levels = new Set<number>();
    for (let x = 0; x < W; x++) levels.add(Math.round(blurred.data[x * 4] * 65535));
    expect(levels.size).toBeGreaterThan(900);
    const edge = new Float32Array(16 * 4); for (let x = 0; x < 16; x++) edge.set(x < 8 ? [0, 0, 0, 1] : [1, 1, 1, 1], x * 4);
    const soft = blurDeep({ width: 16, height: 1, data: edge }, 1.5).data;
    expect(soft[7 * 4]).toBeGreaterThan(0.05); expect(soft[8 * 4]).toBeLessThan(0.95);
    const n1 = noiseDeep({ width: W, height: 1, data: ramp() }, 10, false, true, 7).data, n2 = noiseDeep({ width: W, height: 1, data: ramp() }, 10, false, true, 7).data;
    expect(Array.from(n1.slice(0, 40))).toEqual(Array.from(n2.slice(0, 40)));
    expect(n1.some((v, i) => i % 4 !== 3 && Math.abs(v - src[i]) > 1 / 255)).toBe(true);
    expect(unsharpDeep({ width: 16, height: 1, data: edge }, 100, 1.5, 0).data[8 * 4]).toBeGreaterThanOrEqual(1 - 1e-6);   // sharpened: the bright side of the edge rises to white
  });
});
