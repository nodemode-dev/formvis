import { describe, expect, it } from 'vitest';
import { px } from './setup';
import { PARAM_ADJUSTMENTS, PARAM_KINDS, paramKernel, paramValues, type ParamKind } from '../src/engine/adjust-params';
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, defaultAdjustmentData } from '../src/engine/adjust';

const apply = (kind: ParamKind, params: Record<string, unknown>, rgb = [200, 100, 50]): number[] => {
  const d = px(rgb[0], rgb[1], rgb[2], 255);
  paramKernel(kind, { ...paramValues(kind, {}), ...params })(d, { width: 1, height: 1, unitsPerPixel: 1 } as never);
  return Array.from(d.slice(0, 3));
};

describe('parametric adjustments', () => {
  it('are all registered with labels and defaults', () => {
    for (const k of PARAM_KINDS) {
      expect(ADJUSTMENT_KINDS).toContain(k);
      expect(ADJUSTMENT_LABELS[k]).toBe(PARAM_ADJUSTMENTS[k].label);
      expect(defaultAdjustmentData(k).params).toEqual(paramValues(k, {}));
    }
    expect(new Set(Object.values(ADJUSTMENT_LABELS)).size).toBe(ADJUSTMENT_KINDS.length);
  });

  it('match independently computed pixels', () => {
    expect(apply('brightnessContrast', { brightness: 50 })).toEqual([217, 137, 86]);
    expect(apply('vibrance', { saturation: 50 })).toEqual([238, 88, 13]);
    expect(apply('blackWhite', {})).toEqual([120, 120, 120]);
    expect(apply('invert', {})).toEqual([55, 155, 205]);
    expect(apply('posterize', { levels: 4 })).toEqual([170, 85, 85]);
    expect(apply('threshold', { level: 128 })).toEqual([0, 0, 0]);
    expect(apply('channelMixer', { redR: 0, redG: 100 })).toEqual([100, 100, 50]);
    expect(apply('photoFilter', { density: 50, preserve: false })).toEqual([218, 119, 25]);
    expect(apply('colorBalance', { midtonesCR: 50, preserve: false })).toEqual([255, 100, 50]);
  });

  it('are the identity at their defaults where Photoshop is', () => {
    for (const k of ['brightnessContrast', 'vibrance', 'colorBalance', 'channelMixer', 'selectiveColor'] as ParamKind[]) {
      expect(apply(k, {}, [37, 142, 211])).toEqual([37, 142, 211]);
    }
  });

  it('Preserve Luminosity keeps luminance', () => {
    const [r, g, b] = apply('photoFilter', { density: 80, preserve: true }, [60, 120, 180]);
    const L = (x: number, y: number, z: number): number => 0.299 * x + 0.587 * y + 0.114 * z;
    expect(Math.abs(L(r, g, b) - L(60, 120, 180))).toBeLessThan(1.5);
  });

  it('clamp stored values and replace unreadable ones with defaults', () => {
    const v = paramValues('brightnessContrast', { brightness: 9999, contrast: 'x', legacy: 1 });
    expect(v).toEqual({ brightness: 150, contrast: 0, legacy: false });
    const c = paramValues('photoFilter', { color: { r: 300, g: -5, b: 'z' } });
    expect(c.color).toEqual({ r: 255, g: 0, b: 0 });
    expect(paramValues('selectiveColor', { method: 'bogus' }).method).toBe('relative');
  });

  it('every grouped control belongs to an option of its select', () => {
    for (const k of PARAM_KINDS) {
      const spec = PARAM_ADJUSTMENTS[k], sel = spec.params.find((p) => p.key === spec.groupBy);
      const groups = sel && sel.kind === 'select' ? new Set(sel.options.map(([v]) => v)) : new Set<string>();
      for (const p of spec.params) if (p.group) expect(groups.has(p.group)).toBe(true);
      expect(new Set(spec.params.map((p) => p.key)).size).toBe(spec.params.length);
    }
  });

  it('Selective Color moves only the chosen family', () => {
    expect(apply('selectiveColor', { bluesC: 100 }, [200, 100, 50])).toEqual([200, 100, 50]);
    const red = apply('selectiveColor', { redsC: 100 }, [200, 100, 50]);
    expect(red[0]).toBeLessThan(200);
  });
});
