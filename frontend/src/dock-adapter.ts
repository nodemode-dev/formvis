import type { ConsentChoice, ConsentRequest, DockAdapter, DockAgentStatus, DockTerminal, StoredChoice, StoredChoiceState } from './dock/adapter';
import { jsonLegacy } from './dock/state';
import { api, ApiError, socketTo } from './io/api';
import { isMac } from './ui/dom';
import { t } from './ui/i18n';
import { loadPrefs, savePrefs } from './ui/prefs';

const BLOCKED = 'formvis.agentsBlocked';
interface Question { id: string; tool: string; client: string; wait: number }
const adders: Array<(r: ConsentRequest) => void> = [];
const withdrawers: Array<(id: string) => void> = [];
const early: ConsentRequest[] = [];
const open = new Map<string, ConsentRequest>();
const legacyBlocked = (): boolean => { try { return localStorage.getItem(BLOCKED) === '1'; } catch { return false; } };
let isBlocked = legacyBlocked();
let watching = 0;
const post = (path: string, body: unknown): Promise<Response> => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const reply = (id: string, result: Record<string, boolean>): Promise<void> => post('/api/mcp/bridge/result', { id, result }).then(() => undefined);
const drop = (id: string): void => { if (open.delete(id)) for (const w of withdrawers) w(id); };
const questions = async (): Promise<Question[]> => {
  const r = await fetch('/api/mcp/bridge/questions');
  if (!r.ok) throw new Error(r.statusText);
  return ((await r.json()) as { questions?: Question[] }).questions ?? [];
};
const watch = (): void => {
  if (watching || !open.size) return;
  watching = window.setInterval(() => {
    if (!open.size) { window.clearInterval(watching); watching = 0; return; }
    void questions().then((list) => { const live = new Set(list.map((x) => x.id)); for (const id of [...open.keys()]) if (!live.has(id)) drop(id); }, () => undefined);
  }, 2000);
};

export const outsideAgents = {
  blocked: (): boolean => isBlocked,
  adopt(stored: boolean): void {
    const legacy = legacyBlocked();
    isBlocked = stored || legacy;
    if (legacy && !stored) void outsideAgents.set('blocked');
  },
  arrive(id: string, tool: string, client: string, seconds = 0): void {
    if (isBlocked) { void reply(id, { allowed: false }).catch(() => undefined); return; }
    if (open.has(id)) return;
    const request: ConsentRequest = {
      id, agent: client, what: tool ? `use ${tool.replace(/_/g, ' ')}` : 'make changes', offers: ['deny', 'once', 'always'], always: client ? 'agent' : 'all', escape: 'deny',
      ...(seconds > 0 ? { expires: Date.now() + seconds * 1000 } : {}),
    };
    open.set(id, request);
    watch();
    if (adders.length) for (const h of adders) h(request); else early.push(request);
  },
  subscribe(add: (r: ConsentRequest) => void, withdraw: (id: string) => void): void {
    adders.push(add);
    withdrawers.push(withdraw);
    for (const r of early.splice(0)) add(r);
    void outsideAgents.recover();
  },
  async recover(): Promise<void> {
    try { for (const x of await questions()) outsideAgents.arrive(x.id, x.tool, x.client, x.wait); } catch { return; }
  },
  async answer(id: string, choice: ConsentChoice): Promise<void> {
    const request = open.get(id);
    open.delete(id);
    const yes = { allowed: true, once: true };
    if (choice === 'always' && request?.agent) {
      const kept = await post('/api/agents/policy', { client: request.agent, policy: 'allow' }).then((r) => r.ok, () => false);
      if (kept) for (const [other, r] of [...open]) if (r.agent === request.agent) { void reply(other, yes).catch(() => undefined); drop(other); }
    } else if (choice === 'always') await outsideAgents.set('allowed');
    await reply(id, choice === 'deny' ? { allowed: false } : yes);
  },
  async get(): Promise<StoredChoiceState> {
    let changedOutside = false;
    try {
      const s = (await (await fetch('/api/agents')).json()) as { sealBroken?: unknown; blocked?: unknown };
      changedOutside = s.sealBroken === true;
      if (typeof s.blocked === 'boolean') isBlocked = s.blocked || legacyBlocked();
    } catch { changedOutside = false; }
    return { value: isBlocked ? 'blocked' : loadPrefs().agentsAllowed ? 'allowed' : 'ask', changedOutside };
  },
  async set(value: StoredChoice): Promise<void> {
    isBlocked = value === 'blocked';
    const kept = await post('/api/agents/blocked', { blocked: isBlocked }).then((r) => r.ok, () => false);
    try { if (isBlocked && !kept) localStorage.setItem(BLOCKED, '1'); else localStorage.removeItem(BLOCKED); } catch { isBlocked = value === 'blocked'; }
    if (isBlocked) for (const id of [...open.keys()]) { void reply(id, { allowed: false }).catch(() => undefined); drop(id); }
    if (loadPrefs().agentsAllowed !== (value === 'allowed')) savePrefs({ ...loadPrefs(), agentsAllowed: value === 'allowed' });
    window.dispatchEvent(new CustomEvent('formvis:agents', { detail: value === 'allowed' }));
  },
};

