import { describe, expect, it } from 'vitest';
import { DEFAULT_PATH_SHAPE, arrowPoints, boxedShapePath, heartPoints, linePath, ngonPoints, starPoints } from '../src/engine/shape-paths';

const bounds = (pts: Array<{ x: number; y: number }>): number[] => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

describe('shape generators ported from NodeMode sonny', () => {
  it('a regular polygon has n vertices on the circle, the first at the top', () => {
    const pts = ngonPoints(10, 20, 5, 6);
    expect(pts).toHaveLength(6);
    for (const p of pts) expect(Math.hypot(p.x - 10, p.y - 20)).toBeCloseTo(5, 9);
    expect(pts[0].x).toBeCloseTo(10, 9);
    expect(pts[0].y).toBeCloseTo(15, 9);
  });

  it('a star alternates outer and inner radii over 2n points', () => {
    const pts = starPoints(0, 0, 10, 4, 5);
    expect(pts).toHaveLength(10);
    pts.forEach((p, i) => expect(Math.hypot(p.x, p.y)).toBeCloseTo(i % 2 ? 4 : 10, 9));
  });

  it('an arrow has seven points, its tip at the end and its tail as wide as the shaft', () => {
    const pts = arrowPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, 30, 6);
    expect(pts).toHaveLength(7);
    expect(pts[3]).toEqual({ x: 100, y: 0 });
    expect(Math.abs(pts[0].y - pts[6].y)).toBeCloseTo(6, 9);
    expect(Math.abs(pts[2].y - pts[4].y)).toBeCloseTo(30, 9);
    expect(pts[2].x).toBeCloseTo(80, 9);
  });

  it('a line is a four-point bar of the weight', () => {
    const path = linePath('line', { x: 10, y: 10 }, { x: 10, y: 60 }, { ...DEFAULT_PATH_SHAPE, weight: 8 });
    const a = path.subpaths[0].anchors;
    expect(a).toHaveLength(4);
    expect(bounds(a)).toEqual([6, 10, 14, 60]);
    expect(path.subpaths[0].closed).toBe(true);
  });

  it('the heart is symmetric about its vertical axis', () => {
    const pts = heartPoints(0, 0, 10, 48);
    for (let i = 1; i < 24; i++) { expect(pts[i].x).toBeCloseTo(-pts[48 - i].x, 9); expect(pts[i].y).toBeCloseTo(pts[48 - i].y, 9); }
  });

  it('boxed shapes fill the dragged box exactly, with corner anchors', () => {
    const box = { x: 30, y: 40, w: 200, h: 120 };
    for (const kind of ['polygon', 'star', 'heart'] as const) {
      const a = boxedShapePath(kind, box, DEFAULT_PATH_SHAPE).subpaths[0].anchors;
      const [x0, y0, x1, y1] = bounds(a);
      expect(x0).toBeCloseTo(30, 6); expect(y0).toBeCloseTo(40, 6); expect(x1).toBeCloseTo(230, 6); expect(y1).toBeCloseTo(160, 6);
      for (const p of a) { expect(p.inX).toBe(p.x); expect(p.outY).toBe(p.y); }
    }
    expect(boxedShapePath('polygon', box, { ...DEFAULT_PATH_SHAPE, sides: 2 }).subpaths[0].anchors).toHaveLength(3);
    expect(boxedShapePath('star', box, { ...DEFAULT_PATH_SHAPE, sides: 7 }).subpaths[0].anchors).toHaveLength(14);
  });
});
