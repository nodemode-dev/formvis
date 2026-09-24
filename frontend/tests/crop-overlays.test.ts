import { describe, expect, it } from 'vitest';
import { overlayLines } from '../src/extensions/tools/crop-overlays';

describe('Crop overlays', () => {
  it('Rule of Thirds and Golden Ratio divide the frame where they should', () => {
    const t = overlayLines('thirds', 0, 0, 300, 150);
    expect(t.map((l) => l[0].x).filter((x) => x > 0).sort((a, b) => a - b)).toEqual([100, 200]);
    const g = overlayLines('golden', 0, 0, 1000, 100).map((l) => l[0].x).filter((x) => x > 0).sort((a, b) => a - b);
    expect(g[0]).toBeCloseTo(381.97, 1);
    expect(g[1]).toBeCloseTo(618.03, 1);
  });

  it('Triangle drops lines meeting its diagonal at right angles, even on a wide frame', () => {
    const [diag, ...feet] = overlayLines('triangle', 0, 0, 400, 100);
    const dx = diag[1].x - diag[0].x, dy = diag[1].y - diag[0].y;
    for (const [c, f] of feet) expect(Math.abs((f.x - c.x) * dx + (f.y - c.y) * dy)).toBeLessThan(1e-6);
  });

  it('the Golden Spiral is one continuous line inside the frame', () => {
    const [spiral] = overlayLines('spiral', 10, 20, 400, 250);
    let gap = 0;
    for (let i = 1; i < spiral.length; i++) gap = Math.max(gap, Math.hypot(spiral[i].x - spiral[i - 1].x, spiral[i].y - spiral[i - 1].y));
    expect(gap).toBeLessThan(40);                                    // no jumps between arcs
    for (const p of spiral) { expect(p.x).toBeGreaterThanOrEqual(10 - 1e-9); expect(p.x).toBeLessThanOrEqual(410 + 1e-9); expect(p.y).toBeGreaterThanOrEqual(20 - 1e-9); expect(p.y).toBeLessThanOrEqual(270 + 1e-9); }
  });

  it('orientation mirrors the spiral across the frame', () => {
    const [a] = overlayLines('spiral', 0, 0, 200, 100, 0), [b] = overlayLines('spiral', 0, 0, 200, 100, 1);
    a.forEach((p, i) => { expect(b[i].x).toBeCloseTo(200 - p.x, 9); expect(b[i].y).toBeCloseTo(p.y, 9); });
  });
});
