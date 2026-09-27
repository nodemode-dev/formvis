import { describe, expect, it } from 'vitest';
import { BUILTIN_BRUSH_PRESETS, computeOption, identityOption, noDynamics, pressureOption, presetsFromJson, type CurveOptionSpec } from '../src/engine/brush-dynamics';

describe('brush dynamics ported from NodeMode sonny', () => {
  it('a disabled or missing option is neutral', () => {
    expect(computeOption(identityOption(), { pressure: 0.1 })).toBe(1);
    expect(computeOption(null, { pressure: 0.1 })).toBe(1);
  });

  it('a pressure option maps pressure linearly into its range', () => {
    const o = pressureOption(0.2);
    expect(computeOption(o, { pressure: 0 })).toBeCloseTo(0.2, 12);
    expect(computeOption(o, { pressure: 0.5 })).toBeCloseTo(0.6, 12);
    expect(computeOption(o, { pressure: 1 })).toBeCloseTo(1, 12);
    expect(computeOption(o, { pressure: 7 })).toBeCloseTo(1, 12);
  });

  it('response curves, reversal and strength behave as in the source', () => {
    expect(computeOption(pressureOption(0, 1, [0, 0, 1]), { pressure: 0.5 })).toBeCloseTo(0, 12);
    expect(computeOption(pressureOption(0, 1, [0, 0, 1]), { pressure: 0.75 })).toBeCloseTo(0.5, 12);
    const rev: CurveOptionSpec = { ...pressureOption(0), sensors: [{ id: 'pressure', reversed: true }] };
    expect(computeOption(rev, { pressure: 0.25 })).toBeCloseTo(0.75, 12);
    expect(computeOption({ ...pressureOption(0), strength: 0.5 }, { pressure: 0 })).toBeCloseTo(0.5, 12);
  });

  it('built-in presets are complete and within range', () => {
    expect(BUILTIN_BRUSH_PRESETS.map((p) => p.id)).toEqual(['hard-round', 'soft-air', 'ink', 'pencil', 'marker', 'flat-angled']);
    // A preset's tip shape, where it has one, is within the tip's own ranges.
    for (const p of BUILTIN_BRUSH_PRESETS) { if (p.angle !== undefined) expect(Math.abs(p.angle)).toBeLessThanOrEqual(180); if (p.roundness !== undefined) { expect(p.roundness).toBeGreaterThanOrEqual(1); expect(p.roundness).toBeLessThanOrEqual(100); } }
    for (const p of BUILTIN_BRUSH_PRESETS) {
      expect(p.diameter).toBeGreaterThan(0);
      expect(p.hardness).toBeGreaterThanOrEqual(0); expect(p.hardness).toBeLessThanOrEqual(1);
      expect(p.opacity).toBeGreaterThan(0); expect(p.opacity).toBeLessThanOrEqual(1);
    }
    expect(noDynamics().size.enabled).toBe(false);
  });

  it('stored presets are read defensively', () => {
    const got = presetsFromJson([
      { id: 'a', name: 'Mine', diameter: 99999, hardness: 3, opacity: 0, dynamics: { size: { enabled: true, min: 0.3 } } },
      { id: 'b', name: '   ' }, { name: 'no id' }, 'junk', null,
    ]);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: 'a', name: 'Mine', diameter: 5000, hardness: 1, opacity: 0.01 });
    expect(got[0].dynamics.size).toEqual(pressureOption(0.3, 1));
    expect(got[0].dynamics.flow.enabled).toBe(false);
    expect(presetsFromJson('nope')).toEqual([]);
  });
});
