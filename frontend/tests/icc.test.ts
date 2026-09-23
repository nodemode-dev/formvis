import { describe, expect, it } from 'vitest';
import { convertPixels, iccProfile } from '../src/engine/icc';
import { clampSettings, presetsFromStorage } from '../src/io/export-presets';

// Expected values from LittleCMS 2.17 (through Pillow's ImageCms), converting from its built-in sRGB profile with
// relative colorimetric intent to these same profiles.
const COLOURS = [[204, 77, 51], [128, 128, 128], [20, 200, 90], [255, 255, 255], [0, 0, 0], [240, 30, 200], [90, 140, 250]];
const LCMS = {
  'display-p3': [[189, 85, 60], [128, 128, 128], [93, 197, 103], [255, 255, 255], [0, 0, 0], [220, 57, 194], [101, 139, 242]],
  'adobe-rgb': [[178, 78, 55], [127, 127, 127], [114, 199, 98], [255, 255, 255], [0, 0, 0], [206, 35, 195], [107, 139, 246]],
} as const;

describe('colour spaces and profiles', () => {
  for (const [space, want] of Object.entries(LCMS)) {
    it(`converts sRGB to ${space} as LittleCMS does`, () => {
      const px = new Uint8ClampedArray(COLOURS.flatMap((c) => [...c, 200]));
      convertPixels(px, 'srgb', space as 'display-p3' | 'adobe-rgb');
      expect(COLOURS.map((_, i) => Array.from(px.slice(i * 4, i * 4 + 3)))).toEqual(want);
      expect(px[3]).toBe(200);
    });
  }

  it('writes a well-formed version 2 display profile', () => {
    const p = iccProfile('display-p3'), dv = new DataView(p.buffer);
    expect(dv.getUint32(0)).toBe(p.length);
    expect(String.fromCharCode(...p.slice(36, 40))).toBe('acsp');
    expect(String.fromCharCode(...p.slice(12, 24))).toBe('mntrRGB XYZ ');
    expect(dv.getUint32(128)).toBe(9);
  });

  it('keeps a known export profile and drops others', () => {
    expect(clampSettings({ format: 'png', quality: 90, scale: 100, profile: 'display-p3' }).profile).toBe('display-p3');
    expect(clampSettings({ format: 'png', quality: 90, scale: 100, profile: 'cmyk' as never }).profile).toBeUndefined();
    expect(presetsFromStorage(JSON.stringify([{ id: 'a', name: 'P3', format: 'jpg', quality: 80, scale: 100, profile: 'adobe-rgb' }]))[0].profile).toBe('adobe-rgb');
  });
});
