import type { Pt, Rect } from '../../engine';
import type { OptionSpec, Tool, ToolContext, ToolPointer } from '../registry';

const HANDLE_PX = 5;      // half the size of a resize handle on screen
const PLUS_R = 10;        // radius of a side's "+" button
const PLUS_GAP = 20;      // how far outside a side the "+" button sits
const BESIDE_GAP = 40;    // document pixels between an artboard and the one added beside it
const MIN_SIZE = 8;
const LABEL_H = 16;

const PRESETS = [
  { id: 'iphone', label: 'iPhone 15 (390 x 844)', w: 390, h: 844 },
  { id: 'ipad', label: 'iPad (820 x 1180)', w: 820, h: 1180 },
  { id: 'desktop', label: 'Desktop (1440 x 1024)', w: 1440, h: 1024 },
] as const;

type Side = 'top' | 'right' | 'bottom' | 'left';
type Drag =
  | { mode: 'new'; from: Pt; rect: Rect }
  | { mode: 'move'; id: string; from: Pt; rect0: Rect; rect: Rect }
  | { mode: 'resize'; id: string; handle: number; rect0: Rect; rect: Rect };
type Hit = { kind: 'plus'; id: string; side: Side } | { kind: 'handle'; id: string; handle: number } | { kind: 'label'; id: string } | { kind: 'inside'; id: string } | null;

let drag: Drag | null = null;
let down: Pt | null = null;                         // screen point of the press, to tell a click from a drag
let labels: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];   // label boxes as last drawn, in screen points

/** Handle k, clockwise from the top-left: corners at even k, sides at odd k. Its unit position in the box. */
const HANDLE_UNIT: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
const HANDLE_CURSOR = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];

const rectOf = (a: Pt, b: Pt): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
const clampPt = (p: Pt): Pt => ({ x: Math.max(0, Math.round(p.x)), y: Math.max(0, Math.round(p.y)) });

function selected(ctx: ToolContext): { id: string; r: Rect } | null {
  const l = ctx.engine.activeLayer;
  return l?.isGroup && !l.parentId && l.artboard ? { id: l.id, r: { x: l.artboard.x, y: l.artboard.y, w: l.artboard.w, h: l.artboard.h } } : null;
}

/** Where the "+" button of a side sits, in screen points. */
function plusAt(ctx: ToolContext, r: Rect, side: Side): Pt {
  const v = ctx.view(), a = v.toScreen({ x: r.x, y: r.y }), b = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  return side === 'top' ? { x: cx, y: a.y - PLUS_GAP } : side === 'bottom' ? { x: cx, y: b.y + PLUS_GAP } : side === 'left' ? { x: a.x - PLUS_GAP, y: cy } : { x: b.x + PLUS_GAP, y: cy };
}

/** The rectangle of the artboard added beside `r` on `side`, or null when it would fall off the canvas's top or left. */
function besideRect(r: Rect, side: Side): Rect | null {
  const o = side === 'right' ? { x: r.x + r.w + BESIDE_GAP, y: r.y } : side === 'left' ? { x: r.x - r.w - BESIDE_GAP, y: r.y } : side === 'bottom' ? { x: r.x, y: r.y + r.h + BESIDE_GAP } : { x: r.x, y: r.y - r.h - BESIDE_GAP };
  return o.x < 0 || o.y < 0 ? null : { ...o, w: r.w, h: r.h };
}

function hit(ctx: ToolContext, p: ToolPointer): Hit {
  const v = ctx.view(), sel = selected(ctx), boards = ctx.engine.artboards();
  if (sel) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      if (!besideRect(sel.r, side)) continue;
      const c = plusAt(ctx, sel.r, side);
      if (Math.hypot(c.x - p.screen.x, c.y - p.screen.y) <= PLUS_R) return { kind: 'plus', id: sel.id, side };
    }
    for (let i = 0; i < HANDLE_UNIT.length; i++) {
      const s = v.toScreen({ x: sel.r.x + sel.r.w * HANDLE_UNIT[i][0], y: sel.r.y + sel.r.h * HANDLE_UNIT[i][1] });
      if (Math.abs(s.x - p.screen.x) <= HANDLE_PX + 2 && Math.abs(s.y - p.screen.y) <= HANDLE_PX + 2) return { kind: 'handle', id: sel.id, handle: i };
    }
  }
  for (const b of labels) if (p.screen.x >= b.x && p.screen.x <= b.x + b.w && p.screen.y >= b.y && p.screen.y <= b.y + b.h) return { kind: 'label', id: b.id };
  for (const l of boards) {
    const a = l.artboard;
    if (a && p.doc.x >= a.x && p.doc.x <= a.x + a.w && p.doc.y >= a.y && p.doc.y <= a.y + a.h) return { kind: 'inside', id: l.id };
  }
  return null;
}

