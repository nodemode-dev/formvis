import type { Engine, Pt } from '../../engine';
import { dashed, type OptionSpec, type Tool } from '../registry';
import { lassoTool } from './lasso';

let drag: { start: Pt; now: Pt; pending?: boolean } | null = null, mode: 'move' | 'extend' = 'move';
/** Transform On Drop: the drop waits here (nothing is filled or moved yet) while scale, angle and flips are set; Enter applies. */
let pend: { dx: number; dy: number; scale: number; angle: number; flipH: boolean; flipV: boolean; sel: unknown } | null = null;

function pending(e: Engine): typeof pend {
  if (pend && e.current?.selection !== pend.sel) pend = null;
  return pend;
}

function apply(e: Engine): void {
  const d = pending(e);
  pend = null;
  if (d) e.contentAwareMove(d.dx, d.dy, mode, { scale: d.scale, angle: d.angle, flipH: d.flipH, flipV: d.flipV });
  e.emit('options', null);
  e.emit('overlay', null);
}

function dismiss(e: Engine): void {
  pend = null;
  e.emit('options', null);
  e.emit('overlay', null);
}

/** Content-Aware Move (J; the owner's tool list): draw a selection as with the Lasso (or use any), then
 *  drag it; in Move mode the selected pixels go there and the hole they leave is filled from around it; in Extend mode
 *  the original stays. The selection goes with them; one step. */
export const contentAwareMoveTool: Tool = {
  id: 'contentAwareMove', label: 'Content-Aware Move', key: 'J', order: 57.5,
  icon: () => 'tCAMove',
  hint: () => (mode === 'move' ? 'Draw around what to move, then drag it: the hole it leaves is filled from around it' : 'Draw around what to copy, then drag it: the original stays'),
  cursor: () => 'crosshair',
  down(ctx, p) {
    const sel = ctx.engine.current?.selection;
    if (p.button === 0 && pending(ctx.engine)) { drag = { start: p.doc, now: p.doc, pending: true }; return; }
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
      if (d.pending && pend) { pend.dx += dx; pend.dy += dy; ctx.engine.emit('overlay', null); return; }
      if (!dx && !dy) return;
      if (ctx.engine.retouch.moveTransform) {
        pend = { dx, dy, scale: 100, angle: 0, flipH: false, flipV: false, sel: ctx.engine.current?.selection };
        ctx.engine.emit('options', null);
        ctx.engine.emit('overlay', null);
      } else ctx.engine.contentAwareMove(dx, dy, mode);
      return;
    }
    lassoTool.up?.(ctx, p);
  },
  hover(ctx, p) { lassoTool.hover?.(ctx, p); },
  keydown(ctx, e) {
    if (pending(ctx.engine) && (e.key === 'Enter' || e.key === 'Escape')) { if (e.key === 'Enter') apply(ctx.engine); else dismiss(ctx.engine); return true; }
    return lassoTool.keydown?.(ctx, e) ?? false;
  },
  cancel(ctx) { if (pending(ctx.engine)) dismiss(ctx.engine); else if (drag) { drag = null; ctx.engine.emit('overlay', null); } else lassoTool.cancel?.(ctx); },
  overlay(ctx, g) {
    const sel = ctx.engine.current?.selection, pd = pending(ctx.engine);
    if ((!drag && !pd) || !sel) { lassoTool.overlay?.(ctx, g); return; }
    // Where the selection is going: the box of the selection, scaled, turned and flipped as set.
    const v = ctx.view(), mx = drag ? drag.now.x - drag.start.x : 0, my = drag ? drag.now.y - drag.start.y : 0;
    const dx = (pd ? pd.dx : 0) + (drag && (pd ? drag.pending : true) ? mx : 0), dy = (pd ? pd.dy : 0) + (drag && (pd ? drag.pending : true) ? my : 0);
    const k = pd ? pd.scale / 100 : 1, r = pd ? (pd.angle * Math.PI) / 180 : 0, cs = Math.cos(r), sn = Math.sin(r);
    const cx = sel.x + sel.w / 2 + dx, cy = sel.y + sel.h / 2 + dy;
    const pt = (u: number, w: number): Pt => {
      const rx = (u - sel.w / 2) * k * (pd?.flipH ? -1 : 1), ry = (w - sel.h / 2) * k * (pd?.flipV ? -1 : 1);
      return v.toScreen({ x: cx + rx * cs - ry * sn, y: cy + rx * sn + ry * cs });
    };
    const c = [pt(0, 0), pt(sel.w, 0), pt(sel.w, sel.h), pt(0, sel.h)];
    dashed(ctx, g, () => { g.moveTo(c[0].x + 0.5, c[0].y + 0.5); for (let i = 1; i < 4; i++) g.lineTo(c[i].x + 0.5, c[i].y + 0.5); g.closePath(); });
  },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Content-Aware Move' },
    { kind: 'segment', label: 'Mode', choices: [{ id: 'move', label: 'Move' }, { id: 'extend', label: 'Extend' }], get: () => mode, set: (v) => { mode = v as 'move' | 'extend'; e.emit('options', null); } },
    { kind: 'number', label: 'Structure', min: 1, max: 7, step: 1, get: () => e.retouch.moveStructure, set: (v: number) => { e.retouch.moveStructure = Math.round(Math.min(7, Math.max(1, v))); e.emit('options', null); }, when: () => mode === 'move' },
    { kind: 'number', label: 'Color', min: 0, max: 10, step: 1, get: () => e.retouch.moveColor, set: (v: number) => { e.retouch.moveColor = Math.round(Math.min(10, Math.max(0, v))); e.emit('options', null); } },
    { kind: 'toggle', label: 'Sample All Layers', get: () => e.retouch.moveSampleAll, set: (v: boolean) => { e.retouch.moveSampleAll = v; e.emit('options', null); } },
    { kind: 'toggle', label: 'Transform On Drop', get: () => e.retouch.moveTransform, set: (v: boolean) => { e.retouch.moveTransform = v; if (!v) pend = null; e.emit('options', null); e.emit('overlay', null); } },
    { kind: 'number', label: 'Scale', min: 1, max: 1000, step: 1, unit: '%', get: () => pend?.scale ?? 100, set: (v: number) => { if (pend) { pend.scale = Math.min(1000, Math.max(1, Math.round(v))); e.emit('options', null); e.emit('overlay', null); } }, when: () => !!pending(e) },
    { kind: 'number', label: 'Angle', min: -180, max: 180, step: 1, unit: '°', get: () => pend?.angle ?? 0, set: (v: number) => { if (pend) { pend.angle = Math.min(180, Math.max(-180, Math.round(v))); e.emit('options', null); e.emit('overlay', null); } }, when: () => !!pending(e) },
    { kind: 'toggle', label: 'Flip horizontal', get: () => pend?.flipH ?? false, set: (v: boolean) => { if (pend) { pend.flipH = v; e.emit('options', null); e.emit('overlay', null); } }, when: () => !!pending(e) },
    { kind: 'toggle', label: 'Flip vertical', get: () => pend?.flipV ?? false, set: (v: boolean) => { if (pend) { pend.flipV = v; e.emit('options', null); e.emit('overlay', null); } }, when: () => !!pending(e) },
    { kind: 'button', label: 'Apply', run: () => apply(e), when: () => !!pending(e) },
    { kind: 'button', label: 'Cancel', run: () => dismiss(e), when: () => !!pending(e) },
  ],
};
