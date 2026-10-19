import { SelectionMask, boundsOf, type Pt, type SelectionMode } from '../../engine';
import { toolHost } from '../registry';
import { dashed, type Tool, type ToolContext } from '../registry';
import { growOptions, modeCursor, modeFor, modeSegment, nudgeSelectionKey } from './select-common';
import { EdgeMap, liveWire, snapToEdge } from '../../engine/livewire';

/* The Magnetic Lasso (1.49.4, the owner's tool list): the segment from the last fastening point to the
   pointer follows the strongest edge within Width; points fasten themselves as the trace grows (Frequency), and a
   click fastens one; Contrast is the weakest edge that counts. The edge map is made once per trace from the image. */
const mag = { width: 10, contrast: 10, frequency: 57, pressure: false };
let edges: EdgeMap | null = null, live: Pt[] = [], fasteners: number[] = [], pending: Pt | null = null, frame = 0, pressure = 0;
/** Width the trace looks for an edge in: with Pen Pressure on, a harder press narrows it (half at full pressure) and a lighter one widens it. */
const reach = (): number => (mag.pressure && pressure > 0 ? Math.max(1, Math.round(mag.width * (1.5 - Math.min(1, pressure)))) : mag.width);
const fastenEvery = (): number => Math.round(12 + (100 - mag.frequency) * 1.2);   // in pixels along the trace
function edgeMapOf(ctx: ToolContext): EdgeMap | null {
  const c = ctx.engine.flattened?.(); if (!c) return null;
  const d = (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height);
  return EdgeMap.fromRGBA(d.data, c.width, c.height, mag.contrast / 100);
}
/** The live segment to the pointer; fastening a point each time the trace grows past the spacing. */
function trace(ctx: ToolContext, at: Pt): void {
  if (!edges || !pts.length) return;
  const w = reach(), to = snapToEdge(edges, at, w), margin = w * 2 + 8;
  live = liveWire(edges, pts[pts.length - 1], to, margin);
  const every = fastenEvery();
  while (live.length > every + 1) { pts.push(...live.slice(1, every + 1)); fasteners.push(pts.length - 1); live = liveWire(edges, pts[pts.length - 1], to, margin); }
  ctx.engine.emit('overlay', null);
}
function traceSoon(ctx: ToolContext, at: Pt): void {
  pending = at;
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; if (pending) trace(ctx, pending); });
}

let pts: Pt[] = [];
let mode: SelectionMode = 'replace';
let active = false;
/** Freehand outline switched to straight segments by releasing the mouse with Alt held (Alt was not held at the press). */
let poly = false, pressAlt = false;
let hover: Pt | null = null;

function reset(ctx: ToolContext): void { pts = []; live = []; fasteners = []; edges = null; active = false; poly = false; ctx.engine.emit('overlay', null); }

/** Turns the finished outline into a selection in the mode chosen at its start. */
function commit(ctx: ToolContext): void {
  const e = ctx.engine, doc = e.current?.doc;
  const poly = ctx.engine.lassoKind === 'magnetic' ? [...pts, ...live.slice(1)] : pts;
  reset(ctx);
  if (!doc || poly.length < 3) return;
  const hard = SelectionMask.fromPath(doc.width, doc.height, boundsOf(poly), (c) => {
    c.beginPath();
    poly.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.closePath();
    c.fill();
  }, e.selectionAntialiased);
  const mask = hard && e.lassoFeather > 0 ? e.featherMask(hard, e.lassoFeather) : hard;
  e.applySelection(mask, mode, e.lassoKind === 'polygonal' ? 'Polygonal Lasso' : e.lassoKind === 'magnetic' ? 'Magnetic Lasso' : 'Lasso');
}

