import type { Pt } from '../../engine';
import { dashed, type OptionSpec, type Tool } from '../registry';
import { lassoTool } from './lasso';

let drag: { start: Pt; now: Pt } | null = null, mode: 'move' | 'extend' = 'move';

/** Content-Aware Move (J), as Photoshop's (the owner's tool list): draw a selection as with the Lasso (or use any), then
 *  drag it; in Move mode the selected pixels go there and the hole they leave is filled from around it; in Extend mode
 *  the original stays. The selection goes with them; one step. */
export const contentAwareMoveTool: Tool = {
  id: 'contentAwareMove', label: 'Content-Aware Move', key: 'J', order: 57.5,
  icon: () => 'tCAMove',
  hint: () => (mode === 'move' ? 'Draw around what to move, then drag it: the hole it leaves is filled from around it' : 'Draw around what to copy, then drag it: the original stays'),
  cursor: () => 'crosshair',
  down(ctx, p) {
    const sel = ctx.engine.current?.selection;
    if (p.button === 0 && sel && !p.shift && !p.alt && sel.valueAt(Math.floor(p.doc.x), Math.floor(p.doc.y)) > 0) { drag = { start: p.doc, now: p.doc }; return; }
    lassoTool.down?.(ctx, p);
  },
  move(ctx, p) { if (drag) { drag.now = p.doc; ctx.engine.emit('overlay', null); return; } lassoTool.move?.(ctx, p); },
  up(ctx, p) {
    const d = drag;
    if (d) {
      drag = null;
      ctx.engine.emit('overlay', null);
      const dx = Math.round(d.now.x - d.start.x), dy = Math.round(d.now.y - d.start.y);
      if (dx || dy) ctx.engine.contentAwareMove(dx, dy, mode);
      return;
    }
    lassoTool.up?.(ctx, p);
  },
  hover(ctx, p) { lassoTool.hover?.(ctx, p); },
  keydown(ctx, e) { return lassoTool.keydown?.(ctx, e) ?? false; },
  cancel(ctx) { if (drag) { drag = null; ctx.engine.emit('overlay', null); } else lassoTool.cancel?.(ctx); },
  overlay(ctx, g) {
    const sel = ctx.engine.current?.selection;
    if (!drag || !sel) { lassoTool.overlay?.(ctx, g); return; }
    // Where the selection is going.
    const v = ctx.view(), dx = drag.now.x - drag.start.x, dy = drag.now.y - drag.start.y;
    const a = v.toScreen({ x: sel.x + dx, y: sel.y + dy }), b = v.toScreen({ x: sel.x + sel.w + dx, y: sel.y + sel.h + dy });
    dashed(ctx, g, () => { g.rect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y); });
  },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Content-Aware Move' },
    { kind: 'segment', label: 'Mode', choices: [{ id: 'move', label: 'Move' }, { id: 'extend', label: 'Extend' }], get: () => mode, set: (v) => { mode = v as 'move' | 'extend'; e.emit('options', null); } },
  ],
};
