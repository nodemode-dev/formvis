import type { DockAdapter, DockAgentStatus, DockTerminal } from './dock/adapter';
import { api, ApiError, socketTo } from './io/api';
import { isMac } from './ui/dom';
import { t } from './ui/i18n';

export function formvisDock(): DockAdapter {
  return {
    app: { name: 'formvis', noun: 'picture', start: './formvis boot', examples: 'retouch it, remove an object, add text, resize, export' },
    storage: { key: 'formvis.agentDock', legacy: ['formvis.terminal'] },
    sizes: { minHeight: 120, maxHeightShare: 0.7, defaultHeight: 280, minWidth: 320, maxWidthShare: 0.6, defaultWidth: 440 },
    shortcut: { code: 'KeyJ', label: `${isMac ? 'Cmd' : 'Ctrl'}+J` },
    tabs: ['chat', 'shell', 'claude', 'codex', 'cursor'],
    classes: { iconButton: 'cv-tt-btn', button: 'cv-btn', primaryButton: 'cv-btn-primary', input: 'cv-input', select: 'cv-select', note: 'cv-note' },
    mount: (dock) => {
      const app = document.querySelector('.cv-app');
      app?.insertBefore(dock, app.querySelector('.cv-status'));
    },
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
  };
}
