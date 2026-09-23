import { describe, expect, it } from 'vitest';
import { withGlobalLight } from '../src/engine/style-extras';
import { defaultEffects, effectsActive, effectsFromData, instances } from '../src/engine/types';

describe('several instances of an effect', () => {
  it('extras read back checked: disabled ones kept, at most nine, junk dropped', () => {
    const raw = JSON.parse(JSON.stringify(defaultEffects()));
    raw.stroke.enabled = true;
    raw.extra = { stroke: [{ enabled: true, size: 9, color: { r: 255, g: 0, b: 0 }, opacity: 1, position: 'inside' }, { enabled: false, size: 2, color: { r: 0, g: 0, b: 0 }, opacity: 1 }, 'junk'],
      dropShadow: Array.from({ length: 12 }, () => ({ enabled: true, distance: 3, size: 1, opacity: 1, angle: 0, color: { r: 0, g: 0, b: 0 } })), bogus: [1] };
    const fx = effectsFromData(raw);
    expect(fx?.extra?.stroke?.map((s) => [s.enabled, s.size, s.position])).toEqual([[true, 9, 'inside'], [false, 2, undefined]]);
    expect(fx?.extra?.dropShadow?.length).toBe(9);
    expect(Object.keys(fx?.extra ?? {}).sort()).toEqual(['dropShadow', 'stroke']);
  });

  it('instances come main first, and an extra alone makes a style active', () => {
    const fx = defaultEffects();
    expect(effectsActive(fx)).toBe(false);
    fx.extra = { colorOverlay: [{ ...fx.colorOverlay, enabled: true, color: { r: 0, g: 0, b: 255 } }] };
    expect(effectsActive(fx)).toBe(true);
    expect(instances(fx, 'colorOverlay').map((c) => c.color.b)).toEqual([0, 255]);
  });

  it('Global Light reaches extra shadows that use it', () => {
    const fx = defaultEffects();
    fx.extra = { dropShadow: [{ ...fx.dropShadow, angle: 5, useGlobal: true }, { ...fx.dropShadow, angle: 7 }] };
    const r = withGlobalLight(fx, { angle: 33, altitude: 30 });
    expect(r.extra?.dropShadow?.map((d) => d.angle)).toEqual([33, 7]);
    expect(fx.extra?.dropShadow?.[0].angle).toBe(5);
  });
});
