import type { Engine, SelectionMode } from '../../engine';
import type { OptionSpec, ToolContext, ToolPointer } from '../registry';

/** The mode a press selects with: Shift+Alt intersects, Shift adds, Alt subtracts, else the options bar's mode. */
export function modeFor(e: Engine, p: ToolPointer): SelectionMode {
  if (p.shift && p.alt) return 'intersect';
  if (p.shift) return 'add';
  if (p.alt) return 'subtract';
  return e.selectionMode;
}

const badgeCursors = new Map<string, string>();

/** The crosshair with a + (add), - (subtract) or x (intersect) badge for the mode the next press selects with; a plain crosshair for New. */
export function modeCursor(e: Engine, p: ToolPointer | null): string {
  const m: SelectionMode = p ? modeFor(e, p) : e.selectionMode;
  if (m === 'replace') return 'crosshair';
  let url = badgeCursors.get(m);
  if (!url) {
    const mark = m === 'add' ? 'M19 22h6M22 19v6' : m === 'subtract' ? 'M19 22h6' : 'M19.500 19.500l5 5M24.500 19.500l-5 5';
    const cross = 'M14 4v20M4 14h20';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="${cross}" stroke="#fff" stroke-width="3" fill="none"/><path d="${cross}" stroke="#000" stroke-width="1" fill="none"/><path d="${mark}" stroke="#fff" stroke-width="3.500" fill="none"/><path d="${mark}" stroke="#000" stroke-width="1.500" fill="none"/></svg>`;
    url = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, crosshair`;
    badgeCursors.set(m, url);
  }
  return url;
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

let growBy = 1;

/** Expand and Contract in a selection tool's options bar: the amount, then one button for each direction. */
export function growOptions(e: Engine): OptionSpec[] {
  const has = (): boolean => !!e.current?.selection;
  return [
    { kind: 'number', label: 'Grow by', priority: 27, min: 1, max: 500, step: 1, unit: 'px', get: () => growBy, set: (v) => { growBy = Math.max(1, Math.min(500, Math.round(v) || 1)); e.emit('options', null); } },
    { kind: 'button', label: 'Expand', priority: 26, run: () => e.resizeSelection(growBy, e.selectionAtBounds), when: has },
    { kind: 'button', label: 'Contract', priority: 26, run: () => e.resizeSelection(-growBy, e.selectionAtBounds), when: has },
  ];
}

export function modeSegment(e: Engine): OptionSpec {
  return {
    kind: 'segment', label: 'Mode', priority: 95,
    choices: [{ id: 'replace', label: 'New' }, { id: 'add', label: 'Add' }, { id: 'subtract', label: 'Subtract' }, { id: 'intersect', label: 'Intersect' }],
    get: () => e.selectionMode,
    set: (id) => e.update({ selectionMode: id as SelectionMode })
  };
}
