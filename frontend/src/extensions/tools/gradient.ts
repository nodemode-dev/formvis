import { BLEND_MODES, canvasBlend, type BlendMode, type Pt } from '../../engine';
import { GRADIENT_TYPES, allGradients, clampMid, type GradientType } from '../../engine/gradients';
import type { GradientFill } from '../../engine/fill-layers';
import type { ID, Rect } from '../../engine/types';
import type { Tool, ToolContext } from '../registry';

/** Which end of the pending gradient is being dragged. */
let drag: 'start' | 'end' | null = null;
/** The colour stop or midpoint being dragged along the line. */
let dragStop: number | null = null;
let dragMid: number | null = null;

/** A drag on the active Gradient Fill layer: its line as it was when the drag began, and the content as it is now. */
interface FillDrag { id: ID; content: GradientFill; frame: Rect; start: Pt; end: Pt; what: 'start' | 'end' | 'new' | 'stop'; stop: number }
let fillDrag: FillDrag | null = null;

/** Where along the line (0 at the start, 1 at the end) the stop at stored position `at` is shown. */
const shownAt = (ctx: ToolContext, at: number, rev = ctx.engine.gradientSettings.reversed): number => (rev ? 1 - at : at);

/** Screen point of a place on the line, pushed 13 screen points to one side so it clears the end handles. */
function lineSpot(ctx: ToolContext, gr: { start: Pt; end: Pt }, t: number, side: number): Pt {
  const v = ctx.view(), s = v.toScreen(gr.start), e = v.toScreen(gr.end), len = Math.hypot(e.x - s.x, e.y - s.y) || 1;
  return { x: s.x + (e.x - s.x) * t - ((e.y - s.y) / len) * side, y: s.y + (e.y - s.y) * t + ((e.x - s.x) / len) * side };
}

/** The stop or midpoint under screen point s, or the line itself. */
function stopHit(ctx: ToolContext, s: Pt): { kind: 'stop' | 'mid' | 'line'; i: number; t: number } | null {
  const e = ctx.engine, gr = e.gradient;
  if (!gr || e.gradientSettings.shape === 'angle') return null;
  const stops = e.gradientPreset().stops;
  for (let i = 0; i < stops.length; i++) { const q = lineSpot(ctx, gr, shownAt(ctx, stops[i].at), 13); if (Math.hypot(q.x - s.x, q.y - s.y) <= 7) return { kind: 'stop', i, t: stops[i].at }; }
  for (let i = 0; i < stops.length - 1; i++) {
    const m = stops[i].at + (stops[i + 1].at - stops[i].at) * clampMid(stops[i].mid), q = lineSpot(ctx, gr, shownAt(ctx, m), 13);
    if (Math.hypot(q.x - s.x, q.y - s.y) <= 6) return { kind: 'mid', i, t: m };
  }
  const a = ctx.view().toScreen(gr.start), b = ctx.view().toScreen(gr.end), dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (l2 < 1) return null;
  const u = ((s.x - a.x) * dx + (s.y - a.y) * dy) / l2;
  if (u > 0.02 && u < 0.98 && Math.hypot(a.x + dx * u - s.x, a.y + dy * u - s.y) <= 5) return { kind: 'line', i: -1, t: u };
  return null;
}

/** Where on the line (stored stop position) a document point falls. */
function alongLine(ctx: ToolContext, gr: { start: Pt; end: Pt }, d: Pt, rev = ctx.engine.gradientSettings.reversed): number {
  const dx = gr.end.x - gr.start.x, dy = gr.end.y - gr.start.y, l2 = dx * dx + dy * dy || 1;
  const u = Math.min(1, Math.max(0, ((d.x - gr.start.x) * dx + (d.y - gr.start.y) * dy) / l2));
  return rev ? 1 - u : u;
}

/** What is under screen point s on a Gradient Fill layer's line: an end, a stop (not for Angle) or the line itself. */
function fillHit(ctx: ToolContext, t: FillDrag, s: Pt): { kind: 'start' | 'end' | 'stop' | 'line'; i: number; t: number } | null {
  if (near(ctx, t.end, s)) return { kind: 'end', i: -1, t: 1 };
  if (near(ctx, t.start, s)) return { kind: 'start', i: -1, t: 0 };
  if (t.content.style === 'angle') return null;
  const stops = t.content.stops;
  for (let i = 0; i < stops.length; i++) { const q = lineSpot(ctx, t, shownAt(ctx, stops[i].at, t.content.reverse), 13); if (Math.hypot(q.x - s.x, q.y - s.y) <= 7) return { kind: 'stop', i, t: stops[i].at }; }
  const a = ctx.view().toScreen(t.start), b = ctx.view().toScreen(t.end), dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (l2 < 1) return null;
  const u = ((s.x - a.x) * dx + (s.y - a.y) * dy) / l2;
  if (u > 0.02 && u < 0.98 && Math.hypot(a.x + dx * u - s.x, a.y + dy * u - s.y) <= 5) return { kind: 'line', i: -1, t: u };
  return null;
}

