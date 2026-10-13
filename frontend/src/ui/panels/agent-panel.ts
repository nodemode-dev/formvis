import { api, ApiError, socketTo, type AgentEvent, type AgentMode, type ClaudeStatus } from '../../io/api';
import { el, q, setDisabled, setHidden, setText } from '../dom';
import { icon } from '../icons';

const KEY = 'formvis.agent';
const LABELS: Record<AgentMode, string> = { ask: 'Ask', 'auto-edits': 'Auto-accept edits', plan: 'Plan' };

function keep(open: boolean): void {
  try { localStorage.setItem(KEY, JSON.stringify({ open })); } catch { return; }
}

/** Window > Claude Code (DEV_PLAN 28.5): the person's own Claude Code, started here in stream-JSON mode with formvis's MCP
 *  server attached, its messages streamed in. Built once; text, tool cards and questions are added or patched in place.
 *  Open or closed is the data-ft-agent attribute on documentElement, which index.html writes before the first paint. */
export class AgentPanel {
  readonly el = el(`<aside class="ft-agent" role="complementary" aria-label="Claude Code">
    <div class="ft-agent-head"><span class="ft-agent-title">Claude Code</span><span class="ft-agent-spacer"></span>
      <button type="button" class="cv-btn cv-btn-ghost ft-agent-new" title="Start a new conversation">New</button>
      <button type="button" class="cv-icon-btn ft-agent-close" aria-label="Close Claude Code" title="Close">${icon('close', 16)}</button></div>
    <div class="ft-agent-status" role="status"><span class="ft-agent-status-text"></span></div>
    <div class="ft-agent-install" hidden><code class="ft-agent-install-cmd"></code><button type="button" class="cv-btn ft-agent-copy">Copy</button></div>
    <div class="ft-agent-log" role="log" aria-live="polite"></div>
    <div class="ft-agent-foot">
      <textarea class="cv-input ft-agent-input" rows="3" aria-label="Message to Claude Code" placeholder="Ask Claude Code to edit the picture or the code"></textarea>
      <div class="ft-agent-row">
        <select class="cv-select ft-agent-mode" aria-label="Permission mode"></select>
        <span class="ft-agent-spacer"></span>
        <button type="button" class="cv-btn cv-btn-ghost ft-agent-stop" disabled>Stop</button>
        <button type="button" class="cv-btn cv-btn-primary ft-agent-send" disabled>${icon('send', 14)}<span>Send</span></button>
      </div>
    </div>
  </aside>`);
  private readonly log = q(this.el, '.ft-agent-log');
  private readonly input = q<HTMLTextAreaElement>(this.el, '.ft-agent-input');
  private readonly mode = q<HTMLSelectElement>(this.el, '.ft-agent-mode');
  private readonly send = q<HTMLButtonElement>(this.el, '.ft-agent-send');
  private readonly stop = q<HTMLButtonElement>(this.el, '.ft-agent-stop');
  private readonly statusText = q(this.el, '.ft-agent-status-text');
  private readonly install = q(this.el, '.ft-agent-install');
  private readonly blocks = new Map<string, HTMLElement>();
  private readonly tools = new Map<string, HTMLElement>();
  private readonly asks = new Map<string, HTMLElement>();
  private socket: WebSocket | null = null;
  private info: ClaudeStatus | null = null;
  private state = 'idle';
  private running = false;
  private offline = false;

