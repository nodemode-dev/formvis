import { SelectionMask, boundsOf, type Pt, type SelectionMode } from '../../engine';
import { dashed, type Tool, type ToolContext } from '../registry';
import { modeFor, modeSegment, nudgeSelectionKey } from './select-common';

let pts: Pt[] = [];
let mode: SelectionMode = 'replace';
let active = false;
let hover: Pt | null = null;

function reset(ctx: ToolContext): void { pts = []; active = false; ctx.engine.emit('overlay', null); }

function commit(ctx: ToolContext): void {
  const e = ctx.engine;
  const doc = e.current?.doc;
  const poly = pts;
  reset(ctx);
  if (!doc || poly.length < 3) return;
  const hard = SelectionMask.fromPath(doc.width, doc.height, boundsOf(poly), (c) => {
    c.beginPath();
    c.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) c.lineTo(poly[i].x, poly[i].y);
    c.closePath();
    c.fill();
  }, e.selectionAntialiased);
  const mask = hard && e.lassoFeather > 0 ? e.featherMask(hard, e.lassoFeather) : hard;
  e.applySelection(mask, mode, e.lassoKind === 'polygonal' ? 'Polygonal Lasso' : 'Lasso');
}

export const lassoTool: Tool = {
  id: 'lasso', label: 'Lasso', key: 'L', order: 30,
  icon: (e) => (e.lassoKind === 'polygonal' ? 'tPolyLasso' : 'tLasso'),
  variants: (e) => [
    { id: 'freehand', label: 'Lasso', icon: 'tLasso', active: () => e.lassoKind !== 'polygonal', pick: () => e.update({ lassoKind: 'freehand' }) },
    { id: 'polygonal', label: 'Polygonal Lasso', icon: 'tPolyLasso', active: () => e.lassoKind === 'polygonal', pick: () => e.update({ lassoKind: 'polygonal' }) },
  ],
  hint: (e) => (e.lassoKind === 'polygonal'
    ? 'Click corners · Click the start, double-click or press Enter to close · Backspace removes the last corner · Escape cancels · Shift+L switches mode'
    : 'Drag around an area · Shift adds · Alt subtracts · Shift+L switches to polygonal'),
  cursor: () => 'crosshair',
  down(ctx, p) {
    const e = ctx.engine;
    if (!e.current || p.button !== 0) return;
    if (e.lassoKind === 'freehand' || !active) { mode = modeFor(e, p); pts = [p.doc]; active = true; e.emit('overlay', null); return; }
    const first = ctx.view().toScreen(pts[0]);
    if (p.clicks >= 2 || Math.hypot(first.x - p.screen.x, first.y - p.screen.y) <= 6) { commit(ctx); return; }
    pts.push(p.doc);
    e.emit('overlay', null);
  },
  move(ctx, p) {
    hover = p.doc;
    if (ctx.engine.lassoKind !== 'freehand' || !active) return;
    const last = pts[pts.length - 1];
    const z = ctx.view().zoom;
    if (Math.hypot((p.doc.x - last.x) * z, (p.doc.y - last.y) * z) >= 2) pts.push(p.doc);
    ctx.engine.emit('overlay', null);
  },
  up(ctx) { if (ctx.engine.lassoKind === 'freehand' && active) commit(ctx); },
  hover(ctx, p) { hover = p?.doc ?? null; if (active) ctx.engine.emit('overlay', null); },
  keydown(ctx, e) {
    if (!active || ctx.engine.lassoKind !== 'polygonal') return nudgeSelectionKey(ctx, e);
    if (e.key === 'Enter') { commit(ctx); return true; }
    if (e.key === 'Escape') { reset(ctx); return true; }
    if (e.key === 'Backspace' || e.key === 'Delete') { pts.pop(); if (!pts.length) active = false; ctx.engine.emit('overlay', null); return true; }
    return false;
  },
  cancel(ctx) { reset(ctx); },
  overlay(ctx, g) {
    if (!active || !pts.length) return;
    const v = ctx.view();
    const screen = pts.map((q) => v.toScreen(q));
    if (ctx.engine.lassoKind === 'polygonal' && hover) screen.push(v.toScreen(hover));
    dashed(ctx, g, () => {
      g.moveTo(screen[0].x, screen[0].y);
      for (let i = 1; i < screen.length; i++) g.lineTo(screen[i].x, screen[i].y);
    });
  },
  options: (e) => [
    { kind: 'title', text: 'Lasso' },
    { kind: 'segment', label: 'Kind', choices: [{ id: 'freehand', label: 'Freehand' }, { id: 'polygonal', label: 'Polygonal' }], get: () => e.lassoKind, set: (v) => e.update({ lassoKind: v as 'freehand' | 'polygonal' }) },
    { kind: 'range', label: 'Feather', min: 0, max: 250, unit: 'px', get: () => e.lassoFeather, set: (v: number) => { e.lassoFeather = Math.max(0, Math.min(250, v)); e.emit('options', null); } },
    { kind: 'toggle', label: 'Anti-alias', get: () => e.selectionAntialiased, set: (v) => { e.selectionAntialiased = v; e.emit('options', null); } },
    modeSegment(e),
  ],
};