/** The drag's content for the pointer at document point d, shown on the canvas without recording it. */
function fillMove(ctx: ToolContext, f: FillDrag, d: Pt, shift: boolean): void {
  const e = ctx.engine;
  let next: GradientFill | null = f.content;
  if (f.what === 'stop') {
    const st = f.content.stops, lo = f.stop > 0 ? st[f.stop - 1].at : 0, hi = f.stop < st.length - 1 ? st[f.stop + 1].at : 1;
    const at = Math.min(hi, Math.max(lo, Math.round(alongLine(ctx, f, d, f.content.reverse) * 1000) / 1000));
    next = { ...f.content, stops: st.map((s, i) => (i === f.stop ? { ...s, at } : s)) };
  } else {
    const lin = f.content.style === 'linear', base = f.what === 'start' ? f.end : f.start;
    if (f.what === 'start' && !lin) next = e.gradientFillAlong(f.content, f.frame, d, { x: f.end.x + d.x - f.start.x, y: f.end.y + d.y - f.start.y });
    else next = e.gradientFillAlong(f.content, f.frame, f.what === 'start' ? (shift ? constrain(base, d) : d) : base, f.what === 'start' ? base : (shift ? constrain(base, d) : d));
  }
  if (!next || JSON.stringify(next) === JSON.stringify(f.content)) return;
  f.content = next;
  e.previewFill(f.id, next);
}

/** Whether document point a lies within 8 screen points of screen point s. */
function near(ctx: ToolContext, a: Pt, s: Pt): boolean {
  const q = ctx.view().toScreen(a);
  return Math.hypot(q.x - s.x, q.y - s.y) <= 8;
}

/** Point b moved to the nearest 45-degree direction from a, at the same distance. */
function constrain(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const step = Math.PI / 4, ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}

/** The active Gradient Fill layer's line, ends and stops on the canvas, from the drag's content while one runs. */
function fillOverlay(ctx: ToolContext, g: CanvasRenderingContext2D): void {
  const t = ctx.engine.gradientFillTarget(fillDrag?.content);
  if (!t) return;
  const v = ctx.view(), pal = ctx.paint(), s = v.toScreen(t.start), q = v.toScreen(t.end);
  g.save();
  g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(q.x, q.y);
  g.lineWidth = 3; g.strokeStyle = pal.antsA; g.stroke();
  g.lineWidth = 1; g.strokeStyle = pal.antsB; g.stroke();
  for (const k of [s, q]) {
    g.beginPath(); g.arc(k.x, k.y, 5, 0, Math.PI * 2);
    g.fillStyle = pal.handle; g.fill();
    g.strokeStyle = pal.accent; g.stroke();
  }
  if (t.content.style !== 'angle') {
    for (const st of t.content.stops) {
      const at = shownAt(ctx, st.at, t.content.reverse), c = lineSpot(ctx, t, at, 13), r = lineSpot(ctx, t, at, 0);
      g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(c.x, c.y); g.strokeStyle = pal.antsA; g.stroke();
      g.fillStyle = `rgb(${st.color.r},${st.color.g},${st.color.b})`; g.fillRect(c.x - 5, c.y - 5, 10, 10);
      g.lineWidth = 1.5; g.strokeStyle = pal.accent; g.strokeRect(c.x - 5, c.y - 5, 10, 10); g.lineWidth = 1;
    }
  }
  g.restore();
}