  constructor(private readonly onBash: () => void) {
    for (const [value, label] of Object.entries(LABELS)) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      this.mode.append(o);
    }
    q(this.el, '.ft-agent-close').addEventListener('click', () => this.toggle(false));
    q(this.el, '.ft-agent-new').addEventListener('click', () => void this.begin(true));
    q(this.el, '.ft-agent-copy').addEventListener('click', () => { void navigator.clipboard?.writeText(this.info?.install ?? '').catch(() => undefined); });
    this.send.addEventListener('click', () => void this.ask());
    this.stop.addEventListener('click', () => { void api.claudeStop().catch(() => undefined); });
    this.mode.addEventListener('change', () => { if (this.running) void this.begin(false); });
    this.input.addEventListener('input', () => this.paint());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void this.ask(); }
      e.stopPropagation();
    });
    if (this.isOpen()) void this.open();
  }

  isOpen(): boolean { return document.documentElement.getAttribute('data-ft-agent') === 'open'; }

  toggle(on = !this.isOpen()): void {
    document.documentElement.setAttribute('data-ft-agent', on ? 'open' : 'closed');
    keep(on);
    if (on) void this.open();
  }

  private async open(): Promise<void> {
    this.connect();
    await this.refresh();
    if (this.isOpen()) this.input.focus({ preventScroll: true });
  }

  private async refresh(fresh = false): Promise<void> {
    this.info = await api.claudeStatus(fresh);
    this.offline = this.info === null;
    if (this.info) { this.running = this.info.running; this.state = this.info.state; if (this.mode.value !== this.info.mode && this.info.running) this.mode.value = this.info.mode; }
    this.paint();
  }

  private paint(): void {
    const i = this.info;
    let text: string;
    if (this.offline || !i) text = 'The formvis engine is not reachable. Start it with ./formvis boot.';
    else if (!i.installed) text = 'Claude Code is not installed. Install it with the command below, then sign in once by running claude in a terminal.';
    else {
      const parts = [`Claude Code ${i.version ?? ''}`.trim()];
      if (i.signedIn === true) parts.push('signed in');
      else if (i.signedIn === false) parts.push('not signed in: run claude in a terminal and sign in with /login');
      parts.push(this.running ? (this.state === 'busy' ? 'working' : 'ready') : 'not started');
      text = parts.join(' · ');
    }
    setText(this.statusText, text);
    const missing = !!i && !i.installed;
    setHidden(this.install, !missing);
    if (missing) setText(q(this.install, '.ft-agent-install-cmd'), i.install);
    const usable = !!i && i.installed && !this.offline;
    setDisabled(this.send, !usable || this.state === 'busy' || this.input.value.trim() === '');
    setDisabled(this.stop, !this.running);
    setDisabled(this.mode, !usable);
  }

  private connect(): void {
    if (this.socket) return;
    const socket = socketTo('/agent/claude/stream');
    this.socket = socket;
    socket.addEventListener('open', () => { this.log.replaceChildren(); this.blocks.clear(); this.tools.clear(); this.asks.clear(); });
    socket.addEventListener('message', (msg) => { try { this.onEvent(JSON.parse(String(msg.data)) as AgentEvent); } catch { return; } });
    socket.addEventListener('close', () => {
      this.socket = null;
      if (this.isOpen()) window.setTimeout(() => { if (this.isOpen()) { this.connect(); void this.refresh(); } }, 2000);
    });
  }

  private async begin(fresh: boolean): Promise<boolean> {
    try {
      await api.claudeStart(this.mode.value as AgentMode, fresh);
      if (fresh) { this.log.replaceChildren(); this.blocks.clear(); this.tools.clear(); this.asks.clear(); }
      return true;
    } catch (err) {
      this.note('note', err instanceof ApiError ? err.message : 'Claude Code could not be started.');
      return false;
    }
  }

  private async ask(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.state === 'busy') return;
    if (!this.running && !(await this.begin(false))) return;
    try {
      await api.claudeSend(text);
      this.input.value = '';
    } catch (err) {
      this.note('note', err instanceof ApiError ? err.message : 'The message could not be sent.');
    }
    this.paint();
  }

  private add(cls: string): HTMLElement {
    const node = el(`<div class="${cls}"></div>`);
    const stick = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    this.log.append(node);
    if (stick) this.log.scrollTop = this.log.scrollHeight;
    return node;
  }

  private note(kind: 'user' | 'note' | 'error', text: string): void {
    setText(this.add(`ft-agent-msg is-${kind}`), text);
  }

  private grow(node: HTMLElement): void {
    if (this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80 + node.clientHeight) this.log.scrollTop = this.log.scrollHeight;
  }

  private onEvent(ev: AgentEvent): void {
    switch (ev.type) {
      case 'state':
        this.running = ev.running;
        this.state = ev.state;
        if (ev.running && this.mode.value !== ev.mode) this.mode.value = ev.mode;
        this.paint();
        break;
      case 'user': this.note('user', ev.text); break;
      case 'block':
        if (!this.blocks.has(ev.id)) this.blocks.set(ev.id, this.add(`ft-agent-msg is-${ev.kind === 'thinking' ? 'thinking' : 'assistant'}`));
        break;
      case 'delta': {
        const node = this.blocks.get(ev.id);
        if (node) { setText(node, (node.textContent ?? '') + ev.text); this.grow(node); }
        break;
      }
      case 'tool': this.tool(ev.id, ev.name, ev.summary); break;
      case 'tool_result': {
        const card = this.tools.get(ev.id);
        if (!card) break;
        const out = q(card, '.ft-agent-tool-out');
        setText(out, ev.text);
        setHidden(out, ev.text === '');
        setText(q(card, '.ft-agent-tool-state'), ev.error ? 'failed' : 'done');
        card.classList.toggle('is-error', ev.error);
        break;
      }
      case 'permission': this.question(ev.id, ev.tool, ev.summary); break;
      case 'permission_done': {
        const card = this.asks.get(ev.id);
        if (!card) break;
        card.classList.add('is-done');
        setText(q(card, '.ft-agent-ask-state'), ev.allowed ? 'Allowed' : 'Declined');
        break;
      }
      case 'result': if (!ev.ok) this.note('error', ev.text || 'Claude Code stopped with an error.'); break;
      case 'notice': this.note('note', ev.text); break;
    }
  }

  private tool(id: string, name: string, summary: string): void {
    if (this.tools.has(id)) return;
    const card = this.add('ft-agent-tool');
    card.append(el('<div class="ft-agent-tool-head"><span class="ft-agent-tool-name"></span><span class="ft-agent-tool-state">running</span></div>'),
      el('<code class="ft-agent-tool-sum"></code>'), el('<pre class="ft-agent-tool-out" hidden></pre>'));
    setText(q(card, '.ft-agent-tool-name'), name.replace(/^mcp__/, '').replace(/__/g, ' '));
    setText(q(card, '.ft-agent-tool-sum'), summary);
    this.tools.set(id, card);
    if (name === 'Bash') this.onBash();
  }

  private question(id: string, tool: string, summary: string): void {
    if (this.asks.has(id)) return;
    const card = this.add('ft-agent-ask');
    card.append(el('<div class="ft-agent-ask-text"></div>'), el('<code class="ft-agent-tool-sum"></code>'),
      el('<div class="ft-agent-row"><button type="button" class="cv-btn cv-btn-primary ft-agent-allow">Allow</button><button type="button" class="cv-btn cv-btn-ghost ft-agent-deny">Deny</button><span class="ft-agent-ask-state"></span></div>'));
    setText(q(card, '.ft-agent-ask-text'), `Claude Code asks to use ${tool.replace(/^mcp__/, '').replace(/__/g, ' ')}`);
    setText(q(card, '.ft-agent-tool-sum'), summary);
    q(card, '.ft-agent-allow').addEventListener('click', () => { void api.claudeAllow(id, true).catch(() => undefined); });
    q(card, '.ft-agent-deny').addEventListener('click', () => { void api.claudeAllow(id, false).catch(() => undefined); });
    this.asks.set(id, card);
  }
}
