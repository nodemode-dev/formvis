import type { Engine } from '../../engine';
import { api, ApiError } from '../../io/api';
import type { AgentBridge, McpResult } from '../../automation/agent-bridge';
import { describeCommand, runCommand } from '../../automation/catalogue';
import { el, setDisabled, setHidden, setText, setTitle } from '../dom';
import { confirmAction } from '../dialogs';

const SYSTEM = 'You are the assistant inside formvis, a layered image editor. Act on the open document with the tools: call get_document first '
  + 'to learn its layers and their ids. Each change is one undoable step. Generative tools cost the user money and they are asked first. '
  + 'Prefer commands: for anything the menus can do, call list_commands (with text or group) to find the command id, then call run_command with that id '
  + 'and its params. Keep each tool call to one command, so each step can be undone on its own. Use the other tools only for what commands cannot do. '
  + 'Keep replies short and say what you changed.';
const PLAN = ' The user asked to see a plan first. Do not call any tool now. Reply with a short numbered plan, one command per line, naming the command '
  + 'and its settings in plain words. Wait for the go-ahead before acting.';
const SETTINGS_KEY = 'formvis.assistant';
const IDLE_MS = 800;
const AGENT_LIVE_S = 60;
const POLICY_CLIENT = 'assistant';
const POLICY_WORDS: Array<{ value: 'allow' | 'ask' | 'deny'; label: string }> = [{ value: 'allow', label: 'Auto' }, { value: 'ask', label: 'Ask' }, { value: 'deny', label: 'Refuse' }];
const ASK_BY_DEFAULT = new Set(['save_project', 'export_image', 'timeline_render', 'convert_file', 'open_file', 'close_document', 'delete_layer', 'flatten_image', 'resize_image', 'resize_canvas', 'crop', 'delete_snapshot', 'set_settings']);

/** The assistant's own settings, kept in this browser: the tools it may not call, and whether and how pictures are sent. */
interface Settings { excluded: string[]; vision: boolean; pictures: number; side: number; chatsKept: number; maxCalls: number }
const clampInt = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { excluded: Array.isArray(s.excluded) ? s.excluded.filter((n): n is string => typeof n === 'string').slice(0, 200) : [], vision: s.vision === true, pictures: clampInt(s.pictures, 1, 4, 2), side: clampInt(s.side, 256, 2048, 768), chatsKept: clampInt(s.chatsKept, 1, 1000, 100), maxCalls: clampInt(s.maxCalls, 1, 100, 12) };
  } catch { return { excluded: [], vision: false, pictures: 2, side: 768, chatsKept: 100, maxCalls: 12 }; }
}
function storeSettings(s: Settings): void { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage is blocked: the settings last this session */ } }

/** A line of a saved chat: what the log showed. */
type SavedLine = { kind: 'user' | 'assistant' | 'note'; text: string } | { kind: 'step'; label: string; args: string; result: string; status: 'running' | 'done' | 'failed' | 'undone' };
interface Usage { in: number; out: number; total: number }
interface ChatInfo { id: string; title: string; updated: number; messages: number }
interface ChatRow { el: HTMLElement; open: HTMLButtonElement; del: HTMLButtonElement; updated: number }
interface Reply { content: string; tool_calls: Array<{ id: string; name: string; arguments: string }>; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));
const newId = (): string => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('') + Date.now().toString(36);
const isLocalHost = (h: string): boolean => /^(localhost|127\.|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0)/.test(h) || h.endsWith('.local');

/** What leaves the computer for the service in the settings: nothing for one on this computer, else the messages, tool results and (when on) pictures. */
export function privacyNotice(baseUrl: string, model: string, s: Pick<Settings, 'vision' | 'pictures' | 'side'>): string {
  let host = '';
  try { host = new URL(baseUrl).hostname; } catch { /* not an address */ }
  if (!host) return 'No language model is set, so nothing is sent anywhere.';
  const pics = s.vision ? ` Pictures of the document are sent too: at most ${s.pictures} a turn, each at most ${s.side} pixels on its longest side.` : ' No pictures are sent.';
  if (isLocalHost(host)) return `Your messages and what the tools return go to ${host}, a service on this computer, and do not leave it.${pics}`;
  return `Your messages, the document's layer names and sizes, and what each tool returns are sent over the network to ${host} (model ${model || 'not named'}), which keeps its own records of them. Your key stays in the formvis engine.${pics}`;
}

