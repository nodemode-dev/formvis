import { describe, expect, it } from 'vitest';
import { applyContour, contourLut, withGlobalLight } from '../src/engine/style-extras';
import { defaultEffects, effectsFromData } from '../src/engine/types';

describe('layer style depth', () => {
  it('contours reshape coverage; Linear leaves it alone', () => {
    expect(contourLut('linear')).toBeNull();
    const cone = contourLut('cone') as Uint8Array;
    expect([cone[0], cone[255]]).toEqual([0, 0]);
    expect(cone[128]).toBeGreaterThan(250);
    const inv = contourLut('coneInverted') as Uint8Array;
    expect([inv[0], inv[255]]).toEqual([255, 255]);
    const px = new Uint8ClampedArray([9, 9, 9, 128, 9, 9, 9, 0]);
    applyContour(px, 'cone');
    expect([px[0], px[3], px[7]]).toEqual([9, cone[128], 0]);
  });

  it('Global Light replaces the angle (and bevel altitude) only where it is used', () => {
    const fx = defaultEffects();
    fx.dropShadow.angle = 10; fx.dropShadow.useGlobal = true; fx.innerShadow.angle = 20; fx.bevel.useGlobal = true;
    const r = withGlobalLight(fx, { angle: 45, altitude: 60 });
    expect([r.dropShadow.angle, r.innerShadow.angle, r.bevel.angle, r.bevel.altitude]).toEqual([45, 20, 45, 60]);
    expect(fx.dropShadow.angle).toBe(10);
    const none = defaultEffects();
    expect(withGlobalLight(none, { angle: 1, altitude: 2 })).toBe(none);
  });

  it('saved styles read back the new fields, checked', () => {
    const raw = JSON.parse(JSON.stringify(defaultEffects())) as Record<string, Record<string, unknown>>;
    raw.stroke.enabled = true; raw.stroke.position = 'center';
    raw.dropShadow.contour = 'ring'; raw.dropShadow.useGlobal = true;
    raw.outerGlow.contour = 'nonsense'; raw.bevel.gloss = 'cone';
    const fx = effectsFromData(raw);
    expect(fx?.stroke.position).toBe('center');
    expect(fx?.dropShadow.contour).toBe('ring');
    expect(fx?.dropShadow.useGlobal).toBe(true);
    expect(fx?.outerGlow.contour).toBeUndefined();
    expect(fx?.bevel.gloss).toBe('cone');
    raw.stroke.position = 'sideways';
    expect(effectsFromData(raw)?.stroke.position).toBeUndefined();
  });
});
