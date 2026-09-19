import { isMac } from './dom';

export interface Command {
  id: string;
  label: string | (() => string);
  keys?: string[];
  icon?: string;
  run: () => void;
  enabled?: () => boolean;
  checked?: () => boolean;
}

const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', NumpadAdd: '=', NumpadSubtract: '-', Backspace: 'Backspace', Delete: 'Delete',
  Enter: 'Enter', Escape: 'Escape', Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Slash: '/', Tab: 'Tab',
};

export function comboOf(e: KeyboardEvent): string {
  const c = e.code;
  const key = c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : c.startsWith('Numpad') && /\d$/.test(c) ? c.slice(6) : CODE_KEYS[c] ?? e.key;
  const parts: string[] = [];
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  parts.push(key);
  return parts.join('+');
}

const GLYPHS: Record<string, string> = {
  Mod: '\u2318', Shift: '\u21e7', Alt: '\u2325', Backspace: '\u232b', Delete: '\u2326', Enter: '\u21a9',
  Up: '\u2191', Down: '\u2193', Left: '\u2190', Right: '\u2192', Escape: 'Esc',
};

export function formatKeys(combo: string): string {
  const parts = combo.split('+');
  if (combo.endsWith('++')) { parts.pop(); parts[parts.length - 1] = '+'; }
  if (isMac) return parts.map((p) => GLYPHS[p] ?? p).join('');
  return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+');
}

export class Commands {
  private readonly map = new Map<string, Command>();
  private readonly byKey = new Map<string, Command>();

  add(...cmds: Command[]): void {
    for (const cmd of cmds) {
      if (this.map.has(cmd.id)) throw new Error(`duplicate command: ${cmd.id}`);
      this.map.set(cmd.id, cmd);
      for (const k of cmd.keys ?? []) this.byKey.set(k, cmd);
    }
  }

  get(id: string): Command | undefined { return this.map.get(id); }
  all(): Command[] { return [...this.map.values()]; }
  label(cmd: Command): string { return typeof cmd.label === 'function' ? cmd.label() : cmd.label; }
  enabled(cmd: Command): boolean { return cmd.enabled ? cmd.enabled() : true; }
  keyLabel(cmd: Command): string { const k = cmd.keys?.[0]; return k ? formatKeys(k) : ''; }
  forEvent(e: KeyboardEvent): Command | undefined { return this.byKey.get(comboOf(e)); }

  run(id: string): boolean {
    const cmd = this.map.get(id);
    if (!cmd || !this.enabled(cmd)) return false;
    cmd.run();
    return true;
  }
}
