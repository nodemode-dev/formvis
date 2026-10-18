import { SelectionMask, type Engine, type Pt, type Rect, type SelectionMode } from '../../engine';
import { toolHost } from '../registry';
import { dashed, type Tool, type ToolContext, type ToolPointer } from '../registry';
import { modeFor, modeSegment, nudgeSelectionKey } from './select-common';

interface Draft { anchor: Pt; point: Pt; mode: SelectionMode; shiftAtPress: boolean; altAtPress: boolean; square: boolean; center: boolean }
let draft: Draft | null = null;
let moving: Pt | null = null;
let shifted = false;

/** One drag step to a document point; pointer moves and autoscroll ticks both come through here. */
function follow(ctx: ToolContext, doc: Pt, shift: boolean, alt: boolean): void {
  if (moving) {
    if (Math.hypot(doc.x - moving.x, doc.y - moving.y) >= 1) shifted = true;
    ctx.engine.updateSelectionShift(doc.x - moving.x, doc.y - moving.y);
    return;
  }
  if (!draft) return;
  draft.point = doc;
  // A modifier held since the press picks the mode, not a constraint, until it is let go mid-drag.
  if (!shift) draft.shiftAtPress = false;
  if (!alt) draft.altAtPress = false;
  draft.square = shift && !draft.shiftAtPress;
  draft.center = alt && !draft.altAtPress;
  ctx.engine.emit('overlay', null);
}

/**
 * Dragging near the view's edge scrolls it: past a 12-point margin inside the view, every 60 Hz tick pans toward the
 * pointer by 2 plus 0.4 times the distance past the margin (at most 40), and the drag follows the document point now under it.
 */
let scroll: { at: Pt; shift: boolean; alt: boolean; timer: number } | null = null;

function scrollDelta(ctx: ToolContext, at: Pt): Pt {
  const v = ctx.view(), margin = 12;
  const speed = (past: number): number => Math.min(40, 2 + 0.4 * past);
  const axis = (pos: number, size: number): number => (pos < margin ? speed(margin - pos) : pos > size - margin ? -speed(pos - (size - margin)) : 0);
  return { x: axis(at.x, v.width), y: axis(at.y, v.height) };
}

function stopScroll(): void {
  if (scroll) window.clearInterval(scroll.timer);
  scroll = null;
}

function autoscroll(ctx: ToolContext, p: ToolPointer): void {
  const d = scrollDelta(ctx, p.screen);
  if (!d.x && !d.y) { stopScroll(); return; }
  if (scroll) { scroll.at = p.screen; scroll.shift = p.shift; scroll.alt = p.alt; return; }
  const st = { at: p.screen, shift: p.shift, alt: p.alt, timer: 0 };
  st.timer = window.setInterval(() => {
    const dd = scrollDelta(ctx, st.at);
    if ((!dd.x && !dd.y) || (!draft && !moving)) { stopScroll(); return; }
    ctx.engine.pan(dd.x, dd.y);
    follow(ctx, ctx.view().toDoc(st.at), st.shift, st.alt);
  }, 1000 / 60);
  scroll = st;
}

/** The box from anchor a to point b: square makes both sides the longer one, centred puts a in the middle; whole pixels. */
export function dragRect(a: Pt, b: Pt, square: boolean, center: boolean): Rect {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (square) { const s = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1) * s; dy = (dy < 0 ? -1 : 1) * s; }
  const x0 = center ? a.x - dx : a.x, y0 = center ? a.y - dy : a.y, x1 = a.x + dx, y1 = a.y + dy;
  const l = Math.round(Math.min(x0, x1)), t = Math.round(Math.min(y0, y1)), r = Math.round(Math.max(x0, x1)), bt = Math.round(Math.max(y0, y1));
  return { x: l, y: t, w: r - l, h: bt - t };
}

