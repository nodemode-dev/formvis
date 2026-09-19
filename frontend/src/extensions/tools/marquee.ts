import { SelectionMask, type Pt, type Rect, type SelectionMode } from '../../engine';
import { dashed, type Tool, type ToolContext, type ToolPointer } from '../registry';
import { modeFor, modeSegment } from './select-common';

interface Draft { anchor: Pt; point: Pt; mode: SelectionMode; shiftAtPress: boolean; altAtPress: boolean; square: boolean; center: boolean }
let draft: Draft | null = null;
let moving: Pt | null = null;

export function dragRect(a: Pt, b: Pt, square: boolean, center: boolean): Rect {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (square) { const s = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * s; dy = Math.sign(dy || 1) * s; }
  const x0 = center ? a.x - dx : a.x, y0 = center ? a.y - dy : a.y, x1 = a.x + dx, y1 = a.y + dy;
  const l = Math.round(Math.min(x0, x1)), t = Math.round(Math.min(y0, y1));
  return { x: l, y: t, w: Math.round(Math.max(x0, x1)) - l, h: Math.round(Math.max(y0, y1)) - t };
}

const inside = (ctx: ToolContext, p: ToolPointer): boolean => (ctx.engine.current?.selection?.valueAt(p.doc.x, p.doc.y) ?? 0) >= 128;

export const marqueeTool: Tool = {
  id: 'marquee', label: 'Marquee', key: 'M', order: 20,
  icon: (e) => (e.marqueeKind === 'ellipse' ? 'ellipseSelect' : 'marquee'),
  hint: (e) => `Drag ${e.marqueeKind === 'ellipse' ? 'an ellipse' : 'a rectangle'} · Shift adds · Alt subtracts · Shift after starting constrains · Alt after starting grows from the center · Drag inside to move the outline · Shift+M switches shape · Cmd or Ctrl+D deselects`,
  cursor: (ctx, p) => (p && !p.shift && !p.alt && ctx.engine.selectionMode === 'replace' && inside(ctx, p) ? 'move' : 'crosshair'),
  down(ctx, p) {
    const e = ctx.engine;
    if (!e.current || p.button !== 0) return;
    const mode = modeFor(e, p);
    if (mode === 'replace' && inside(ctx, p)) { moving = p.doc; e.beginSelectionShift(); return; }
    draft = { anchor: p.doc, point: p.doc, mode, shiftAtPress: p.shift, altAtPress: p.alt, square: false, center: false };
  },
  move(ctx, p) {
    if (moving) { ctx.engine.updateSelectionShift(p.doc.x - moving.x, p.doc.y - moving.y); return; }
    if (!draft) return;
    draft.point = p.doc;
    draft.square = p.shift && !draft.shiftAtPress;
    draft.center = p.alt && !draft.altAtPress;
    ctx.engine.emit('overlay', null);
  },
  up(ctx) {
    const e = ctx.engine;
    if (moving) { moving = null; e.endSelectionShift(); return; }
    const d = draft;
    draft = null;
    const doc = e.current?.doc;
    if (!d || !doc) return;
    const r = dragRect(d.anchor, d.point, d.square, d.center);
    if (r.w < 1 || r.h < 1) { if (d.mode === 'replace') e.deselect(); else e.emit('overlay', null); return; }
    const ellipse = e.marqueeKind === 'ellipse';
    const mask = SelectionMask.fromPath(doc.width, doc.height, r, (c) => {
      c.beginPath();
      if (ellipse) c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      else c.rect(r.x, r.y, r.w, r.h);
      c.fill();
    });
    e.applySelection(mask, d.mode, ellipse ? 'Elliptical Marquee' : 'Rectangular Marquee');
  },
  cancel(ctx) {
    if (moving) { moving = null; ctx.engine.updateSelectionShift(0, 0); ctx.engine.endSelectionShift(); }
    draft = null;
    ctx.engine.emit('overlay', null);
  },
  overlay(ctx, g) {
    if (!draft) return;
    const r = dragRect(draft.anchor, draft.point, draft.square, draft.center);
    const v = ctx.view();
    const a = v.toScreen({ x: r.x, y: r.y }), b = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
    const ellipse = ctx.engine.marqueeKind === 'ellipse';
    dashed(ctx, g, () => {
      if (ellipse) g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      else g.rect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
    });
  },
  options: (e) => [
    { kind: 'title', text: 'Marquee' },
    { kind: 'segment', label: 'Shape', choices: [{ id: 'rectangle', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }], get: () => e.marqueeKind, set: (v) => e.update({ marqueeKind: v as 'rectangle' | 'ellipse' }) },
    modeSegment(e),
  ],
};
