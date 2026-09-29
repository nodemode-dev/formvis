import type { Engine } from '../../engine';
import { api, ApiError } from '../../io/api';
import type { AgentBridge, McpResult } from '../../automation/agent-bridge';
import { el, setHidden, setText } from '../dom';

const SYSTEM = 'You are the assistant inside formvis, a layered image editor. Act on the open document with the tools: call get_document first '
  + 'to learn its layers and their ids. Each change is one undoable step. Generative tools cost the user money and they are asked first. '
  + 'Keep replies short and say what you changed.';
const MAX_STEPS = 12;

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
    foot.append(this.input, row);
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

  private card(name: string, args: Record<string, unknown>): HTMLElement {
    const c = el('<details class="cv-assistant-card"><summary></summary><pre class="cv-assistant-args"></pre><p class="cv-assistant-result">Running...</p></details>');
    setText(c.querySelector('summary') as HTMLElement, name);
    setText(c.querySelector('pre') as HTMLElement, JSON.stringify(args, null, 1));
    this.log.append(c);
    this.log.scrollTop = this.log.scrollHeight;
    return c;
  }

  private async ask(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.busy) return;
    const st = await api.llmStatus();
    if (!st?.configured) { this.line('note', 'Set a language model first, in Preferences > Plugins (Ollama or LM Studio on this computer, or a service with a key).'); return; }
    this.input.value = '';
    this.line('user', text);
    this.history.push({ role: 'user', content: text });
    const p = this.engine.current;
    this.turn = p ? { projectId: p.id, depth: p.history.steps.current } : null;
    this.busy = true; this.stopped = false;
    this.send.disabled = true; this.stop.disabled = false; this.undoTurn.disabled = true;
    try {
      for (let step = 0; step < MAX_STEPS && !this.stopped; step++) {
        const reply = await api.assistantStep([{ role: 'system', content: SYSTEM }, ...this.history]);
        this.history.push({ role: 'assistant', content: reply.content || null, ...(reply.tool_calls.length ? { tool_calls: reply.tool_calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}) });
        if (reply.content) this.line('assistant', reply.content);
        if (!reply.tool_calls.length) break;
        for (const call of reply.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.arguments || '{}') as Record<string, unknown>; } catch { /* reported below */ }
          const c = this.card(call.name, args);
          const result: McpResult = this.stopped ? { content: [{ type: 'text', text: 'Stopped by the user.' }], isError: true } : await this.bridge.run(call.name, args);
          const said = result.content.map((x) => (x.type === 'text' ? x.text : '[an image of the document: images cannot be passed back here]')).join('\n');
          setText(c.querySelector('.cv-assistant-result') as HTMLElement, said.slice(0, 600));
          c.classList.toggle('is-error', !!result.isError);
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
