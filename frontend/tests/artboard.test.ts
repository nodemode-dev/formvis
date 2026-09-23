import { describe, expect, it } from 'vitest';
import { artboardFromData } from '../src/engine/types';

describe('artboards read back', () => {
  it('keeps a valid one, rounded, with or without a background', () => {
    expect(artboardFromData({ x: 10.4, y: -5, w: 200, h: 100.6, background: { r: 300, g: 20.2, b: -4 } })).toEqual({ x: 10, y: -5, w: 200, h: 101, background: { r: 255, g: 20, b: 0 } });
    expect(artboardFromData({ x: 0, y: 0, w: 5, h: 5, background: null })?.background).toBeNull();
  });
  it('refuses what is not one', () => {
    for (const bad of [null, 'x', { x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: 10 }, { x: 0, y: 0, w: 40000, h: 10 }, { x: NaN, y: 0, w: 1, h: 1 }]) expect(artboardFromData(bad)).toBeNull();
  });
});
