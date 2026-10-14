import type { DocSlice, Pt, Rect } from '../../engine';
import { type Tool } from '../registry';

/** The slices in reading order (top to bottom, then left to right), which is how they are numbered. */
export const readingOrder = (list: readonly DocSlice[]): DocSlice[] => [...list].sort((a, b) => a.y - b.y || a.x - b.x);

/** Draws user slices as solid rectangles with their numbers; the screen position is pan + document position * zoom. */
export function drawSlices(g: CanvasRenderingContext2D, list: readonly DocSlice[], panX: number, panY: number, zoom: number, color: string, active: string | null = null): void {
  g.save();
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
  },
  keydown(ctx, e) {
    if (e.key === 'Escape' && drag) { drag = null; ctx.engine.emit('overlay', null); return true; }
    return false;
  },
  cancel(ctx) { drag = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    const p = ctx.engine.current;
    if (!p) return;
    const v = p.viewport, pal = ctx.paint();
    drawSlices(g, p.doc.slices ?? [], v.panX, v.panY, v.zoom, pal.accent, ctx.engine.activeSlice);
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
    { kind: 'button', label: 'Clear Slices', icon: 'close', run: () => e.clearSlices() },
  ],
};
