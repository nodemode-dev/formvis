import type { Pt } from '../../engine';
import type { Tool } from '../registry';

let last: Pt | null = null;
let trail: { t: number; x: number; y: number }[] = [];
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const handTool: Tool = {
  id: 'hand', label: 'Hand', key: 'H', order: 90,
  icon: () => 'tHand',
  hint: () => 'Drag to pan · Scroll pans · Cmd/Ctrl + scroll zooms · Hold Space to pan with any tool',
  cursor: () => (last ? 'grabbing' : 'grab'),
  down(ctx, p) { ctx.engine.stopFlick(); last = p.screen; trail = [{ t: performance.now(), x: p.screen.x, y: p.screen.y }]; },
  move(ctx, p) {
    if (last) ctx.engine.pan(p.screen.x - last.x, p.screen.y - last.y);
    last = p.screen;
    trail.push({ t: performance.now(), x: p.screen.x, y: p.screen.y });
    if (trail.length > 8) trail.shift();
    if (ctx.engine.handScrollAll) ctx.engine.syncOtherViews();
  },
  up(ctx) {
    const end = trail[trail.length - 1], from = end && trail.find((s) => end.t - s.t <= 100);
    last = null;
    if (!REDUCED && end && from && from !== end && performance.now() - end.t < 80) {
      const vx = (end.x - from.x) / (end.t - from.t), vy = (end.y - from.y) / (end.t - from.t);
      if (Math.hypot(vx, vy) >= 0.3) ctx.engine.flick(vx, vy);
    }
    trail = [];
  },
  cancel() { last = null; trail = []; },
  options: (e) => [
    { kind: 'title', text: 'Hand' },
    { kind: 'button', label: 'Fit', icon: 'fitView', run: () => e.fit() },
    { kind: 'button', label: 'Actual pixels', icon: 'maximize', run: () => e.zoomTo(1) },
    { kind: 'button', label: 'Fill Screen', run: () => e.fillScreen() },
    { kind: 'toggle', label: 'Scroll All Windows', get: () => e.handScrollAll, set: (v) => { e.handScrollAll = v; e.emit('options', null); } }
  ]
};
