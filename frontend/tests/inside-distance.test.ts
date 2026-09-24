import { describe, expect, it } from 'vitest';
import { insideDistance, scaleHealCorrection } from '../src/engine/retouch';

describe('scaleHealCorrection', () => {
  // 3 by 1: the middle pixel is covered and heals from the pixel one to the right.
  const before = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255, 200, 40, 40, 255]);
  const cov = new Uint8Array([0, 255, 0]);
  it('leaves the heal alone at Diffusion 7 and full colour', () => {
    const out = new Uint8ClampedArray([0, 0, 0, 255, 150, 150, 150, 255, 200, 40, 40, 255]);
    scaleHealCorrection(out, before, cov, 3, 1, 1, 0, 7, 1, 1);
    expect(Array.from(out.subarray(4, 7))).toEqual([150, 150, 150]);
  });
  it('at colour 0 gives a plain copy, mixed at the opacity the heal used', () => {
    const out = new Uint8ClampedArray([0, 0, 0, 255, 125, 125, 125, 255, 200, 40, 40, 255]);   // a heal at opacity 0.5
    scaleHealCorrection(out, before, cov, 3, 1, 1, 0, 7, 0, 0.5);
    expect(Array.from(out.subarray(4, 7))).toEqual([150, 70, 70]);                         // halfway to the source
  });
});

describe('insideDistance', () => {
  it('is 0 outside and grows by one pixel per step inward', () => {
    const W = 11, H = 11, cov = new Uint8Array(W * H);
    for (let y = 2; y < 9; y++) for (let x = 2; x < 9; x++) cov[y * W + x] = 255;
    const d = insideDistance(cov, W, H);
    expect(d[0]).toBe(0);
    expect(d[5 * W + 1]).toBe(0);
    expect(d[5 * W + 2]).toBeCloseTo(1);
    expect(d[5 * W + 3]).toBeCloseTo(2);
    expect(d[5 * W + 5]).toBeCloseTo(4);
  });

  it('treats the image border as an edge', () => {
    const W = 5, H = 5, cov = new Uint8Array(W * H).fill(255);
    const d = insideDistance(cov, W, H);
    expect(d[0]).toBeCloseTo(1);
    expect(d[2 * W + 2]).toBeCloseTo(3);
  });
});
