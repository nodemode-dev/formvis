import type { Tool } from '../registry';
import { modeFor, modeSegment, nudgeSelectionKey } from './select-common';

export const wandTool: Tool = {
  id: 'wand', label: 'Magic Wand', key: 'W', order: 40,
  icon: () => 'wandSelect',
  hint: () => 'Click to select similar colors · Shift adds · Alt subtracts · Tolerance sets how similar · Arrows nudge the outline',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button === 0) ctx.engine.magicWand(p.doc, modeFor(ctx.engine, p)); },
  keydown(ctx, e) { return nudgeSelectionKey(ctx, e); },
  options: (e) => [
    { kind: 'title', text: 'Magic Wand' },
    { kind: 'range', label: 'Tolerance', min: 0, max: 255, get: () => e.wand.tolerance, set: (v) => e.setWand({ tolerance: v }) },
    { kind: 'segment', label: 'Sample Size', choices: [{ id: '0', label: 'Point' }, { id: '1', label: '3 by 3' }, { id: '2', label: '5 by 5' }], get: () => String(e.wand.sampleSize), set: (v) => e.setWand({ sampleSize: Number(v) }) },
    { kind: 'toggle', label: 'Anti-alias', get: () => e.wand.antialias, set: (v) => e.setWand({ antialias: v }) },
    { kind: 'toggle', label: 'Contiguous', get: () => e.wand.contiguous, set: (v) => e.setWand({ contiguous: v }) },
    { kind: 'toggle', label: 'Sample all layers', get: () => e.wand.sampleAll, set: (v) => e.setWand({ sampleAll: v }) },
    modeSegment(e),
  ],
};
