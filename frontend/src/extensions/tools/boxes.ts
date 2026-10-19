import type { BoxKind, DocBox, ID, Pt, Rect } from '../../engine/types';
import { BOX_KINDS, MIN_BOX, cropFor, cycleBox, fitRect, kindLabel } from '../../engine/boxes';
import type { OptionSpec, Tool, ToolContext } from '../registry';

/** The Generate panel's description editor, connected by the panel: opens it over the canvas for a box. */
export const boxEditHost = { open: (id: ID, at: { left: number; top: number; width: number }): void => { void id; void at; } };

const HANDLE = 6;
const KIND_COLOUR: Record<BoxKind, string> = { new: '#4fa3ff', keep: '#4cc38a', move: '#f5c542', remove: '#ef5b5b', reference: '#b57cf0', text: '#f08a3c' };
const EDGES: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];

type Drag =
  | { mode: 'draw'; from: Pt; rect: Rect }
  | { mode: 'move'; id: ID; from: Pt; start: Rect; rect: Rect; moved: boolean }
  | { mode: 'resize'; id: ID; handle: number; start: Rect; rect: Rect };
let drag: Drag | null = null;
let kind: BoxKind = 'new';
let canvasEl: HTMLCanvasElement | null = null;

const boxes = (ctx: ToolContext): readonly DocBox[] => ctx.engine.current?.doc.boxes ?? [];
const dims = (ctx: ToolContext): { W: number; H: number } => ({ W: ctx.engine.current?.doc.width ?? 0, H: ctx.engine.current?.doc.height ?? 0 });

