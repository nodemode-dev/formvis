import { listCommands, runCommand } from '../../automation/catalogue';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

const MAX_LINES = 500;
const MAX_CHARS = 2000;
const AsyncFunction = Object.getPrototypeOf(async function () { /* constructor holder */ }).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;

export interface ConsoleDeps {
  /** The plugin API object plugins get, created under the identity 'console'. */
  api(): unknown;
  /** True while an outside agent's call is running. */
  agentBusy(): boolean;
}

/** Window > Script Console (DEV_PLAN 36.7). The input is JavaScript run as an async function body with `formvis` in scope.
 *  The DOM is built once; every line is appended to the log (never rebuilt) and the oldest drop past 500. */
export class ScriptConsoleDialog extends Dialog {
  private readonly log = el('<div class="cv-console-log" role="log" aria-live="polite" tabindex="0" style="height: 260px; overflow-y: auto; font: var(--fs-12)/1.45 var(--font-mono, monospace); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 8px; user-select: text; -webkit-user-select: text"></div>');
  private readonly input = el('<textarea class="cv-input" rows="1" spellcheck="false" autocomplete="off" aria-label="Script" placeholder="formvis.run(\'id\'), formvis.commands(), formvis.api, formvis.log(...)" style="width: 100%; margin-top: 6px; resize: vertical; font: 12px/1.4 var(--font-mono, monospace)"></textarea>') as HTMLTextAreaElement;
  private readonly history: string[] = [];
  private cursor = 0;
  private draft = '';
  private busy = false;
  private greeted = false;

  constructor(private readonly deps: ConsoleDeps) {
    super('Script Console', 560);
    this.body.append(this.log, this.input,
      el('<p class="cv-dialog-note">Enter runs. Shift+Enter adds a line. Up and Down walk earlier lines.</p>'));
    this.input.addEventListener('keydown', (e) => this.key(e));
    const clear = el('<button class="cv-btn" type="button">Clear</button>') as HTMLButtonElement;
    clear.addEventListener('click', () => this.log.replaceChildren());
    this.foot.append(clear);
    this.button('Done', 'primary', () => this.close());
  }

  show(): void {
    if (!this.greeted) { this.greeted = true; this.line('JavaScript runs as an async function body. In scope: formvis.run(id, args), formvis.commands(), formvis.api, formvis.log(...).', 'info'); }
    this.open();
    this.input.focus();
  }

  private line(text: string, kind: 'in' | 'out' | 'err' | 'info'): void {
    const row = el('<div style="white-space: pre-wrap; overflow-wrap: anywhere"></div>');
    row.style.color = kind === 'err' ? 'var(--danger, #e5484d)' : kind === 'in' || kind === 'info' ? 'var(--text-muted)' : '';
    setText(row, kind === 'in' ? `> ${text}` : text);
    const stick = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 24;
    this.log.append(row);
    while (this.log.childElementCount > MAX_LINES) this.log.firstElementChild?.remove();
    if (stick) this.log.scrollTop = this.log.scrollHeight;
  }

  private show1(v: unknown): string {
    if (typeof v === 'string') return v.length > MAX_CHARS ? `${v.slice(0, MAX_CHARS)} ... (cut)` : v;
    let s: string;
    try { s = JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : ArrayBuffer.isView(x) ? `${x.constructor.name}(${(x as Uint8Array).length})` : x), 2) ?? String(v); } catch { s = String(v); }
    return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)} ... (cut)` : s;
  }

  private key(e: KeyboardEvent): void {
    const i = this.input;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void this.run(); return; }
    if (e.key === 'ArrowUp' && !i.value.slice(0, i.selectionStart).includes('\n') && this.cursor > 0) {
      e.preventDefault();
      if (this.cursor === this.history.length) this.draft = i.value;
      i.value = this.history[--this.cursor];
    } else if (e.key === 'ArrowDown' && !i.value.slice(i.selectionEnd).includes('\n') && this.cursor < this.history.length) {
      e.preventDefault();
      this.cursor++;
      i.value = this.cursor === this.history.length ? this.draft : this.history[this.cursor];
    } else return;
    i.rows = Math.min(6, i.value.split('\n').length);
  }

  private async run(): Promise<void> {
    const code = this.input.value.trim();
    if (!code || this.busy) return;
    if (this.history[this.history.length - 1] !== code) this.history.push(code);
    this.cursor = this.history.length;
    this.draft = '';
    this.input.value = '';
    this.input.rows = 1;
    this.line(code, 'in');
    if (this.deps.agentBusy()) { this.line('An outside agent is working in formvis right now. Try again when it has finished.', 'err'); return; }
    this.busy = true;
    const formvis = {
      run: async (id: string, args?: Record<string, unknown>): Promise<unknown> => {
        const r = await runCommand(String(id), args ?? {});
        if (!r.ok) throw new Error(r.error ?? `${id} did not run.`);
        return r.result;
      },
      commands: (): Array<{ id: string; label: string }> => listCommands().map((c) => ({ id: c.id, label: c.label })),
      api: this.deps.api(),
      log: (...a: unknown[]): void => this.line(a.map((x) => this.show1(x)).join(' '), 'out'),
    };
    try {
      let fn: (...a: unknown[]) => Promise<unknown>;
      try { fn = new AsyncFunction('formvis', `return (\n${code.replace(/[;\s]+$/, '')}\n);`); } catch { fn = new AsyncFunction('formvis', code); }
      const v = await fn(formvis);
      if (v !== undefined) this.line(this.show1(v), 'out');
    } catch (err) {
      this.line(err instanceof Error ? `${err.name}: ${err.message}` : String(err), 'err');
    } finally { this.busy = false; }
  }
}
