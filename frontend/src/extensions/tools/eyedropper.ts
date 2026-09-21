import { hexOf, type RGB } from '../../engine';
import type { Tool, ToolContext, ToolPointer } from '../registry';

/** The color a drag started from, shown on the sample ring's lower half. */
let original: RGB | null = null;

function sample(ctx: ToolContext, p: ToolPointer): void {
  const c = ctx.engine.sampleColor(p.doc);
  if (!c) return;
  if (p.alt) ctx.engine.setColors(undefined, c);
  else ctx.engine.setColors(c);
  if (original) ctx.engine.setSampleRing({ at: p.doc, sampled: c, original });
}

function finish(ctx: ToolContext): void {
  original = null;
  ctx.engine.setSampleRing(null);
}

export const eyedropperTool: Tool = {
  id: 'eyedropper', label: 'Eyedropper', key: 'I', order: 80,
  icon: () => 'eyeDropper',
  hint: () => 'Click or drag to sample the foreground color from the visible image · Alt-click samples the background color',
  cursor: () => 'crosshair',
  down(ctx, p) {
    if (p.button !== 0) return;
    original = { ...(p.alt ? ctx.engine.bg : ctx.engine.fg) };
    sample(ctx, p);
  },
  move(ctx, p) { sample(ctx, p); },
  up(ctx) { finish(ctx); },
  cancel(ctx) { finish(ctx); },
  options: (e) => [
    { kind: 'title', text: 'Eyedropper' },
    { kind: 'readout', label: 'Foreground', get: () => hexOf(e.fg) },
    { kind: 'readout', label: 'Background', get: () => hexOf(e.bg) },
    { kind: 'toggle', label: 'Sample Ring', get: () => e.showsSampleRing, set: (v) => { e.showsSampleRing = v; e.emit('options', null); } },
  ],
};
