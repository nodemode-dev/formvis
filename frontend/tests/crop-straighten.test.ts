import { describe, expect, it } from 'vitest';
import { levelAngle } from '../src/extensions/tools/crop';

const at = (deg: number): { x: number; y: number } => ({ x: 100 * Math.cos((deg * Math.PI) / 180), y: 100 * Math.sin((deg * Math.PI) / 180) });

describe('Straighten', () => {
  it('turns a tilted line level', () => {
    expect(levelAngle({ x: 0, y: 0 }, at(10))).toBeCloseTo(-10, 9);
    expect(levelAngle({ x: 0, y: 0 }, at(-7))).toBeCloseTo(7, 9);
    expect(levelAngle({ x: 0, y: 0 }, at(0))).toBeCloseTo(0, 9);
  });

  it('turns a nearly upright line plumb, whichever way it was drawn', () => {
    expect(levelAngle({ x: 0, y: 0 }, at(85))).toBeCloseTo(5, 9);
    expect(levelAngle(at(85), { x: 0, y: 0 })).toBeCloseTo(5, 9);
    expect(levelAngle({ x: 0, y: 0 }, at(-80))).toBeCloseTo(-10, 9);
  });

  it('never turns more than 45 degrees', () => {
    for (let d = -180; d <= 180; d += 7) { const a = levelAngle({ x: 0, y: 0 }, at(d)); expect(a).toBeGreaterThanOrEqual(-45); expect(a).toBeLessThanOrEqual(45); }
  });
});
