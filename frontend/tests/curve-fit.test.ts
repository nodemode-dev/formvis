import { describe, expect, it } from 'vitest';
import { simplify, smoothAnchors } from '../src/engine/curve-fit';

describe('curve fitting', () => {
  it('thins a noisy straight stroke to its ends, and a circle to a handful of points', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i * 4, y: 10 + (i % 2 ? 0.4 : -0.4) }));
    expect(simplify(line, 1)).toEqual([line[0], line[49]]);
    const circle = Array.from({ length: 200 }, (_, i) => ({ x: 100 + 60 * Math.cos((i / 200) * 2 * Math.PI), y: 100 + 60 * Math.sin((i / 200) * 2 * Math.PI) }));
    const kept = simplify(circle, 1).length;
    expect(kept).toBeGreaterThan(8);
    expect(kept).toBeLessThan(40);
  });

  it('makes smooth anchors through every point, with sharp ends and corners where asked', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }];
    const open = smoothAnchors(pts, false);
    expect(open.map((a) => [a.x, a.y])).toEqual(pts.map((p) => [p.x, p.y]));
    expect([open[0].outX, open[0].outY]).toEqual([0, 0]);
    const m = open[1];
    expect(m.outX - m.x).toBeCloseTo(m.x - m.inX, 9);                                    // symmetric: smooth
    expect(m.outY - m.y).toBeCloseTo(m.y - m.inY, 9);
    expect(m.outX - m.x).toBeCloseTo(20 / 6, 9);                                          // along prev -> next
    expect(m.outY - m.y).toBeCloseTo(0, 9);
    const cornered = smoothAnchors(pts, true, new Set([2]));
    expect([cornered[2].inX, cornered[2].outX]).toEqual([20, 20]);
    expect(cornered[0].inX).not.toBe(0);                                                 // closed: the first is smooth too
  });
});
