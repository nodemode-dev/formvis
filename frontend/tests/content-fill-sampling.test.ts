import { describe, expect, it } from 'vitest';
import { contentFill, premultiply, unpremultiply } from '../src/engine/retouch';

const W = 72, H = 36;
const scene = (): { px: Uint8ClampedArray; hole: Uint8Array } => {
  const rgba = new Uint8ClampedArray(W * H * 4), hole = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = x < 30 ? [220, 30, 30] : x >= 42 ? [30, 30, 220] : [128, 128, 128];
    rgba.set([...c, 255], (y * W + x) * 4);
    if (x >= 32 && x < 40 && y >= 12 && y < 24) hole[y * W + x] = 1;
  }
  return { px: premultiply(rgba), hole };
};
const side = (pred: (x: number) => boolean): Uint8Array => { const a = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pred(x)) a[y * W + x] = 1; return a; };
const holeMean = (px: Uint8ClampedArray, hole: Uint8Array): number[] => {
  const out = new Uint8ClampedArray(px.length);
  unpremultiply(px, out);
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < hole.length; i++) if (hole[i]) { s[0] += out[i * 4]; s[1] += out[i * 4 + 1]; s[2] += out[i * 4 + 2]; n++; }
  return s.map((v) => v / n);
};

describe('Content-Aware Fill sampling area', () => {
  it('fills only from the red side when only the red side may be sampled', () => {
    const { px, hole } = scene();
    expect(contentFill(px, hole, W, H, side((x) => x < 30))).toBe(true);
    const [r, , b] = holeMean(px, hole);
    expect(r).toBeGreaterThan(180); expect(b).toBeLessThan(80);
  });

  it('fills only from the blue side when only the blue side may be sampled, even far away', () => {
    const { px, hole } = scene();
    expect(contentFill(px, hole, W, H, side((x) => x >= 60))).toBe(true);
    const [r, , b] = holeMean(px, hole);
    expect(b).toBeGreaterThan(180); expect(r).toBeLessThan(80);
  });

  it('refuses when the sampling area holds no whole patch', () => {
    const { px, hole } = scene();
    expect(contentFill(px, hole, W, H, new Uint8Array(W * H))).toBe(false);
  });
});