export function formvisDock(openSettings: () => void = () => undefined, layerOpen: () => boolean = () => false): DockAdapter {
  return {
    app: { name: 'formvis', noun: 'picture', start: './formvis boot', examples: 'retouch it, remove an object, add text, resize, export' },
    placement: {
      mode: 'own',
      storage: { key: 'formvis.agentDock', legacy: jsonLegacy(['formvis.terminal']) },
      sizes: { minHeight: 120, maxHeightShare: 0.7, defaultHeight: 280, minWidth: 320, maxWidthShare: 0.6, defaultWidth: 440 },
    },
    isDockChord: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === 'KeyJ' && !(layerOpen() && !(e.target instanceof Element && e.target.closest('.ft-dock'))),
    chordLabel: () => `${isMac ? 'Cmd' : 'Ctrl'}+J`,
    passKey: (e) => e.key === 'F1' || ((e.metaKey || e.ctrlKey) && (e.key === ',' || (e.altKey && e.code === 'KeyJ'))),
    tabs: ['chat', 'shell', 'claude', 'codex', 'cursor'],
    classes: { iconButton: 'cv-tt-btn', button: 'cv-btn', primaryButton: 'cv-btn-primary', input: 'cv-input', select: 'cv-select', note: 'cv-note' },
    t: (_key, english) => t(english),
    onTheme: (handler) => { document.addEventListener('nm:ui-settings-changed', handler); },
    keyHeaders: (): Record<string, string> => {
      try { const key = sessionStorage.getItem('formvis-window-key'); return key ? { 'X-Formvis-Window-Key': key } : {}; } catch { return {}; }
    },
    errors: {
      message: (err) => (err instanceof ApiError ? err.message : null),
      missingRoute: (err) => err instanceof ApiError && (err.status === 404 || err.status === 405) && /^(Not Found|Method Not Allowed)$/i.test(err.message),
    },
    terminal: {
      list: () => api.terminals(),
      open: async (kind, o) => {
        if (kind === 'shell') return api.openTerminal(o.cols, o.rows);
        if (kind === 'claude') return api.openClaude({ prompt: o.prompt, resume: o.resume, cols: o.cols, rows: o.rows });
        const r = await fetch('/api/terminal/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, cols: o.cols, rows: o.rows }) });
        const body = (await r.json().catch(() => ({}))) as { detail?: unknown } & DockTerminal;
        if (!r.ok) throw new ApiError(typeof body.detail === 'string' ? body.detail : r.statusText, r.status);
        return body;
      },
      restart: (id) => api.restartTerminal(id),
      close: (id) => api.closeTerminal(id),
      socket: (id) => socketTo(`/terminal/${id}/stream`),
    },
    agentStatus: async () => {
      const claude = await api.claudeCodeStatus();
      let others: DockAgentStatus = {};
      try { others = ((await (await fetch('/api/claude-code/status')).json()) as { agents?: DockAgentStatus }).agents ?? {}; } catch { others = {}; }
      return claude || others.codex || others.cursor ? { ...others, ...(claude ? { claude } : {}) } : null;
    },
    chat: {
      status: () => api.claudeStatus(),
      start: (mode, fresh) => api.claudeStart(mode, fresh),
      send: (text) => api.claudeSend(text),
      stop: () => api.claudeStop(),
      answer: (id, allow) => api.claudeAllow(id, allow),
      socket: () => socketTo('/agent/claude/stream'),
    },
    consent: { subscribe: (add, withdraw) => outsideAgents.subscribe(add, withdraw), answer: (id, choice) => outsideAgents.answer(id, choice) },
    storedChoice: { get: () => outsideAgents.get(), set: (value) => outsideAgents.set(value) },
    openSettings,
  };
}
