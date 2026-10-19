import type { Engine } from '../engine';

/** Preferences > History Log: with it on, every new history step is written down with the time and the document,
 *  kept on this device (the newest 2000), and saved as a text file from Edit > History Log. */
export interface LogEntry { at: number; doc: string; step: string }

const STORE = 'formvis.historyLog';
const LIMIT = 2000;

export class HistoryLog {
  private entries: LogEntry[] = [];
  private seen = new WeakMap<object, number>();
  private on = false;

  constructor(private readonly engine: Engine) {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) ?? '[]') as unknown;
      if (Array.isArray(raw)) this.entries = raw.filter((e): e is LogEntry => !!e && typeof e.at === 'number' && typeof e.doc === 'string' && typeof e.step === 'string').slice(-LIMIT);
    } catch { /* an empty log */ }
    engine.on('projects', () => { for (const p of engine.projects) if (!this.seen.has(p)) this.seen.set(p, p.history.steps.names.length); });
    engine.on('history', () => this.note());
  }

  get count(): number { return this.entries.length; }

  /** Turns logging on or off; steps made while it was off are not back-filled. */
  enable(on: boolean): void {
    this.on = on;
    const p = this.engine.current;
    if (on && p) this.seen.set(p, p.history.steps.names.length);
  }

  private note(): void {
    const p = this.engine.current;
    if (!p) return;
    const names = p.history.steps.names, before = this.seen.get(p);
    this.seen.set(p, names.length);
    if (!this.on || before === undefined || names.length <= before) return;
    for (let i = before; i < names.length; i++) this.entries.push({ at: Date.now(), doc: p.name, step: names[i] });
    if (this.entries.length > LIMIT) this.entries.splice(0, this.entries.length - LIMIT);
    try { localStorage.setItem(STORE, JSON.stringify(this.entries)); } catch { /* kept for this session only */ }
  }

  clear(): void {
    this.entries = [];
    try { localStorage.removeItem(STORE); } catch { /* nothing kept */ }
  }

  text(): string {
    return this.entries.map((e) => `${new Date(e.at).toISOString()}\t${e.doc}\t${e.step}`).join('\n') + (this.entries.length ? '\n' : '');
  }
}
