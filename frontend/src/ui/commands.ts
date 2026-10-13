import { isMac } from './dom';

export interface Command {
  id: string;
  label: string | (() => string);
  /** Key combos; the first is the one menus show. */
  keys?: string[];
  icon?: string;
  run: () => void;
  enabled?: () => boolean;
  checked?: () => boolean;
}

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
  }

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
  remove(id: string): void { const c = this.map.get(id); if (!c) return; this.map.delete(id); for (const k of c.keys ?? []) if (this.byKey.get(k) === c) this.byKey.delete(k); }

  get(id: string): Command | undefined { return this.map.get(id); }
  all(): Command[] { return [...this.map.values()]; }
  label(cmd: Command): string { return typeof cmd.label === 'function' ? cmd.label() : cmd.label; }
  /** What the document allows before a command's own test (1.53.6: a 16-bit document allows its 16-bit commands). */
  gate: ((cmd: Command) => boolean) | null = null;
  enabled(cmd: Command): boolean { return (!this.gate || this.gate(cmd)) && (cmd.enabled ? cmd.enabled() : true); }
  keyLabel(cmd: Command): string { return cmd.keys && cmd.keys.length ? formatKeys(cmd.keys[0]) : ''; }
  forEvent(e: KeyboardEvent): Command | undefined { return this.byKey.get(comboOf(e)); }

  run(id: string): boolean {
    const cmd = this.map.get(id);
    if (!cmd || !this.enabled(cmd)) return false;
    const label = this.label(cmd);
    cmd.run();
    this.onRun?.(cmd, label);
    return true;
  }
}