/** A picture from a tool result, scaled to at most `side` pixels on its longest side and sent as a JPEG address. */
async function shrink(b64: string, mime: string, side: number): Promise<{ url: string; width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(await (await fetch(`data:${mime};base64,${b64}`)).blob());
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')?.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return { url: c.toDataURL('image/jpeg', 0.8), width: w, height: h };
  } catch { return null; }
}

async function llmCall<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(`/api/llm${path}`, init); } catch { throw new ApiError('The assistant could not reach the formvis engine (./formvis boot).', 0); }
  if (!res.ok) {
    let detail = '';
    try { const b = await res.json() as { detail?: unknown }; if (typeof b.detail === 'string') detail = b.detail; } catch { /* not JSON */ }
    throw new ApiError(detail || res.statusText || `Request failed (${res.status})`, res.status);
  }
  return await res.json() as T;
}

/** One tool call's row in the log: patched in place as the call runs, and the history steps it made (before to after). */
interface StepRow { el: HTMLElement; status: HTMLElement; undo: HTMLButtonElement; project: string; before: number; after: number; label: string; state: 'running' | 'done' | 'failed' | 'undone'; saved: Extract<SavedLine, { kind: 'step' }> }

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
  private turn: { projectId: string; depth: number; depths: Map<string, number>; ended: Map<string, number> } | null = null;
  private settings = loadSettings();
  private chatId = newId();
  private lines: SavedLine[] = [];
  private usage: Usage = { in: 0, out: 0, total: 0 };
  private sentPictures = 0;
  private pointerDown = false;
  private lastTyped = -1e9;
  private flashTimer = 0;
  private baseTitle = '';
  private agentTimer = 0;
  private chatRows = new Map<string, ChatRow>();
  private toolBoxes = new Map<string, HTMLSelectElement>();
  private policies = new Map<string, string>();
  private toolsLoaded = false;
  private status: { baseUrl: string; model: string } | null = null;
  private readonly privacy = el('<p class="cv-assistant-notice cv-assistant-privacy" role="note"></p>');
  private readonly agentNote = el('<p class="cv-assistant-notice cv-assistant-agents" role="status" hidden></p>');
  private readonly waitNote = el('<p class="cv-assistant-notice cv-assistant-wait" role="status" hidden>Waiting for you to finish your stroke or typing before the next step.</p>');
  private readonly usageNote = el('<p class="cv-assistant-usage" role="status"></p>');
  private readonly chatsBox = el('<div class="cv-assistant-chats" hidden></div>');
  private readonly chatsEmpty = el('<p class="cv-assistant-notice cv-assistant-chats-empty">No saved chats yet.</p>');
  private readonly chatsBtn = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" aria-expanded="false">Chats</button>');
  private readonly toolList = el('<div class="cv-assistant-tools"></div>');
  private readonly visionBox = el<HTMLInputElement>('<input type="checkbox">');
  private readonly picturesIn = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="4" step="1" aria-label="Pictures a turn">');
  private readonly sideIn = el<HTMLInputElement>('<input class="cv-input" type="number" min="256" max="2048" step="64" aria-label="Longest side in pixels">');
  private readonly keptIn = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="1000" step="1" aria-label="Chats kept">');
  private readonly callsIn = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" max="100" step="1" aria-label="Tool calls a turn">');
  private readonly clearBtn = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Delete all chats</button>');

  constructor(private readonly engine: Engine, private readonly bridge: AgentBridge) {
    const head = el('<div class="cv-assistant-head"><span>Assistant</span></div>'), close = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost" aria-label="Close assistant">Close</button>');
    close.addEventListener('click', () => this.toggle(false));
    const fresh = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">New chat</button>');
    fresh.addEventListener('click', () => this.newChat());
    this.chatsBtn.addEventListener('click', () => this.toggleChats());
    head.append(fresh, this.chatsBtn, close);
    this.chatsBox.append(this.chatsEmpty);
    const foot = el('<div class="cv-assistant-foot"></div>'), row = el('<div class="cv-improve"></div>');
    row.append(this.send, this.stop, this.undoTurn);
    this.planLabel.prepend(this.planBox);
    foot.append(this.input, this.planLabel, row, this.usageNote, this.buildSettings());
    this.engine.on('history', () => this.refreshRows());
    this.el.append(head, this.chatsBox, this.privacy, this.agentNote, this.log, this.waitNote, foot);
    this.setUsage();
    window.addEventListener('pointerdown', () => { this.pointerDown = true; }, true);
    for (const t of ['pointerup', 'pointercancel', 'blur'] as const) window.addEventListener(t, () => { this.pointerDown = false; }, true);
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t !== this.input && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) this.lastTyped = performance.now();
    }, true);
    window.addEventListener('focus', () => this.stopFlash());
    this.send.addEventListener('click', () => void this.ask());
    this.stop.addEventListener('click', () => { this.stopped = true; });
    this.undoTurn.addEventListener('click', () => void this.undo());
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void this.ask(); } e.stopPropagation(); });
  }

  toggle(on = this.el.hidden): void {
    setHidden(this.el, !on);
    window.clearInterval(this.agentTimer);
    if (on) {
      this.input.focus();
      void this.refreshStatus();
      void this.loadPolicies();
      void this.watchAgents();
      this.agentTimer = window.setInterval(() => void this.watchAgents(), 5000);
    }
  }

  private line(kind: 'user' | 'assistant' | 'note', text: string, keep = true): void {
    const p = el(`<div class="cv-assistant-msg is-${kind}"></div>`);
    setText(p, text);
    this.log.append(p);
    this.log.scrollTop = this.log.scrollHeight;
    if (keep) this.lines.push({ kind, text });
  }

  /** The tool list, pictures and idle rules in one folded section, built once. */
  private buildSettings(): HTMLElement {
    const box = el('<details class="cv-assistant-settings"><summary>Tools and pictures</summary></details>');
    const tools = el('<div class="cv-assistant-tools-wrap"><span class="cv-assistant-small">What the assistant may do with each tool: Auto runs it, Ask shows the call and waits, Refuse leaves it out</span></div>');
    tools.append(this.toolList);
    box.addEventListener('toggle', () => { if ((box as HTMLDetailsElement).open) void this.loadTools(); });
    const vision = el('<label class="cv-check"><span>Send pictures of the document to the model</span></label>');
    vision.prepend(this.visionBox);
    this.visionBox.checked = this.settings.vision;
    this.picturesIn.value = String(this.settings.pictures);
    this.sideIn.value = String(this.settings.side);
    const nums = el('<div class="cv-assistant-nums"><label><span>Pictures a turn</span></label><label><span>Longest side, px</span></label></div>');
    nums.children[0].append(this.picturesIn);
    nums.children[1].append(this.sideIn);
    this.keptIn.value = String(this.settings.chatsKept);
    this.callsIn.value = String(this.settings.maxCalls);
    const limits = el('<div class="cv-assistant-nums"><label><span>Chats kept</span></label><label><span>Tool calls a turn</span></label></div>');
    limits.children[0].append(this.keptIn);
    limits.children[1].append(this.callsIn);
    const changed = (): void => {
      this.settings = { ...this.settings, vision: this.visionBox.checked, pictures: clampInt(Number(this.picturesIn.value), 1, 4, 2), side: clampInt(Number(this.sideIn.value), 256, 2048, 768), chatsKept: clampInt(Number(this.keptIn.value), 1, 1000, 100), maxCalls: clampInt(Number(this.callsIn.value), 1, 100, 12) };
      storeSettings(this.settings);
      this.showPrivacy();
    };
    this.visionBox.addEventListener('change', changed);
    this.picturesIn.addEventListener('change', () => { changed(); this.picturesIn.value = String(this.settings.pictures); });
    this.sideIn.addEventListener('change', () => { changed(); this.sideIn.value = String(this.settings.side); });
    this.keptIn.addEventListener('change', () => { changed(); this.keptIn.value = String(this.settings.chatsKept); });
    this.callsIn.addEventListener('change', () => { changed(); this.callsIn.value = String(this.settings.maxCalls); });
    this.clearBtn.addEventListener('click', () => void this.clearChats());
    for (const i of [this.picturesIn, this.sideIn, this.keptIn, this.callsIn]) i.addEventListener('keydown', (e) => e.stopPropagation());
    box.append(tools, vision, nums, limits, this.clearBtn);
    return box;
  }

  /** What the assistant does with a tool: Refuse when excluded, else the saved policy, else Ask for the steps that overwrite files or change the whole picture. */
  private policyOf(name: string): 'allow' | 'ask' | 'deny' {
    if (this.settings.excluded.includes(name)) return 'deny';
    const p = this.policies.get(name);
    return p === 'allow' || p === 'ask' || p === 'deny' ? p : ASK_BY_DEFAULT.has(name) ? 'ask' : 'allow';
  }

  /** The saved per-tool policies, from the agent policy store (the same file Agent Connect keeps). */
  private async loadPolicies(): Promise<void> {
    try {
      const r = await fetch(`/api/agents/tool-policies?client=${POLICY_CLIENT}`);
      if (!r.ok) return;
      const body = await r.json() as { policies?: Record<string, string> };
      this.policies = new Map(Object.entries(body.policies ?? {}));
      for (const [name, sel] of this.toolBoxes) if (sel.value !== this.policyOf(name)) sel.value = this.policyOf(name);
    } catch { /* the engine is not answering: the defaults hold */ }
  }

  private savePolicy(name: string, policy: string): void {
    this.policies.set(name, policy);
    const rest = this.settings.excluded.filter((n) => n !== name);
    this.settings = { ...this.settings, excluded: policy === 'deny' ? [...rest, name] : rest };
    storeSettings(this.settings);
    void fetch('/api/agents/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: `${POLICY_CLIENT}:${name}`, policy }) }).catch(() => undefined);
  }

  /** The per-tool table from the engine's tool list, made once: a policy select on each row. */
  private async loadTools(): Promise<void> {
    if (this.toolsLoaded) return;
    try {
      const { tools } = await llmCall<{ tools: Array<{ name: string; description: string }> }>('/tools');
      this.toolsLoaded = true;
      for (const t of tools) {
        const sel = el<HTMLSelectElement>(`<select class="cv-select" aria-label="Policy for ${t.name}">${POLICY_WORDS.map((w) => `<option value="${w.value}">${w.label}</option>`).join('')}</select>`);
        const lab = el<HTMLLabelElement>('<label class="cv-assistant-tool"><span></span></label>');
        setText(lab.querySelector('span'), t.name);
        setTitle(lab, t.description);
        sel.value = this.policyOf(t.name);
        sel.addEventListener('change', () => this.savePolicy(t.name, sel.value));
        lab.append(sel);
        this.toolBoxes.set(t.name, sel);
        this.toolList.append(lab);
      }
      await this.loadPolicies();
    } catch (err) { setText(this.toolList, err instanceof Error ? err.message : 'The tool list could not be read.'); }
  }

  /** Ask: the canonical call is shown on the step's card with Allow and Refuse, and the turn waits; null when allowed, else what the model is told. */
  private async gate(name: string, args: Record<string, unknown>, row: StepRow): Promise<string | null> {
    const policy = this.policyOf(name);
    if (policy === 'deny') return `The tool ${name} is set to Refuse in the assistant's tool table, so it was not run. Use another tool or tell the person what is needed.`;
    if (policy !== 'ask') return null;
    const canon = el('<p class="cv-assistant-canon"></p>'), acts = el('<div class="cv-assistant-plan-bar"></div>');
    const yes = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-primary">Allow</button>'), no = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Refuse</button>');
    acts.append(yes, no);
    setText(canon, `${name}(${JSON.stringify(args).slice(0, 300)})`);
    row.el.append(canon, acts);
    setText(row.status, 'Waiting for you');
    this.attention();
    this.log.scrollTop = this.log.scrollHeight;
    const verdict = await new Promise<boolean>((done) => {
      yes.addEventListener('click', () => done(true));
      no.addEventListener('click', () => done(false));
      const poll = window.setInterval(() => { if (this.stopped) { window.clearInterval(poll); done(false); } }, 200);
      for (const b of [yes, no]) b.addEventListener('click', () => window.clearInterval(poll));
    });
    setDisabled(yes, true); setDisabled(no, true);
    setHidden(acts, true);
    return verdict ? null : `The person refused ${name} on its card, so it was not run. Do not retry it; ask what they want instead.`;
  }

  private async refreshStatus(): Promise<void> {
    const st = await api.llmStatus();
    this.status = st?.configured ? { baseUrl: st.baseUrl, model: st.model } : null;
    this.showPrivacy();
  }

  private showPrivacy(): void { setText(this.privacy, privacyNotice(this.status?.baseUrl ?? '', this.status?.model ?? '', this.settings)); }

  /** An outside agent seen by the engine in the last minute is named, so its edits are not a surprise. */
  private async watchAgents(): Promise<void> {
    try {
      const r = await fetch('/api/agents');
      if (!r.ok) return;
      const s = await r.json() as { enabled?: boolean; clients?: Array<{ name: string; last_seen: number }> };
      const now = Date.now() / 1000, live = (s.clients ?? []).filter((c) => now - c.last_seen < AGENT_LIVE_S).map((c) => c.name);
      setText(this.agentNote, live.length ? `An outside agent is connected to formvis: ${live.join(', ')}. It can change the open document while you chat, so its steps and the assistant's may mix. Window > Agent Connect shows what it did.` : '');
      setHidden(this.agentNote, !live.length);
    } catch { /* the engine is not answering: no notice */ }
  }

  private setUsage(): void {
    const n = (v: number): string => v.toLocaleString('en-US');
    setText(this.usageNote, this.usage.total > 0 ? `Tokens this chat: ${n(this.usage.in)} in, ${n(this.usage.out)} out, ${n(this.usage.total)} total.` : 'Tokens this chat: none yet.');
  }

  /** Taskbar or window attention when the assistant asks something while the window is not in front: the desktop shell's request, else the page title. */
  private attention(): void {
    if (document.hasFocus() && !document.hidden) return;
    if ('__TAURI_INTERNALS__' in window) void import('@tauri-apps/api/window').then((m) => m.getCurrentWindow().requestUserAttention(2)).catch(() => undefined);
    if (this.flashTimer) return;
    const base = this.baseTitle = document.title, alert = 'Assistant is asking - formvis';
    let on = true;
    this.flashTimer = window.setInterval(() => { on = !on; document.title = on ? alert : base; }, 1000);
    document.title = alert;
  }

  private stopFlash(): void {
    if (!this.flashTimer) return;
    window.clearInterval(this.flashTimer);
    this.flashTimer = 0;
    document.title = this.baseTitle;
  }

  private idle(): boolean { return !this.pointerDown && performance.now() - this.lastTyped > IDLE_MS; }

  /** Holds the next step while the person is mid-stroke or typing in another field; the note shows only while it waits. */
  private async waitIdle(): Promise<void> {
    if (this.idle()) return;
    setHidden(this.waitNote, false);
    while (!this.idle() && !this.stopped) await sleep(100);
    setHidden(this.waitNote, true);
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
    const saved: StepRow['saved'] = { kind: 'step', label, args: plainArgs(shown), result: '', status: 'running' };
    const row: StepRow = { el: c, status: c.querySelector('.cv-assistant-step-status') as HTMLElement, undo: c.querySelector('button') as HTMLButtonElement, project: p?.id ?? '', before: depth, after: depth, label, state: 'running', saved };
    row.undo.addEventListener('click', () => this.undoRow(row));
    this.rows.push(row);
    this.lines.push(saved);
    this.setState(row, 'running');
    this.log.append(c);
    this.log.scrollTop = this.log.scrollHeight;
    return row;
  }

  private setState(row: StepRow, state: StepRow['state']): void {
    row.state = state;
    row.saved.status = state;
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
    this.attention();
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
    this.status = { baseUrl: st.baseUrl, model: st.model };
    this.showPrivacy();
    this.sentPictures = 0;
    if (this.planBar) { this.dropPlan(); this.history.splice(-2); }   // a new message replaces a plan not yet run
    this.input.value = '';
    this.line('user', text);
    this.history.push({ role: 'user', content: text });
    const p = this.engine.current;
    this.turn = p ? { projectId: p.id, depth: p.history.steps.current, depths: new Map(this.engine.projects.map((x) => [x.id, x.history.steps.current])), ended: new Map() } : null;
    await this.converse(this.planBox.checked);
  }

  /** The model's side of a message: only a plan when `planOnly`, else tool calls until it answers in words. */
  private async converse(planOnly: boolean): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.stopped = false;
    this.send.disabled = true; this.stop.disabled = false; this.undoTurn.disabled = true;
    try {
      if (planOnly) {
        const plan = await this.step([{ role: 'system', content: SYSTEM + PLAN }, ...this.history], false);
        if (!plan.content.trim()) { this.history.pop(); this.line('note', 'The model gave no plan. Try again.'); return; }
        this.history.push({ role: 'assistant', content: plan.content });
        this.line('assistant', plan.content);
        this.showPlan();
        return;
      }
      const maxCalls = this.settings.maxCalls;
      let calls = 0;
      for (let step = 0; step <= maxCalls && !this.stopped; step++) {
        const reply = await this.step([{ role: 'system', content: SYSTEM }, ...this.history]);
        this.history.push({ role: 'assistant', content: reply.content || null, ...(reply.tool_calls.length ? { tool_calls: reply.tool_calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}) });
        if (reply.content) this.line('assistant', reply.content);
        if (!reply.tool_calls.length) { if (/\?\s*$/.test(reply.content)) this.attention(); break; }
        const pictures: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
        for (const call of reply.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.arguments || '{}') as Record<string, unknown>; } catch { /* reported below */ }
          const { label, shown } = this.labelOf(call.name, args);
          const row = this.stepRow(label, shown);
          if (!this.stopped) await this.waitIdle();
          const over = calls >= maxCalls;
          if (!over) calls++;
          const result: McpResult = this.stopped ? { content: [{ type: 'text', text: 'Stopped by the user.' }], isError: true }
            : over ? { content: [{ type: 'text', text: `The limit of ${maxCalls} tool calls for this turn is reached, so ${call.name} was not run. Tell the person what is done and what is left.` }], isError: true }
            : await this.runGated(call.name, args, row);
          const parts: string[] = [];
          for (const x of result.content) {
            if (x.type === 'text') { parts.push(x.text); continue; }
            if (!this.settings.vision) { parts.push('[an image of the document: not sent, because Send pictures is off in the assistant settings]'); continue; }
            if (this.sentPictures >= this.settings.pictures) { parts.push(`[an image of the document: not sent, the budget of ${this.settings.pictures} picture${this.settings.pictures === 1 ? '' : 's'} a turn is used]`); continue; }
            const small = await shrink(x.data, x.mimeType, this.settings.side);
            if (!small) { parts.push('[an image of the document that could not be read]'); continue; }
            this.sentPictures++;
            pictures.push({ type: 'image_url', image_url: { url: small.url } });
            parts.push(`[a picture of the document, ${small.width} by ${small.height} pixels, follows in the next message]`);
          }
          const said = parts.join('\n');
          row.saved.result = said.slice(0, 600);
          setText(row.el.querySelector('.cv-assistant-result'), said.slice(0, 600));
          const q = this.engine.current;
          row.after = q && q.id === row.project ? q.history.steps.current : row.before;
          if (row.after - row.before === 1 && call.name === 'run_command' && !result.isError) this.engine.renameLastStep(label);
          this.setState(row, result.isError ? 'failed' : 'done');
          this.history.push({ role: 'tool', tool_call_id: call.id, content: said.slice(0, 4000) });
        }
        if (pictures.length) { this.history.push({ role: 'user', content: [{ type: 'text', text: 'The picture of the document from the tool result above.' }, ...pictures] }); this.trimPictures(); }
        if (step === maxCalls) this.line('note', `Stopped after ${maxCalls} tool calls.`);
      }
      if (this.stopped) this.line('note', 'Stopped.');
    } catch (err) {
      this.line('note', err instanceof ApiError ? err.message : 'The assistant could not reach the formvis engine (./formvis boot).');
    } finally {
      this.busy = false;
      this.send.disabled = false; this.stop.disabled = true;
      if (this.turn) this.turn.ended = new Map(this.engine.projects.map((x) => [x.id, x.history.steps.current]));
      this.undoTurn.disabled = !this.turn || !this.engine.projects.some((x) => x.history.steps.current > (this.turn?.depths.get(x.id) ?? Infinity));
      void this.persist();
    }
  }

  private async runGated(name: string, args: Record<string, unknown>, row: StepRow): Promise<McpResult> {
    const refused = await this.gate(name, args, row);
    if (refused) return { content: [{ type: 'text', text: refused }], isError: true };
    setText(row.status, STATUS_WORDS.running);
    return await this.bridge.run(name, args);
  }

  /** One model step through the engine: the excluded tools are left out of the request, and the tokens the service reports are added up. */
  private async step(messages: unknown[], tools = true): Promise<Reply> {
    const reply = await llmCall<Reply>('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, tools, exclude: this.settings.excluded }) });
    if (reply.usage) {
      this.usage = { in: this.usage.in + reply.usage.prompt_tokens, out: this.usage.out + reply.usage.completion_tokens, total: this.usage.total + reply.usage.total_tokens };
      this.setUsage();
    }
    return reply;
  }

  /** Only the newest pictures stay in the conversation: older ones become a line of text, so a request never carries more than the budget. */
  private trimPictures(): void {
    let seen = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const m = this.history[i] as { role?: string; content?: unknown };
      if (m.role !== 'user' || !Array.isArray(m.content)) continue;
      const kept = (m.content as Array<{ type: string }>).filter((p) => p.type !== 'image_url' || ++seen <= this.settings.pictures);
      if (kept.length !== m.content.length) m.content = kept.length > 1 ? kept : 'An earlier picture of the document, no longer sent.';
    }
  }

  /** Saves the chat in the engine's data folder (pictures are not kept); a failure is said once in the log. */
  private async persist(): Promise<void> {
    const first = this.lines.find((l): l is Exclude<SavedLine, { kind: 'step' }> => l.kind === 'user');
    if (!first) return;
    const plain = this.history.map((m) => {
      const c = m as { content?: unknown };
      return Array.isArray(c.content) ? { ...(m as object), content: (c.content as Array<{ type: string; text?: string }>).filter((p) => p.type === 'text').map((p) => p.text).join('\n') } : m;
    });
    try {
      await llmCall(`/chats/${this.chatId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: first.text.slice(0, 60), history: plain, lines: this.lines, usage: this.usage, keep: this.settings.chatsKept }) });
      void this.refreshChats();
    } catch (err) { this.line('note', err instanceof ApiError ? err.message : 'This chat could not be saved.', false); }
  }

  private toggleChats(): void {
    const open = this.chatsBox.hidden;
    setHidden(this.chatsBox, !open);
    this.chatsBtn.setAttribute('aria-expanded', String(open));
    if (open) void this.refreshChats();
  }

  /** The Chats list patched in place: a row per saved chat, kept by its id; new ones added, gone ones removed, changed ones retitled. */
  private async refreshChats(): Promise<void> {
    let list: ChatInfo[];
    try { list = (await llmCall<{ chats: ChatInfo[] }>('/chats')).chats; } catch { return; }
    const ids = new Set(list.map((c) => c.id));
    for (const [id, r] of this.chatRows) if (!ids.has(id)) { r.el.remove(); this.chatRows.delete(id); }
    let anchor: Element = this.chatsEmpty;
    for (const c of list) {
      let r = this.chatRows.get(c.id);
      if (!r) {
        const rowEl = el('<div class="cv-assistant-chat"><button type="button" class="cv-btn cv-btn-ghost cv-assistant-chat-open"><strong></strong><span></span></button><button type="button" class="cv-btn cv-btn-ghost" aria-label="Delete chat">Delete</button></div>');
        const [open, del] = Array.from(rowEl.querySelectorAll('button'));
        open.addEventListener('click', () => void this.openChat(c.id));
        del.addEventListener('click', () => void this.deleteChat(c.id));
        r = { el: rowEl, open, del, updated: -1 };
        this.chatRows.set(c.id, r);
      }
      if (r.updated !== c.updated) {
        r.updated = c.updated;
        setText(r.el.querySelector('strong'), c.title);
        setText(r.el.querySelector('span'), `${c.messages} lines, ${new Date(c.updated * 1000).toLocaleString()}`);
      }
      r.el.classList.toggle('is-current', c.id === this.chatId);
      if (anchor.nextElementSibling !== r.el) this.chatsBox.insertBefore(r.el, anchor.nextElementSibling);
      anchor = r.el;
    }
    setHidden(this.chatsEmpty, list.length > 0);
  }

  /** Starts an empty chat: the log, the conversation and the token count begin again; the saved one stays in the list. */
  private newChat(): void {
    if (this.busy) { this.line('note', 'Stop the assistant before starting a new chat.', false); return; }
    this.dropPlan();
    this.chatId = newId();
    this.history = []; this.lines = []; this.rows.length = 0; this.turn = null;
    this.usage = { in: 0, out: 0, total: 0 };
    this.log.replaceChildren();
    this.undoTurn.disabled = true;
    this.setUsage();
    for (const r of this.chatRows.values()) r.el.classList.remove('is-current');
  }

  private async openChat(id: string): Promise<void> {
    if (this.busy) { this.line('note', 'Stop the assistant before opening another chat.', false); return; }
    let c: { history: unknown[]; lines: SavedLine[]; usage?: Partial<Usage> };
    try { c = await llmCall(`/chats/${id}`); } catch (err) { this.line('note', err instanceof ApiError ? err.message : 'That chat could not be opened.', false); return; }
    this.newChat();
    this.chatId = id;
    this.history = c.history;
    this.usage = { in: c.usage?.in ?? 0, out: c.usage?.out ?? 0, total: c.usage?.total ?? 0 };
    this.setUsage();
    const nodes: HTMLElement[] = [];
    for (const l of c.lines) {
      this.lines.push(l);
      if (l.kind === 'step') {
        const card = el(`<div class="cv-assistant-card cv-assistant-step${l.status === 'failed' ? ' is-error' : ''}"><div class="cv-assistant-step-head"><strong class="cv-assistant-step-label"></strong><span class="cv-assistant-step-status"></span></div><p class="cv-assistant-args"></p><p class="cv-assistant-result"></p></div>`);
        setText(card.querySelector('.cv-assistant-step-label'), l.label);
        setText(card.querySelector('.cv-assistant-step-status'), STATUS_WORDS[l.status === 'running' ? 'done' : l.status]);
        setText(card.querySelector('.cv-assistant-args'), l.args);
        setText(card.querySelector('.cv-assistant-result'), l.result);
        nodes.push(card);
      } else {
        const p = el(`<div class="cv-assistant-msg is-${l.kind}"></div>`);
        setText(p, l.text);
        nodes.push(p);
      }
    }
    this.log.append(...nodes);
    this.log.scrollTop = this.log.scrollHeight;
    for (const [rid, r] of this.chatRows) r.el.classList.toggle('is-current', rid === id);
  }

  private async deleteChat(id: string): Promise<void> {
    try { await llmCall(`/chats/${id}`, { method: 'DELETE' }); } catch { return; }
    if (id === this.chatId && !this.busy) this.newChat();
    void this.refreshChats();
  }

  private async clearChats(): Promise<void> {
    if (this.busy) { this.line('note', 'Stop the assistant before deleting the chats.', false); return; }
    if (!(await confirmAction('Delete all chats', 'Delete every saved assistant chat? This cannot be undone.', 'Delete', true))) return;
    try { await llmCall('/chats', { method: 'DELETE' }); } catch { return; }
    this.newChat();
    void this.refreshChats();
  }

  /** Every step since the last message, undone in each document that was open when it began; asks first when the person
   *  changed one of them after the turn ended, since their later steps would go too. */
  private async undo(): Promise<void> {
    const t = this.turn;
    if (!t) return;
    const open = this.engine.projects.filter((x) => t.depths.has(x.id) && x.history.steps.current > (t.depths.get(x.id) as number));
    if (!open.length) { this.line('note', 'That turn began in another document.'); return; }
    const later = open.reduce((s, x) => s + Math.max(0, x.history.steps.current - (t.ended.get(x.id) ?? x.history.steps.current)), 0);
    if (later > 0 && !(await confirmAction('Undo This Turn', `You changed ${later === 1 ? 'a document' : 'documents'} after this turn: ${later} later step${later === 1 ? '' : 's'} would be undone too.`, 'Undo', true))) return;
    const back = this.engine.current;
    let n = 0;
    for (const x of open) {
      if (this.engine.current !== x) this.engine.switchTo(x.id);
      while (x.history.steps.current > (t.depths.get(x.id) as number) && n < 500) { this.engine.undo(); n++; }
    }
    if (back && this.engine.current !== back && this.engine.projects.includes(back)) this.engine.switchTo(back.id);
    this.undoTurn.disabled = true;
    this.line('note', `Undid ${n} step${n === 1 ? '' : 's'}${open.length > 1 ? ` in ${open.length} documents` : ''}.`);
  }
}
