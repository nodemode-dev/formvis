import type { Tool } from '../registry';
import { modeFor, modeSegment } from './select-common';

export const wandTool: Tool = {
  id: 'wand', label: 'Magic Wand', key: 'W', order: 40,
  icon: () => 'wandSelect',
  hint: () => 'Click to select similar colors · Shift adds · Alt subtracts · Tolerance sets how similar',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button === 0) ctx.engine.magicWand(p.doc, modeFor(ctx.engine, p)); },
  options: (e) => [
    { kind: 'title', text: 'Magic Wand' },
    { kind: 'range', label: 'Tolerance', min: 0, max: 255, get: () => e.wand.tolerance, set: (v) => e.setWand({ tolerance: v }) },
    { kind: 'toggle', label: 'Contiguous', get: () => e.wand.contiguous, set: (v) => e.setWand({ contiguous: v }) },
    { kind: 'toggle', label: 'Sample all layers', get: () => e.wand.sampleAll, set: (v) => e.setWand({ sampleAll: v }) },
    modeSegment(e),
  ],
};
