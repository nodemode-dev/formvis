import { BLEND_MODES, canvasBlend, type BlendMode, type Pt } from '../../engine';
import { GRADIENT_TYPES, allGradients, type GradientType } from '../../engine/gradients';
import type { Tool, ToolContext } from '../registry';

/** Which end of the pending gradient is being dragged. */
let drag: 'start' | 'end' | null = null;

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

export const gradientTool: Tool = {
  id: 'gradient', label: 'Gradient', key: 'G', order: 70,
  icon: () => 'tGradient',
  hint: () => 'Drag to draw a gradient · Drag either end to adjust it · Shift snaps to 45 degrees · Enter applies · Escape cancels · Switching tools applies',
  cursor: () => 'crosshair',
  down(ctx, p) {
    if (p.button !== 0) return;
    const e = ctx.engine, gr = e.gradient;
    if (gr) {
      if (near(ctx, gr.end, p.screen)) { drag = 'end'; return; }
      if (near(ctx, gr.start, p.screen)) { drag = 'start'; return; }
    }
    if (e.beginGradient(p.doc)) drag = 'end';
  },
  move(ctx, p) {
    const e = ctx.engine, gr = e.gradient;
    if (!drag || !gr) return;
    if (drag === 'end') e.updateGradient(undefined, p.shift ? constrain(gr.start, p.doc) : p.doc);
    else e.updateGradient(p.shift ? constrain(gr.end, p.doc) : p.doc, undefined);
  },
  up(ctx) {
    drag = null;
    const gr = ctx.engine.gradient;
    if (gr && Math.hypot(gr.end.x - gr.start.x, gr.end.y - gr.start.y) < 1) ctx.engine.cancelGradient();
  },
  keydown(ctx, ev) {
    if (!ctx.engine.gradient || ev.metaKey || ev.ctrlKey) return false;
    if (ev.key === 'Enter') { ctx.engine.commitGradient(); return true; }
    if (ev.key === 'Escape') { ctx.engine.cancelGradient(); return true; }
    return false;
  },
  cancel() { drag = null; },
  overlay(ctx, g) {
    const gr = ctx.engine.gradient;
    if (!gr) return;
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
    g.restore();
  },
  options: (e) => {
    const set = (fn: () => void): void => { fn(); e.renderGradient(); e.emit('options', null); };
    return [
      { kind: 'title', text: 'Gradient' },
      { kind: 'segment', label: 'Shape', choices: GRADIENT_TYPES, get: () => e.gradientSettings.shape, set: (v) => set(() => { e.gradientSettings.shape = v as GradientType; }) },
      { kind: 'select', label: 'Colors', choices: allGradients().map((p) => ({ id: p.id, label: p.label })), live: () => allGradients().map((p) => ({ id: p.id, label: p.label })), get: () => e.gradientSettings.style, set: (v) => set(() => { e.gradientSettings.style = v; }) },
      { kind: 'button', label: 'Edit', icon: 'gradient', run: () => e.uiHooks.gradientEditor?.() },
      { kind: 'toggle', label: 'Reverse', get: () => e.gradientSettings.reversed, set: (v) => set(() => { e.gradientSettings.reversed = v; }) },
      { kind: 'toggle', label: 'Dither', get: () => e.gradientSettings.dither, set: (v) => set(() => { e.gradientSettings.dither = v; }) },
      // Transparency and Method (1.50.6, the tool audit), as Photoshop's bar.
      { kind: 'toggle', label: 'Transparency', get: () => e.gradientSettings.transparency, set: (v) => set(() => { e.gradientSettings.transparency = v; }) },
      { kind: 'select', label: 'Method', choices: [{ id: 'perceptual', label: 'Perceptual' }, { id: 'linear', label: 'Linear' }, { id: 'classic', label: 'Classic' }], get: () => e.gradientSettings.method, set: (v: string) => set(() => { e.gradientSettings.method = v as 'classic' | 'linear' | 'perceptual'; }) },
      { kind: 'select', label: 'Mode', choices: BLEND_MODES.filter((m) => canvasBlend(m.id)).map((m) => ({ id: m.id, label: m.label })), get: () => e.gradientSettings.blend, set: (v) => set(() => { e.gradientSettings.blend = v as BlendMode; }) },
      { kind: 'range', label: 'Opacity', min: 1, max: 100, unit: '%', get: () => Math.round(e.gradientSettings.opacity * 100), set: (v: number) => set(() => { e.gradientSettings.opacity = v / 100; }) },
    ];
  },
};
