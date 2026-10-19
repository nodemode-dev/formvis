import { describe, expect, it } from 'vitest';
import { defaultAdjustmentData, defaultHsv, hsvFromData, hsvToData, type Adjustment, type AdjustmentKind } from '../src/engine';
import { fromPsdAdjustment, toPsdAdjustment } from '../src/io/psd-adjust';

const withData = (kind: AdjustmentKind, data: Record<string, unknown>): Adjustment => ({ kind, data: { ...(defaultAdjustmentData(kind) as Record<string, unknown>), ...data } });
const back = (a: Adjustment): Adjustment | null => { const p = toPsdAdjustment(a); return p ? fromPsdAdjustment(JSON.parse(JSON.stringify(p))) : null; };

describe('adjustment layers to and from PSD', () => {
  const cases: Array<[AdjustmentKind, Record<string, unknown>]> = [
    ['brightnessContrast', { brightness: 40, contrast: -20, legacy: true }],
    ['vibrance', { vibrance: 35, saturation: -10 }],
    ['posterize', { levels: 6 }],
    ['threshold', { level: 90 }],
    ['photoFilter', { color: { r: 10, g: 120, b: 200 }, density: 60, preserve: false }],
    ['colorBalance', { shadowsCR: 10, midtonesMG: -30, highlightsYB: 25, preserve: false }],
    ['blackWhite', { reds: 70, blues: -10, tint: true, tintColor: { r: 200, g: 180, b: 150 } }],
    ['channelMixer', { redR: 80, redG: 20, greenK: 5, monochrome: false }],
    ['selectiveColor', { redsC: -20, neutralsK: 15, method: 'absolute' }],
    ['exposure', { exposure: 0.7, offset: -0.05, gamma: 1.3 }],
    ['levels', { ranges: [{ black: 20, white: 230, gamma: 1.2, outputBlack: 5, outputWhite: 250 }, { black: 0, white: 255, gamma: 0.9, outputBlack: 0, outputWhite: 255 }, { black: 0, white: 255, gamma: 1, outputBlack: 0, outputWhite: 255 }, { black: 10, white: 255, gamma: 1, outputBlack: 0, outputWhite: 255 }] }],
    ['curves', { channels: [[{ x: 0, y: 0 }, { x: 128, y: 150 }, { x: 255, y: 255 }], [{ x: 0, y: 20 }, { x: 255, y: 255 }], [{ x: 0, y: 0 }, { x: 255, y: 255 }], [{ x: 0, y: 0 }, { x: 255, y: 230 }]] }],
    ['gradientMap', { shadows: { red: 0.2, green: 0, blue: 0.4 }, highlights: { red: 1, green: 0.9, blue: 0.6 }, reversed: true }],
  ];
  for (const [kind, data] of cases) {
    it(`keeps ${kind}`, () => {
      const a = withData(kind, data), r = back(a) as Adjustment;
      expect(r.kind).toBe(kind);
      for (const [k, v] of Object.entries(data)) expect(r.data[k]).toEqual(v);
    });
  }

  it('keeps Hue/Saturation ranges and bands', () => {
    const s = defaultHsv();
    s.adjustments.Master = { hue: 30, saturation: 20, lightness: -5 };
    s.adjustments.Blues = { hue: -40, saturation: 10, lightness: 0 };
    s.bands.Blues = { falloffStart: 190, rangeStart: 215, rangeEnd: 250, falloffEnd: 275 };
    const r = back({ kind: 'hsv', data: { hsvSettings: hsvToData(s) } }) as Adjustment, got = hsvFromData(r.data as never);
    expect([got.adjustments.Master?.hue, got.adjustments.Master?.lightness, got.adjustments.Blues?.hue]).toEqual([30, -5, -40]);
    expect(got.bands.Blues).toEqual({ falloffStart: 190, rangeStart: 215, rangeEnd: 250, falloffEnd: 275 });
  });

  it('refuses kinds the PSD format has no layer for', () => {
    expect(toPsdAdjustment({ kind: 'grain', data: {} })).toBeNull();
    expect(toPsdAdjustment({ kind: 'develop', data: {} })).toBeNull();
    expect(fromPsdAdjustment({ type: 'color lookup' } as never)).toBeNull();
  });
});
