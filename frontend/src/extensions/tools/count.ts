import type { OptionSpec, Tool } from '../registry';

const NEAR = 10;

/** Count (I), as Photoshop's (the owner's tool list): click to count, each mark numbered on the canvas; Alt-click a
 *  mark to remove it; the total in the bar, and Clear. Saved with the document; each change one step. */
export const countTool: Tool = {
  id: 'count', label: 'Count', key: 'I', order: 80.8,
  icon: () => 'tCount',
  hint: () => 'Click to count · Alt-click a mark to remove it · Clear in the bar',
  cursor: () => 'crosshair',
  down(ctx, p) {
    const e = ctx.engine, counts = e.current?.doc.counts ?? [];
    if (p.button !== 0 || !e.current) return;
    if (p.alt) {
      const v = ctx.view(), at = v.toScreen(p.doc);
      const i = counts.findIndex((c) => { const q = v.toScreen(c); return Math.hypot(q.x - at.x, q.y - at.y) <= NEAR; });
      if (i >= 0) e.removeCount(i);
      return;
    }
    e.addCount(p.doc);
  },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Count' },
    { kind: 'readout', label: 'Count', get: () => String(e.current?.doc.counts?.length ?? 0) },
    { kind: 'button', label: 'Clear', run: () => e.clearCounts() },
  ],
};
