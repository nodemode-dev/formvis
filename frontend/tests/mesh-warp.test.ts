import { describe, expect, it } from 'vitest';
import './setup';
import { convexQuad, invBilinear, meshSurfacePoint, meshWarpImage, uniformGrid, type P2 } from '../src/engine/mesh-warp';

const W = 24, H = 16;
const source = (): ImageData => {
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.data.set([x * 10, y * 15, 90, 255], (y * W + x) * 4);
  return img;
};
const at = (img: ImageData, x: number, y: number): number[] => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe('mesh warp ported from NodeMode formvis', () => {
  it('inverse bilinear recovers the cell coordinates', () => {
    const out: P2 = [0, 0];
    expect(invBilinear([0, 0], [10, 0], [0, 10], [10, 10], 2.5, 7.5, out)).toBe(true);
    expect(out[0]).toBeCloseTo(0.25, 9); expect(out[1]).toBeCloseTo(0.75, 9);
    expect(invBilinear([0, 0], [10, 0], [0, 10], [10, 10], 12, 5, out)).toBe(false);
  });

  it('detects folded cells', () => {
    expect(convexQuad([[0, 0], [10, 0], [0, 10], [10, 10]])).toBe(true);
    expect(convexQuad([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false);
  });

  it('a uniform grid gives an exactly linear smooth surface', () => {
    const g = uniformGrid(4, 3, 5, 7, 30, 20), out: P2 = [0, 0];
    meshSurfacePoint(4, 3, g, 1.37, 0.61, out);
    expect(out[0]).toBeCloseTo(5 + (30 * 1.37) / 3, 9);
    expect(out[1]).toBeCloseTo(7 + (20 * 0.61) / 2, 9);
  });

  it('the smooth surface passes through a dragged point', () => {
    const g = uniformGrid(4, 4, 0, 0, 30, 30), out: P2 = [0, 0];
    g[5] = [13, 8];
    meshSurfacePoint(4, 4, g, 1, 1, out);
    expect(out[0]).toBeCloseTo(13, 9); expect(out[1]).toBeCloseTo(8, 9);
  });

  it('an identity grid reproduces the image, in both modes', () => {
    for (const smooth of [false, true]) {
      const out = meshWarpImage(source(), 4, 3, uniformGrid(4, 3, 0, 0, W, H), W, H, smooth);
      expect(out).not.toBeNull();
      for (const [x, y] of [[0, 0], [5, 3], [23, 15], [12, 8]]) at(out as ImageData, x, y).forEach((v, i) => expect(Math.abs(v - at(source(), x, y)[i])).toBeLessThanOrEqual(1));
    }
  });

  it('a doubled grid doubles the image and a moved grid moves it', () => {
    const big = meshWarpImage(source(), 3, 3, uniformGrid(3, 3, 0, 0, W * 2, H * 2), W * 2, H * 2, false) as ImageData;
    expect(Math.abs(at(big, 21, 11)[0] - at(source(), 10, 5)[0])).toBeLessThanOrEqual(6);
    const moved = meshWarpImage(source(), 2, 2, uniformGrid(2, 2, 5, 3, W, H), W + 5, H + 3, false) as ImageData;
    expect(at(moved, 5 + 4, 3 + 2)).toEqual(at(source(), 4, 2));
    expect(at(moved, 2, 1)[3]).toBe(0);
  });

  it('refuses a folded grid', () => {
    const g = uniformGrid(3, 3, 0, 0, W, H);
    g[4] = [W * 2, H * 2];
    expect(meshWarpImage(source(), 3, 3, g, W, H)).toBeNull();
  });
});
