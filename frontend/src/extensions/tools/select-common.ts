import type { Engine, SelectionMode } from '../../engine';
import type { OptionSpec, ToolPointer } from '../registry';

export function modeFor(e: Engine, p: ToolPointer): SelectionMode {
  if (p.shift && p.alt) return 'intersect';
  if (p.shift) return 'add';
  if (p.alt) return 'subtract';
  return e.selectionMode;
}

export function modeSegment(e: Engine): OptionSpec {
  return {
    kind: 'segment', label: 'Mode',
    choices: [{ id: 'replace', label: 'New' }, { id: 'add', label: 'Add' }, { id: 'subtract', label: 'Subtract' }, { id: 'intersect', label: 'Intersect' }],
    get: () => e.selectionMode,
    set: (v) => e.update({ selectionMode: v as SelectionMode }),
  };
}
