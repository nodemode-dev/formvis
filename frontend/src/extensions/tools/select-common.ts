import type { Engine, SelectionMode } from '../../engine';
import type { OptionSpec, ToolContext, ToolPointer } from '../registry';

export function modeFor(e: Engine, p: ToolPointer): SelectionMode {
  if (p.shift && p.alt) return 'intersect';
  if (p.shift) return 'add';
  if (p.alt) return 'subtract';
  return e.selectionMode;
}

/** Arrow keys nudge the selection outline (1 pixel, 10 with Shift); false for anything else so other commands see it. */
export function nudgeSelectionKey(ctx: ToolContext, e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const step = e.shiftKey ? 10 : 1;
  if (e.key === 'ArrowLeft') return ctx.engine.nudgeSelection(-step, 0);
  if (e.key === 'ArrowRight') return ctx.engine.nudgeSelection(step, 0);
  if (e.key === 'ArrowUp') return ctx.engine.nudgeSelection(0, -step);
  if (e.key === 'ArrowDown') return ctx.engine.nudgeSelection(0, step);
  return false;
}

export function modeSegment(e: Engine): OptionSpec {
  return {
    kind: 'segment', label: 'Mode',
    choices: [{ id: 'replace', label: 'New' }, { id: 'add', label: 'Add' }, { id: 'subtract', label: 'Subtract' }, { id: 'intersect', label: 'Intersect' }],
    get: () => e.selectionMode,
    set: (id) => e.update({ selectionMode: id as SelectionMode })
  };
}