export const gradientTool: Tool = {
  id: 'gradient', label: 'Gradient', key: 'G', order: 70,
  icon: () => 'tGradient',
  hint: () => 'Drag to draw a gradient · Drag either end to adjust it · Click the line to add a colour stop, drag stops and midpoints, Alt-click a stop to remove it, Ctrl-click to give it the foreground colour · On a Gradient Fill layer the same handles edit the layer · Shift snaps to 45 degrees · Enter applies · Escape cancels · Switching tools applies',
  cursor: () => 'crosshair',
  down(ctx, p) {
    if (p.button !== 0) return;
    const e = ctx.engine, gr = e.gradient, ft = gr ? null : e.gradientFillTarget();
    if (ft) {
      const f: FillDrag = { ...ft, what: 'new', stop: -1 }, hit = fillHit(ctx, f, p.screen), st = ft.content.stops;
      if (hit?.kind === 'stop') {
        if (p.alt) { if (st.length > 2) e.setFillContent(ft.id, { ...ft.content, stops: st.filter((_, i) => i !== hit.i) }); return; }
        if (p.mod) { e.setFillContent(ft.id, { ...ft.content, stops: st.map((s, i) => (i === hit.i ? { ...s, color: { r: e.fg.r, g: e.fg.g, b: e.fg.b } } : s)) }); return; }
        fillDrag = { ...f, what: 'stop', stop: hit.i }; return;
      }
      if (hit?.kind === 'start' || hit?.kind === 'end') { fillDrag = { ...f, what: hit.kind }; return; }
      if (hit?.kind === 'line') {
        const r = e.gradientFillAddStop(ft.content, ft.content.reverse ? 1 - hit.t : hit.t);
        fillDrag = { ...f, content: r.content, what: 'stop', stop: r.index }; e.previewFill(ft.id, r.content); return;
      }
      fillDrag = { ...f, start: p.doc, end: p.doc };
      return;
    }
    if (gr) {
      if (near(ctx, gr.end, p.screen)) { drag = 'end'; return; }
      if (near(ctx, gr.start, p.screen)) { drag = 'start'; return; }
      const hit = stopHit(ctx, p.screen);
      if (hit?.kind === 'stop') {
        if (p.alt) { e.removeGradientStop(hit.i); return; }
        if (p.mod) { e.setGradientStopColour(hit.i, e.fg); return; }
        dragStop = hit.i; return;
      }
      if (hit?.kind === 'mid') { dragMid = hit.i; return; }
      if (hit?.kind === 'line') { const i = e.addGradientStop(hit.t); if (i >= 0) dragStop = i; return; }
    }
    if (e.beginGradient(p.doc)) drag = 'end';
  },
  move(ctx, p) {
    const e = ctx.engine, gr = e.gradient;
    if (fillDrag) { fillMove(ctx, fillDrag, p.doc, p.shift); return; }
    if (gr && dragStop !== null) {
      const st = e.gradientPreset().stops, lo = dragStop > 0 ? st[dragStop - 1].at : 0, hi = dragStop < st.length - 1 ? st[dragStop + 1].at : 1;
      e.moveGradientStop(dragStop, Math.min(hi, Math.max(lo, alongLine(ctx, gr, p.doc))));
      return;
    }
    if (gr && dragMid !== null) {
      const st = e.gradientPreset().stops, a = st[dragMid]?.at ?? 0, b = st[dragMid + 1]?.at ?? 1;
      if (b > a) e.moveGradientMid(dragMid, (alongLine(ctx, gr, p.doc) - a) / (b - a));
      return;
    }
    if (!drag || !gr) return;
    if (drag === 'end') e.updateGradient(undefined, p.shift ? constrain(gr.start, p.doc) : p.doc);
    else e.updateGradient(p.shift ? constrain(gr.end, p.doc) : p.doc, undefined);
  },
  up(ctx) {
    const fd = fillDrag;
    fillDrag = null;
    if (fd) { ctx.engine.setFillContent(fd.id, fd.content); return; }
    drag = null; dragStop = null; dragMid = null;
    const gr = ctx.engine.gradient;
    if (gr && Math.hypot(gr.end.x - gr.start.x, gr.end.y - gr.start.y) < 1) ctx.engine.cancelGradient();
  },
  keydown(ctx, ev) {
    if (fillDrag && ev.key === 'Escape') { ctx.engine.previewFill(null); fillDrag = null; return true; }
    if (!ctx.engine.gradient || ev.metaKey || ev.ctrlKey) return false;
    if (ev.key === 'Enter') { ctx.engine.commitGradient(); return true; }
    if (ev.key === 'Escape') { ctx.engine.cancelGradient(); return true; }
    return false;
  },
  cancel(ctx) { drag = null; dragStop = null; dragMid = null; if (fillDrag) { fillDrag = null; ctx.engine.previewFill(null); } },
  overlay(ctx, g) {
    const gr = ctx.engine.gradient;
    if (!gr) { fillOverlay(ctx, g); return; }
    const v = ctx.view(), pal = ctx.paint(), s = v.toScreen(gr.start), t = v.toScreen(gr.end);
    g.save();
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(t.x, t.y);
    g.lineWidth = 3; g.strokeStyle = pal.antsA; g.stroke();
    g.lineWidth = 1; g.strokeStyle = pal.antsB; g.stroke();
    for (const q of [s, t]) {
      g.beginPath(); g.arc(q.x, q.y, 5, 0, Math.PI * 2);
      g.fillStyle = pal.handle; g.fill();
      g.strokeStyle = pal.accent; g.stroke();
    }
    if (ctx.engine.gradientSettings.shape !== 'angle') {
      const e = ctx.engine, stops = e.gradientPreset().stops, rgb = (c: typeof stops[number]['color']): string => { const k = c === 'fg' ? e.fg : c === 'bg' ? e.bg : c; return `rgb(${k.r},${k.g},${k.b})`; };
      const half = (t: number): Pt => lineSpot(ctx, gr, t, 13);
      for (let i = 0; i < stops.length - 1; i++) {
        const q = half(shownAt(ctx, stops[i].at + (stops[i + 1].at - stops[i].at) * clampMid(stops[i].mid)));
        g.beginPath(); g.moveTo(q.x, q.y - 5); g.lineTo(q.x + 5, q.y); g.lineTo(q.x, q.y + 5); g.lineTo(q.x - 5, q.y); g.closePath();
        g.fillStyle = pal.handle; g.fill(); g.strokeStyle = pal.accent; g.stroke();
      }
      for (const s of stops) {
        const t = shownAt(ctx, s.at), q = half(t), r = lineSpot(ctx, gr, t, 0);
        g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(q.x, q.y); g.strokeStyle = pal.antsA; g.stroke();
        g.fillStyle = rgb(s.color); g.fillRect(q.x - 5, q.y - 5, 10, 10);
        g.lineWidth = 1.5; g.strokeStyle = pal.accent; g.strokeRect(q.x - 5, q.y - 5, 10, 10); g.lineWidth = 1;
      }
    }
    g.restore();
  },
  options: (e) => {
    const set = (fn: () => void): void => { fn(); e.renderGradient(); e.emit('options', null); };
    return [
      { kind: 'title', text: 'Gradient' },
      { kind: 'segment', label: 'Shape', priority: 90, choices: GRADIENT_TYPES, get: () => e.gradientSettings.shape, set: (v) => set(() => { e.gradientSettings.shape = v as GradientType; }) },
      { kind: 'select', label: 'Colors', priority: 95, choices: allGradients().map((p) => ({ id: p.id, label: p.label })), live: () => allGradients().map((p) => ({ id: p.id, label: p.label })), get: () => e.gradientSettings.style, set: (v) => set(() => { e.gradientSettings.style = v; }) },
      { kind: 'button', label: 'Edit', priority: 60, icon: 'gradient', run: () => e.uiHooks.gradientEditor?.() },
      { kind: 'button', label: 'As Fill Layer', priority: 55, icon: 'gradient', run: () => { e.gradientAsFillLayer(); } },
      { kind: 'toggle', label: 'Reverse', priority: 70, get: () => e.gradientSettings.reversed, set: (v) => set(() => { e.gradientSettings.reversed = v; }) },
      { kind: 'toggle', label: 'Dither', priority: 40, get: () => e.gradientSettings.dither, set: (v) => set(() => { e.gradientSettings.dither = v; }) },
      // Transparency and Method (1.50.6, the tool audit).
      { kind: 'toggle', label: 'Transparency', priority: 45, get: () => e.gradientSettings.transparency, set: (v) => set(() => { e.gradientSettings.transparency = v; }) },
      { kind: 'select', label: 'Method', priority: 40, choices: [{ id: 'perceptual', label: 'Perceptual' }, { id: 'linear', label: 'Linear' }, { id: 'classic', label: 'Classic' }], get: () => e.gradientSettings.method, set: (v: string) => set(() => { e.gradientSettings.method = v as 'classic' | 'linear' | 'perceptual'; }) },
      { kind: 'select', label: 'Mode', priority: 75, choices: BLEND_MODES.filter((m) => canvasBlend(m.id)).map((m) => ({ id: m.id, label: m.label })), get: () => e.gradientSettings.blend, set: (v) => set(() => { e.gradientSettings.blend = v as BlendMode; }) },
      { kind: 'range', label: 'Opacity', priority: 95, min: 1, max: 100, unit: '%', get: () => Math.round(e.gradientSettings.opacity * 100), set: (v: number) => set(() => { e.gradientSettings.opacity = v / 100; }) },
    ];
  },
};
