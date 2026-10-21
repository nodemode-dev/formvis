import { toolHost } from '../registry';
import type { Tool } from '../registry';
import { growOptions, modeCursor, modeFor, modeSegment, nudgeSelectionKey } from './select-common';

export const wandTool: Tool = {
  id: 'wand', label: 'Magic Wand', key: 'W', order: 40,
  icon: () => 'tWand',
  hint: () => 'Click to select similar colors · Shift adds · Alt subtracts · Tolerance sets how alike · With a layer mask targeted it samples the mask · Arrows nudge the outline',
  cursor: (ctx, p) => modeCursor(ctx.engine, p),
  down(ctx, p) { if (p.button === 0) ctx.engine.magicWand(p.doc, modeFor(ctx.engine, p)); },
  keydown: (ctx, e) => nudgeSelectionKey(ctx, e),
  options: (e) => [
    { kind: 'title', text: 'Magic Wand' },
    { kind: 'range', label: 'Tolerance', priority: 90, min: 0, max: 255, get: () => e.wand.tolerance, set: (v) => e.setWand({ tolerance: v }) },
    // The sample sizes (1.50.4, the tool audit), as radii: Point to 101 by 101.
    { kind: 'select', label: 'Sample Size', priority: 60, choices: [['0', 'Point'], ['1', '3 by 3'], ['2', '5 by 5'], ['5', '11 by 11'], ['15', '31 by 31'], ['25', '51 by 51'], ['50', '101 by 101']].map(([id, label]) => ({ id, label })), get: () => String(e.wand.sampleSize), set: (v) => e.setWand({ sampleSize: Number(v) }) },
    { kind: 'toggle', label: 'Anti-alias', priority: 40, get: () => e.wand.antialias, set: (v) => e.setWand({ antialias: v }) },
    { kind: 'toggle', label: 'Contiguous', priority: 55, get: () => e.wand.contiguous, set: (v) => e.setWand({ contiguous: v }) },
    { kind: 'toggle', label: 'Sample all layers', priority: 45, get: () => e.wand.sampleAll, set: (v) => e.setWand({ sampleAll: v }) },
    modeSegment(e),
    { kind: 'button', label: 'Select Subject', priority: 35, run: () => toolHost.run('select-subject') },
    { kind: 'button', label: 'Feather Selection...', priority: 28, run: () => toolHost.run('feather'), when: () => !!e.current?.selection },
    ...growOptions(e),
    { kind: 'button', label: 'Select and Mask...', priority: 25, run: () => toolHost.run('select-and-mask') }
  ]
};
