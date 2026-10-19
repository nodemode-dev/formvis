import type { Engine, Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** The History Brush (Y): paints the active layer back as it was in the source snapshot (the document
 *  as opened, or one chosen in the History panel), with the Brush's size, hardness and dynamics. The owner's
 *  walkthrough: the target's toolbar has it; formvis had none. */
export const historyBrushTool: Tool = {
  id: 'historyBrush', label: 'History Brush', key: 'Y', order: 61,
  icon: () => 'tHistoryBrush',
  hint: () => 'Paint to bring back the layer as it was in the source snapshot (History panel) \u00b7 [ ] size',
  cursor: () => 'none',
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginRetouchStroke('historyBrush', p.doc, p.shift); },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelStroke(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e: Engine): OptionSpec[] => [
    { kind: 'title', text: 'History Brush' },
    { kind: 'readout', label: 'Source', priority: 45, get: () => e.snapshots.find((s) => s.id === e.historyBrushSourceId)?.name ?? 'none (take a snapshot)' },
    ...brushOptions(e, 'Opacity'),
  ],
};
