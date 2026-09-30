import { describe, expect, it } from 'vitest';
import { composeDeep, deepFromU16, transferOf } from './deep';
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
