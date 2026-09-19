import { hexOf } from '../../engine';
import type { Tool, ToolContext, ToolPointer } from '../registry';

function sample(ctx: ToolContext, p: ToolPointer): void {
  const c = ctx.engine.sampleColor(p.doc);
  if (!c) return;
  if (p.alt) ctx.engine.setColors(undefined, c);
  else ctx.engine.setColors(c);
}

export const eyedropperTool: Tool = {
  id: 'eyedropper', label: 'Eyedropper', key: 'I', order: 80,
  icon: () => 'eyeDropper',
  hint: () => 'Click or drag to sample the foreground color from the visible image · Alt-click samples the background color',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button === 0) sample(ctx, p); },
  move(ctx, p) { sample(ctx, p); },
  options: (e) => [
    { kind: 'title', text: 'Eyedropper' },
    { kind: 'readout', label: 'Foreground', get: () => hexOf(e.fg) },
    { kind: 'readout', label: 'Background', get: () => hexOf(e.bg) },
  ],
};
