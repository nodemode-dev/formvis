import { describe, expect, it } from 'vitest';
import { insideDistance } from '../src/engine/retouch';

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
