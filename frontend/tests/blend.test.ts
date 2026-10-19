import { describe, expect, it } from 'vitest';
import { px } from './setup';
import { PIXEL_BLENDS, blendPixels, dissolveNoise } from '../src/engine/blend';
import { BLEND_MODES, canvasBlend, compositeOp, type BlendMode } from '../src/engine/types';

const run = (mode: BlendMode, opacity = 1, dst = px(100, 150, 200, 255), src = px(200, 100, 50, 255)): number[] => {
  const d = dst.slice();
  blendPixels(d, src, mode, opacity, () => [0, 0]);
  return Array.from(d);
};

describe('blend modes', () => {
  it('lists all 27 PSD modes once, in the usual order', () => {
    expect(BLEND_MODES).toHaveLength(27);
    expect(new Set(BLEND_MODES.map((m) => m.id)).size).toBe(27);
    expect(BLEND_MODES[0].id).toBe('normal');
    expect(BLEND_MODES[1].id).toBe('dissolve');
    expect(BLEND_MODES[26].id).toBe('luminosity');
  });

  it('sends exactly the ten modes the canvas lacks to the pixel path', () => {
    for (const { id } of BLEND_MODES) expect(canvasBlend(id)).toBe(!PIXEL_BLENDS.has(id));
    expect(PIXEL_BLENDS.size).toBe(10);
    for (const id of PIXEL_BLENDS) expect(compositeOp(id)).toBe('source-over');
    expect(compositeOp('linear-dodge')).toBe('lighter');
  });

  it.each<[BlendMode, number[]]>([
    ['linear-burn', [45, 0, 0]],
    ['vivid-light', [232, 121, 115]],
    ['linear-light', [245, 95, 45]],
    ['pin-light', [145, 150, 100]],
    ['hard-mix', [255, 0, 0]],
    ['subtract', [0, 50, 150]],
    ['divide', [128, 255, 255]],
    ['darker-color', [200, 100, 50]],
    ['lighter-color', [100, 150, 200]],
  ])('%s of (200,100,50) over (100,150,200)', (mode, want) => {
    expect(run(mode)).toEqual([...want, 255]);
  });

  it('mixes with the backdrop by opacity', () => {
    const r = run('subtract', 0.5);
    expect(r.slice(0, 3)).toEqual([50, 100, 175]);
  });

  it('over a transparent backdrop shows the source', () => {
    expect(run('subtract', 1, px(0, 0, 0, 0))).toEqual([200, 100, 50, 255]);
  });

  it('leaves the backdrop alone where the source is clear', () => {
    expect(run('divide', 1, px(100, 150, 200, 255), px(9, 9, 9, 0))).toEqual([100, 150, 200, 255]);
  });

  it('dissolve keeps about its opacity share on a fixed pattern', () => {
    const n = 64 * 64, dst = new Uint8ClampedArray(n * 4), src = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { dst.set([100, 150, 200, 255], i * 4); src.set([200, 100, 50, 255], i * 4); }
    const at = (i: number): [number, number] => [i % 64, Math.floor(i / 64)];
    const a = dst.slice(), b = dst.slice();
    blendPixels(a, src, 'dissolve', 0.5, at);
    blendPixels(b, src, 'dissolve', 0.5, at);
    let kept = 0;
    for (let i = 0; i < n; i++) if (a[i * 4] === 200) kept++;
    expect(kept / n).toBeGreaterThan(0.45);
    expect(kept / n).toBeLessThan(0.55);
    expect(Array.from(a)).toEqual(Array.from(b));
    for (let i = 0; i < 1000; i++) { const v = dissolveNoise(i * 7, i * 13); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