export const lassoTool: Tool = {
  id: 'lasso', label: 'Lasso', key: 'L', order: 30,
  icon: (e) => (e.lassoKind === 'polygonal' ? 'tPolyLasso' : e.lassoKind === 'magnetic' ? 'tMagLasso' : 'tLasso'),
  variants: (e) => [
    { id: 'freehand', label: 'Lasso', icon: 'tLasso', active: () => e.lassoKind !== 'polygonal', pick: () => e.update({ lassoKind: 'freehand' }) },
    { id: 'polygonal', label: 'Polygonal Lasso', icon: 'tPolyLasso', active: () => e.lassoKind === 'polygonal', pick: () => e.update({ lassoKind: 'polygonal' }) },
    { id: 'magnetic', label: 'Magnetic Lasso', icon: 'tMagLasso', active: () => e.lassoKind === 'magnetic', pick: () => e.update({ lassoKind: 'magnetic' }) },
  ],
  hint: (e) => (e.lassoKind === 'magnetic'
    ? 'Click an edge, then move along it: points fasten themselves · Click to fasten one · Click the start, double-click or press Enter to close · Backspace removes the last point · Escape cancels'
    : e.lassoKind === 'polygonal'
    ? 'Click the corners · Click the start, double-click or press Enter to close · Backspace removes the last corner · Escape cancels · Shift+L switches mode'
    : 'Drag around an area · Shift adds · Alt subtracts · Release the mouse with Alt held to click straight segments · A click deselects · Shift+L switches to polygonal'),
  cursor: (ctx, p) => modeCursor(ctx.engine, p),
  down(ctx, p) {
    const e = ctx.engine;
    if (!e.current || p.button !== 0) return;
    if (e.lassoKind === 'magnetic' && !active) {
      mode = modeFor(e, p); edges = edgeMapOf(ctx);
      pts = [edges ? snapToEdge(edges, p.doc, mag.width) : p.doc]; fasteners = [0]; live = []; active = true; e.emit('overlay', null); return;
    }
    if (e.lassoKind === 'freehand' && active && poly) { pts.push(p.doc); poly = p.alt; e.emit('overlay', null); return; }
    if (e.lassoKind === 'freehand' || !active) { mode = modeFor(e, p); pressAlt = p.alt; pts = [p.doc]; active = true; e.emit('overlay', null); return; }
    const first = ctx.view().toScreen(pts[0]);
    // Closing: a double-click, a click on the start, or (Magnetic) a click that snaps to the start (the start itself was
    // snapped onto the edge, so it need not be where the first click landed).
    const home = Math.max(3, mag.width * 0.6);   // near the start, in document pixels
    const snapsHome = e.lassoKind === 'magnetic' && !!edges && ((q) => Math.hypot(q.x - pts[0].x, q.y - pts[0].y) <= home)(snapToEdge(edges, p.doc, mag.width));
    if (p.clicks >= 2 || snapsHome || Math.hypot(first.x - p.screen.x, first.y - p.screen.y) <= (e.lassoKind === 'magnetic' ? 8 : 6)) { commit(ctx); return; }
    if (e.lassoKind === 'magnetic' && p.alt) { pts.push(p.doc); live = []; fasteners.push(pts.length - 1); e.emit('overlay', null); return; }   // Alt-click: a straight segment, off the edge
    if (e.lassoKind === 'magnetic') { pressure = p.pressure; trace(ctx, p.doc); pts.push(...live.slice(1)); live = []; fasteners.push(pts.length - 1); e.emit('overlay', null); return; }   // a click fastens
    pts.push(p.doc);
    e.emit('overlay', null);
  },
  move(ctx, p) {
    hover = p.doc;
    if (ctx.engine.lassoKind === 'magnetic' && active) { pressure = p.pressure; traceSoon(ctx, p.doc); return; }
    if (!active || ctx.engine.lassoKind !== 'freehand' || poly) return;
    const last = ctx.view().toScreen(pts[pts.length - 1]);
    if (Math.hypot(last.x - p.screen.x, last.y - p.screen.y) < 2) return;
    pts.push(p.doc);
    ctx.engine.emit('overlay', null);
  },
  up(ctx, p) {
    if (!active || ctx.engine.lassoKind !== 'freehand') return;
    if (p.alt && (poly || (!pressAlt && pts.length >= 2))) { poly = true; ctx.engine.emit('overlay', null); return; }
    if (pts.length < 3 && mode === 'replace') { reset(ctx); ctx.engine.deselect(); return; }
    commit(ctx);
  },
  hover(ctx, p) { hover = p?.doc ?? null; if (active && ctx.engine.lassoKind === 'magnetic' && hover) traceSoon(ctx, hover); else if (active) ctx.engine.emit('overlay', null); },
  keydown(ctx, e) {
    if (!active || ctx.engine.lassoKind === 'freehand') return nudgeSelectionKey(ctx, e);
    if (ctx.engine.lassoKind === 'magnetic' && (e.key === 'Backspace' || e.key === 'Delete')) {
      if (fasteners.length > 1) { fasteners.pop(); pts.length = fasteners[fasteners.length - 1] + 1; live = []; if (hover) trace(ctx, hover); } else reset(ctx);
      ctx.engine.emit('overlay', null);
      return true;
    }
    if (e.key === 'Enter') { commit(ctx); return true; }
    if (e.key === 'Escape') { reset(ctx); return true; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      pts.pop();
      if (!pts.length) active = false;
      ctx.engine.emit('overlay', null);
      return true;
    }
    return false;
  },
  cancel(ctx) { reset(ctx); },
  overlay(ctx, g) {
    if (!active || !pts.length) return;
    const v = ctx.view();
    const screen = pts.map((q) => v.toScreen(q));
    if ((ctx.engine.lassoKind === 'polygonal' || poly) && hover) screen.push(v.toScreen(hover));
    if (ctx.engine.lassoKind === 'magnetic') for (const q of live.slice(1)) screen.push(v.toScreen(q));
    dashed(ctx, g, () => {
      screen.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
    });
    if (ctx.engine.lassoKind === 'magnetic') {   // the fastening points, small squares
      const pal = ctx.paint();
      g.save(); g.fillStyle = pal.handle; g.strokeStyle = pal.antsA;
      for (const i of fasteners) { const q = v.toScreen(pts[i]); g.fillRect(Math.round(q.x) - 2.5, Math.round(q.y) - 2.5, 5, 5); g.strokeRect(Math.round(q.x) - 2.5, Math.round(q.y) - 2.5, 5, 5); }
      g.restore();
    }
  },
  options: (e) => [
    { kind: 'title', text: 'Lasso' },
    { kind: 'segment', label: 'Kind', priority: 45, choices: [{ id: 'freehand', label: 'Freehand' }, { id: 'polygonal', label: 'Polygonal' }, { id: 'magnetic', label: 'Magnetic' }], get: () => e.lassoKind, set: (v) => e.update({ lassoKind: v as 'freehand' | 'polygonal' | 'magnetic' }) },
    { kind: 'range', label: 'Feather', priority: 70, min: 0, max: 250, unit: 'px', get: () => e.lassoFeather, set: (v: number) => { e.lassoFeather = Math.max(0, Math.min(250, v)); e.emit('options', null); } },
    ...(e.lassoKind === 'magnetic' ? [
      { kind: 'range' as const, label: 'Width', priority: 65, min: 1, max: 256, unit: 'px', get: () => mag.width, set: (v: number) => { mag.width = Math.max(1, Math.min(256, Math.round(v))); e.emit('options', null); } },
      { kind: 'range' as const, label: 'Contrast', priority: 62, min: 1, max: 100, unit: '%', get: () => mag.contrast, set: (v: number) => { mag.contrast = Math.max(1, Math.min(100, Math.round(v))); edges = null; e.emit('options', null); } },
      { kind: 'toggle' as const, label: 'Pen Pressure', priority: 58, get: () => mag.pressure, set: (v: boolean) => { mag.pressure = v; e.emit('options', null); } },
      { kind: 'range' as const, label: 'Frequency', priority: 60, min: 0, max: 100, unit: '', get: () => mag.frequency, set: (v: number) => { mag.frequency = Math.max(0, Math.min(100, Math.round(v))); e.emit('options', null); } },
    ] : []),
    { kind: 'toggle', label: 'Anti-alias', priority: 40, get: () => e.selectionAntialiased, set: (v) => { e.selectionAntialiased = v; e.emit('options', null); } },
    modeSegment(e),
    { kind: 'button', label: 'Deselect', priority: 30, run: () => toolHost.run('deselect'), when: () => !!e.current?.selection },
    { kind: 'button', label: 'Feather Selection...', priority: 28, run: () => toolHost.run('feather'), when: () => !!e.current?.selection },
    ...growOptions(e),
    { kind: 'button', label: 'Select and Mask...', priority: 25, run: () => toolHost.run('select-and-mask') }
  ],
};
