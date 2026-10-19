import { serviceReady, socketTo, whenServiceUp } from '../../io/api';
import { transformBounds, type Engine } from '../../engine';
import type { Commands } from '../commands';
import { el, patchList, q, setChecked, setClass, setHidden, setText, setValue } from '../dom';
import { icon } from '../icons';
import { loadPrefs, savePrefs } from '../prefs';
import { toast } from '../toast';

const KEY = 'formvis.agentConnect';
const FEED_LIMIT = 200;
const POLICIES: Array<{ value: string; label: string }> = [{ value: 'allow', label: 'Allow all' }, { value: 'ask', label: 'Ask for risky steps' }, { value: 'deny', label: 'Deny' }];
const STATUS: Record<string, string> = { running: 'Running', ok: 'Done', error: 'Failed', denied: 'Declined', waiting: 'Waiting for you' };
const NEW_LAYER_TOOLS = new Set(['add_layer', 'add_text', 'draw_shape', 'place_image', 'generate_image', 'generative_fill', 'duplicate_layer', 'add_adjustment', 'add_film_layer']);

interface Agent { name: string; version: string; policy: string; calls: number; waiting: number }
interface Ask { id: string; client: string; tool: string; command: string | null; summary: string; why: string }
interface Entry { id: string; t: number; client: string; tool: string; command: string | null; summary: string; status: string; message: string; target: { layer?: string; rect?: { x: number; y: number; w: number; h: number } } | null }
interface Wire { type: 'state' | 'activity'; enabled?: boolean; clients?: Agent[]; pending?: Ask[]; activity?: Entry[]; entry?: Entry }

const clock = (t: number): string => new Date(t * 1000).toLocaleTimeString([], { hour12: false });

function read(): { follow: boolean } {
  try { return { follow: (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { follow?: boolean }).follow === true }; } catch { return { follow: false }; }
}

function keep(follow: boolean): void {
  try { localStorage.setItem(KEY, JSON.stringify({ follow })); } catch { return; }
}