/** `r0` with handle `k` dragged to document point `to`; the opposite edges stay, and the box keeps a minimum size. */
function resized(r0: Rect, k: number, to: Pt): Rect {
  const [ux, uy] = HANDLE_UNIT[k];
  let l = r0.x, t = r0.y, r = r0.x + r0.w, b = r0.y + r0.h;
  const x = Math.max(0, Math.round(to.x)), y = Math.max(0, Math.round(to.y));
  if (ux === 0) l = Math.min(x, r - MIN_SIZE); else if (ux === 1) r = Math.max(x, l + MIN_SIZE);
  if (uy === 0) t = Math.min(y, b - MIN_SIZE); else if (uy === 1) b = Math.max(y, t + MIN_SIZE);
  return { x: l, y: t, w: r - l, h: b - t };
}

const sizeId = (ctx: ToolContext | null, e: { activeLayer: { isGroup?: boolean; parentId?: string | null; artboard?: { w: number; h: number } | null } | null }): string => {
  void ctx;
  const a = e.activeLayer?.isGroup && !e.activeLayer.parentId ? e.activeLayer.artboard : null;
  return a ? PRESETS.find((s) => s.w === a.w && s.h === a.h)?.id ?? 'custom' : 'custom';
};

/** The Artboard tool (36.27), V with the Move tool as Photoshop's: drag on empty canvas to make an artboard, click an
 *  artboard's name to select it, drag inside to move it with its contents, the eight handles to resize it and a side's
 *  "+" to add one of the same size beside it. Everything in progress is drawn on the overlay; the engine is touched once,
 *  when the drag ends. */
