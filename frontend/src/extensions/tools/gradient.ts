import { BLEND_MODES, canvasBlend, type BlendMode, type Pt } from '../../engine';
import { GRADIENT_TYPES, allGradients, type GradientType } from '../../engine/gradients';
import type { Tool, ToolContext } from '../registry';

let drag: 'start' | 'end' | null = null;
const near = (ctx: ToolContext, a: Pt, s: Pt): boolean => { const v = ctx.view().toScreen(a); return Math.hypot(v.x - s.x, v.y - s.y) <= 8; };
function constrain(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}

export const gradientTool: Tool = {
  id: 'gradient', label: 'Gradient', key: 'G', order: 70,
  icon: () => 'tGradient',
  hint: () => 'Drag to draw a gradient · Drag either end to adjust it · Shift snaps to 45 degrees · Enter applies · Escape cancels · Switching tools applies',
  cursor: () => 'crosshair',
  down(ctx, p) {
    if (p.button !== 0) return;
    const g = ctx.engine.gradient;
    if (g && near(ctx, g.end, p.screen)) { drag = 'end'; return; }
    if (g && near(ctx, g.start, p.screen)) { drag = 'start'; return; }
    if (ctx.engine.beginGradient(p.doc)) drag = 'end';
  },
  move(ctx, p) {
    const g = ctx.engine.gradient;
    if (!drag || !g) return;
    if (drag === 'end') ctx.engine.updateGradient(undefined, p.shift ? constrain(g.start, p.doc) : p.doc);
    else ctx.engine.updateGradient(p.shift ? constrain(g.end, p.doc) : p.doc);
  },
  up(ctx) {
    const g = ctx.engine.gradient;
    drag = null;
    if (g && Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) < 1) ctx.engine.cancelGradient();
  },
  keydown(ctx, e) {
    if (!ctx.engine.gradient || e.metaKey || e.ctrlKey) return false;
    if (e.key === 'Enter') { ctx.engine.commitGradient(); return true; }
    if (e.key === 'Escape') { ctx.engine.cancelGradient(); return true; }
    return false;
  },
  cancel() { drag = null; },
  overlay(ctx, g) {
    const gr = ctx.engine.gradient;
    if (!gr) return;
    const v = ctx.view(), pal = ctx.paint();
    const a = v.toScreen(gr.start), b = v.toScreen(gr.end);
    g.save();
    g.lineWidth = 3;
    g.strokeStyle = pal.antsA;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = pal.antsB;
    g.stroke();
    for (const q of [a, b]) {
      g.beginPath();
      g.arc(q.x, q.y, 5, 0, Math.PI * 2);
      g.fillStyle = pal.handle;
      g.fill();
      g.strokeStyle = pal.accent;
      g.stroke();
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
      { kind: 'range', label: 'Opacity', min: 1, max: 100, unit: '%', get: () => Math.round(e.gradientSettings.opacity * 100), set: (v) => set(() => { e.gradientSettings.opacity = v / 100; }) },
    ];
  },
};
