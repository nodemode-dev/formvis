import { describe, expect, it } from 'vitest';
import { GAMUT_GREY, applyLut, lutOf } from './colour-lut';

const px = (...c: number[]): Uint8ClampedArray => new Uint8ClampedArray(c);

describe('colour lookup tables (1.53.5)', () => {
  it('the identity changes nothing, and a channel swap swaps exactly', () => {
    const d = px(0, 0, 0, 255, 255, 255, 255, 10, 12, 200, 99, 128, 250, 3, 77, 0);
    const before = Array.from(d);
    applyLut(d, lutOf(33, (r, g, b) => [Math.round(r), Math.round(g), Math.round(b)]));
    expect(Array.from(d)).toEqual(before);
    applyLut(d, lutOf(33, (r, g, b) => [Math.round(b), Math.round(r), Math.round(g)]));
    expect(Array.from(d.slice(8, 12))).toEqual([99, 12, 200, 128]);   // alpha kept
  });

  it('a curved table is interpolated within a level', () => {
    const fn = (v: number): number => 255 * (v / 255) ** 2.2;
    const lut = lutOf(33, (r, g, b) => [Math.round(fn(r)), Math.round(fn(g)), Math.round(fn(b))]);
    let worst = 0;
    for (let v = 0; v < 256; v++) { const d = px(v, v, v, 255); applyLut(d, lut); worst = Math.max(worst, Math.abs(d[0] - fn(v))); }
    expect(worst).toBeLessThanOrEqual(3.5);
  });

  it('the gamut warning greys out only the flagged colours', () => {
    const lut = { ...lutOf(33, (r, g, b) => [Math.round(r), Math.round(g), Math.round(b)]), gamut: new Uint8Array(33 ** 3) };
    lut.gamut[0 * 33 * 33 + 0 * 33 + 32] = 255;   // pure blue
    const d = px(0, 0, 255, 255, 128, 128, 128, 255);
    applyLut(d, lut, true);
    expect(Array.from(d)).toEqual([GAMUT_GREY, GAMUT_GREY, GAMUT_GREY, 255, 128, 128, 128, 255]);
  });
});
