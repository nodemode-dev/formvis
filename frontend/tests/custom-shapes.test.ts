import { describe, expect, it } from 'vitest';
import { CUSTOM_SHAPES, customShapePath, parseShape, windingArea } from '../src/engine/custom-shapes';

describe('custom shapes', () => {
  it('parses lines and curves, merging a closing point equal to the start', () => {
    const vp = parseShape('M0 0 L10 0 L10 10 Z M20 20 C30 20 30 30 20 30 C10 30 10 20 20 20 Z');
    expect(vp.subpaths.map((s) => [s.anchors.length, s.closed])).toEqual([[3, true], [2, true]]);
    const c = vp.subpaths[1].anchors;
    expect([c[0].outX, c[0].outY, c[1].inX, c[1].inY]).toEqual([30, 20, 30, 30]);
    expect([c[0].inX, c[0].inY]).toEqual([10, 20]);
  });

  it('winds the ring hole against its outer circle', () => {
    const ring = customShapePath('ring', { x: 0, y: 0, w: 100, h: 100 });
    const [outer, inner] = ring.subpaths.map((s) => windingArea(s.anchors));
    expect(Math.sign(outer)).toBe(-Math.sign(inner));
  });

  it('gives every shape closed outlines fitted to the box', () => {
    for (const s of CUSTOM_SHAPES) {
      const vp = customShapePath(s.id, { x: 10, y: 20, w: 200, h: 50 });
      expect(vp.subpaths.length).toBeGreaterThan(0);
      for (const sp of vp.subpaths) {
        expect(sp.closed).toBe(true);
        for (const a of sp.anchors) { expect(a.x).toBeGreaterThanOrEqual(10); expect(a.x).toBeLessThanOrEqual(210); expect(a.y).toBeGreaterThanOrEqual(20); expect(a.y).toBeLessThanOrEqual(70); }
      }
    }
  });
});
