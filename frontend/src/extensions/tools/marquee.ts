import { SelectionMask, type Engine, type Pt, type Rect, type SelectionMode } from '../../engine';
import { dashed, type Tool, type ToolContext, type ToolPointer } from '../registry';
import { modeFor, modeSegment, nudgeSelectionKey } from './select-common';

interface Draft { anchor: Pt; point: Pt; mode: SelectionMode; shiftAtPress: boolean; altAtPress: boolean; square: boolean; center: boolean }
let draft: Draft | null = null;
let moving: Pt | null = null;

/** One drag step toward document point `doc`: the moved outline follows, or the box's corner with the
 *  marqueeConstrainArmed rule (a modifier held from the press sets the mode, not a constraint, until it is released
 *  during the drag; pressed again, it constrains). Pointer moves and autoscroll ticks both call it. */
function follow(ctx: ToolContext, doc: Pt, shift: boolean, alt: boolean): void {
  if (moving) { ctx.engine.updateSelectionShift(doc.x - moving.x, doc.y - moving.y); return; }
  if (!draft) return;
  draft.point = doc;
  if (!shift) draft.shiftAtPress = false;
  if (!alt) draft.altAtPress = false;
  draft.square = shift && !draft.shiftAtPress;
  draft.center = alt && !draft.altAtPress;
  ctx.engine.emit('overlay', null);
}

/** the marquee autoscroll: past a 12 px margin inside the view, each 60 Hz tick pans toward the pointer at
 *  min(40, 2 + 0.4 x the distance past), and the drag follows the document point that is now under the pointer. */
let scroll: { at: Pt; shift: boolean; alt: boolean; timer: number } | null = null;

function scrollDelta(ctx: ToolContext, at: Pt): Pt {
  const v = ctx.view(), m = 12, speed = (past: number): number => (past <= 0 ? 0 : Math.min(40, 2 + past * 0.4));
  return { x: speed(m - at.x) - speed(at.x - (v.width - m)), y: speed(m - at.y) - speed(at.y - (v.height - m)) };
}

function stopScroll(): void {
  if (scroll) window.clearInterval(scroll.timer);
  scroll = null;
}

function autoscroll(ctx: ToolContext, p: ToolPointer): void {
  const d = scrollDelta(ctx, p.screen);
  if (!d.x && !d.y) { stopScroll(); return; }
  if (scroll) { scroll.at = p.screen; scroll.shift = p.shift; scroll.alt = p.alt; return; }
  const state = { at: p.screen, shift: p.shift, alt: p.alt, timer: 0 };
  state.timer = window.setInterval(() => {
    const delta = scrollDelta(ctx, state.at);
    if ((!delta.x && !delta.y) || (!draft && !moving)) { stopScroll(); return; }
    ctx.engine.pan(delta.x, delta.y);
    follow(ctx, ctx.view().toDoc(state.at), state.shift, state.alt);
  }, 1000 / 60);
  scroll = state;
}

export function dragRect(a: Pt, b: Pt, square: boolean, center: boolean): Rect {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (square) { const s = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * s; dy = Math.sign(dy || 1) * s; }
  const x0 = center ? a.x - dx : a.x, y0 = center ? a.y - dy : a.y, x1 = a.x + dx, y1 = a.y + dy;
  const l = Math.round(Math.min(x0, x1)), t = Math.round(Math.min(y0, y1));
  return { x: l, y: t, w: Math.round(Math.max(x0, x1)) - l, h: Math.round(Math.max(y0, y1)) - t };
}

const inside = (ctx: ToolContext, p: ToolPointer): boolean => (ctx.engine.current?.selection?.valueAt(p.doc.x, p.doc.y) ?? 0) >= 128;

/** The marquee's rectangle for its Style, as Photoshop's options bar sets it: as dragged (Normal); held to the width to
 *  height ratio, growing from the press or, with Alt, from its centre (Fixed Ratio); or the set size placed at the
 *  pointer, so dragging moves it (Fixed Size). */
function styledRect(e: Engine, d: { anchor: Pt; point: Pt; square: boolean; center: boolean }): Rect {
  if (e.marqueeStyle === 'size') return { x: Math.round(d.point.x), y: Math.round(d.point.y), w: Math.max(1, Math.round(e.marqueeSize.w)), h: Math.max(1, Math.round(e.marqueeSize.h)) };
  if (e.marqueeStyle !== 'ratio') return dragRect(d.anchor, d.point, d.square, d.center);
  const k = Math.max(0.001, e.marqueeRatio.h) / Math.max(0.001, e.marqueeRatio.w), dx = d.point.x - d.anchor.x, dy = d.point.y - d.anchor.y;
  const w = Math.max(Math.abs(dx), Math.abs(dy) / k), h = w * k;
  if (d.center) return { x: Math.round(d.anchor.x - w), y: Math.round(d.anchor.y - h), w: Math.round(2 * w), h: Math.round(2 * h) };
  return { x: Math.round(dx >= 0 ? d.anchor.x : d.anchor.x - w), y: Math.round(dy >= 0 ? d.anchor.y : d.anchor.y - h), w: Math.round(w), h: Math.round(h) };
}

