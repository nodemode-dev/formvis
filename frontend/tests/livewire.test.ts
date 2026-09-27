import { describe, expect, it } from 'vitest';
import { EdgeMap, liveWire, snapToEdge } from '../src/engine/livewire';

/** A 60 x 40 image: dark left of x = 30, light right of it (a strong vertical edge), with a faint step at x = 10. */
function image(): EdgeMap {
  const w = 60, h = 40, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = x >= 30 ? 220 : x >= 10 ? 44 : 40; d.set([v, v, v, 255], (y * w + x) * 4); }
  return EdgeMap.fromRGBA(d, w, h, 0.1);
}

describe('the Magnetic Lasso edge-following', () => {
  it('finds the strong edge and not the faint one below the contrast threshold', () => {
    const m = image();
    expect(m.strength[20 * 60 + 30]).toBeGreaterThan(0.9);
    expect(m.strength[20 * 60 + 10]).toBe(0);                      // a 4-level step: below 10 percent
    expect(m.strength[20 * 60 + 45]).toBe(0);                      // flat
  });
  it('snaps a point beside the edge onto it', () => {
    const p = snapToEdge(image(), { x: 36, y: 20 }, 10);
    expect(Math.abs(p.x - 30) <= 1).toBe(true);
    expect(p.y).toBe(20);
  });
  it('follows the edge between two points on it, rather than cutting across', () => {
    const path = liveWire(image(), { x: 30, y: 2 }, { x: 30, y: 37 }, 20);
    expect(path[0]).toEqual({ x: 30, y: 2 });
    expect(path[path.length - 1]).toEqual({ x: 30, y: 37 });
    expect(path.every((q) => Math.abs(q.x - 30) <= 1)).toBe(true);    // along the edge
    for (let i = 1; i < path.length; i++) expect(Math.max(Math.abs(path[i].x - path[i - 1].x), Math.abs(path[i].y - path[i - 1].y))).toBe(1);   // contiguous
  });
  it('bends to the edge from points off it', () => {
    const m = image(), a = snapToEdge(m, { x: 34, y: 3 }, 8), b = snapToEdge(m, { x: 26, y: 36 }, 8), path = liveWire(m, a, b, 20);
    const onEdge = path.filter((q) => Math.abs(q.x - 30) <= 1).length;
    expect(onEdge / path.length).toBeGreaterThan(0.9);
  });
});
