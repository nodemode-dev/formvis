import type { Pt } from '../../engine';
import { toolHost } from '../registry';
import type { Tool } from '../registry';
import { brushKeys, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** Quick Selection (W, with Magic Wand): brush over an area to select it; the selection grows to similar colour and
 *  stops at edges. Alt-drag takes from the selection. It shares the brush size, so [ and ] size it. */
let qsMode: 'new' | 'add' | 'subtract' = 'new';

export const quickSelectTool: Tool = {
  id: 'quickSelect', label: 'Quick Selection', key: 'W', order: 39,
  icon: () => 'tQuickSelect',
  hint: () => 'Drag over an area to select it; the selection grows to similar color and stops at edges \u00b7 Alt-drag subtracts \u00b7 [ ] size',
  cursor: () => 'none',
  // New, Add and Subtract (1.49.10, the owner's tool list), as Photoshop's: New makes a fresh selection, then turns to
  // Add for the strokes after it; Shift adds and Alt subtracts from any of them.
  down(ctx, p) {
    if (p.button !== 0) return;
    hover = p.doc;
    const subtract = p.alt || (qsMode === 'subtract' && !p.shift), fresh = qsMode === 'new' && !p.shift && !p.alt;
    ctx.engine.beginQuickSelect(p.doc, subtract, fresh);
    if (fresh) { qsMode = 'add'; ctx.engine.emit('options', null); }
  },
  move(ctx, p) { hover = p.doc; ctx.engine.quickTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endQuickSelect(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { ctx.engine.cancelQuickSelect(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) { drawBrushCursor(ctx, g, hover); },
  options: (e) => [
    { kind: 'title', text: 'Quick Selection' },
    { kind: 'segment', label: 'Selection', choices: [{ id: 'new', label: 'New' }, { id: 'add', label: 'Add' }, { id: 'subtract', label: 'Subtract' }], get: () => qsMode, set: (v) => { qsMode = v as 'new' | 'add' | 'subtract'; e.emit('options', null); } },
    { kind: 'range', label: 'Size', min: 1, max: 500, get: () => Math.round(e.brush.diameter), set: (v) => e.setBrush({ diameter: v }) },
    { kind: 'toggle', label: 'Sample all layers', get: () => e.quick.sampleAll, set: (v) => e.setQuick({ sampleAll: v }) },
    { kind: 'button', label: 'Select and Mask...', run: () => toolHost.run('select-and-mask') }
  ],
};
