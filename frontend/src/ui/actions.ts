import type { RGB } from '../engine';

/** Actions: recorded sequences of document changes, replayed on the current document or a batch of files. A step is a
 *  command that changes the document without asking anything, a filter with its settings, or an Image or Canvas Size
 *  change with its numbers. Actions are kept in this browser's storage and move between machines as JSON. */

export type ActionStep =
  | { kind: 'command'; id: string; label: string }
  | { kind: 'filter'; filter: string; label: string; settings: Record<string, unknown> }
  | { kind: 'imageSize'; label: string; w: number; h: number; sampling: string; res: number }
  | { kind: 'canvasSize'; label: string; w: number; h: number; dx: number; dy: number; fill: RGB | null };
export interface Action { name: string; steps: ActionStep[] }

/** Commands that change the document straight away, without a dialog or a background task, so they replay exactly. */
export const RECORDABLE: ReadonlySet<string> = new Set([
  'fill-fg', 'fill-bg', 'clear', 'delete', 'invert', 'flip-canvas-h', 'flip-canvas-v', 'new-layer', 'new-folder', 'delete-layer', 'group',
  'move-out', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', 'flip-layer-h', 'flip-layer-v',
  'forward', 'backward', 'blend-next', 'blend-prev', 'select-all', 'deselect', 'inverse', 'path-selection', 'fill-path', 'stroke-path',
  'paste-layer-style', 'clear-layer-style', 'duplicate', 'merge-down', 'merge-visible', 'flatten',
]);

const KEY = 'sonny.actions';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A step read from storage or a file, checked field by field; null when unusable. */
function stepFrom(v: unknown): ActionStep | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>, label = typeof s.label === 'string' ? s.label.slice(0, 200) : '';
  if (s.kind === 'command' && typeof s.id === 'string' && RECORDABLE.has(s.id)) return { kind: 'command', id: s.id, label: label || s.id };
  if (s.kind === 'filter' && typeof s.filter === 'string' && s.settings && typeof s.settings === 'object') return { kind: 'filter', filter: s.filter, label: label || s.filter, settings: s.settings as Record<string, unknown> };
  if (s.kind === 'imageSize' && isNum(s.w) && isNum(s.h) && typeof s.sampling === 'string' && isNum(s.res)) return { kind: 'imageSize', label: label || 'Image Size', w: s.w, h: s.h, sampling: s.sampling, res: s.res };
  if (s.kind === 'canvasSize' && isNum(s.w) && isNum(s.h) && isNum(s.dx) && isNum(s.dy)) {
    const f = s.fill as Record<string, unknown> | null;
    const fill = f && isNum(f.r) && isNum(f.g) && isNum(f.b) ? { r: f.r, g: f.g, b: f.b } : null;
    return { kind: 'canvasSize', label: label || 'Canvas Size', w: s.w, h: s.h, dx: s.dx, dy: s.dy, fill };
  }
  return null;
}

/** Actions read from JSON: an array of actions or one action; steps that fail the checks are dropped. */
export function actionsFrom(value: unknown): Action[] {
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((a) => {
    if (!a || typeof a !== 'object' || typeof (a as Action).name !== 'string' || !Array.isArray((a as Action).steps)) return [];
    const steps = (a as Action).steps.map(stepFrom).filter((x): x is ActionStep => x !== null);
    return [{ name: (a as Action).name.slice(0, 80) || 'Action', steps }];
  });
}

export class Actions {
  list: Action[] = [];
  private active: Action | null = null;
  private playing = false;

  constructor() {
    try { this.list = actionsFrom(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { this.list = []; }
  }

  get recording(): Action | null { return this.active; }

  save(): void { try { localStorage.setItem(KEY, JSON.stringify(this.list)); } catch { /* storage unavailable: actions last this session */ } }

  /** Starts recording a new action named `name`. */
  start(name: string): Action { const a: Action = { name: name.slice(0, 80), steps: [] }; this.list.push(a); this.active = a; this.save(); return a; }

  /** Records more steps onto the end of `a`. */
  resume(a: Action): Action { this.active = a; return a; }

  stop(): void { this.active = null; this.save(); }

  remove(a: Action): void { this.list = this.list.filter((x) => x !== a); if (this.active === a) this.active = null; this.save(); }

  add(more: Action[]): void { this.list.push(...more); this.save(); }

  /** Adds `step` to the action being recorded, unless an action is playing. */
  record(step: ActionStep): void { if (!this.active || this.playing) return; this.active.steps.push(step); this.save(); }

  /** Runs each step through `run`, stopping at the first that cannot run; returns how many ran and which failed. */
  async play(a: Action, run: (step: ActionStep) => boolean | Promise<boolean>): Promise<{ done: number; failed: string | null }> {
    this.playing = true;
    try {
      for (let i = 0; i < a.steps.length; i++) if (!(await run(a.steps[i]))) return { done: i, failed: a.steps[i].label };
      return { done: a.steps.length, failed: null };
    } finally { this.playing = false; }
  }
}
