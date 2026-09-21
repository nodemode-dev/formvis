import type { Pt } from '../../engine';
import type { Tool } from '../registry';
import { brushKeys, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** Quick Selection (W, with Magic Wand): brush over an area to select it; the selection grows to similar colour and
 *  stops at edges. Alt-drag takes from the selection. It shares the brush size, so [ and ] size it. */
export const quickSelectTool: Tool = {
  id: 'quickSelect', label: 'Quick Selection', key: 'W', order: 39,
  icon: () => 'quickSelect',
  hint: () => 'Drag over an area to select it; the selection grows to similar color and stops at edges \u00b7 Alt-drag subtracts \u00b7 [ ] size',
  cursor: () => 'none',
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginQuickSelect(p.doc, p.alt); },
  move(ctx, p) { hover = p.doc; ctx.engine.quickTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endQuickSelect(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelQuickSelect(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e) => [
    { kind: 'title', text: 'Quick Selection' },
    { kind: 'range', label: 'Size', min: 1, max: 500, get: () => Math.round(e.brush.diameter), set: (v) => e.setBrush({ diameter: v }) },
    { kind: 'toggle', label: 'Sample all layers', get: () => e.quick.sampleAll, set: (v) => e.setQuick({ sampleAll: v }) },
  ],
};
