import type { Engine, Pt } from '../../engine';
import type { OptionSpec, ToolContext } from '../registry';
import { brushTool } from './brush';

export function drawBrushCursor(ctx: ToolContext, g: CanvasRenderingContext2D, pt: Pt | null): void {
  pt = ctx.engine.tipDrag?.at ?? pt;
  if (!pt) return;
  const v = ctx.view(), pal = ctx.paint(), c = v.toScreen(pt);
  const r = Math.max(0.5, (ctx.engine.brush.diameter * v.zoom) / 2);
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = pal.antsA;
  g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = pal.antsB;
  g.beginPath(); g.arc(c.x, c.y, r + 1, 0, Math.PI * 2); g.stroke();
  g.restore();
}

export const brushKeys = (ctx: ToolContext, e: KeyboardEvent): boolean => brushTool.keydown?.(ctx, e) ?? false;

export function brushOptions(e: Engine, strength = 'Opacity'): OptionSpec[] {
  return [
    { kind: 'range', label: 'Size', min: 1, max: 1000, unit: 'px', get: () => e.brush.diameter, set: (v) => e.setBrush({ diameter: v }) },
    { kind: 'range', label: 'Hardness', min: 0, max: 100, unit: '%', get: () => Math.round(e.brush.hardness * 100), set: (v) => e.setBrush({ hardness: v / 100 }) },
    { kind: 'range', label: strength, min: 1, max: 100, unit: '%', get: () => Math.round(e.brush.opacity * 100), set: (v) => e.setBrush({ opacity: v / 100 }) },
  ];
}
