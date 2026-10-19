import { ADJUSTMENT_KINDS, type RGB } from '../engine';
import type { DocMode } from '../engine/types';

const DOC_MODES: readonly string[] = ['rgb', 'cmyk', 'lab', 'grayscale', 'bitmap', 'indexed', 'duotone', 'multichannel'];
const isMode = (v: unknown): v is DocMode => typeof v === 'string' && DOC_MODES.includes(v);

/** Actions: recorded sequences of document changes, replayed on the current document or a batch of files. A step is a
 *  command that changes the document without asking anything, a filter with its settings, an Image or Canvas Size
 *  change with its numbers, or Fit Image with its box. Actions are kept in this browser's storage and move between
 *  machines as JSON. */

type StepKind =
  | { kind: 'command'; id: string; label: string }
  | { kind: 'filter'; filter: string; label: string; settings: Record<string, unknown>; ask?: boolean }
  | { kind: 'stop'; label: string; message: string; allowContinue: boolean }
  | { kind: 'adjustment'; adj: string; label: string; data: Record<string, unknown>; layer: boolean; ask?: boolean }
  | { kind: 'layerStyle'; label: string; effects: Record<string, unknown> | null }
  | { kind: 'imageSize'; label: string; w: number; h: number; sampling: string; res: number; fromW?: number; fromH?: number }
  | { kind: 'canvasSize'; label: string; w: number; h: number; dx: number; dy: number; fill: RGB | null; fromW?: number; fromH?: number }
  | { kind: 'fitImage'; label: string; w: number; h: number; enlarge: boolean }
  | { kind: 'conditionalMode'; label: string; from: DocMode[]; to: DocMode }
  | { kind: 'save'; label: string; format: 'png' | 'jpg' | 'webp'; quality: number }
  | { kind: 'conditional'; label: string; test: ConditionTest; then: string; else: string }
  | { kind: 'play'; label: string; name: string }
  | { kind: 'menu'; label: string; id: string }
  | { kind: 'unsupported'; label: string; event: string; raw: string };

/** Button Mode colours, in the order an .atn file numbers them (none is 0). */
export const ACTION_COLOURS = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'] as const;
export type ActionColour = (typeof ACTION_COLOURS)[number];
const isColour = (v: unknown): v is ActionColour => ACTION_COLOURS.some((c) => c === v);

/** Function-key shortcuts an action can take, written as the key table writes a press. */
export const ACTION_KEYS: readonly string[] = ['', ...['', 'Shift+', 'Mod+', 'Shift+Mod+'].flatMap((m) => Array.from({ length: 12 }, (_, i) => `${m}F${i + 1}`))];
const isKey = (v: unknown): v is string => typeof v === 'string' && ACTION_KEYS.includes(v);

/** What a conditional step asks of the document it plays on. */
export const CONDITION_TESTS = [
  ['landscape', 'The document is landscape'], ['portrait', 'The document is portrait'], ['square', 'The document is square'],
  ['depth8', 'The document is 8 bits per channel'], ['depth16', 'The document is 16 bits per channel'], ['depth32', 'The document is 32 bits per channel'],
  ['selection', 'There is a selection'], ['unsaved', 'The document has unsaved changes'], ['layers', 'The document has more than one layer'],
  ['textLayer', 'The active layer is a type layer'], ['smartLayer', 'The active layer is a smart object'], ['maskLayer', 'The active layer has a mask'],
] as const;
export type ConditionTest = (typeof CONDITION_TESTS)[number][0];
const isTest = (v: unknown): v is ConditionTest => CONDITION_TESTS.some(([t]) => t === v);
/** `off`: the step is left out when the action plays. */
export type ActionStep = StepKind & { off?: boolean };
/** `relative`: size steps follow each document, Image Size as the same proportion and Canvas Size as the same pixels
 *  added, using the size each step was recorded from. */
export interface Action { name: string; steps: ActionStep[]; relative?: boolean; set?: string; colour?: ActionColour; key?: string }

/** The set names in use, in the order they first appear; actions with no set are not counted. */
export function actionSets(list: readonly Action[]): string[] { return [...new Set(list.flatMap((a) => (a.set ? [a.set] : [])))]; }

