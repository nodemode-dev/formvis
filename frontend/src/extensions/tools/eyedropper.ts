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
  icon: () => 'tEyedropper',
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
    { kind: 'select', label: 'Sample Size', choices: [['1', 'Point Sample'], ['3', '3 by 3 Average'], ['5', '5 by 5 Average'], ['11', '11 by 11 Average'], ['31', '31 by 31 Average'], ['51', '51 by 51 Average'], ['101', '101 by 101 Average']].map(([id, label]) => ({ id, label })), get: () => String(e.eyedropperSize), set: (v: string) => { e.eyedropperSize = Number(v) || 1; e.emit('options', null); } },
    // Photoshop's Sample (1.50.7, the tool audit): the active layer, it and those below, or everything shown.
    { kind: 'select', label: 'Sample', choices: [{ id: 'current', label: 'Current Layer' }, { id: 'below', label: 'Current & Below' }, { id: 'all', label: 'All Layers' }], get: () => e.eyedropperSample, set: (v: string) => { e.eyedropperSample = v as typeof e.eyedropperSample; e.emit('options', null); } },
    { kind: 'readout', label: 'Foreground', get: () => hexOf(e.fg) },
    { kind: 'readout', label: 'Background', get: () => hexOf(e.bg) },
    { kind: 'toggle', label: 'Sample Ring', get: () => e.showsSampleRing, set: (v) => { e.showsSampleRing = v; e.emit('options', null); } },
  ],
};
