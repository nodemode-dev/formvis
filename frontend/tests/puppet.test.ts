import { describe, expect, it } from 'vitest';
import './setup';
import { mlsRigid, puppetImage, type P2 } from '../src/engine/puppet';

describe('puppet warp (rigid moving least squares)', () => {
  const pins: P2[] = [[10, 10], [50, 10], [30, 40]];

  it('pins land exactly where they are moved', () => {
    const to: P2[] = [[12, 8], [55, 20], [25, 44]];
    pins.forEach((p, i) => { const f = mlsRigid(pins, to, p); expect(f[0]).toBeCloseTo(to[i][0], 9); expect(f[1]).toBeCloseTo(to[i][1], 9); });
  });

  it('unmoved pins leave space alone and one pin translates it', () => {
    const f = mlsRigid(pins, pins, [23, 17]);
    expect(f[0]).toBeCloseTo(23, 9); expect(f[1]).toBeCloseTo(17, 9);
    const g = mlsRigid([[5, 5]], [[9, 2]], [40, 30]);
    expect(g[0]).toBeCloseTo(44, 9); expect(g[1]).toBeCloseTo(27, 9);
  });

  it('turning every pin a quarter about a point turns space rigidly about it', () => {
    const c: P2 = [30, 20], rot = ([x, y]: P2): P2 => [c[0] - (y - c[1]), c[1] + (x - c[0])];
    const f = mlsRigid(pins, pins.map(rot), [37, 24]), want = rot([37, 24]);
    expect(f[0]).toBeCloseTo(want[0], 6); expect(f[1]).toBeCloseTo(want[1], 6);
  });

  it('resampling with unmoved pins reproduces the image', () => {
    const src = new ImageData(20, 12);
    for (let i = 0; i < 20 * 12; i++) src.data.set([(i * 7) % 256, (i * 3) % 256, 90, 255], i * 4);
    const out = puppetImage(src, (x, y) => [x, y], [[4, 4], [15, 8]], [[4, 4], [15, 8]], 0, 0, 20, 12, 1, 4);
    for (const [x, y] of [[0, 0], [7, 5], [19, 11]]) expect(Array.from(out.data.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 4))).toEqual(Array.from(src.data.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 4)));
  });
});
