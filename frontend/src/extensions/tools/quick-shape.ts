import type { Engine, Pt } from '../../engine';
import { fitQuickShape } from '../../engine/quick-shape';
import type { OptionSpec, ToolContext, ToolPointer } from '../registry';

/** Quick Shape (DEV_PLAN 36.5), shared by the Brush, Pencil and Eraser: hold the pointer still for about 600 ms at the
 *  end of a stroke (button still down) and the stroke snaps to the line, ellipse or rectangle it resembles. The
 *  freehand stroke is cancelled (its history step aborted) and the shape is painted in a new stroke with the same brush,
 *  which the release then ends: one undo step, holding the shape only. */
export const HOLD_MS = 600;
const LATE_MS = 120;   // how much later than HOLD_MS the timer may fire and still count as a true wait
const STILL = 2;  // document pixels the pointer may wander and still count as still

const state = { on: true };
let pts: Pt[] = [], anchor: Pt | null = null, timer = 0, snapped = false;

export function quickShapeOption(e: Engine): OptionSpec {
  return { kind: 'toggle', label: 'Quick Shape', priority: 20, get: () => state.on, set: (v) => { state.on = v; e.emit('options', null); } };
}

/** True once the stroke has snapped; the tool then stops adding freehand points. */
export function quickShapeSnapped(): boolean { return snapped; }

/** The stroke began at `p`. `enabled` tells whether this tool state allows snapping (the Airbrush, Block and Erase to
 *  History do not). */
export function holdStart(p: Pt, enabled = true): void {
  window.clearTimeout(timer);
  pts = enabled && state.on ? [{ ...p }] : [];
  anchor = { ...p };
  snapped = false;
}

/** The pointer moved to `p.doc`: record it and restart the wait. */
export function holdMove(ctx: ToolContext, p: ToolPointer, begin: (pt: Pt, pressure: number, pose: ToolPointer['pose']) => boolean): void {
  if (!pts.length || snapped) return;
  if (anchor && Math.hypot(p.doc.x - anchor.x, p.doc.y - anchor.y) <= STILL && pts.length > 1) return;   // still: keep waiting
  pts.push({ ...p.doc });
  anchor = { ...p.doc };
  arm(ctx.engine, p.pressure, p.pose, begin);
}

/** The wait is stillness in input time: a timer that fires much later than it was set (the page stalled, as in a flush
 *  of a giant layer's stroke window) says nothing about the pointer, whose queued moves are still to arrive, so it waits
 *  again from now rather than snapping. */
function arm(e: Engine, pressure: number, pose: ToolPointer['pose'], begin: (pt: Pt, pressure: number, pose: ToolPointer['pose']) => boolean): void {
  window.clearTimeout(timer);
  const at = performance.now();
  timer = window.setTimeout(() => {
    if (performance.now() - at > HOLD_MS + LATE_MS) arm(e, pressure, pose, begin);
    else snap(e, pressure, pose, begin);
  }, HOLD_MS);
}

function snap(e: Engine, pressure: number, pose: ToolPointer['pose'], begin: (pt: Pt, pressure: number, pose: ToolPointer['pose']) => boolean): void {
  if (snapped || !e.stroking) return;
  const shape = fitQuickShape(pts);
  if (!shape) return;
  snapped = true;
  e.cancelStroke();
  if (!begin(shape.points[0], pressure, pose)) { snapped = false; return; }
  for (let i = 1; i < shape.points.length; i++) e.strokeTo(shape.points[i], pressure, pose);
  e.emit('overlay', null);
}

/** The stroke ended or was cancelled. */
export function holdEnd(): void {
  window.clearTimeout(timer);
  pts = [];
  anchor = null;
  snapped = false;
}
