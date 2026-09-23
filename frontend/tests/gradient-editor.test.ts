import { describe, expect, it } from 'vitest';
import './setup';
import { allGradients, gradientsFromJson, noiseStops, presetById, setCustomGradients } from '../src/engine/gradients';
import { History, type Snapshot } from '../src/engine/history';

describe('gradient editor model', () => {
  it('noise gradients repeat for a seed, vary with it, and grow with roughness', () => {
    expect(noiseStops(7, 50)).toEqual(noiseStops(7, 50));
    expect(noiseStops(7, 50)).not.toEqual(noiseStops(8, 50));
    expect(noiseStops(1, 100).length).toBeGreaterThan(noiseStops(1, 0).length);
    for (const s of noiseStops(3, 100)) { const c = s.color as { r: number; g: number; b: number }; for (const v of [c.r, c.g, c.b]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); } }
    const st = noiseStops(5, 40);
    expect(st[0].at).toBe(0); expect(st[st.length - 1].at).toBe(1);
  });

  it('stored gradients are read defensively and join the list', () => {
    const got = gradientsFromJson([
      { id: 'u1', label: ' Mine ', stops: [{ at: -1, color: { r: 300, g: 0, b: 0 }, alpha: 2 }, { at: 1, color: 'bg', alpha: 1 }] },
      { id: 'u2', label: 'One stop', stops: [{ at: 0, color: 'fg', alpha: 1 }] }, { id: 'u3', label: '', stops: [] }, 'junk',
    ]);
    expect(got).toEqual([{ id: 'u1', label: 'Mine', stops: [{ at: 0, color: { r: 255, g: 0, b: 0 }, alpha: 1 }, { at: 1, color: 'bg', alpha: 1 }] }]);
    setCustomGradients(got);
    expect(presetById('u1').label).toBe('Mine');
    expect(allGradients().some((g) => g.id === 'u1')).toBe(true);
    setCustomGradients([]);
    expect(presetById('u1').id).toBe('background');
  });

  it('History origin gives the first snapshot and the done patches only', () => {
    const h = new History(), snap = (t: string): Snapshot => ({ doc: { width: 1, height: 1, layers: [], t } as never, activeId: null, selection: null });
    const patch = (n: number) => ({ raster: {} as never, x: n, y: 0, before: new ImageData(1, 1), after: new ImageData(1, 1) });
    const a = snap('a');
    h.begin('One', a); h.addPatch(patch(1)); h.end(snap('b'));
    h.begin('Two', snap('b')); h.addPatch(patch(2)); h.end(snap('c'));
    h.undo();
    const o = h.origin();
    expect(o.first).toBe(a);
    expect(o.patches.map((p) => p.x)).toEqual([1]);
  });
});
