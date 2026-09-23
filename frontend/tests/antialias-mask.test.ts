import { describe, expect, it } from 'vitest';
import { antialiasMask } from '../src/engine/kernels';

describe('Magic Wand anti-alias', () => {
  it('softens only the boundary of a hard mask', () => {
    const W = 12, H = 12, m = new Uint8Array(W * H);
    for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) m[y * W + x] = 255;
    const a = antialiasMask(m, W, H);
    expect(a[5 * W + 5]).toBe(255);              // inside
    expect(a[0]).toBe(0);                         // well outside
    expect(a[5 * W + 3]).toBeGreaterThan(0);      // an edge pixel inside the square
    expect(a[5 * W + 3]).toBeLessThan(255);
    expect(a[5 * W + 2]).toBeGreaterThan(0);      // the pixel just outside picks up part
    expect(a[5 * W + 2]).toBeLessThan(255);
    expect(m[5 * W + 2]).toBe(0);                 // the input is untouched
  });
});
