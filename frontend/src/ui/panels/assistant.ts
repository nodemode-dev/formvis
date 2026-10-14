import type { Engine } from '../../engine';
import { api, ApiError } from '../../io/api';
import type { AgentBridge, McpResult } from '../../automation/agent-bridge';
import { describeCommand, runCommand } from '../../automation/catalogue';
import { el, setDisabled, setHidden, setText, setTitle } from '../dom';

const SYSTEM = 'You are the assistant inside formvis, a layered image editor. Act on the open document with the tools: call get_document first '
  + 'to learn its layers and their ids. Each change is one undoable step. Generative tools cost the user money and they are asked first. '
  + 'Prefer commands: for anything the menus can do, call list_commands (with text or group) to find the command id, then call run_command with that id '
  + 'and its params. Keep each tool call to one command, so each step can be undone on its own. Use the other tools only for what commands cannot do. '
  + 'Keep replies short and say what you changed.';
const PLAN = ' The user asked to see a plan first. Do not call any tool now. Reply with a short numbered plan, one command per line, naming the command '
  + 'and its settings in plain words. Wait for the go-ahead before acting.';
const MAX_STEPS = 12;

/** One tool call's row in the log: patched in place as the call runs, and the history steps it made (before to after). */
interface StepRow { el: HTMLElement; status: HTMLElement; undo: HTMLButtonElement; project: string; before: number; after: number; label: string; state: 'running' | 'done' | 'failed' | 'undone' }

const STATUS_WORDS = { running: 'Running', done: 'Done', failed: 'Failed', undone: 'Undone' } as const;
const plainValue = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'number' ? String(v) : JSON.stringify(v));
const plainArgs = (o: Record<string, unknown>): string => Object.entries(o).map(([k, v]) => `${k.replace(/[_.]+/g, ' ')}: ${plainValue(v)}`).join(', ');
const humanTool = (name: string): string => { const s = name.replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };

/** Window > Assistant (1.52.2, the capability plan): a chat beside the canvas on the language model set in Preferences >
 *  Plugins, acting through the same tools outside agents use (each change undoable; anything that costs money asked
 *  first). Each tool call is a card; Undo This Turn walks the document back to before the last message. */
export class AssistantPanel {
  readonly el = el('<aside class="cv-assistant" role="complementary" aria-label="Assistant" hidden></aside>');
  private readonly log = el('<div class="cv-assistant-log" role="log" aria-live="polite"></div>');
  private readonly input = el<HTMLTextAreaElement>('<textarea class="cv-input" rows="3" aria-label="Message" placeholder="Ask for a change, e.g. add a warm glow to the sky"></textarea>');
  private readonly send = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-primary">Send</button>');
  private readonly stop = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" disabled>Stop</button>');
  private readonly undoTurn = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" disabled>Undo This Turn</button>');
  private readonly planBox = el<HTMLInputElement>('<input type="checkbox">');
  private readonly planLabel = el<HTMLLabelElement>('<label class="cv-check cv-assistant-plan"><span>Plan first</span></label>');
  private readonly rows: StepRow[] = [];
  private planBar: HTMLElement | null = null;
  private history: unknown[] = [];
  private busy = false;
  private stopped = false;
  private turn: { projectId: string; depth: number } | null = null;