function handleAt(ctx: ToolContext, b: Rect, at: Pt): number {
  const v = ctx.view();
  for (let i = 0; i < EDGES.length; i++) {
    const q = v.toScreen({ x: b.x + b.w * EDGES[i][0], y: b.y + b.h * EDGES[i][1] });
    if (Math.abs(q.x - at.x) <= HANDLE && Math.abs(q.y - at.y) <= HANDLE) return i;
  }
  return -1;
}
/** The box under a document point: the smallest, so a box inside another can be picked. */
function boxAt(list: readonly DocBox[], p: Pt): DocBox | undefined {
  return list.filter((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
}
function resized(start: Rect, handle: number, to: Pt): Rect {
  const [ex, ey] = EDGES[handle];
  let x0 = start.x, y0 = start.y, x1 = start.x + start.w, y1 = start.y + start.h;
  if (ex === 0) x0 = Math.min(to.x, x1 - MIN_BOX); else if (ex === 1) x1 = Math.max(to.x, x0 + MIN_BOX);
  if (ey === 0) y0 = Math.min(to.y, y1 - MIN_BOX); else if (ey === 1) y1 = Math.max(to.y, y0 + MIN_BOX);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const clampPt = (p: Pt, W: number, H: number): Pt => ({ x: Math.min(W, Math.max(0, p.x)), y: Math.min(H, Math.max(0, p.y)) });

/** Opens the description editor over the canvas for a box. */
function edit(ctx: ToolContext, id: ID): void {
  const b = boxes(ctx).find((x) => x.id === id);
  if (!b || !canvasEl) return;
  const v = ctx.view(), r = canvasEl.getBoundingClientRect(), a = v.toScreen({ x: b.x, y: b.y }), c = v.toScreen({ x: b.x + b.w, y: b.y + b.h });
  boxEditHost.open(id, { left: r.left + a.x, top: r.top + Math.min(c.y + 4, r.height - 30), width: Math.max(160, c.x - a.x) });
}

/** Boxes: draw rectangles on the picture and say what each is for; Generate writes them into the prompt. */
export const boxesTool: Tool = {
  id: 'boxes', label: 'Boxes', key: 'I', order: 80.9,
  icon: () => 'tBoxes',
  hint: () => 'Drag to draw a box · Click one to select it, drag to move, drag a handle to resize · Double-click or Enter to describe it · Delete, Mod+D, arrows, Tab',
  cursor: () => 'crosshair',
  down(ctx, p) {
    const e = ctx.engine;
    if (p.button !== 0 || !e.current) return;
    const { W, H } = dims(ctx), list = boxes(ctx), active = list.find((b) => b.id === e.activeBox);
    if (active) {
      const h = handleAt(ctx, active, p.screen);
      if (h >= 0) { drag = { mode: 'resize', id: active.id, handle: h, start: { x: active.x, y: active.y, w: active.w, h: active.h }, rect: { x: active.x, y: active.y, w: active.w, h: active.h } }; return; }
    }
    const hit = boxAt(list, p.doc);
    if (hit) {
      e.selectBox(hit.id);
      if (p.clicks >= 2) { edit(ctx, hit.id); return; }
      const r = { x: hit.x, y: hit.y, w: hit.w, h: hit.h };
      drag = { mode: 'move', id: hit.id, from: p.doc, start: r, rect: r, moved: false };
      return;
    }
    e.selectBox(null);
    const from = clampPt(p.doc, W, H);
    drag = { mode: 'draw', from, rect: { x: from.x, y: from.y, w: 0, h: 0 } };
  },
  move(ctx, p) {
    const d = drag;
    if (!d) return;
    const { W, H } = dims(ctx);
    if (d.mode === 'draw') {
      const q = clampPt(p.doc, W, H);
      d.rect = { x: Math.min(d.from.x, q.x), y: Math.min(d.from.y, q.y), w: Math.abs(q.x - d.from.x), h: Math.abs(q.y - d.from.y) };
    } else if (d.mode === 'move') {
      const a = ctx.view().toScreen(d.from), b = ctx.view().toScreen(p.doc);
      if (!d.moved && Math.hypot(b.x - a.x, b.y - a.y) < 3) return;
      d.moved = true;
      d.rect = fitRect({ ...d.start, x: d.start.x + p.doc.x - d.from.x, y: d.start.y + p.doc.y - d.from.y }, W, H);
    } else d.rect = resized(d.start, d.handle, clampPt(p.doc, W, H));
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    const d = drag;
    drag = null;
    if (!d) return;
    const e = ctx.engine;
    if (d.mode === 'draw') { if (d.rect.w >= MIN_BOX && d.rect.h >= MIN_BOX) e.addBox(d.rect, kind); }
    else if (d.mode === 'move') { if (d.moved) e.setBox(d.id, { x: d.rect.x, y: d.rect.y }, 'Move Box'); }
    else e.setBox(d.id, d.rect, 'Resize Box');
    e.emit('overlay', null);
  },
  cancel(ctx) { drag = null; ctx.engine.emit('overlay', null); },
  keydown(ctx, ev) {
    const e = ctx.engine, list = boxes(ctx), id = e.activeBox, b = list.find((x) => x.id === id);
    const mod = ev.metaKey || ev.ctrlKey;
    if (ev.key === 'Tab') { const next = cycleBox(list, id, ev.shiftKey); if (!next) return false; e.selectBox(next); return true; }
    if (ev.key === 'Escape') { if (!id) return false; e.selectBox(null); return true; }
    if (!b) return false;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { e.removeBox(b.id); return true; }
    if (mod && ev.key.toLowerCase() === 'd') { e.duplicateBox(b.id); return true; }
    if (ev.key === 'Enter') { edit(ctx, b.id); return true; }
    const step = ev.shiftKey ? 10 : 1, dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0, dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0;
    if (dx || dy) { e.setBox(b.id, { x: b.x + dx, y: b.y + dy }, 'Nudge Box'); return true; }
    return false;
  },
  overlay(ctx, g) {
    canvasEl = g.canvas;
    const e = ctx.engine, v = ctx.view(), pal = ctx.paint(), p = e.current;
    if (!p) return;
    const live = new Map<ID, Rect>();
    if (drag && drag.mode !== 'draw') live.set(drag.id, drag.rect);
    g.save();
    g.font = '600 12px Inter, system-ui, sans-serif';
    g.textBaseline = 'top';
    for (const b of p.doc.boxes ?? []) {
      const r = live.get(b.id) ?? b, a = v.toScreen({ x: r.x, y: r.y }), c = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
      const on = b.id === e.activeBox, col = KIND_COLOUR[b.kind];
      g.fillStyle = col + '22';
      g.fillRect(a.x, a.y, c.x - a.x, c.y - a.y);
      g.lineWidth = on ? 2 : 1.5;
      g.strokeStyle = col;
      g.setLineDash(b.kind === 'keep' ? [6, 4] : []);
      g.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);
      g.setLineDash([]);
      const label = `${b.name}${b.text ? `: ${b.text.replace(/\s+/g, ' ')}` : ''}`, room = Math.max(0, c.x - a.x - 8);
      if (room > 24) {
        let s = label;
        while (s.length > 1 && g.measureText(s).width > room) s = s.slice(0, -2) + '…';
        const wd = Math.min(room + 8, g.measureText(s).width + 8);
        g.fillStyle = col; g.fillRect(a.x, a.y, wd, 17);
        g.fillStyle = '#0d1117'; g.fillText(s, a.x + 4, a.y + 2);
      }
      if (on) {
        const k = cropFor(r, p.doc.width, p.doc.height), ka = v.toScreen({ x: k.x, y: k.y }), kc = v.toScreen({ x: k.x + k.w, y: k.y + k.h });
        g.strokeStyle = pal.antsA; g.lineWidth = 1; g.setLineDash([3, 4]);
        g.strokeRect(ka.x, ka.y, kc.x - ka.x, kc.y - ka.y);
        g.setLineDash([]);
        g.fillStyle = pal.handle; g.strokeStyle = pal.accent; g.lineWidth = 1;
        for (const [fx, fy] of EDGES) {
          const q = v.toScreen({ x: r.x + r.w * fx, y: r.y + r.h * fy });
          g.fillRect(q.x - 4, q.y - 4, 8, 8); g.strokeRect(q.x - 4, q.y - 4, 8, 8);
        }
      }
    }
    if (drag?.mode === 'draw' && drag.rect.w > 0) {
      const r = drag.rect, a = v.toScreen({ x: r.x, y: r.y }), c = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
      g.strokeStyle = KIND_COLOUR[kind]; g.lineWidth = 1.5; g.setLineDash([5, 4]);
      g.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);
    }
    g.restore();
  },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Boxes' },
    { kind: 'select', label: 'Kind', choices: BOX_KINDS, get: () => kind, set: (id) => { kind = id as BoxKind; const b = e.current?.doc.boxes?.find((x) => x.id === e.activeBox); if (b && b.kind !== kind) e.setBox(b.id, { kind }, 'Box Kind'); } },
    { kind: 'readout', label: 'Boxes', get: () => String(e.current?.doc.boxes?.length ?? 0) },
    { kind: 'readout', label: 'Selected', get: () => { const b = e.current?.doc.boxes?.find((x) => x.id === e.activeBox); return b ? `${kindLabel(b.kind)} ${b.w} x ${b.h}` : 'none'; } },
    { kind: 'button', label: 'From Selection', run: () => { e.boxFromSelection(kind); } },
    { kind: 'button', label: 'Clear', run: () => e.clearBoxes() },
  ],
};
