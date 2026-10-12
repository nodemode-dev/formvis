import { toolHost } from '../registry';
import type { Tool } from '../registry';
import { modeFor, modeSegment, nudgeSelectionKey } from './select-common';

export const wandTool: Tool = {
  id: 'wand', label: 'Magic Wand', key: 'W', order: 40,
  icon: () => 'tWand',
  hint: () => 'Click to select similar colours · Shift adds · Alt subtracts · Tolerance sets how alike · Arrows nudge the outline',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button === 0) ctx.engine.magicWand(p.doc, modeFor(ctx.engine, p)); },
  keydown: (ctx, e) => nudgeSelectionKey(ctx, e),
  options: (e) => [
    { kind: 'title', text: 'Magic Wand' },
    { kind: 'range', label: 'Tolerance', min: 0, max: 255, get: () => e.wand.tolerance, set: (v) => e.setWand({ tolerance: v }) },
    // Photoshop's sample sizes (1.50.4, the tool audit), as radii: Point to 101 by 101.
    { kind: 'select', label: 'Sample Size', choices: [['0', 'Point'], ['1', '3 by 3'], ['2', '5 by 5'], ['5', '11 by 11'], ['15', '31 by 31'], ['25', '51 by 51'], ['50', '101 by 101']].map(([id, label]) => ({ id, label })), get: () => String(e.wand.sampleSize), set: (v) => e.setWand({ sampleSize: Number(v) }) },
    { kind: 'toggle', label: 'Anti-alias', get: () => e.wand.antialias, set: (v) => e.setWand({ antialias: v }) },
    { kind: 'toggle', label: 'Contiguous', get: () => e.wand.contiguous, set: (v) => e.setWand({ contiguous: v }) },
    { kind: 'toggle', label: 'Sample all layers', get: () => e.wand.sampleAll, set: (v) => e.setWand({ sampleAll: v }) },
    modeSegment(e),
    { kind: 'button', label: 'Select Subject', run: () => toolHost.run('select-subject') },
    { kind: 'button', label: 'Select and Mask...', run: () => toolHost.run('select-and-mask') }
  ]
};
