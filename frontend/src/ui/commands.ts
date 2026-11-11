import { isMac } from './dom';

export interface Command {
  id: string;
  label: string | (() => string);
  /** Key combos; the first is the one menus show. */
  keys?: string[];
  icon?: string;
  run: (params?: Record<string, unknown>) => unknown;
  enabled?: () => boolean;
  checked?: () => boolean;
  /** The catalogue's words (DEV_PLAN 28.3); a command may leave them to automation/command-meta.ts. */
  group?: string;
  description?: string;
  /** One "Use when ..." sentence, for an agent choosing between commands. */
  when?: string;
  params?: Record<string, CommandParam>;
  mutates?: boolean;
  /** Undo cannot reverse it: it overwrites or exports over a file, closes without saving, deletes several layers, prints or publishes. */
  risky?: boolean;
}

export interface CommandParam { type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'; required?: boolean; enum?: ReadonlyArray<string | number>; min?: number; max?: number; description?: string }

export class Told extends Error {}

/** Names given to some physical key codes inside a combo. */
const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', NumpadAdd: '=', NumpadSubtract: '-',
  Backspace: 'Backspace', Delete: 'Delete', Enter: 'Enter', Escape: 'Escape', Space: 'Space',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Slash: '/', Tab: 'Tab',
};

/** The combo text a key event stands for, in the form saved bindings use, e.g. 'Alt+Shift+Mod+S'. */
export function comboOf(e: KeyboardEvent): string {
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) key = e.code.slice(6);
  else if (e.code in CODE_KEYS) key = CODE_KEYS[e.code];
  else key = e.key;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  return (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + (mod ? 'Mod+' : '') + key;
}

/** Glyphs for the Apple menu style. */
const GLYPHS: Record<string, string> = {
  Mod: '⌘', Shift: '⇧', Alt: '⌥', Backspace: '⌫', Delete: '⌦', Enter: '↩',
  Up: '↑', Down: '↓', Left: '←', Right: '→', Escape: 'Esc',
};

/** Renders a combo for display; a combo ending in '++' means the plus key itself. */
export function formatKeys(combo: string): string {
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+');
  if (isMac) return parts.map((p) => GLYPHS[p] ?? p).join('');
  return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+');
}

export class Commands {
  /** Called after each command runs, for Actions to record it, with its label as it read before running. */
  onRun: ((cmd: Command, label: string) => void) | null = null;
  private readonly map = new Map<string, Command>();
  private readonly byKey = new Map<string, Command>();
  private readonly defaults = new Map<string, string[]>();

  add(...cmds: Command[]): void {
    for (const cmd of cmds) {
      if (this.map.has(cmd.id)) throw new Error(`duplicate command: ${cmd.id}`);
      this.map.set(cmd.id, cmd);
      this.defaults.set(cmd.id, [...(cmd.keys ?? [])]);
      for (const k of cmd.keys ?? []) this.byKey.set(k, cmd);
    }
    this.onChange?.();
  }

  /** Called after commands are added or removed, for the catalogue to mirror itself to the engine. */
  onChange: (() => void) | null = null;

  /** Rebinds a command (1.53.4, Edit > Keyboard Shortcuts): its keys replaced, each taken from whichever command had it. */
  setKeys(id: string, keys: string[]): void {
    const cmd = this.map.get(id);
    if (!cmd) return;
    for (const k of cmd.keys ?? []) if (this.byKey.get(k) === cmd) this.byKey.delete(k);
    for (const k of keys) {
      const had = this.byKey.get(k);
      if (had && had !== cmd) had.keys = (had.keys ?? []).filter((x) => x !== k);
      this.byKey.set(k, cmd);
    }
    cmd.keys = [...keys];
  }

  /** The command that has `combo`, if any. */
  forCombo(combo: string): Command | undefined { return this.byKey.get(combo); }

  /** A command's keys as defined, before any rebinding. */
  defaultKeys(id: string): string[] { return [...(this.defaults.get(id) ?? [])]; }

  /** Every command's keys that differ from its defaults: what Preferences keeps. */
  overrides(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [id, cmd] of this.map) { const d = this.defaults.get(id) ?? [], k = cmd.keys ?? []; if (d.length !== k.length || d.some((x, i) => x !== k[i])) out[id] = [...k]; }
    return out;
  }

  /** Back to every command's defined keys. */
  resetKeys(): void { this.byKey.clear(); for (const [id, cmd] of this.map) { cmd.keys = [...(this.defaults.get(id) ?? [])]; for (const k of cmd.keys) this.byKey.set(k, cmd); } }

  /** Takes a command away (1.52.6: a plugin turned off or removed). */
  remove(id: string): void { const c = this.map.get(id); if (!c) return; this.map.delete(id); for (const k of c.keys ?? []) if (this.byKey.get(k) === c) this.byKey.delete(k); this.onChange?.(); }

  relabel(id: string, label: string, words: Partial<Pick<Command, 'description' | 'when'>> = {}): void { const c = this.map.get(id); if (!c) return; c.label = label; Object.assign(c, words); this.onChange?.(); }
  get(id: string): Command | undefined { return this.map.get(id); }
  all(): Command[] { return [...this.map.values()]; }
  label(cmd: Command): string { return typeof cmd.label === 'function' ? cmd.label() : cmd.label; }
  /** What the document allows before a command's own test (1.53.6: a 16-bit document allows its 16-bit commands). */
  gate: ((cmd: Command) => boolean) | null = null;
  enabled(cmd: Command): boolean { return !this.why(cmd) && (!this.gate || this.gate(cmd)) && (cmd.enabled ? cmd.enabled() : true); }
  /** Why a command is off for a reason outside the document (DEV_PLAN 36.19: it needs the engine service, which is
   *  not running), as the title menus and the palette show; '' when nothing outside stops it. */
  blocked: ((cmd: Command) => string) | null = null;
  why(cmd: Command): string { return this.blocked ? this.blocked(cmd) : ''; }
  keyLabel(cmd: Command): string { return cmd.keys && cmd.keys.length ? formatKeys(cmd.keys[0]) : ''; }
  forEvent(e: KeyboardEvent): Command | undefined { return this.byKey.get(comboOf(e)); }

  run(id: string, params?: Record<string, unknown>): boolean {
    const cmd = this.map.get(id);
    if (!cmd || !this.enabled(cmd)) return false;
    const label = this.label(cmd);
    const out = cmd.run(params);
    if (out instanceof Promise) out.catch((e: unknown) => { if (!(e instanceof Told)) throw e; });
    this.onRun?.(cmd, label);
    return true;
  }

  /** Like run, but waits for a command that works in the background and hands back what it returned. */
  async call(id: string, params?: Record<string, unknown>): Promise<{ ran: boolean; result?: unknown }> {
    const cmd = this.map.get(id);
    if (!cmd || !this.enabled(cmd)) return { ran: false };
    const label = this.label(cmd);
    const result = await cmd.run(params);
    this.onRun?.(cmd, label);
    return { ran: true, result };
  }
}