async function post(path: string, body: unknown): Promise<void> {
  try { await fetch(`/api/agents${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch { return; }
}

/** Copies how to register formvis in a client: Claude Code's claude mcp add line, or Claude Desktop's mcpServers JSON with this copy's launcher path. */
export async function copyRegistration(kind: 'claude_code' | 'claude_desktop'): Promise<void> {
  try {
    const text = ((await (await fetch('/api/mcp/registration')).json()) as Record<string, string>)[kind];
    if (!text) throw new Error('empty');
    await navigator.clipboard.writeText(text);
    toast(kind === 'claude_code' ? 'Copied the Claude Code line.' : 'Copied the Claude Desktop JSON.', 'info');
  } catch { toast('Could not copy: the engine is not answering or the clipboard is blocked.', 'error'); }
}

/** Window > Agent Connect (DEV_PLAN 28.4): the master switch for outside agents, one row per connected agent with its policy
 *  (Allow all, Ask for risky steps, Deny), the steps waiting for the person's approval, the activity feed (newest first),
 *  Follow Agent and Stop. Built once; the engine's WebSocket patches rows, approvals and feed entries in place. */
export class AgentConnect {
  readonly el = el(`<aside class="ft-connect" role="complementary" aria-label="Agent Connect" hidden>
    <div class="ft-connect-head"><span class="ft-connect-title">Agent Connect</span><span class="ft-connect-spacer"></span>
      <button type="button" class="cv-icon-btn ft-connect-close" aria-label="Close Agent Connect" title="Close">${icon('close', 16)}</button></div>
    <div class="ft-connect-master"><label><input type="checkbox" class="ft-connect-on"><span>Allow outside agents</span></label><span class="ft-connect-state" role="status"></span></div>
    <div class="ft-connect-sheet" hidden><span class="ft-connect-sheet-title">Waiting for your approval</span><div class="ft-connect-asks"></div></div>
    <div class="ft-connect-section"><span class="ft-connect-label">Connected agents</span>
      <div class="ft-connect-agents"></div>
      <p class="ft-connect-empty">No agent has connected yet. Start one with ./formvis agents install, then ask it to edit the picture.</p></div>
    <div class="ft-connect-section"><span class="ft-connect-label">Connect an agent</span>
      <div class="ft-connect-bar"><button type="button" class="cv-btn cv-btn-ghost" data-copy="claude_code" title="Copies the claude mcp add line">Copy Claude Code line</button>
      <button type="button" class="cv-btn cv-btn-ghost" data-copy="claude_desktop" title="Copies the mcpServers JSON with this copy's path">Copy Claude Desktop JSON</button></div></div>
    <div class="ft-connect-section"><span class="ft-connect-label">Folders agents may use</span>
      <textarea class="cv-input ft-connect-roots" rows="3" spellcheck="false" aria-label="Folders agents may use, one absolute path per line" placeholder="One absolute folder per line"></textarea>
      <div class="ft-connect-bar"><button type="button" class="cv-btn cv-btn-ghost ft-connect-roots-save">Save folders</button><span class="ft-connect-roots-note ft-connect-empty" role="status"></span></div>
      <p class="ft-connect-empty">Agents may open, place, save and export only inside these folders. Leave it empty to allow any folder except the system's own.</p></div>
    <div class="ft-connect-section is-feed"><div class="ft-connect-bar"><span class="ft-connect-label">Activity</span>
      <label class="ft-connect-follow"><input type="checkbox" class="ft-connect-follow-on"><span>Follow Agent</span></label>
      <button type="button" class="cv-btn cv-btn-ghost ft-connect-stop" title="Cancel the steps waiting for approval">${icon('close', 14)}<span>Stop</span></button></div>
      <div class="ft-connect-feed" role="log" aria-live="polite"></div>
      <p class="ft-connect-empty ft-connect-feed-empty">Nothing yet. Each step an agent takes appears here, newest first.</p></div>
  </aside>`);
  private readonly master = q<HTMLInputElement>(this.el, '.ft-connect-on');
  private readonly state = q(this.el, '.ft-connect-state');
  private readonly sheet = q(this.el, '.ft-connect-sheet');
  private readonly asks = q(this.el, '.ft-connect-asks');
  private readonly agentList = q(this.el, '.ft-connect-agents');
  private readonly noAgents = q(this.el, '.ft-connect-section:not(.is-feed) .ft-connect-empty');
  private readonly feed = q(this.el, '.ft-connect-feed');
  private readonly noFeed = q(this.el, '.ft-connect-feed-empty');
  private readonly follow = q<HTMLInputElement>(this.el, '.ft-connect-follow-on');
  private readonly roots = q<HTMLTextAreaElement>(this.el, '.ft-connect-roots');
  private readonly rootsNote = q(this.el, '.ft-connect-roots-note');
  private readonly entries: Entry[] = [];
  private agents: Agent[] = [];
  private socket: WebSocket | null = null;
  private retry = 0;

  constructor(private readonly engine: Engine) {
    setChecked(this.follow, read().follow);
    q(this.el, '.ft-connect-close').addEventListener('click', () => this.toggle(false));
    q(this.el, '.ft-connect-stop').addEventListener('click', () => void post('/stop', {}));
    for (const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('[data-copy]'))) b.addEventListener('click', () => void copyRegistration(b.dataset.copy === 'claude_desktop' ? 'claude_desktop' : 'claude_code'));
    this.follow.addEventListener('change', () => keep(this.follow.checked));
    this.master.addEventListener('change', () => this.switchAgents(this.master.checked));
    q(this.el, '.ft-connect-roots-save').addEventListener('click', () => void this.saveRoots());
    this.connect();
  }

  isOpen(): boolean { return !this.el.hidden; }

  toggle(open = !this.isOpen()): void {
    setHidden(this.el, !open);
    if (open) void this.loadRoots();
  }

  private async loadRoots(): Promise<void> {
    try {
      const lim = await (await fetch('/api/agents/limits')).json() as { roots?: string[] };
      const text = (lim.roots ?? []).join('\n');
      if (this.roots.value !== text && document.activeElement !== this.roots) this.roots.value = text;
    } catch { setText(this.rootsNote, 'The engine is not answering.'); }
  }

  private async saveRoots(): Promise<void> {
    const roots = this.roots.value.split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/agents/limits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roots }) });
      if (res.ok) setText(this.rootsNote, roots.length ? `Agents are kept to ${roots.length} folder${roots.length === 1 ? '' : 's'}.` : 'Any folder except the system\'s own.');
      else setText(this.rootsNote, ((await res.json()) as { detail?: string }).detail ?? 'Not saved.');
    } catch { setText(this.rootsNote, 'The engine is not answering.'); }
  }

  private switchAgents(on: boolean): void {
    void post('/enabled', { enabled: on });
    savePrefs({ ...loadPrefs(), agentsAllowed: on });
    window.dispatchEvent(new CustomEvent('formvis:agents', { detail: on }));
  }

  private connect(): void {
    // With the engine service not running there is no stream to open: wait for it to start instead of retrying.
    void serviceReady().then((up) => { if (up) this.open(); else void whenServiceUp().then(() => this.open()); });
  }

  private open(): void {
    const ws = socketTo('/agents/stream');
    this.socket = ws;
    ws.addEventListener('message', (ev) => { try { this.take(JSON.parse(String(ev.data)) as Wire); } catch { return; } });
    ws.addEventListener('open', () => { this.retry = 0; });
    ws.addEventListener('close', () => {
      if (this.socket !== ws) return;
      setText(this.state, 'The engine is not answering');
      window.setTimeout(() => this.connect(), Math.min(10000, 1000 * 2 ** this.retry++));
    });
  }

  private take(m: Wire): void {
    if (m.type === 'state') {
      this.agents = m.clients ?? [];
      setChecked(this.master, m.enabled !== false);
      if (m.activity) { this.entries.length = 0; this.entries.push(...m.activity.slice(0, FEED_LIMIT)); this.paintFeed(); }
      this.paintAgents();
      this.paintAsks(m.pending ?? []);
      return;
    }
    if (!m.entry) return;
    const known = this.entries.findIndex((x) => x.id === m.entry?.id);
    if (known >= 0) this.entries[known] = m.entry;
    else { this.entries.unshift(m.entry); if (this.entries.length > FEED_LIMIT) this.entries.length = FEED_LIMIT; }
    this.paintFeed();
    if (m.entry.status === 'ok' && this.follow.checked) this.goTo(m.entry);
  }

  private paintAgents(): void {
    const n = this.agents.length;
    setText(this.state, this.master.checked ? (n ? `${n} agent${n === 1 ? '' : 's'} known` : 'Ready') : 'Off: agents are refused');
    setHidden(this.noAgents, n > 0);
    patchList(this.agentList, this.agents, {
      key: (a) => a.name,
      create: (a) => {
        const row = el(`<div class="ft-connect-agent"><span class="ft-connect-agent-name"><span class="ft-connect-agent-label"></span><span class="ft-connect-agent-ver"></span></span><select class="cv-select" aria-label="Policy"></select></div>`);
        const sel = q<HTMLSelectElement>(row, 'select');
        for (const p of POLICIES) { const o = document.createElement('option'); o.value = p.value; o.textContent = p.label; sel.append(o); }
        sel.setAttribute('aria-label', `Policy for ${a.name}`);
        sel.addEventListener('change', () => void post('/policy', { client: a.name, policy: sel.value }));
        this.fillAgent(row, a);
        return row;
      },
      update: (row, a) => this.fillAgent(row, a),
    });
  }

  private fillAgent(row: HTMLElement, a: Agent): void {
    setText(q(row, '.ft-connect-agent-label'), a.name);
    setText(q(row, '.ft-connect-agent-ver'), a.version);
    setValue(q<HTMLSelectElement>(row, 'select'), a.policy);
  }

  private paintAsks(pending: Ask[]): void {
    setHidden(this.sheet, pending.length === 0);
    patchList(this.asks, pending, {
      key: (a) => a.id,
      create: (a) => {
        const row = el(`<div class="ft-connect-ask"><span class="ft-connect-ask-what"></span><span class="ft-connect-ask-why"></span><span class="ft-connect-ask-sum"></span>
          <div class="ft-connect-ask-row"><button type="button" class="cv-btn cv-btn-ghost" data-act="deny">Decline</button><button type="button" class="cv-btn cv-btn-primary" data-act="allow">Approve</button></div></div>`);
        q(row, '[data-act="deny"]').addEventListener('click', () => void post('/approve', { id: a.id, allow: false }));
        q(row, '[data-act="allow"]').addEventListener('click', () => void post('/approve', { id: a.id, allow: true }));
        this.fillAsk(row, a);
        return row;
      },
      update: (row, a) => this.fillAsk(row, a),
    });
    if (pending.length && !this.isOpen()) this.toggle(true);
  }

  private fillAsk(row: HTMLElement, a: Ask): void {
    setText(q(row, '.ft-connect-ask-what'), `${a.client} wants to run ${a.command ?? a.tool}`);
    setText(q(row, '.ft-connect-ask-why'), a.why);
    setText(q(row, '.ft-connect-ask-sum'), a.summary);
  }

  private paintFeed(): void {
    setHidden(this.noFeed, this.entries.length > 0);
    patchList(this.feed, this.entries, {
      key: (e) => e.id,
      create: (e) => {
        const row = el(`<div class="ft-connect-item"><span class="ft-connect-item-time"></span><div class="ft-connect-item-main"><span class="ft-connect-item-what"></span><span class="ft-connect-item-sum"></span><span class="ft-connect-item-msg"></span></div></div>`);
        this.fillEntry(row, e);
        return row;
      },
      update: (row, e) => this.fillEntry(row, e),
    });
    setClass(this.el, 'has-feed', this.entries.length > 0);
  }

  private fillEntry(row: HTMLElement, e: Entry): void {
    if (row.dataset.status !== e.status) row.dataset.status = e.status;
    setText(q(row, '.ft-connect-item-time'), clock(e.t));
    setText(q(row, '.ft-connect-item-what'), `${e.command ? `${e.tool} ${e.command}` : e.tool} · ${e.client}`);
    setText(q(row, '.ft-connect-item-sum'), e.summary);
    setText(q(row, '.ft-connect-item-msg'), e.status === 'ok' ? '' : e.message || STATUS[e.status] || e.status);
  }

  /** Follow Agent: the view moves to what the step touched when the engine can tell (a layer id, a rectangle, the new layer). */
  private goTo(e: Entry): void {
    const p = this.engine.current;
    if (!p) return;
    let r: { x: number; y: number; w: number; h: number } | null = null;
    const layer = e.target?.layer ? p.layer(e.target.layer) : NEW_LAYER_TOOLS.has(e.tool) ? this.engine.activeLayer : null;
    if (layer && !layer.isGroup && layer.raster) r = transformBounds(layer.transform);
    else if (e.target?.rect) r = e.target.rect;
    if (!r || r.w <= 0 || r.h <= 0) return;
    const v = p.viewport, w = v.centerX * 2, h = v.height, pad = 48;
    const a = v.toScreen(r.x, r.y), b = v.toScreen(r.x + r.w, r.y + r.h);
    const inside = a.x >= pad && a.y >= pad && b.x <= w - pad && b.y <= h - pad;
    if (inside) return;
    const fits = (b.x - a.x) <= w - pad * 2 && (b.y - a.y) <= h - pad * 2;
    const zoom = fits ? v.zoom : Math.min(8, Math.min((w - pad * 2) / r.w, (h - pad * 2) / r.h));
    const c = v.toScreen(r.x + r.w / 2, r.y + r.h / 2);
    if (!fits) this.engine.zoomTo(zoom, c);
    const d = v.toScreen(r.x + r.w / 2, r.y + r.h / 2);
    this.engine.pan(v.centerX - d.x, h / 2 - d.y);
  }
}

/** Registers agent.connect.open (Window > Agent Connect) and builds the panel into the page. */
export function installAgentConnect(commands: Commands, engine: Engine): AgentConnect {
  const panel = new AgentConnect(engine);
  document.body.appendChild(panel.el);
  commands.add({ id: 'agent.connect.open', label: 'Agent Connect', icon: 'link', checked: () => panel.isOpen(), run: () => panel.toggle() });
  commands.add({ id: 'agent.connect.copy-claude-code', label: 'Copy Claude Code Connect Line', run: () => copyRegistration('claude_code') });
  commands.add({ id: 'agent.connect.copy-claude-desktop', label: 'Copy Claude Desktop Connect JSON', run: () => copyRegistration('claude_desktop') });
  return panel;
}
