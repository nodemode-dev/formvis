import type { Pt } from '../../engine';
import { toolHost } from '../registry';
import type { Tool } from '../registry';
import { growOptions } from './select-common';
import { brushKeys, drawBrushCursor } from './brush-common';

let hover: Pt | null = null, trail: Pt[] = [];

/** Quick Selection (W, with Magic Wand): brush over an area to select it; the selection grows to similar colour and
 *  stops at edges. Alt-drag takes from the selection. It shares the brush size, so [ and ] size it. */
let qsMode: 'new' | 'add' | 'subtract' = 'new';

export const quickSelectTool: Tool = {
  id: 'quickSelect', label: 'Quick Selection', key: 'W', order: 39,
  icon: () => 'tQuickSelect',
  hint: () => 'Drag over an area to select it; the selection grows to similar color and stops at edges \u00b7 Alt-drag subtracts \u00b7 [ ] size',
  cursor: () => 'none',
  // New, Add and Subtract (1.49.10, the owner's tool list): New makes a fresh selection, then turns to
  // Add for the strokes after it; Shift adds and Alt subtracts from any of them.
  down(ctx, p) {
    if (p.button !== 0) return;
    hover = p.doc;
    trail = [p.doc];
    const subtract = p.alt || (qsMode === 'subtract' && !p.shift), fresh = qsMode === 'new' && !p.shift && !p.alt;
    ctx.engine.beginQuickSelect(p.doc, subtract, fresh);
    if (fresh) { qsMode = 'add'; ctx.engine.emit('options', null); }
  },
  move(ctx, p) { hover = p.doc; if (trail.length) trail.push(p.doc); ctx.engine.quickTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { trail = []; ctx.engine.endQuickSelect(); ctx.engine.emit('overlay', null); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { trail = []; ctx.engine.cancelQuickSelect(); },
  keydown(ctx, e) { return brushKeys(ctx, e); },
  overlay(ctx, g) {
    // The brush's footprint while dragging: one 45% white band along the path, as Spot Healing and Remove lay.
    if (trail.length) {
      const v = ctx.view();
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = Math.max(1, ctx.engine.brush.diameter * v.zoom);
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      trail.forEach((q, i) => { const s = v.toScreen(q); if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); });
      if (trail.length === 1) { const s = v.toScreen(trail[0]); g.lineTo(s.x + 0.01, s.y); }
      g.stroke();
      g.restore();
    }
    drawBrushCursor(ctx, g, hover);
  },
  options: (e) => [
    { kind: 'title', text: 'Quick Selection' },
    { kind: 'segment', label: 'Selection', priority: 80, choices: [{ id: 'new', label: 'New' }, { id: 'add', label: 'Add' }, { id: 'subtract', label: 'Subtract' }], get: () => qsMode, set: (v) => { qsMode = v as 'new' | 'add' | 'subtract'; e.emit('options', null); } },
    { kind: 'range', label: 'Size', priority: 90, min: 1, max: 500, get: () => Math.round(e.brush.diameter), set: (v) => e.setBrush({ diameter: v }) },
    { kind: 'toggle', label: 'Sample all layers', priority: 45, get: () => e.quick.sampleAll, set: (v) => e.setQuick({ sampleAll: v }) },
    { kind: 'toggle', label: 'Enhance Edge', priority: 44, get: () => e.quick.enhance, set: (v) => e.setQuick({ enhance: v }) },
    { kind: 'button', label: 'Feather Selection...', priority: 28, run: () => toolHost.run('feather'), when: () => !!e.current?.selection },
    ...growOptions(e),
    { kind: 'button', label: 'Select and Mask...', priority: 25, run: () => toolHost.run('select-and-mask') }
  ],
};
