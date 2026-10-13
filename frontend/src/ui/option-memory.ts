import type { Engine, RGB } from '../engine';
import { toolList, type OptionSpec, type Tool } from '../extensions/registry';
import { loadPrefs, updatePrefs, type ToolOptionValue } from './prefs';

/** DEV_PLAN 35.1: every tool option sticks. The tools keep their options in the engine or in their own module state and
 *  start each session at the defaults; this wraps each tool's `options` so a change made anywhere (the options bar, the
 *  command catalogue, an agent, a key) is kept in Preferences under `tool.option`, and puts the kept values back when
 *  formvis starts. A value equal to the tool's own default is not kept, so a default that changes later still reaches
 *  everyone who never moved it. Values are put back oldest change first, so where two tools share one setting (the
 *  brush size) the latest change wins. */

/** Options that describe the open document or the current gesture, not a setting: never kept. */
const NEVER: Record<string, readonly string[] | '*'> = {
  move: ['X', 'Y', 'W', 'H', 'Scale', 'Angle', 'Sampling', 'Perspective Warp'],
  rotateView: '*',
  crop: ['Straighten', 'Perspective'],
  cloneStamp: ['Source'],
  type: ['Color'],
};

type Settable = Extract<OptionSpec, { kind: 'segment' | 'range' | 'toggle' | 'select' | 'color' | 'number' }>;
type Kept = { spec: Settable; key: string };
const settable = (s: OptionSpec): s is Settable => s.kind !== 'title' && s.kind !== 'readout' && s.kind !== 'button';

const skipped = (tool: string, label: string): boolean => { const n = NEVER[tool]; return n === '*' || !!n?.includes(label); };

/** The specs worth keeping, with the key each is kept under (a repeated label gets a count, as the catalogue names it). */
function keptSpecs(tool: Tool, specs: OptionSpec[]): Kept[] {
  const seen = new Map<string, number>(), out: Kept[] = [];
  for (const spec of specs) {
    if (!settable(spec)) continue;
    const label = spec.label || 'option', n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    if (skipped(tool.id, label)) continue;
    out.push({ spec, key: `${tool.id}.${label}${n > 1 ? `#${n}` : ''}` });
  }
  return out;
}

const hex = (c: RGB): string => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** The value as it is kept, or undefined when it is not one that can be. */
function valueOf(spec: Kept['spec']): ToolOptionValue | undefined {
  let v: unknown;
  try { v = spec.get(); } catch { return undefined; }
  if (spec.kind === 'color') return v && typeof v === 'object' ? hex(v as RGB) : undefined;
  if (spec.kind === 'toggle') return typeof v === 'boolean' ? v : undefined;
  if (spec.kind === 'range' || spec.kind === 'number') return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  return typeof v === 'string' ? v : undefined;
}

const same = (a: ToolOptionValue | undefined, b: ToolOptionValue | undefined): boolean => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6);

/** Whether `v` is something this control can take: a choice it lists, a number inside its range. */
function accepts(tool: string, spec: Kept['spec'], v: ToolOptionValue): boolean {
  if (spec.kind === 'toggle') return typeof v === 'boolean';
  if (spec.kind === 'range') return typeof v === 'number' && v >= spec.min && v <= spec.max;
  if (spec.kind === 'number') return typeof v === 'number' && (spec.min === undefined || v >= spec.min) && (spec.max === undefined || v <= spec.max);
  if (spec.kind === 'color') return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if (typeof v !== 'string') return false;
  if (spec.kind === 'select' && tool === 'type' && spec.label === 'Font') return true;
  const list = spec.kind === 'select' && spec.live ? spec.live() : spec.choices;
  return list.some((c) => c.id === v);
}

export function installOptionMemory(engine: Engine): void {
  const tools = new Map<string, Tool>(), original = new Map<string, NonNullable<Tool['options']>>(), defaults = new Map<string, ToolOptionValue>();
  let restoring = false;

  const store = (key: string, v: ToolOptionValue | undefined): void => {
    if (restoring || v === undefined) return;
    const cur = loadPrefs().toolOptions, had = cur[key], isDefault = same(defaults.get(key), v);
    if (isDefault && had === undefined) return;
    if (!isDefault && same(had, v)) return;
    const next = { ...cur };
    delete next[key];   // a changed value goes to the end, so the latest change is the last put back
    if (!isDefault) next[key] = v;
    updatePrefs({ toolOptions: next });
  };

  /** What a tool's bar shows now, kept: the keys (the brush size's bracket keys, a tool's own shortcuts) set values
   *  without going through a control. Only the active tool is read, once a frame at most. */
  let frame = 0;
  const capture = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const t = tools.get(engine.tool), raw = t ? original.get(t.id) : undefined;
      if (!t || !raw) return;
      for (const { spec, key } of keptSpecs(t, raw.call(t, engine))) if (defaults.has(key)) store(key, valueOf(spec));
    });
  };

  for (const t of toolList()) {
    const raw = t.options;
    if (!raw) continue;
    tools.set(t.id, t);
    original.set(t.id, raw);
    try { for (const { spec, key } of keptSpecs(t, raw.call(t, engine))) { const v = valueOf(spec); if (v !== undefined) defaults.set(key, v); } } catch { /* a tool whose options need a document keeps none */ }
    t.options = (e) => {
      const specs = raw.call(t, e);
      for (const { spec, key } of keptSpecs(t, specs)) {
        const set = spec.set as (v: unknown) => void;
        (spec as { set: (v: unknown) => void }).set = (v) => { set(v); store(key, valueOf(spec)); };
      }
      return specs;
    };
  }

  // Put the kept values back, oldest first.
  restoring = true;
  const before = engine.tool;
  try {
    for (const [key, v] of Object.entries(loadPrefs().toolOptions)) {
      const dot = key.indexOf('.'), t = tools.get(key.slice(0, dot)), raw = t ? original.get(t.id) : undefined;
      if (!t || !raw) continue;
      try {
        const hit = keptSpecs(t, raw.call(t, engine)).find((k) => k.key === key);
        if (!hit || !accepts(t.id, hit.spec, v) || same(valueOf(hit.spec), v)) continue;
        if (hit.spec.kind === 'color') (hit.spec.set as (c: RGB) => void)({ r: parseInt(String(v).slice(1, 3), 16), g: parseInt(String(v).slice(3, 5), 16), b: parseInt(String(v).slice(5, 7), 16) });
        else (hit.spec.set as (x: unknown) => void)(v);
      } catch { /* one option that cannot be put back leaves the rest */ }
    }
  } finally { restoring = false; }
  if (engine.tool !== before) engine.setTool(before);
  engine.emit('options', null);

  engine.on('options', capture);
  engine.on('tool', capture);
}
