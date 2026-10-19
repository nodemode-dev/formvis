import type { DocSlice, Pt, Rect } from '../../engine';
import { type Tool, type ToolContext } from '../registry';

/** The slices in reading order (top to bottom, then left to right), which is how they are numbered. */
export const readingOrder = (list: readonly DocSlice[]): DocSlice[] => [...list].sort((a, b) => a.y - b.y || a.x - b.x);

/** Auto slices (29.5 part d): the canvas cut along every user slice edge, the cells no user slice covers merged into horizontal runs per row. */
export function autoSlices(doc: { width: number; height: number; slices?: readonly DocSlice[] }): Rect[] {
  const list = doc.slices ?? [];
  const clampTo = (v: number, max: number) => Math.min(max, Math.max(0, v));
  const xs = [...new Set([0, doc.width, ...list.flatMap((s) => [clampTo(s.x, doc.width), clampTo(s.x + s.w, doc.width)])])].sort((a, b) => a - b);
  const ys = [...new Set([0, doc.height, ...list.flatMap((s) => [clampTo(s.y, doc.height), clampTo(s.y + s.h, doc.height)])])].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const y = ys[j]!, h = ys[j + 1]! - y;
    let runStart = -1;
    for (let i = 0; i <= xs.length - 1; i++) {
      const x = xs[i]!;
      const free = i < xs.length - 1 && !list.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
      if (free && runStart < 0) runStart = x;
      else if (!free && runStart >= 0) { out.push({ x: runStart, y, w: x - runStart, h }); runStart = -1; }
    }
  }
  return out;
}

/** Draws user slices as solid rectangles with their numbers, and the auto slices dashed and dim beneath; the screen position is pan + document position * zoom. */
export function drawSlices(g: CanvasRenderingContext2D, list: readonly DocSlice[], panX: number, panY: number, zoom: number, color: string, active: string | null = null, docSize: { width: number; height: number } | null = null, showAuto = true): void {
  g.save();
  if (docSize && list.length && showAuto) {
    g.globalAlpha = 0.5;
    g.setLineDash([3, 3]);
    g.strokeStyle = color;
    for (const a of autoSlices({ ...docSize, slices: list })) {
      const x0 = Math.round(panX + a.x * zoom) + 0.5, y0 = Math.round(panY + a.y * zoom) + 0.5;
      g.strokeRect(x0, y0, Math.round(panX + (a.x + a.w) * zoom) - Math.round(panX + a.x * zoom), Math.round(panY + (a.y + a.h) * zoom) - Math.round(panY + a.y * zoom));
    }
    g.setLineDash([]);
    g.globalAlpha = 1;
  }
  g.lineWidth = 1;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.font = '11px sans-serif';
  g.textBaseline = 'top';
  readingOrder(list).forEach((s, i) => {
    const x0 = Math.round(panX + s.x * zoom) + 0.5, y0 = Math.round(panY + s.y * zoom) + 0.5;
    const x1 = Math.round(panX + (s.x + s.w) * zoom) + 0.5, y1 = Math.round(panY + (s.y + s.h) * zoom) + 0.5;
    const on = s.id === active;
    g.lineWidth = on ? 2 : 1;   // 29.5: the active slice, thicker and with corner handles
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    if (on) for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) g.fillRect(cx - 3, cy - 3, 6, 6);
    g.fillText(String(i + 1).padStart(2, '0'), x0 + 3, y0 + 3);
  });
  g.restore();
}

/** Which sides of a slice a resize drag moves. */
interface Edge { l: boolean; r: boolean; t: boolean; b: boolean }
interface SliceDrag { start: Pt; now: Pt; square: boolean; move?: DocSlice; edge?: Edge }

/** The rectangle being dragged, in document coordinates, or null. */
let drag: SliceDrag | null = null;
/** The Slice tool draws new slices; the Slice Select tool (a mode of the same key) selects, moves and resizes them. */
let mode: 'slice' | 'select' = 'slice';
/** The Slice tool's Style: free, a fixed aspect ratio (width : height) or a fixed size in pixels. */
let style: 'normal' | 'ratio' | 'size' = 'normal';
const fixed = { rw: 1, rh: 1, w: 100, h: 100 };
const HANDLE = 6;

