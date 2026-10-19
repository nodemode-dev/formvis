import { describe, expect, it } from 'vitest';
import './setup';
import { GRADIENT_PRESETS, GRADIENT_TYPES, colorAt, diamondFill, presetById, reflectStops, resolveStops } from '../src/engine/gradients';

const fg = { r: 10, g: 20, b: 30 }, bg = { r: 200, g: 210, b: 220 };

describe('gradients', () => {
  it('offers the five usual types and presets that keep the two old choices', () => {
    expect(GRADIENT_TYPES.map((t) => t.id)).toEqual(['linear', 'radial', 'angle', 'reflected', 'diamond']);
    expect(presetById('background').label).toBe('Foreground to Background');
    expect(presetById('transparent').label).toBe('Foreground to Transparent');
    expect(presetById('nonsense').id).toBe('background');
    for (const p of GRADIENT_PRESETS) expect(p.stops.length).toBeGreaterThanOrEqual(2);
  });

  it('fills in the foreground and background and reverses', () => {
    const s = resolveStops(presetById('background'), fg, bg, false);
    expect(s.map((x) => [x.at, x.rgb])).toEqual([[0, fg], [1, bg]]);
    const r = resolveStops(presetById('background'), fg, bg, true);
    expect(r.map((x) => [x.at, x.rgb])).toEqual([[0, bg], [1, fg]]);
  });

  it('interpolates colour and alpha between stops', () => {
    const s = resolveStops(presetById('transparent'), fg, bg, false);
    expect(colorAt(s, 0.5)).toEqual([10, 20, 30, 127.5]);
    const bw = resolveStops(presetById('black-white'), fg, bg, false);
    expect(colorAt(bw, 0.25)[0]).toBeCloseTo(63.75, 9);
    expect(colorAt(bw, -1)[0]).toBe(0);
    expect(colorAt(bw, 2)[0]).toBe(255);
  });

  it('reflected stops mirror about the middle', () => {
    const r = reflectStops([{ at: 0, v: 'a' }, { at: 1, v: 'b' }]);
    expect(r.map((x) => [x.at, x.v])).toEqual([[0, 'b'], [0.5, 'a'], [0.5, 'a'], [1, 'b']]);
  });

  it('diamond is an L1 distance in the drag frame', () => {
    const img = new ImageData(41, 41), stops = resolveStops(presetById('black-white'), fg, bg, false);
    diamondFill(img, (x, y) => ({ x: x - 0.5, y: y - 0.5 }), { x: 20, y: 20 }, { x: 40, y: 20 }, stops);
    const at = (x: number, y: number): number => img.data[(y * 41 + x) * 4];
    expect(at(20, 20)).toBe(0);
    expect(at(30, 20)).toBe(128);
    expect(at(25, 25)).toBe(128);
    expect(at(20, 30)).toBe(128);
    expect(at(40, 20)).toBe(255);
  });
});
