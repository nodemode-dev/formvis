import { describe, expect, it } from 'vitest';
import './setup';
import { applyMat, boundsOf, integral, intersectRect, invert, mul, placement, unionRect } from '../src/engine/geometry';
import { gaussianBlur, resizeMask } from '../src/engine/filters';

describe('geometry', () => {
  it('inverts placements and maps points back', () => {
    const m = placement({ x: 10, y: 20, w: 50, h: 40, rotation: 30 } as never, 25, 20), inv = invert(m);
    for (const [x, y] of [[0, 0], [25, 20], [7, 13]]) {
      const p = applyMat(m, x, y), q = applyMat(inv, p.x, p.y);
      expect(q.x).toBeCloseTo(x, 9);
      expect(q.y).toBeCloseTo(y, 9);
    }
    const id = mul(m, inv);
    [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(id[i]).toBeCloseTo(v, 9));
  });

  it('rect helpers agree with hand-worked cases', () => {
    expect(boundsOf([{ x: 3, y: 9 }, { x: -1, y: 4 }, { x: 5, y: 2 }])).toEqual({ x: -1, y: 2, w: 6, h: 7 });
    expect(intersectRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({ x: 5, y: 5, w: 5, h: 5 });
    expect(intersectRect({ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 5, w: 1, h: 1 })).toBeNull();
    expect(unionRect({ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 5, w: 1, h: 1 })).toEqual({ x: 0, y: 0, w: 6, h: 6 });
    expect(integral({ x: 0.5, y: 1.2, w: 2, h: 2 })).toEqual({ x: 0, y: 1, w: 3, h: 3 });
  });
});

describe('mask filters', () => {
  const square = (w: number, h: number, x0: number, y0: number, s: number): Uint8Array => {
    const m = new Uint8Array(w * h);
    for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) m[y * w + x] = 255;
    return m;
  };
  const count = (m: Uint8Array): number => m.reduce((n, v) => n + (v >= 128 ? 1 : 0), 0);

  it('expands and contracts a square by the amount', () => {
    const m = square(40, 40, 10, 10, 20);
    expect(count(resizeMask(m, 40, 40, 3))).toBeGreaterThan(count(m));
    const shrunk = resizeMask(m, 40, 40, -3);
    expect(count(shrunk)).toBe(14 * 14);
  });

  it('Gaussian blur keeps total alpha away from the borders, keeps flat interiors, and halves at an edge', () => {
    const img = new ImageData(64, 64);
    for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) img.data.set([255, 255, 255, 255], (y * 64 + x) * 4);
    const b = gaussianBlur(img, 3);
    let before = 0, after = 0;
    for (let i = 3; i < img.data.length; i += 4) { before += img.data[i]; after += b.data[i]; }
    expect(Math.abs(after - before) / before).toBeLessThan(0.01);
    expect(b.data[(32 * 64 + 32) * 4 + 3]).toBe(255);
    const edge = (b.data[(32 * 64 + 15) * 4 + 3] + b.data[(32 * 64 + 16) * 4 + 3]) / 2;
    expect(edge).toBeGreaterThan(115);
    expect(edge).toBeLessThan(140);
    expect(b.data[(32 * 64 + 2) * 4 + 3]).toBe(0);
  });
});