function rectOf(d: SliceDrag): Rect {
  const dx0 = d.now.x - d.start.x, dy0 = d.now.y - d.start.y;
  if (d.move && d.edge) {
    const s = d.move, e = d.edge, x = s.x + (e.l ? dx0 : 0), y = s.y + (e.t ? dy0 : 0);
    const r = s.x + s.w + (e.r ? dx0 : 0), b = s.y + s.h + (e.b ? dy0 : 0);
    return { x: Math.min(x, r - 1), y: Math.min(y, b - 1), w: Math.max(1, r - Math.min(x, r - 1)), h: Math.max(1, b - Math.min(y, b - 1)) };
  }
  if (d.move) return { x: d.move.x + dx0, y: d.move.y + dy0, w: d.move.w, h: d.move.h };
  let dx = dx0, dy = dy0;
  if (style === 'size') { dx = fixed.w * (dx0 < 0 ? -1 : 1); dy = fixed.h * (dy0 < 0 ? -1 : 1); }
  else if (style === 'ratio' && fixed.rw > 0 && fixed.rh > 0) dy = Math.sign(dy0 || 1) * Math.abs(dx0) * (fixed.rh / fixed.rw);
  else if (d.square) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
  return { x: Math.min(d.start.x, d.start.x + dx), y: Math.min(d.start.y, d.start.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

/** The sides of `s` the screen point is on (corners give two), within a few pixels, or null. */
function edgeAt(ctx: ToolContext, s: DocSlice, screen: Pt): Edge | null {
  const v = ctx.view(), a = v.toScreen({ x: s.x, y: s.y }), b = v.toScreen({ x: s.x + s.w, y: s.y + s.h });
  if (screen.x < a.x - HANDLE || screen.x > b.x + HANDLE || screen.y < a.y - HANDLE || screen.y > b.y + HANDLE) return null;
  const e = { l: Math.abs(screen.x - a.x) <= HANDLE, r: Math.abs(screen.x - b.x) <= HANDLE, t: Math.abs(screen.y - a.y) <= HANDLE, b: Math.abs(screen.y - b.y) <= HANDLE };
  return e.l || e.r || e.t || e.b ? e : null;
}

export const sliceTool: Tool = {
  id: 'slice', label: 'Slice', key: 'C', order: 46,
  icon: () => 'tCrop',
  variants: (e) => [
    { id: 'slice', label: 'Slice', icon: 'tCrop', active: () => mode === 'slice', pick: () => { mode = 'slice'; e.emit('options', null); e.emit('overlay', null); } },
    { id: 'select', label: 'Slice Select', icon: 'tCrop', active: () => mode === 'select', pick: () => { mode = 'select'; e.emit('options', null); e.emit('overlay', null); } },
  ],
  hint: (e) => (e.view.slicesLocked ? 'Slices are locked · View > Lock Slices unlocks them'
    : mode === 'select' ? 'Click a slice to select it · Drag it to move · Drag an edge or corner to resize · Delete removes it'
    : 'Drag a rectangle to add a slice · Shift makes it square · Slices are numbered in reading order'),
  cursor: (ctx, p) => {
    if (ctx.engine.view.slicesLocked) return 'not-allowed';
    if (mode === 'slice') return 'crosshair';
    const s = ctx.engine.current?.doc.slices?.find((x) => x.id === ctx.engine.activeSlice), e = s && p ? edgeAt(ctx, s, p.screen) : null;
    if (!e) return 'default';
    return (e.l && e.t) || (e.r && e.b) ? 'nwse-resize' : (e.r && e.t) || (e.l && e.b) ? 'nesw-resize' : e.l || e.r ? 'ew-resize' : 'ns-resize';
  },
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current || ctx.engine.view.slicesLocked) return;
    const list = ctx.engine.current.doc.slices ?? [];
    if (mode === 'slice') {
      drag = { start: p.doc, now: p.doc, square: p.shift };
    } else {
      // Slice Select: an edge of the selected slice resizes it; a press inside a slice (the topmost) selects it and a drag moves it; empty canvas selects none.
      const cur = list.find((s) => s.id === ctx.engine.activeSlice), edge = cur ? edgeAt(ctx, cur, p.screen) : null;
      const hit = edge ? cur : [...list].reverse().find((s) => p.doc.x >= s.x && p.doc.x < s.x + s.w && p.doc.y >= s.y && p.doc.y < s.y + s.h);
      if (!hit) { ctx.engine.activeSlice = null; ctx.engine.emit('overlay', null); ctx.engine.emit('options', null); return; }
      ctx.engine.activeSlice = hit.id;
      drag = { start: p.doc, now: p.doc, square: false, move: hit, ...(edge ? { edge } : {}) };
    }
    ctx.engine.emit('overlay', null);
    ctx.engine.emit('options', null);
  },
  move(ctx, p) {
    if (!drag) return;
    drag.now = p.doc;
    drag.square = p.shift;
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    if (!drag) return;
    const r = rectOf(drag), moved = drag.move;
    drag = null;
    if (moved) {
      if (r.w !== moved.w || r.h !== moved.h) ctx.engine.updateSlice(moved.id, { x: r.x, y: r.y, w: r.w, h: r.h }, 'Resize Slice');
      else if (r.x !== moved.x || r.y !== moved.y) ctx.engine.updateSlice(moved.id, { x: r.x, y: r.y }, 'Move Slice');
    } else if (ctx.engine.addSlice(r)) {
      const made = ctx.engine.current?.doc.slices?.at(-1);
      if (made) ctx.engine.activeSlice = made.id;
    }
    ctx.engine.emit('overlay', null);
    ctx.engine.emit('options', null);
  },
  keydown(ctx, e) {
    if (e.key === 'Escape' && drag) { drag = null; ctx.engine.emit('overlay', null); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !drag && !e.metaKey && !e.ctrlKey && !e.altKey) return ctx.engine.view.slicesLocked ? false : ctx.engine.deleteActiveSlice();
    return false;
  },
  cancel(ctx) { drag = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    const p = ctx.engine.current;
    if (!p) return;
    const v = p.viewport, pal = ctx.paint();
    drawSlices(g, p.doc.slices ?? [], v.panX, v.panY, v.zoom, pal.accent, ctx.engine.activeSlice, p.doc, ctx.engine.view.autoSlices);
    if (drag) {
      const r = rectOf(drag), a = ctx.view().toScreen({ x: r.x, y: r.y }), b = ctx.view().toScreen({ x: r.x + r.w, y: r.y + r.h });
      g.save();
      g.setLineDash([4, 3]);
      g.strokeStyle = pal.accent;
      g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x) - Math.round(a.x), Math.round(b.y) - Math.round(a.y));
      g.restore();
    }
  },
  options: (e) => [
    { kind: 'title', text: mode === 'select' ? 'Slice Select' : 'Slice' },
    { kind: 'select', label: 'Style', choices: [{ id: 'normal', label: 'Normal' }, { id: 'ratio', label: 'Fixed Aspect Ratio' }, { id: 'size', label: 'Fixed Size' }], get: () => style, set: (id) => { style = id === 'ratio' || id === 'size' ? id : 'normal'; e.emit('options', null); }, when: () => mode === 'slice' },
    { kind: 'number', label: 'Width', min: 1, max: 10000, step: 1, get: () => (style === 'size' ? fixed.w : fixed.rw), set: (v) => { if (style === 'size') fixed.w = Math.max(1, Math.round(v)); else fixed.rw = Math.max(0.01, v); }, when: () => mode === 'slice' && style !== 'normal' },
    { kind: 'number', label: 'Height', min: 1, max: 10000, step: 1, get: () => (style === 'size' ? fixed.h : fixed.rh), set: (v) => { if (style === 'size') fixed.h = Math.max(1, Math.round(v)); else fixed.rh = Math.max(0.01, v); }, when: () => mode === 'slice' && style !== 'normal' },
    { kind: 'readout', label: 'Slices', get: () => String(e.current?.doc.slices?.length ?? 0) },
    { kind: 'toggle', label: 'Show Auto Slices', get: () => e.view.autoSlices, set: (v) => e.setView({ autoSlices: v }) },
    { kind: 'toggle', label: 'Lock Slices', get: () => e.view.slicesLocked, set: (v) => e.setView({ slicesLocked: v }) },
    { kind: 'button', label: 'Slices From Guides', icon: 'tCrop', run: () => { e.slicesFromGuides(); }, when: () => mode === 'slice' && !e.view.slicesLocked && !!e.current?.doc.guides?.length },
    { kind: 'button', label: 'Delete Slice', icon: 'close', run: () => { e.deleteActiveSlice(); }, when: () => !e.view.slicesLocked && !!e.current?.doc.slices?.some((s) => s.id === e.activeSlice) },
    { kind: 'button', label: 'Clear Slices', icon: 'close', run: () => e.clearSlices(), when: () => !e.view.slicesLocked },
  ],
};