/** Commands that change the document straight away, without a dialog or a background task, so they replay exactly. */
export const RECORDABLE: ReadonlySet<string> = new Set([
  'fill-fg', 'fill-bg', 'clear', 'delete', 'invert', 'flip-canvas-h', 'flip-canvas-v', 'new-layer', 'new-folder', 'delete-layer', 'group',
  'move-out', 'add-mask', 'add-mask-hide', 'apply-mask', 'delete-mask', 'toggle-mask', 'link-mask', 'flip-layer-h', 'flip-layer-v',
  'forward', 'backward', 'blend-next', 'blend-prev', 'select-all', 'deselect', 'inverse', 'path-selection', 'fill-path', 'stroke-path',
  'paste-layer-style', 'clear-layer-style', 'convert-smart', 'rasterize', 'new-shape-path', 'shape-color', 'reveal-all', 'duplicate', 'merge-down', 'merge-visible', 'flatten', 'filter-average',
  'bring-front', 'send-back', 'reverse-layers', 'layer-via-cut', 'delete-hidden', 'ungroup', 'hide-layers', 'select-all-layers', 'deselect-layers',
  'mask-reveal-all', 'mask-hide-all', 'mask-reveal-selection', 'mask-hide-selection', 'mask-from-transparency', 'matting-black', 'matting-white',
  'rasterize-type', 'rasterize-shape', 'rasterize-smart', 'rasterize-all', 'reselect', 'grow', 'similar', 'convert-to-shape',
  'save-selection-channel', 'create-layers', 'hide-all-effects', 'link-layers', 'select-linked',
  'frame-from-layers', 'shapes-unite', 'shapes-subtract', 'shapes-intersect', 'shapes-exclude', 'shapes-merge',
  'auto-tone', 'auto-contrast', 'auto-color', 'desaturate', 'equalize', 'equalize-layer-from-selection', 'image-crop',
  'layer-rotate-180', 'layer-rotate-90-cw', 'layer-rotate-90-ccw',
]);

/** A Batch output file name from a template: {name} is the source file name without its extension, {serial} counts from
 *  `serial` in three digits, {date} is the day as yyyy-mm-dd. Characters a file name cannot hold are dropped. */
export function batchName(template: string, base: string, serial: number, day: Date = new Date()): string {
  const n = String(Math.max(0, Math.floor(serial))).padStart(3, '0'), d = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const out = (template.trim() || '{name}').replace(/\{name\}/g, base).replace(/\{serial\}/g, n).replace(/\{date\}/g, d).replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 120);
  return out || base;
}

const KEY = 'formvis.actions';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A step read from storage or a file, checked field by field; null when unusable. */
function stepFrom(v: unknown): ActionStep | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>, label = typeof s.label === 'string' ? s.label.slice(0, 200) : '';
  if (s.kind === 'command' && typeof s.id === 'string' && RECORDABLE.has(s.id)) return { kind: 'command', id: s.id, label: label || s.id };
  const ask = s.ask === true ? { ask: true } : {};
  if (s.kind === 'stop' && typeof s.message === 'string') return { kind: 'stop', label: label || 'Stop', message: s.message.slice(0, 500), allowContinue: s.allowContinue !== false };
  if (s.kind === 'layerStyle' && (s.effects === null || (s.effects && typeof s.effects === 'object'))) return { kind: 'layerStyle', label: label || 'Layer Style', effects: (s.effects as Record<string, unknown> | null) ?? null };
  if (s.kind === 'adjustment' && typeof s.adj === 'string' && (ADJUSTMENT_KINDS as readonly string[]).includes(s.adj) && s.data && typeof s.data === 'object') return { kind: 'adjustment', adj: s.adj, label: label || s.adj, data: s.data as Record<string, unknown>, layer: s.layer === true, ...(s.layer === true ? {} : ask) };
  if (s.kind === 'filter' && typeof s.filter === 'string' && s.settings && typeof s.settings === 'object') return { kind: 'filter', filter: s.filter, label: label || s.filter, settings: s.settings as Record<string, unknown>, ...ask };
  if (s.kind === 'conditional' && isTest(s.test) && typeof s.then === 'string' && typeof s.else === 'string' && (s.then || s.else)) return { kind: 'conditional', label: label || 'Conditional', test: s.test, then: s.then.slice(0, 80), else: s.else.slice(0, 80) };
  if (s.kind === 'play' && typeof s.name === 'string' && s.name) return { kind: 'play', label: label || `Play ${s.name.slice(0, 80)}`, name: s.name.slice(0, 80) };
  if (s.kind === 'menu' && typeof s.id === 'string' && /^[\w.:-]{1,80}$/.test(s.id)) return { kind: 'menu', label: label || s.id, id: s.id };
  if (s.kind === 'unsupported' && typeof s.event === 'string' && typeof s.raw === 'string' && s.raw.length <= 200000) return { kind: 'unsupported', label: label || s.event, event: s.event.slice(0, 40), raw: s.raw };
  const from = isNum(s.fromW) && isNum(s.fromH) && s.fromW > 0 && s.fromH > 0 ? { fromW: s.fromW, fromH: s.fromH } : {};
  if (s.kind === 'imageSize' && isNum(s.w) && isNum(s.h) && typeof s.sampling === 'string' && isNum(s.res)) return { kind: 'imageSize', label: label || 'Image Size', w: s.w, h: s.h, sampling: s.sampling, res: s.res, ...from };
  if (s.kind === 'fitImage' && isNum(s.w) && isNum(s.h) && s.w >= 1 && s.h >= 1) return { kind: 'fitImage', label: label || 'Fit Image', w: Math.round(s.w), h: Math.round(s.h), enlarge: s.enlarge !== false };
  if (s.kind === 'save' && (s.format === 'png' || s.format === 'jpg' || s.format === 'webp') && isNum(s.quality)) return { kind: 'save', label: label || `Save as ${s.format.toUpperCase()}`, format: s.format, quality: Math.min(1, Math.max(0.01, s.quality)) };
  if (s.kind === 'conditionalMode' && Array.isArray(s.from) && s.from.every(isMode) && s.from.length > 0 && isMode(s.to)) return { kind: 'conditionalMode', label: label || 'Conditional Mode Change', from: s.from.filter(isMode), to: s.to };
  if (s.kind === 'canvasSize' && isNum(s.w) && isNum(s.h) && isNum(s.dx) && isNum(s.dy)) {
    const f = s.fill as Record<string, unknown> | null;
    const fill = f && isNum(f.r) && isNum(f.g) && isNum(f.b) ? { r: f.r, g: f.g, b: f.b } : null;
    return { kind: 'canvasSize', label: label || 'Canvas Size', w: s.w, h: s.h, dx: s.dx, dy: s.dy, fill, ...from };
  }
  return null;
}

