import type { Engine, SelectionMode } from '../../engine';
import type { OptionSpec, ToolContext, ToolPointer } from '../registry';

export function modeFor(e: Engine, p: ToolPointer): SelectionMode {
 if (p.shift && p.alt) return 'intersect';
 if (p.shift) return 'add';
 if (p.alt) return 'subtract';
 return e.selectionMode;
}

/** Arrow keys nudge the selection outline in the selection tools: 1 px, or 10 with Shift, as the.ref format; with Cmd,
 * Ctrl or Alt held the key is left for other commands. True when the key was used. */
export function nudgeSelectionKey(ctx: ToolContext, e: KeyboardEvent): boolean {
 if (e.metaKey || e.ctrlKey || e.altKey) return false;
 const step = e.shiftKey ? 10: 1;
 const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
 return d ? ctx.engine.nudgeSelection(d[0], d[1]): false;
}

export function modeSegment(e: Engine): OptionSpec {
 return {
 kind: 'segment', label: 'Mode',
 choices: [{ id: 'replace', label: 'New' }, { id: 'add', label: 'Add' }, { id: 'subtract', label: 'Subtract' }, { id: 'intersect', label: 'Intersect' }],
 get: () => e.selectionMode,
 set: (v) => e.update({ selectionMode: v as SelectionMode }),
 };
}
