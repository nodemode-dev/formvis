import { api } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, patchList, setHidden, setText, setTitle } from '../dom';
import { selectRow } from './controls';

type Level = 'error' | 'warn' | 'info';
interface Line { key: string; at: number; level: Level; where: 'window' | 'engine'; text: string }
export interface ConsoleLogDeps {
  /** The window's error ring: the uncaught errors, unfinished tasks and engine failures of this session. */
  entries(): ReadonlyArray<{ at: number; what: string; message: string }>;
  /** Forget the window's own entries. */
  clearEntries(): void;
  /** Copy text to the clipboard and say so. */
  copy(text: string): void;
}

const RANK: Record<Level, number> = { info: 0, warn: 1, error: 2 };
const LEVEL_RE = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(?:,\d+)? (DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL)\b/;

/** Help > Console (Log): the window's error ring and the end of the engine's log file, with a level and a text filter.
 *  The list is built once and patched by key, so a refresh or a filter change never rebuilds a row that stays. */
export class ConsoleLogDialog extends Dialog {
  private min: Level = 'info';
  private text = '';
  private lines: Line[] = [];
  private hidden = new Set<string>();
  private path = '';
  private readonly list = el('<div class="cv-conlog" role="log" tabindex="0" style="height: 280px; overflow-y: auto; font: var(--fs-12)/1.45 var(--font-mono, monospace); border: 1px solid var(--border-color); border-radius: var(--radius-sm, 4px); padding: var(--space-2); background: var(--bg-primary)"></div>');
  private readonly empty = el('<p class="cv-dialog-note" hidden>Nothing matches.</p>');
  private readonly pathNote = el('<p class="cv-dialog-note"></p>');
  private readonly count = el('<span class="cv-dialog-note" style="margin-right: auto"></span>');
  private readonly filter = el<HTMLInputElement>('<input class="cv-input" type="text" aria-label="Filter the log" placeholder="Filter the text" spellcheck="false" autocomplete="off">');

  constructor(private readonly deps: ConsoleLogDeps) {
    super('Console', 640);
    const level = selectRow('Level', [['info', 'All'], ['warn', 'Warnings and errors'], ['error', 'Errors only']], (v) => { this.min = v as Level; this.paint(); });
    this.body.append(level.el, this.filter, this.list, this.empty, this.pathNote);
    this.filter.addEventListener('input', () => { this.text = this.filter.value.trim().toLowerCase(); this.paint(); });
    this.foot.append(this.count);
    this.button('Refresh', 'ghost', () => void this.load());
    this.button('Copy', 'ghost', () => this.deps.copy(this.visible().map((l) => `${new Date(l.at).toISOString()} ${l.level} ${l.where} ${l.text}`).join('\n')));
    this.button('Copy Path', 'ghost', () => { if (this.path) this.deps.copy(this.path); });
    this.button('Clear', 'ghost', () => { this.deps.clearEntries(); for (const l of this.lines) this.hidden.add(l.key); this.paint(); });
    this.button('Done', 'primary', () => this.close());
  }

  show(): void {
    this.open(this.filter);
    void this.load();
  }

  private async load(): Promise<void> {
    const out: Line[] = this.deps.entries().map((e, i) => ({ key: `w:${e.at}:${i}`, at: e.at, level: 'error' as Level, where: 'window' as const, text: `${e.what} · ${e.message}` }));
    const log = await api.engineLog(400);
    if (log) {
      this.path = log.path;
      const seen = new Map<string, number>();
      let last = 0;
      for (const raw of log.text.split('\n')) {
        if (!raw.trim()) continue;
        const m = LEVEL_RE.exec(raw);
        const at = m ? Date.parse(m[1].replace(' ', 'T')) : last;
        if (m) last = at;
        const level: Level = m && /^(ERROR|CRITICAL)$/.test(m[2]) ? 'error' : m && /^WARN/.test(m[2]) ? 'warn' : 'info';
        const n = (seen.get(raw) ?? 0) + 1;
        seen.set(raw, n);
        out.push({ key: `e:${n}:${raw}`, at, level, where: 'engine', text: raw });
      }
    } else this.path = '';
    this.lines = out.sort((a, b) => a.at - b.at);
    setText(this.pathNote, this.path ? `Engine log: ${this.path}` : 'The engine is offline, so only this window\u2019s own errors are listed.');
    this.paint();
  }

  private visible(): Line[] {
    return this.lines.filter((l) => !this.hidden.has(l.key) && RANK[l.level] >= RANK[this.min] && (!this.text || l.text.toLowerCase().includes(this.text)));
  }

  private paint(): void {
    const stick = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 24;
    const rows = this.visible();
    patchList(this.list, rows, {
      key: (l) => l.key,
      create: (l) => { const r = el('<div style="white-space: pre-wrap; overflow-wrap: anywhere"></div>'); this.style(r, l); return r; },
      update: (r, l) => this.style(r, l),
    });
    setHidden(this.empty, rows.length > 0);
    setText(this.count, `${rows.length} of ${this.lines.length}`);
    if (stick) this.list.scrollTop = this.list.scrollHeight;
  }

  private style(r: HTMLElement, l: Line): void {
    const color = l.level === 'error' ? 'var(--danger, #e5484d)' : l.level === 'warn' ? 'var(--warning-color, #f59e0b)' : '';
    if (r.style.color !== color) r.style.color = color;
    if (r.textContent !== l.text) setText(r, l.text);
    setTitle(r, l.where === 'window' ? new Date(l.at).toISOString() : '');
    if (r.dataset.level !== l.level) r.dataset.level = l.level;
  }

  /** The row count in the list, for checks. */
  get rows(): number { return this.list.querySelectorAll('[data-key]').length; }
}
