import { hexOf, type RGB } from '../../engine';
import type { Tool, ToolContext, ToolPointer } from '../registry';

/** The colour a drag began from; the lower half of the sample ring shows it. Null between drags. */
let original: RGB | null = null;

function sample(ctx: ToolContext, p: ToolPointer): void {
  const e = ctx.engine, c = e.sampleColor(p.doc);
  if (!c) return;
  if (p.alt) e.setColors(undefined, c);
  else e.setColors(c);
  if (original) e.setSampleRing({ at: p.doc, sampled: c, original });
}

let bgCursor = '';
/** The crosshair with a small square badge: the next click samples the background colour (Alt held). */
function backgroundCursor(): string {
  if (!bgCursor) {
    const cross = 'M14 4v20M4 14h20';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="${cross}" stroke="#fff" stroke-width="3" fill="none"/><path d="${cross}" stroke="#000" stroke-width="1" fill="none"/><rect x="18.500" y="18.500" width="6" height="6" fill="#fff" stroke="#000" stroke-width="1.500"/></svg>`;
    bgCursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, crosshair`;
  }
  return bgCursor;
}

function finish(ctx: ToolContext): void {
  original = null;
  ctx.engine.setSampleRing(null);
}

export const eyedropperTool: Tool = {
  id: 'eyedropper', label: 'Eyedropper', key: 'I', order: 80,
  icon: () => 'tEyedropper',
  hint: () => 'Click or drag to sample the foreground colour from the visible image · Alt-click samples the background colour',
  cursor: (_ctx, p) => (p?.alt ? backgroundCursor() : 'crosshair'),
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
    // Sample (1.50.7, the tool audit): the active layer, it and those below, or everything shown.
    { kind: 'select', label: 'Sample', choices: [{ id: 'current', label: 'Current Layer' }, { id: 'below', label: 'Current & Below' }, { id: 'all', label: 'All Layers' }, { id: 'below-flat', label: 'Current & Below, No Adjustments' }, { id: 'all-flat', label: 'All Layers, No Adjustments' }], get: () => e.eyedropperSample, set: (v: string) => { e.eyedropperSample = v as typeof e.eyedropperSample; e.emit('options', null); } },
    { kind: 'readout', label: 'Foreground', get: () => hexOf(e.fg) },
    { kind: 'readout', label: 'Background', get: () => hexOf(e.bg) },
    { kind: 'toggle', label: 'Sample Ring', get: () => e.showsSampleRing, set: (v) => { e.showsSampleRing = v; e.emit('options', null); } }
  ]
};
