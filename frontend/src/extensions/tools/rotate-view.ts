import type { OptionSpec, Tool } from '../registry';

let drag: { start: number; from: number } | null = null, lastDown: { t: number; x: number; y: number } | null = null;

const angleAt = (x: number, y: number, w: number, h: number): number => (Math.atan2(y - h / 2, x - w / 2) * 180) / Math.PI;
const stageSize = (): { w: number; h: number } => { const r = document.querySelector('.cv-stage')?.getBoundingClientRect(); return { w: r?.width ?? 1, h: r?.height ?? 1 }; };

/** Rotate View (R) (the owner's tool list; it sits with the Hand): drag to turn the view about the
 *  canvas's centre, Shift for 15-degree steps; double-click, Escape or Reset View straightens it. Only the view turns,
 *  never the image. */
export const rotateViewTool: Tool = {
  id: 'rotateView', label: 'Rotate View', key: 'R', group: 'H', order: 90.5,
  icon: () => 'tRotateView',
  hint: () => 'Drag to turn the view · Shift for 15 degree steps · Double-click or Escape straightens it',
  cursor: () => 'grab',
  down(ctx, p) {
    const e = ctx.engine, v = e.current?.viewport;
    if (p.button !== 0 || !v) return;
    // A double-click straightens it: recognised here (two presses close in time and place), not from a click count.
    const now = performance.now(), near = lastDown && now - lastDown.t < 400 && Math.hypot(p.screen.x - lastDown.x, p.screen.y - lastDown.y) < 6;
    lastDown = { t: now, x: p.screen.x, y: p.screen.y };
    if (p.clicks >= 2 || near) { e.setViewRotation(0); drag = null; lastDown = null; return; }
    // The pointer's own screen angle (not the turned-back one), so the view follows the hand.
    const { w, h } = stageSize(), raw = pointerRaw(p, v.rotation, w, h);
    drag = { start: angleAt(raw.x, raw.y, w, h), from: v.rotation };
  },
  move(ctx, p) {
    const e = ctx.engine, v = e.current?.viewport;
    if (!drag || !v) return;
    const { w, h } = stageSize(), raw = pointerRaw(p, v.rotation, w, h);
    let deg = drag.from + angleAt(raw.x, raw.y, w, h) - drag.start;
    if (p.shift) deg = Math.round(deg / 15) * 15;
    e.setViewRotation(deg);
  },
  up() { drag = null; },
  cancel(ctx) { drag = null; ctx.engine.setViewRotation(0); },
  keydown(ctx, e) { if (e.key === 'Escape') { ctx.engine.setViewRotation(0); return true; } return false; },
  overlay(ctx, g) {
    const v = ctx.engine.current?.viewport;
    if (!drag || !v) return;
    // A compass needle pointing to the canvas's top while turning.
    const { w, h } = stageSize(), pal = ctx.paint(), a = -Math.PI / 2, L = Math.min(w, h) * 0.18;   // up the canvas: the overlay turns with it
    g.save();
    g.translate(w / 2, h / 2);
    for (const [c, lw] of [[pal.antsB, 5], ['#e5484d', 3]] as const) { g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * L, Math.sin(a) * L); g.stroke(); }
    g.fillStyle = pal.antsA; g.beginPath(); g.arc(0, 0, 4, 0, Math.PI * 2); g.fill();
    g.restore();
  },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Rotate View' },
    { kind: 'number', label: 'Rotation Angle', min: -180, max: 180, step: 1, unit: '\u00b0', get: () => Math.round((e.current?.viewport.rotation ?? 0) * 10) / 10, set: (v: number) => e.setViewRotation(v) },
    { kind: 'button', label: 'Reset View', run: () => e.setViewRotation(0) },
  ],
};

/** A pointer back in screen space (the stage turns it into the drawing surfaces' space). */
function pointerRaw(p: { screen: { x: number; y: number } }, deg: number, w: number, h: number): { x: number; y: number } {
  if (!deg) return p.screen;
  const a = (deg * Math.PI) / 180, cx = w / 2, cy = h / 2, dx = p.screen.x - cx, dy = p.screen.y - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}
