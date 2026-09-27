import type { Engine, Pt } from '../../engine';
import type { OptionSpec, ToolContext } from '../registry';
import { brushTool } from './brush';

export function drawBrushCursor(ctx: ToolContext, g: CanvasRenderingContext2D, pt: Pt | null): void {
  pt = ctx.engine.tipDrag?.at ?? pt;
  if (!pt) return;
  const v = ctx.view(), pal = ctx.paint(), c = v.toScreen(pt);
  const r = Math.max(0.5, (ctx.engine.brush.diameter * v.zoom) / 2), how = ctx.engine.cursorPrefs;
  // Preferences > Cursors, as Photoshop's: the tip's outline (Normal Brush Tip), a crosshair alone (Precise), or a small
  // ring (Standard); Show Crosshair in Brush Tip adds one inside the outline. Each is drawn twice, dark over light.
  const ring = (radius: number): void => { for (const [color, off] of [[pal.antsA, 0], [pal.antsB, 1]] as const) { g.strokeStyle = color; g.beginPath(); g.arc(c.x, c.y, radius + off, 0, Math.PI * 2); g.stroke(); } };
  const cross = (arm: number): void => { for (const [color, off] of [[pal.antsB, 1], [pal.antsA, 0]] as const) { g.strokeStyle = color; g.lineWidth = 1 + off; g.beginPath(); g.moveTo(c.x - arm, c.y); g.lineTo(c.x + arm, c.y); g.moveTo(c.x, c.y - arm); g.lineTo(c.x, c.y + arm); g.stroke(); } g.lineWidth = 1; };
  g.save();
  g.lineWidth = 1;
  if (how.paint === 'precise') cross(8);
  else if (how.paint === 'standard') { ring(5); g.fillStyle = pal.antsA; g.fillRect(c.x - 0.5, c.y - 0.5, 1.5, 1.5); }
  else { ring(r); if (how.crosshair) cross(Math.min(8, Math.max(3, r / 3))); }
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
