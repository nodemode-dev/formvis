import { describe, expect, it } from 'vitest';
import { BUILTIN_EXPORT_PRESETS, clampSettings, exportName, exportSize, presetsFromStorage } from '../src/io/export-presets';

describe('export presets', () => {
  it('built-ins are well formed and unique', () => {
    expect(new Set(BUILTIN_EXPORT_PRESETS.map((p) => p.id)).size).toBe(BUILTIN_EXPORT_PRESETS.length);
    for (const p of BUILTIN_EXPORT_PRESETS) expect(clampSettings(p)).toEqual({ format: p.format, quality: p.quality, scale: p.scale });
  });

  it('settings are clamped and unknown formats fall back to PNG', () => {
    expect(clampSettings({ format: 'bmp' as never, quality: 900, scale: 0 })).toEqual({ format: 'png', quality: 100, scale: 1 });
    expect(clampSettings({ format: 'webp', quality: NaN, scale: 5000 })).toEqual({ format: 'webp', quality: 90, scale: 1000 });
  });

  it('stored presets are read defensively', () => {
    expect(presetsFromStorage(null)).toEqual([]);
    expect(presetsFromStorage('{nope')).toEqual([]);
    expect(presetsFromStorage('{"a":1}')).toEqual([]);
    const got = presetsFromStorage(JSON.stringify([{ id: 'u1', name: ' Mine ', format: 'avif', quality: 55, scale: 150 }, { id: 'u2', name: '' }, 7, null]));
    expect(got).toEqual([{ id: 'u1', name: 'Mine', format: 'avif', quality: 55, scale: 150, builtin: false }]);
  });

  it('names and sizes follow the usual presets', () => {
    expect(exportName('Shot', { format: 'png', quality: 100, scale: 100 })).toBe('Shot.png');
    expect(exportName('Shot', { format: 'png', quality: 100, scale: 200 })).toBe('Shot@2x.png');
    expect(exportName('Shot', { format: 'webp', quality: 80, scale: 50 })).toBe('Shot@0.5x.webp');
    expect(exportName('Shot', { format: 'tiff', quality: 100, scale: 100 })).toBe('Shot.tif');
    expect(exportSize(301, 199, 50)).toEqual({ w: 151, h: 100 });
    expect(exportSize(3, 3, 1)).toEqual({ w: 1, h: 1 });
  });
});