const inside = (ctx: ToolContext, p: ToolPointer): boolean => { const s = ctx.engine.current?.selection; return !!s && s.valueAt(Math.floor(p.doc.x), Math.floor(p.doc.y)) >= 128; };

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
  icon: (e) => (e.marqueeKind === 'ellipse' ? 'tEllipse' : e.marqueeKind === 'row' ? 'tRowMarquee' : e.marqueeKind === 'column' ? 'tColMarquee' : 'tMarquee'),
  variants: (e) => [
    { id: 'rectangle', label: 'Rectangular Marquee', icon: 'tMarquee', active: () => e.marqueeKind === 'rectangle', pick: () => e.update({ marqueeKind: 'rectangle' }) },
    { id: 'ellipse', label: 'Elliptical Marquee', icon: 'tEllipse', active: () => e.marqueeKind === 'ellipse', pick: () => e.update({ marqueeKind: 'ellipse' }) },
    { id: 'row', label: 'Single Row Marquee', icon: 'tRowMarquee', active: () => e.marqueeKind === 'row', pick: () => e.update({ marqueeKind: 'row' }) },
    { id: 'column', label: 'Single Column Marquee', icon: 'tColMarquee', active: () => e.marqueeKind === 'column', pick: () => e.update({ marqueeKind: 'column' }) },
  ],
  hint: (e) => (e.marqueeKind === 'ellipse' ? 'Drag an ellipse' : 'Drag a rectangle') + ' · Shift adds · Alt subtracts · Shift after starting constrains · Alt after starting grows from the centre · Drag inside to move the outline · Shift+M switches shape · A click, Escape or Cmd or Ctrl+D deselects',
  cursor: (ctx, p) => (p && !p.shift && !p.alt && ctx.engine.selectionMode === 'replace' && inside(ctx, p) ? 'move' : 'crosshair'),
  down(ctx, p) {
    const e = ctx.engine;
    if (!e.current || p.button !== 0) return;
    const mode = modeFor(e, p);
    // Single Row and Single Column Marquee (the owner's tool list), as Photoshop's: a click selects the one-pixel row or
    // column across the document, Shift adding and Alt taking away.
    if (e.marqueeKind === 'row' || e.marqueeKind === 'column') {
      const W = e.current.doc.width, H = e.current.doc.height, row = e.marqueeKind === 'row';
      const at = Math.max(0, Math.min((row ? H : W) - 1, Math.floor(row ? p.doc.y : p.doc.x)));
      const mask = row ? SelectionMask.cropped(0, at, W, 1, new Uint8Array(W).fill(255)) : SelectionMask.cropped(at, 0, 1, H, new Uint8Array(H).fill(255));
      e.applySelection(mask, mode, row ? 'Single Row Marquee' : 'Single Column Marquee');
      return;
    }
    if (mode === 'replace' && inside(ctx, p)) { moving = p.doc; shifted = false; e.beginSelectionShift(); return; }
    draft = { anchor: p.doc, point: p.doc, mode, shiftAtPress: p.shift, altAtPress: p.alt, square: false, center: false };
    e.emit('overlay', null);
  },
  move(ctx, p) {
    if (!moving && !draft) return;
    follow(ctx, p.doc, p.shift, p.alt);
    autoscroll(ctx, p);
  },
  keydown: (ctx, e) => nudgeSelectionKey(ctx, e),
  up(ctx) {
    stopScroll();
    const e = ctx.engine;
    if (moving) { moving = null; if (shifted) e.endSelectionShift(); else { e.updateSelectionShift(0, 0); e.endSelectionShift(); e.deselect(); } return; }
    const d = draft;
    draft = null;
    const doc = e.current?.doc;
    if (!d || !doc) return;
    const r = styledRect(e, d);
    if (r.w < 1 || r.h < 1) {
      if (d.mode === 'replace') e.deselect(); else e.emit('overlay', null);
      return;
    }
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
    if (moving) { ctx.engine.updateSelectionShift(0, 0); ctx.engine.endSelectionShift(); moving = null; }
    draft = null;
    ctx.engine.emit('overlay', null);
  },
  overlay(ctx, g) {
    if (!draft) return;
    const r = styledRect(ctx.engine, draft);
    const v = ctx.view(), a = v.toScreen({ x: r.x, y: r.y }), b = v.toScreen({ x: r.x + r.w, y: r.y + r.h });
    const ax = Math.round(a.x), ay = Math.round(a.y), bx = Math.round(b.x), by = Math.round(b.y);
    dashed(ctx, g, () => {
      if (ctx.engine.marqueeKind === 'ellipse') g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      else g.rect(ax + 0.5, ay + 0.5, bx - ax, by - ay);
    });
  },
  options: (e) => [
    { kind: 'title', text: 'Marquee' },
    { kind: 'segment', label: 'Shape', choices: [{ id: 'rectangle', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }, { id: 'row', label: 'Row' }, { id: 'column', label: 'Column' }], get: () => e.marqueeKind, set: (v) => e.update({ marqueeKind: v as 'rectangle' | 'ellipse' | 'row' | 'column' }) },
    { kind: 'range', label: 'Feather', min: 0, max: 250, unit: 'px', get: () => e.marqueeFeather, set: (v: number) => { e.marqueeFeather = Math.max(0, Math.min(250, v)); e.emit('options', null); } },
    { kind: 'toggle', label: 'Anti-alias', get: () => e.selectionAntialiased, set: (v) => { e.selectionAntialiased = v; e.emit('options', null); }, when: () => e.marqueeKind === 'ellipse' },
    { kind: 'select', label: 'Style', choices: [{ id: 'normal', label: 'Normal' }, { id: 'ratio', label: 'Fixed Ratio' }, { id: 'size', label: 'Fixed Size' }], get: () => e.marqueeStyle, set: (v: string) => { e.marqueeStyle = v === 'ratio' || v === 'size' ? v : 'normal'; e.emit('options', null); } },
    { kind: 'number', label: 'Width', min: 0.01, max: 1000, get: () => e.marqueeRatio.w, set: (v: number) => { e.marqueeRatio = { ...e.marqueeRatio, w: Math.max(0.01, v) }; e.emit('options', null); }, when: () => e.marqueeStyle === 'ratio' },
    { kind: 'number', label: 'Height', min: 0.01, max: 1000, get: () => e.marqueeRatio.h, set: (v: number) => { e.marqueeRatio = { ...e.marqueeRatio, h: Math.max(0.01, v) }; e.emit('options', null); }, when: () => e.marqueeStyle === 'ratio' },
    { kind: 'number', label: 'Width', min: 1, max: 30000, unit: 'px', get: () => e.marqueeSize.w, set: (v: number) => { e.marqueeSize = { ...e.marqueeSize, w: Math.max(1, Math.round(v)) }; e.emit('options', null); }, when: () => e.marqueeStyle === 'size' },
    { kind: 'number', label: 'Height', min: 1, max: 30000, unit: 'px', get: () => e.marqueeSize.h, set: (v: number) => { e.marqueeSize = { ...e.marqueeSize, h: Math.max(1, Math.round(v)) }; e.emit('options', null); }, when: () => e.marqueeStyle === 'size' },
    modeSegment(e),
    { kind: 'button', label: 'Deselect', run: () => toolHost.run('deselect'), when: () => !!e.current?.selection },
    { kind: 'button', label: 'Select and Mask...', run: () => toolHost.run('select-and-mask') }
  ],
};