/** Actions read from JSON: an array of actions or one action; steps that fail the checks are dropped. */
export function actionsFrom(value: unknown): Action[] {
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((a) => {
    if (!a || typeof a !== 'object' || typeof (a as Action).name !== 'string' || !Array.isArray((a as Action).steps)) return [];
    const steps = (a as Action).steps.map((x) => { const s = stepFrom(x); if (s && (x as { off?: unknown }).off === true) s.off = true; return s; }).filter((x): x is ActionStep => x !== null);
    const x = a as Action, set = typeof x.set === 'string' && x.set.trim() ? { set: x.set.trim().slice(0, 80) } : {};
    return [{ name: x.name.slice(0, 80) || 'Action', steps, ...(x.relative === true ? { relative: true } : {}), ...set, ...(isColour(x.colour) && x.colour !== 'none' ? { colour: x.colour } : {}), ...(isKey(x.key) && x.key ? { key: x.key } : {}) }];
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

  add(more: Action[]): void {
    this.list.push(...more);
    for (const a of more) if (a.key && this.list.some((x) => x !== a && x.key === a.key)) delete a.key;
    this.save();
  }

  /** Gives `a` the function-key shortcut `key` ('' clears it); another action holding that key loses it. */
  setKey(a: Action, key: string): void {
    if (!isKey(key)) return;
    if (key) for (const x of this.list) if (x !== a && x.key === key) delete x.key;
    if (key) a.key = key; else delete a.key;
    this.save();
  }

  /** The action that runs on this key press, if one has it. */
  forKey(combo: string): Action | undefined { return combo ? this.list.find((x) => x.key === combo) : undefined; }

  /** Adds `step` to the action being recorded, unless an action is playing. */
  record(step: ActionStep): void { if (!this.active || this.playing) return; this.active.steps.push(step); this.save(); }

  /** Runs each step through `run`, stopping at the first that cannot run, or that the person stopped (a stop step, or a
   *  dialog cancelled while paused for input); returns how many ran, which step ended it, and whether it was stopped. */
  async play(a: Action, run: (step: ActionStep) => boolean | 'stopped' | Promise<boolean | 'stopped'>, from = 0): Promise<{ done: number; failed: string | null; stopped: boolean }> {
    const was = this.playing;
    this.playing = true;
    try {
      for (let i = Math.max(0, Math.min(a.steps.length, Math.floor(from))); i < a.steps.length; i++) {
        if (a.steps[i].off || a.steps[i].kind === 'unsupported') continue;
        const r = await run(a.steps[i]);
        if (r !== true) return { done: i, failed: a.steps[i].label, stopped: r === 'stopped' };
      }
      return { done: a.steps.length, failed: null, stopped: false };
    } finally { this.playing = was; }
  }
}