export const artboardTool: Tool = {
  id: 'artboard', label: 'Artboard', key: 'V', order: 10.5,
  icon: () => 'tArtboard',
  hint: () => 'Drag on empty canvas to make an artboard · Click its name to select it · Drag inside to move it with its contents · Handles resize · "+" adds one beside it',
  cursor(ctx, p) {
    if (drag) return drag.mode === 'move' ? 'move' : drag.mode === 'resize' ? HANDLE_CURSOR[drag.handle] : 'crosshair';
    const h = p ? hit(ctx, p) : null;
    return !h ? 'crosshair' : h.kind === 'handle' ? HANDLE_CURSOR[h.handle] : h.kind === 'plus' || h.kind === 'label' ? 'pointer' : 'move';
  },
  down(ctx, p) {
    const e = ctx.engine;
    if (p.button !== 0 || !e.current) return;
    down = p.screen;
    const h = hit(ctx, p);
    if (!h) { const s = clampPt(p.doc); drag = { mode: 'new', from: s, rect: { x: s.x, y: s.y, w: 0, h: 0 } }; }
    else if (h.kind === 'plus') {
      const sel = selected(ctx), r = sel && besideRect(sel.r, h.side);
      if (r) { const id = e.newArtboard(r); if (id) e.emit('options', null); }
      down = null;
    } else if (h.kind === 'handle') {
      const sel = selected(ctx);
      if (sel) drag = { mode: 'resize', id: h.id, handle: h.handle, rect0: sel.r, rect: sel.r };
    } else {
      e.selectLayer(h.id);
      const l = e.current?.layer(h.id), a = l?.artboard;
      if (h.kind === 'inside' && a) { const r = { x: a.x, y: a.y, w: a.w, h: a.h }; drag = { mode: 'move', id: h.id, from: p.doc, rect0: r, rect: r }; }
      e.emit('options', null);
    }
    e.emit('overlay', null);
  },
  move(ctx, p) {
    if (!drag) return;
    if (drag.mode === 'new') drag.rect = rectOf(drag.from, clampPt(p.doc));
    else if (drag.mode === 'move') {
      const dx = Math.max(-drag.rect0.x, Math.round(p.doc.x - drag.from.x)), dy = Math.max(-drag.rect0.y, Math.round(p.doc.y - drag.from.y));
      drag.rect = { ...drag.rect0, x: drag.rect0.x + dx, y: drag.rect0.y + dy };
    } else drag.rect = resized(drag.rect0, drag.handle, p.doc);
    ctx.engine.emit('overlay', null);
  },
  up(ctx, p) {
    const d = drag, e = ctx.engine;
    drag = null;
    if (d) {
      if (d.mode === 'new') { if (d.rect.w >= MIN_SIZE && d.rect.h >= MIN_SIZE) e.newArtboard(d.rect); }
      else if (d.mode === 'move') {
        const moved = !down || Math.hypot(p.screen.x - down.x, p.screen.y - down.y) >= 3;
        if (moved) e.moveArtboard(d.id, d.rect.x - d.rect0.x, d.rect.y - d.rect0.y);
      } else e.resizeArtboard(d.id, d.rect);
      e.emit('options', null);
    }
    down = null;
    e.emit('overlay', null);
  },
  cancel(ctx) { drag = null; down = null; ctx.engine.emit('overlay', null); },
  overlay(ctx, g) {
    const v = ctx.view(), pal = ctx.paint(), sel = selected(ctx);
    labels = [];
    g.save();
    g.font = '600 11px system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const l of ctx.engine.artboards()) {
      const a = l.artboard;
      if (!a) continue;
      const live = drag && drag.mode !== 'new' && drag.id === l.id ? drag.rect : a;
      const s = v.toScreen({ x: live.x, y: live.y }), isSel = sel?.id === l.id;
      const text = l.name, w = Math.ceil(g.measureText(text).width) + 4;
      labels.push({ id: l.id, x: s.x, y: s.y - LABEL_H - 2, w, h: LABEL_H });
      g.fillStyle = isSel ? pal.accent : pal.handle;
      g.globalAlpha = isSel ? 1 : 0.75;
      g.fillText(text, s.x + 2, s.y - LABEL_H / 2 - 2);
      g.globalAlpha = 1;
    }
    if (sel) {
      const r = drag && drag.mode !== 'new' ? drag.rect : sel.r;
      const a = v.toScreen({ x: r.x, y: r.y }), b = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
      g.strokeStyle = pal.accent; g.lineWidth = 1;
      g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
      g.fillStyle = pal.handle;
      for (const [ux, uy] of HANDLE_UNIT) {
        const c = v.toScreen({ x: r.x + r.w * ux, y: r.y + r.h * uy }), x = Math.round(c.x) - HANDLE_PX, y = Math.round(c.y) - HANDLE_PX;
        g.fillRect(x, y, HANDLE_PX * 2, HANDLE_PX * 2);
        g.strokeRect(x + 0.5, y + 0.5, HANDLE_PX * 2, HANDLE_PX * 2);
      }
      if (!drag) {
        for (const side of ['top', 'right', 'bottom', 'left'] as const) {
          if (!besideRect(sel.r, side)) continue;
          const c = plusAt(ctx, sel.r, side);
          g.beginPath(); g.arc(c.x, c.y, PLUS_R, 0, Math.PI * 2);
          g.fillStyle = pal.accent; g.fill();
          g.strokeStyle = pal.handle; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(c.x - 4, c.y); g.lineTo(c.x + 4, c.y); g.moveTo(c.x, c.y - 4); g.lineTo(c.x, c.y + 4); g.stroke();
        }
      }
    }
    if (drag) {
      const r = drag.rect, a = v.toScreen({ x: r.x, y: r.y }), b = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
      if (drag.mode === 'new') {
        g.setLineDash([4, 4]); g.lineWidth = 1; g.strokeStyle = pal.accent;
        g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
      }
      g.setLineDash([]);
      const text = `${Math.round(r.w)} x ${Math.round(r.h)}`, tw = Math.ceil(g.measureText(text).width) + 8;
      g.fillStyle = pal.accent; g.fillRect(Math.round(b.x) - tw, Math.round(b.y) + 6, tw, LABEL_H);
      g.fillStyle = pal.handle; g.fillText(text, Math.round(b.x) - tw + 4, Math.round(b.y) + 6 + LABEL_H / 2);
    }
    g.restore();
  },
  options: (e): OptionSpec[] => {
    const cur = () => { const l = e.activeLayer; return l?.isGroup && !l.parentId ? l.artboard ?? null : null; };
    const apply = (w: number, h: number): void => {
      const l = e.activeLayer, a = cur();
      if (l && a) e.resizeArtboard(l.id, { x: a.x, y: a.y, w, h });
      else { const r = e.nextArtboardRect({ w, h }); if (r) e.newArtboard(r); }
      e.emit('options', null);
    };
    return [
      { kind: 'title', text: 'Artboard' },
      { kind: 'select', label: 'Size', choices: [...PRESETS.map((s) => ({ id: s.id, label: s.label })), { id: 'custom', label: 'Custom' }], get: () => sizeId(null, e), set: (id) => { const s = PRESETS.find((x) => x.id === id); if (s) apply(s.w, s.h); } },
      { kind: 'number', label: 'Width', min: MIN_SIZE, max: 30000, unit: 'px', get: () => cur()?.w ?? null, set: (v) => { const a = cur(); if (a) apply(Math.round(v), a.h); } },
      { kind: 'number', label: 'Height', min: MIN_SIZE, max: 30000, unit: 'px', get: () => cur()?.h ?? null, set: (v) => { const a = cur(); if (a) apply(a.w, Math.round(v)); } },
      { kind: 'button', label: 'Make Artboard from Selected Layers', run: () => { e.artboardFromLayers(); e.emit('options', null); } },
    ];
  },
};