  constructor(private readonly engine: Engine, private readonly bridge: AgentBridge) {
    const head = el('<div class="cv-assistant-head"><span>Assistant</span></div>'), close = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" aria-label="Close assistant">Close</button>');
    close.addEventListener('click', () => this.toggle(false));
    head.append(close);
    const foot = el('<div class="cv-assistant-foot"></div>'), row = el('<div class="cv-improve"></div>');
    row.append(this.send, this.stop, this.undoTurn);
    this.planLabel.prepend(this.planBox);
    foot.append(this.input, this.planLabel, row);
    this.engine.on('history', () => this.refreshRows());
    this.el.append(head, this.log, foot);
    this.send.addEventListener('click', () => void this.ask());
    this.stop.addEventListener('click', () => { this.stopped = true; });
    this.undoTurn.addEventListener('click', () => this.undo());
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void this.ask(); } e.stopPropagation(); });
  }

  toggle(on = this.el.hidden): void { setHidden(this.el, !on); if (on) this.input.focus(); }

  private line(kind: 'user' | 'assistant' | 'note', text: string): void {
    const p = el(`<div class="cv-assistant-msg is-${kind}"></div>`);
    setText(p, text);
    this.log.append(p);
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** The command's label from the catalogue for run_command, else the tool's name in words. */
  private labelOf(name: string, args: Record<string, unknown>): { label: string; shown: Record<string, unknown> } {
    if (name === 'run_command' && typeof args.id === 'string') {
      const p = args.params && typeof args.params === 'object' && !Array.isArray(args.params) ? args.params as Record<string, unknown> : {};
      return { label: describeCommand(args.id)?.label ?? args.id, shown: p };
    }
    if (name === 'list_commands') return { label: 'Look up commands', shown: args };
    return { label: humanTool(name), shown: args };
  }

  /** A new row for a tool call, appended once and patched from then on. */
  private stepRow(label: string, shown: Record<string, unknown>): StepRow {
    const c = el('<div class="cv-assistant-card cv-assistant-step"><div class="cv-assistant-step-head"><strong class="cv-assistant-step-label"></strong><span class="cv-assistant-step-status"></span>'
      + '<button type="button" class="cv-btn cv-btn-ghost">Undo</button></div><p class="cv-assistant-args"></p><p class="cv-assistant-result"></p></div>');
    setText(c.querySelector('.cv-assistant-step-label'), label);
    setText(c.querySelector('.cv-assistant-args'), plainArgs(shown));
    const p = this.engine.current, depth = p ? p.history.steps.current : 0;
    const row: StepRow = { el: c, status: c.querySelector('.cv-assistant-step-status') as HTMLElement, undo: c.querySelector('button') as HTMLButtonElement, project: p?.id ?? '', before: depth, after: depth, label, state: 'running' };
    row.undo.addEventListener('click', () => this.undoRow(row));
    this.rows.push(row);
    this.setState(row, 'running');
    this.log.append(c);
    this.log.scrollTop = this.log.scrollHeight;
    return row;
  }

  private setState(row: StepRow, state: StepRow['state']): void {
    row.state = state;
    setText(row.status, STATUS_WORDS[state]);
    row.el.classList.toggle('is-error', state === 'failed');
    this.refreshRows();
  }

  /** Undo is for the latest history step only: enabled when this row's steps are the newest ones done. */
  private refreshRows(): void {
    const p = this.engine.current;
    for (const r of this.rows) {
      const made = r.after - r.before;
      if (r.state === 'done' && made > 0 && p && p.id === r.project && p.history.steps.current < r.after) { r.state = 'undone'; setText(r.status, STATUS_WORDS.undone); }
      let why = '';
      if (made <= 0 || r.state === 'running' || r.state === 'failed') why = made <= 0 ? 'This step changed nothing to undo.' : '';
      else if (r.state === 'undone') why = 'This step is already undone.';
      else if (!p || p.id !== r.project) why = 'This step is in another document.';
      else if (p.history.steps.current !== r.after) why = 'Later steps must be undone first.';
      setDisabled(r.undo, made <= 0 || r.state !== 'done' || !!why);
      setTitle(r.undo, why || (made > 1 ? `Undo these ${made} steps` : 'Undo this step'));
    }
  }

  private undoRow(row: StepRow): void {
    const p = this.engine.current;
    if (!p || p.id !== row.project || p.history.steps.current !== row.after) return;
    this.engine.jumpHistory(row.before);
    this.setState(row, 'undone');
  }

  /** The plan the model wrote, with Run and Cancel under it. */
  private showPlan(): void {
    this.dropPlan();
    const bar = el('<div class="cv-assistant-plan-bar"><button type="button" class="cv-btn cv-btn-primary">Run</button><button type="button" class="cv-btn cv-btn-ghost">Cancel</button></div>');
    const [run, cancel] = Array.from(bar.querySelectorAll('button'));
    run.addEventListener('click', () => { this.dropPlan(); this.history.push({ role: 'user', content: 'Run the plan now, calling the tools.' }); void this.converse(false); });
    cancel.addEventListener('click', () => { this.dropPlan(); this.history.splice(-2); this.line('note', 'Plan cancelled.'); });
    this.planBar = bar;
    this.log.append(bar);
    this.log.scrollTop = this.log.scrollHeight;
  }

  private dropPlan(): void { this.planBar?.remove(); this.planBar = null; }

  /** The not-configured note, with a button to the settings. */
  private setupNote(): void {
    const p = el('<div class="cv-assistant-msg is-note"><span></span> <button type="button" class="cv-btn cv-btn-ghost">Open Preferences</button></div>');
    setText(p.querySelector('span'), 'No language model is set. Choose a model and add its key, if it needs one, in Preferences > Plugins (Ollama or LM Studio on this computer, or a service with a key).');
    p.querySelector('button')!.addEventListener('click', () => { void runCommand('settings'); });
    this.log.append(p);
    this.log.scrollTop = this.log.scrollHeight;
  }

  private async ask(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.busy) return;
    const st = await api.llmStatus();
    if (!st?.configured) { this.setupNote(); return; }
    if (this.planBar) { this.dropPlan(); this.history.splice(-2); }   // a new message replaces a plan not yet run
    this.input.value = '';
    this.line('user', text);
    this.history.push({ role: 'user', content: text });
    const p = this.engine.current;
    this.turn = p ? { projectId: p.id, depth: p.history.steps.current } : null;
    await this.converse(this.planBox.checked);
  }

  /** The model's side of a message: only a plan when `planOnly`, else tool calls until it answers in words. */
  private async converse(planOnly: boolean): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.stopped = false;
    this.send.disabled = true; this.stop.disabled = false; this.undoTurn.disabled = true;
    try {
      if (planOnly) {
        const plan = await api.assistantStep([{ role: 'system', content: SYSTEM + PLAN }, ...this.history], false);
        if (!plan.content.trim()) { this.history.pop(); this.line('note', 'The model gave no plan. Try again.'); return; }
        this.history.push({ role: 'assistant', content: plan.content });
        this.line('assistant', plan.content);
        this.showPlan();
        return;
      }
      for (let step = 0; step < MAX_STEPS && !this.stopped; step++) {
        const reply = await api.assistantStep([{ role: 'system', content: SYSTEM }, ...this.history]);
        this.history.push({ role: 'assistant', content: reply.content || null, ...(reply.tool_calls.length ? { tool_calls: reply.tool_calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}) });
        if (reply.content) this.line('assistant', reply.content);
        if (!reply.tool_calls.length) break;
        for (const call of reply.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.arguments || '{}') as Record<string, unknown>; } catch { /* reported below */ }
          const { label, shown } = this.labelOf(call.name, args);
          const row = this.stepRow(label, shown);
          const result: McpResult = this.stopped ? { content: [{ type: 'text', text: 'Stopped by the user.' }], isError: true } : await this.bridge.run(call.name, args);
          const said = result.content.map((x) => (x.type === 'text' ? x.text : '[an image of the document: images cannot be passed back here]')).join('\n');
          setText(row.el.querySelector('.cv-assistant-result'), said.slice(0, 600));
          const q = this.engine.current;
          row.after = q && q.id === row.project ? q.history.steps.current : row.before;
          if (row.after - row.before === 1 && call.name === 'run_command' && !result.isError) this.engine.renameLastStep(label);
          this.setState(row, result.isError ? 'failed' : 'done');
          this.history.push({ role: 'tool', tool_call_id: call.id, content: said.slice(0, 4000) });
        }
        if (step === MAX_STEPS - 1) this.line('note', `Stopped after ${MAX_STEPS} steps.`);
      }
      if (this.stopped) this.line('note', 'Stopped.');
    } catch (err) {
      this.line('note', err instanceof ApiError ? err.message : 'The assistant could not reach the formvis engine (./formvis boot).');
    } finally {
      this.busy = false;
      this.send.disabled = false; this.stop.disabled = true;
      const q = this.engine.current;
      this.undoTurn.disabled = !(this.turn && q && q.id === this.turn.projectId && q.history.steps.current > this.turn.depth);
    }
  }

  /** Every step since the last message, undone (only in the document the turn began in). */
  private undo(): void {
    const t = this.turn, p = this.engine.current;
    if (!t || !p || p.id !== t.projectId) { this.line('note', 'That turn began in another document.'); return; }
    let n = 0;
    while (p.history.steps.current > t.depth && n < 500) { this.engine.undo(); n++; }
    this.undoTurn.disabled = true;
    this.line('note', `Undid ${n} step${n === 1 ? '' : 's'}.`);
  }
}