export const marqueeTool: Tool = {
  id: 'marquee', label: 'Marquee', key: 'M', order: 20,
  icon: (e) => (e.marqueeKind === 'ellipse' ? 'tEllipse' : 'tMarquee'),
  variants: (e) => [
    { id: 'rectangle', label: 'Rectangular Marquee', icon: 'tMarquee', active: () => e.marqueeKind !== 'ellipse', pick: () => e.update({ marqueeKind: 'rectangle' }) },
    { id: 'ellipse', label: 'Elliptical Marquee', icon: 'tEllipse', active: () => e.marqueeKind === 'ellipse', pick: () => e.update({ marqueeKind: 'ellipse' }) },
  ],
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
    if (!moving && !draft) return;
    follow(ctx, p.doc, p.shift, p.alt);
    autoscroll(ctx, p);
  },
  keydown(ctx, e) { return nudgeSelectionKey(ctx, e); },
  up(ctx) {
    stopScroll();
    const e = ctx.engine;
    if (moving) { moving = null; e.endSelectionShift(); return; }
    const d = draft;
    draft = null;
    const doc = e.current?.doc;
    if (!d || !doc) return;
    const r = styledRect(e, d);
    if (r.w < 1 || r.h < 1) { if (d.mode === 'replace') e.deselect(); else e.emit('overlay', null); return; }
    const ellipse = e.marqueeKind === 'ellipse';
    const hard = SelectionMask.fromPath(doc.width, doc.height, r, (c) => {
      c.beginPath();
      if (ellipse) c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      else c.rect(r.x, r.y, r.w, r.h);
      c.fill();
    }, e.selectionAntialiased);
    const mask = hard && e.marqueeFeather > 0 ? e.featherMask(hard, e.marqueeFeather) : hard;
    e.applySelection(mask, d.mode, ellipse ? 'Elliptical Marquee' : 'Rectangular Marquee');
  },
  cancel(ctx) {
    stopScroll();
    if (moving) { moving = null; ctx.engine.updateSelectionShift(0, 0); ctx.engine.endSelectionShift(); }
    draft = null;
    ctx.engine.emit('overlay', null);
  },
  overlay(ctx, g) {
    if (!draft) return;
    const r = styledRect(ctx.engine, draft);
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
    { kind: 'range', label: 'Feather', min: 0, max: 250, unit: 'px', get: () => e.marqueeFeather, set: (v: number) => { e.marqueeFeather = Math.max(0, Math.min(250, v)); e.emit('options', null); } },
    { kind: 'toggle', label: 'Anti-alias', get: () => e.selectionAntialiased, set: (v) => { e.selectionAntialiased = v; e.emit('options', null); }, when: () => e.marqueeKind === 'ellipse' },
    { kind: 'select', label: 'Style', choices: [{ id: 'normal', label: 'Normal' }, { id: 'ratio', label: 'Fixed Ratio' }, { id: 'size', label: 'Fixed Size' }], get: () => e.marqueeStyle, set: (v: string) => { e.marqueeStyle = v === 'ratio' || v === 'size' ? v : 'normal'; e.emit('options', null); } },
    { kind: 'number', label: 'Width', min: 0.01, max: 1000, get: () => e.marqueeRatio.w, set: (v: number) => { e.marqueeRatio = { ...e.marqueeRatio, w: Math.max(0.01, v) }; e.emit('options', null); }, when: () => e.marqueeStyle === 'ratio' },
    { kind: 'number', label: 'Height', min: 0.01, max: 1000, get: () => e.marqueeRatio.h, set: (v: number) => { e.marqueeRatio = { ...e.marqueeRatio, h: Math.max(0.01, v) }; e.emit('options', null); }, when: () => e.marqueeStyle === 'ratio' },
    { kind: 'number', label: 'Width', min: 1, max: 30000, unit: 'px', get: () => e.marqueeSize.w, set: (v: number) => { e.marqueeSize = { ...e.marqueeSize, w: Math.max(1, Math.round(v)) }; e.emit('options', null); }, when: () => e.marqueeStyle === 'size' },
    { kind: 'number', label: 'Height', min: 1, max: 30000, unit: 'px', get: () => e.marqueeSize.h, set: (v: number) => { e.marqueeSize = { ...e.marqueeSize, h: Math.max(1, Math.round(v)) }; e.emit('options', null); }, when: () => e.marqueeStyle === 'size' },
    modeSegment(e),
  ],
};
