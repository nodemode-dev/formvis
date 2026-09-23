import { describe, expect, it } from 'vitest';
import './setup';
import { findWires } from '../src/engine/distractions';

const W = 200, H = 120;
const sky = (): ImageData => {
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.data.set([120 + y / 2, 170 + y / 3, 230, 255], (y * W + x) * 4);
  return img;
};
const put = (img: ImageData, x: number, y: number, v: number): void => { if (x >= 0 && y >= 0 && x < W && y < H) img.data.set([v, v, v, 255], (y * W + x) * 4); };

describe('Remove Distractions: Wires and Cables', () => {
  it('finds a thin dark wire across the sky and leaves a dark square alone', () => {
    const img = sky();
    for (let x = 0; x < W; x++) { const y = Math.round(20 + x * 0.25); put(img, x, y, 30); put(img, x, y + 1, 30); }
    for (let y = 80; y < 110; y++) for (let x = 140; x < 170; x++) put(img, x, y, 25);
    const m = findWires(img);
    expect(m[Math.round(20 + 100 * 0.25) * W + 100]).toBe(1);
    expect(m[95 * W + 155]).toBe(0);
    expect(m[100 * W + 20]).toBe(0);
  });

  it('finds nothing in a plain sky', () => {
    expect(findWires(sky()).some((v) => v)).toBe(false);
  });
});
