import type { Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';

let drag: number | null = null;
const MAX = 10, NEAR = 8;

/** The Color Sampler (I, the owner's tool list): click to place a sampler (ten at most), drag one to
 *  move it, Alt-click one to remove it; each sampler's colour shows in the Info panel. */
export const colorSamplerTool: Tool = {
  id: 'colorSampler', label: 'Color Sampler', key: 'I', order: 80.5,
  icon: () => 'tColorSampler',
  hint: () => 'Click to place a sampler (up to ten) · Drag one to move it · Alt-click one to remove it · Its colour shows in Window > Info',
  cursor: () => 'crosshair',
  down(ctx, p) {
    const m = ctx.engine.measure;
    if (p.button !== 0 || !m) return;
    const v = ctx.view(), at = v.toScreen(p.doc);
    const hit = m.samplers.findIndex((s) => { const q = v.toScreen(s); return Math.hypot(q.x - at.x, q.y - at.y) <= NEAR; });
    if (hit >= 0 && p.alt) { m.samplers.splice(hit, 1); ctx.engine.measureChanged(); return; }
    if (hit >= 0) { drag = hit; return; }
    if (m.samplers.length >= MAX) { ctx.engine.notice('Ten samplers at most: drag one, or Alt-click one to remove it.'); return; }
    m.samplers.push({ x: Math.floor(p.doc.x) + 0.5, y: Math.floor(p.doc.y) + 0.5 });
    drag = m.samplers.length - 1;
    ctx.engine.measureChanged();
  },
  move(ctx, p) { const m = ctx.engine.measure; if (drag === null || !m) return; m.samplers[drag] = { x: Math.floor(p.doc.x) + 0.5, y: Math.floor(p.doc.y) + 0.5 }; ctx.engine.measureChanged(); },
  up() { drag = null; },
  cancel() { drag = null; },
  overlay(ctx, g) { drawSamplers(ctx.view(), ctx.paint(), g, ctx.engine.measure?.samplers ?? []); },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Color Sampler' },
    { kind: 'readout', label: 'Samplers', get: () => `${e.measure?.samplers.length ?? 0} of ${MAX}` },
    { kind: 'button', label: 'Clear All', run: () => { const m = e.measure; if (m) { m.samplers.length = 0; e.measureChanged(); } } },
  ],
};

/** A sampler: a small target with its number, drawn dark over light so it reads on any image. */
export function drawSamplers(v: { toScreen(p: Pt): Pt }, pal: { antsA: string; antsB: string }, g: CanvasRenderingContext2D, samplers: Pt[]): void {
  g.save();
  g.font = '600 11px Inter, system-ui, sans-serif';
  samplers.forEach((s, i) => {
    const q = v.toScreen(s);
    for (const [color, w] of [[pal.antsB, 3], [pal.antsA, 1.2]] as const) {
      g.strokeStyle = color; g.lineWidth = w;
      g.beginPath(); g.arc(q.x, q.y, 5, 0, Math.PI * 2); g.moveTo(q.x - 9, q.y); g.lineTo(q.x - 3, q.y); g.moveTo(q.x + 3, q.y); g.lineTo(q.x + 9, q.y); g.moveTo(q.x, q.y - 9); g.lineTo(q.x, q.y - 3); g.moveTo(q.x, q.y + 3); g.lineTo(q.x, q.y + 9); g.stroke();
    }
    g.lineWidth = 3; g.strokeStyle = pal.antsB; g.strokeText(String(i + 1), q.x + 8, q.y + 16);
    g.fillStyle = pal.antsA; g.fillText(String(i + 1), q.x + 8, q.y + 16);
  });
  g.restore();
}
