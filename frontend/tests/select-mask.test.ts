import { describe, expect, it } from 'vitest';
import { DEFAULT_REFINE, refineSelection } from '../src/engine/select-mask';

const W = 48, H = 32;
const square = (x0: number, x1: number): Float32Array => { const m = new Float32Array(W * H); for (let y = 8; y < 24; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1; return m; };
const guideEdge = (edge: number): Float32Array => { const g = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = x < edge ? 0.9 : 0.1; return g; };
const sum = (m: Float32Array): number => m.reduce((a, v) => a + v, 0);

describe('Select and Mask refinements', () => {
  it('leave the selection alone at their defaults', () => {
    const m = square(10, 30);
    expect(Array.from(refineSelection(m, guideEdge(24), W, H, DEFAULT_REFINE))).toEqual(Array.from(m));
  });

  it('Feather softens the edge and keeps the middle', () => {
    const f = refineSelection(square(10, 30), guideEdge(24), W, H, { ...DEFAULT_REFINE, feather: 3 });
    expect(f[16 * W + 20]).toBeGreaterThan(0.95);
    expect(f[16 * W + 10]).toBeGreaterThan(0.2);
    expect(f[16 * W + 10]).toBeLessThan(0.8);
  });

  it('Shift Edge grows or shrinks, and Contrast hardens a soft edge', () => {
    const m = square(10, 30), base = sum(m);
    expect(sum(refineSelection(m, guideEdge(24), W, H, { ...DEFAULT_REFINE, shift: 4 }))).toBeGreaterThan(base);
    expect(sum(refineSelection(m, guideEdge(24), W, H, { ...DEFAULT_REFINE, shift: -4 }))).toBeLessThan(base);
    const soft = refineSelection(m, guideEdge(24), W, H, { ...DEFAULT_REFINE, feather: 6 }), hard = refineSelection(m, guideEdge(24), W, H, { ...DEFAULT_REFINE, feather: 6, contrast: 90 });
    const greys = (x: Float32Array): number => x.filter((v) => v > 0.1 && v < 0.9).length;
    expect(greys(hard)).toBeLessThan(greys(soft));
  });

  it('Smooth removes a speck', () => {
    const m = square(10, 30);
    m[2 * W + 40] = 1;
    expect(refineSelection(m, guideEdge(24), W, H, { ...DEFAULT_REFINE, smooth: 40 })[2 * W + 40]).toBeLessThan(0.1);
  });

  it('Radius pulls a loose edge toward the image edge', () => {
    // the selection stops at x = 30 but the image changes at x = 24
    const m = square(10, 30), r = refineSelection(m, guideEdge(24), W, H, { ...DEFAULT_REFINE, radius: 8 });
    expect(r[16 * W + 27]).toBeLessThan(m[16 * W + 27]);
    expect(r[16 * W + 20]).toBeGreaterThan(0.5);
  });
});
