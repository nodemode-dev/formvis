import type { DocSlice, Pt, Rect } from '../../engine';
import { type Tool } from '../registry';

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
export function drawSlices(g: CanvasRenderingContext2D, list: readonly DocSlice[], panX: number, panY: number, zoom: number, color: string, active: string | null = null, docSize: { width: number; height: number } | null = null): void {
  g.save();
  if (docSize && list.length) {
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

/** The rectangle being dragged, in document coordinates, or null. */
let drag: { start: Pt; now: Pt; square: boolean; move?: DocSlice } | null = null;

function rectOf(d: { start: Pt; now: Pt; square: boolean; move?: DocSlice }): Rect {
  if (d.move) return { x: d.move.x + d.now.x - d.start.x, y: d.move.y + d.now.y - d.start.y, w: d.move.w, h: d.move.h };
  let dx = d.now.x - d.start.x, dy = d.now.y - d.start.y;
  if (d.square) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
  return { x: Math.min(d.start.x, d.start.x + dx), y: Math.min(d.start.y, d.start.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

export const sliceTool: Tool = {
  id: 'slice', label: 'Slice', key: 'C', order: 46,
  icon: () => 'tCrop',
  hint: () => 'Drag a rectangle to add a slice · Shift makes it square · Slices are numbered in reading order',
  cursor: () => 'crosshair',
  down(ctx, p) {
    if (p.button !== 0 || !ctx.engine.current) return;
    // Slice Select: a press inside an existing slice (the topmost) selects it and a drag moves it; a press outside every slice starts a new one.
    const hit = [...(ctx.engine.current.doc.slices ?? [])].reverse().find((s) => p.doc.x >= s.x && p.doc.x < s.x + s.w && p.doc.y >= s.y && p.doc.y < s.y + s.h);
    if (hit) ctx.engine.activeSlice = hit.id;
    drag = { start: p.doc, now: p.doc, square: p.shift, ...(hit ? { move: hit } : {}) };
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
      if (r.x !== moved.x || r.y !== moved.y) ctx.engine.updateSlice(moved.id, { x: r.x, y: r.y }, 'Move Slice');
    } else if (ctx.engine.addSlice(r)) {
      const made = ctx.engine.current?.doc.slices?.at(-1);
      if (made) ctx.engine.activeSlice = made.id;
    }
    ctx.engine.emit('overlay', null);
    ctx.engine.emit('options', null);
  },
  keydown(ctx, e) {
    if (e.key === 'Escape' && drag) { drag = null; ctx.engine.emit('overlay', null); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !drag && !e.metaKey && !e.ctrlKey && !e.altKey) return ctx.engine.deleteActiveSlice();
    return false;
  },
  cancel(ctx) { drag = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    const p = ctx.engine.current;
    if (!p) return;
    const v = p.viewport, pal = ctx.paint();
    drawSlices(g, p.doc.slices ?? [], v.panX, v.panY, v.zoom, pal.accent, ctx.engine.activeSlice, p.doc);
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
    { kind: 'title', text: 'Slice' },
    { kind: 'readout', label: 'Slices', get: () => String(e.current?.doc.slices?.length ?? 0) },
    { kind: 'button', label: 'Delete Slice', icon: 'close', run: () => { e.deleteActiveSlice(); }, when: () => !!e.current?.doc.slices?.some((s) => s.id === e.activeSlice) },
    { kind: 'button', label: 'Clear Slices', icon: 'close', run: () => e.clearSlices() },
  ],
};
