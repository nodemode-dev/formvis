import { describe, expect, it } from 'vitest';
import './setup';
import { dabField, fieldAt, fieldIsZero, liquifyImage, makeField, pushField, resetField } from '../src/engine/liquify';

const W = 64, H = 48;
const bar = (): ImageData => {
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = x >= 28 && x < 36 ? 0 : 255; img.data.set([v, v, v, 255], (y * W + x) * 4); }
  return img;
};
const centre = (img: ImageData, y: number): number => { const xs: number[] = []; for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4] < 128) xs.push(x); return (xs[0] + xs[xs.length - 1] + 1) / 2; };

describe('liquify ported from NodeMode formvis', () => {
  it('an empty field reproduces the image', () => {
    const src = bar(), out = liquifyImage(src, makeField(W, H));
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
  });

  it('Forward Warp moves the content along the drag, most at the brush centre, and not outside it', () => {
    const f = makeField(W, H);
    for (let i = 0; i < 4; i++) pushField(f, 32 + i * 2, 24, 32 + (i + 1) * 2, 24, 12, 1);
    const out = liquifyImage(bar(), f);
    expect(centre(out, 24)).toBeGreaterThan(36);
    expect(centre(out, 2)).toBe(32);
  });

  it('Reconstruct eases the field back and Restore All clears it', () => {
    const f = makeField(W, H), d: [number, number] = [0, 0];
    pushField(f, 32, 24, 42, 24, 12, 1);
    fieldAt(f, 32, 24, d);
    const before = d[0];
    for (let i = 0; i < 6; i++) dabField(f, 'reconstruct', 32, 24, 14, 1);
    fieldAt(f, 32, 24, d);
    expect(Math.abs(d[0])).toBeLessThan(Math.abs(before) * 0.1);
    resetField(f);
    expect(fieldIsZero(f)).toBe(true);
  });

  it('Bloat swells and Pucker shrinks what lies under the brush', () => {
    const width = (tool: 'bloat' | 'pucker'): number => {
      const f = makeField(W, H);
      for (let i = 0; i < 8; i++) dabField(f, tool, 32, 24, 20, 1);
      const out = liquifyImage(bar(), f), xs: number[] = [];
      for (let x = 0; x < W; x++) if (out.data[(24 * W + x) * 4] < 128) xs.push(x);
      return xs.length;
    };
    expect(width('bloat')).toBeGreaterThan(8);
    expect(width('pucker')).toBeLessThan(8);
  });

  it('Twirl turns the bar at the centre and the two directions are opposite', () => {
    const slope = (tool: 'twirlCW' | 'twirlCCW'): number => {
      const f = makeField(W, H);
      for (let i = 0; i < 6; i++) dabField(f, tool, 32, 24, 20, 1);
      const out = liquifyImage(bar(), f);
      return centre(out, 18) - centre(out, 30);
    };
    const cw = slope('twirlCW'), ccw = slope('twirlCCW');
    expect(Math.abs(cw)).toBeGreaterThan(1);
    expect(Math.sign(cw)).toBe(-Math.sign(ccw));
  });
});
