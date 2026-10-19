import type { Engine, Pt } from '../../engine';
import type { SampledTip } from '../../engine/abr';
import type { OptionSpec, ToolContext } from '../registry';
import { brushTool, pressureOpacityOption, pressureSizeOption, symmetryOptions } from './brush';
import { extraShown } from '../../ui/view-extras';

/** Caps Lock turns the precise crosshair on and off over the Preferences > Cursors choice. */
export const cursorState = { caps: false, hardAt: -1e9 };

// Every painting tool shares the cursor, so the lock state is read from the pointer, not from one tool's key handler.
if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => { cursorState.caps = e.getModifierState('CapsLock'); }, { capture: true, passive: true });

const outlines = new WeakMap<Uint8Array, number[]>();

/** A sampled tip's outline as 48 points from its centre, in half the longer side, where its grey last passes a quarter. */
function tipOutline(tip: SampledTip): number[] {
  const known = outlines.get(tip.data);
  if (known) return known;
  const half = Math.max(tip.w, tip.h) / 2, pts: number[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let far = 0.05;
    for (let t = 0; t <= half * 1.5; t += 0.5) {
      const x = Math.floor(tip.w / 2 + ca * t), y = Math.floor(tip.h / 2 + sa * t);
      if (x >= 0 && y >= 0 && x < tip.w && y < tip.h && tip.data[y * tip.w + x] >= 64) far = t;
    }
    pts.push((ca * far) / half, (sa * far) / half);
  }
  outlines.set(tip.data, pts);
  return pts;
}

/** The symmetry axes through the point set in the options, drawn faintly across the document. */
function drawSymmetryAxes(ctx: ToolContext, g: CanvasRenderingContext2D): void {
  const e = ctx.engine, p = e.current, m = e.brushSymmetry.mode;
  if (!p || m === 'off') return;
  const v = ctx.view(), c = v.toScreen({ x: p.doc.width * e.symmetryAt.x, y: p.doc.height * e.symmetryAt.y }), a = v.toScreen({ x: 0, y: 0 }), b = v.toScreen({ x: p.doc.width, y: p.doc.height });
  g.save();
  g.strokeStyle = ctx.paint().accent;
  g.globalAlpha = 0.6;
  g.setLineDash([6, 4]);
  g.beginPath();
  if (m !== 'horizontal') { g.moveTo(c.x, a.y); g.lineTo(c.x, b.y); }
  if (m !== 'vertical' && m !== 'radial') { g.moveTo(a.x, c.y); g.lineTo(b.x, c.y); }
  g.stroke();
  g.restore();
}

export function drawBrushCursor(ctx: ToolContext, g: CanvasRenderingContext2D, pt: Pt | null): void {
  drawSymmetryAxes(ctx, g);
  const at = ctx.engine.tipDrag?.at ?? pt;
  if (!at) return;
  const v = ctx.view(), pal = ctx.paint(), c = v.toScreen(at);
  const r = Math.max(0.5, (ctx.engine.brush.diameter * v.zoom) / 2), how = ctx.engine.cursorPrefs;
  // Preferences > Cursors: the tip's outline (Normal Brush Tip), a crosshair alone (Precise), or a small
  // ring (Standard); Show Crosshair in Brush Tip adds one inside the outline. Each is drawn twice, dark over light.
  // The tip rings follow the tip's roundness and angle; the small Standard ring stays round.
  const sh = ctx.engine.brushShape, flat = Math.max(0.01, Math.min(1, sh.roundness / 100)), turn = (sh.angle * Math.PI) / 180;
  const shape = ctx.engine.brush.tip ? tipOutline(ctx.engine.brush.tip) : null;
  const ring = (radius: number, tip = false): void => { for (const [color, off] of [[pal.antsA, 0], [pal.antsB, 1]] as const) { g.strokeStyle = color; g.beginPath(); if (tip && shape) { const k = radius + off, cs = Math.cos(turn), sn = Math.sin(turn); for (let i = 0; i < shape.length; i += 2) { const x = shape[i] * k * (sh.flipX ? -1 : 1), y = shape[i + 1] * k * flat * (sh.flipY ? -1 : 1), X = c.x + x * cs - y * sn, Y = c.y + x * sn + y * cs; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); } g.closePath(); } else if (tip) g.ellipse(c.x, c.y, radius + off, (radius + off) * flat, turn, 0, Math.PI * 2); else g.arc(c.x, c.y, radius + off, 0, Math.PI * 2); g.stroke(); } };
  const cross = (arm: number): void => { for (const [color, off] of [[pal.antsB, 1], [pal.antsA, 0]] as const) { g.strokeStyle = color; g.lineWidth = 1 + off; g.beginPath(); g.moveTo(c.x - arm, c.y); g.lineTo(c.x + arm, c.y); g.moveTo(c.x, c.y - arm); g.lineTo(c.x, c.y + arm); g.stroke(); } g.lineWidth = 1; };
  g.save();
  g.lineWidth = 1;
  const resizing = !!ctx.engine.tipDrag || performance.now() - cursorState.hardAt < 1200;
  if (cursorState.caps || how.paint === 'precise' || (how.onlyCross && ctx.engine.stroking)) cross(8);
  else if (how.paint === 'standard') { ring(5); g.fillStyle = pal.antsA; g.fillRect(c.x - 0.5, c.y - 0.5, 1.5, 1.5); }
  else {
    // While the tip is resized or its hardness changes, the tip is tinted with the Brush Preview Color
    if (resizing && extraShown('brushPreview')) { g.globalAlpha = 0.4; g.fillStyle = how.previewColor; g.beginPath(); g.ellipse(c.x, c.y, r, r * flat, turn, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
    ring(r, true);
    if (how.crosshair || r < 6) cross(Math.min(8, Math.max(3, r / 3)));
    // Just after a hardness change the ring where the edge starts to fade shows inside the outline
    if (performance.now() - cursorState.hardAt < 1200 && ctx.engine.brush.hardness < 1) { g.setLineDash([3, 3]); ring(Math.max(0.5, r * ctx.engine.brush.hardness), true); g.setLineDash([]); }
  }
  g.restore();
}

export function brushKeys(ctx: ToolContext, e: KeyboardEvent): boolean { return brushTool.keydown?.(ctx, e) ?? false; }

export function brushOptions(e: Engine, strength = 'Opacity'): OptionSpec[] {
  return [
    { kind: 'range', label: 'Size', priority: 90, min: 1, max: 1000, unit: 'px', get: () => e.brush.diameter, set: (v) => e.setBrush({ diameter: v }) },
    { kind: 'range', label: 'Hardness', priority: 80, min: 0, max: 100, unit: '%', get: () => Math.round(e.brush.hardness * 100), set: (v) => e.setBrush({ hardness: v / 100 }) },
    { kind: 'range', label: strength, priority: 95, min: 1, max: 100, unit: '%', get: () => Math.round(e.brush.opacity * 100), set: (v) => e.setBrush({ opacity: v / 100 }) },
    pressureSizeOption(e),
    pressureOpacityOption(e),
    ...symmetryOptions(e)
  ];
}
