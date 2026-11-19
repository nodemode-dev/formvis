import type { DockAdapter } from './dock/adapter';
import { api, ApiError, socketTo } from './io/api';
import { isMac } from './ui/dom';
import { t } from './ui/i18n';

export function formvisDock(): DockAdapter {
  return {
    app: { name: 'formvis', noun: 'picture', start: './formvis boot', examples: 'retouch it, remove an object, add text, resize, export' },
    storage: { key: 'formvis.agentDock', legacy: ['formvis.terminal'] },
    sizes: { minHeight: 120, maxHeightShare: 0.7, defaultHeight: 280, minWidth: 320, maxWidthShare: 0.6, defaultWidth: 440 },
    shortcut: { code: 'KeyJ', label: `${isMac ? 'Cmd' : 'Ctrl'}+J` },
    tabs: ['chat', 'shell', 'claude'],
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
      open: (kind, o) => (kind === 'shell' ? api.openTerminal(o.cols, o.rows) : api.openClaude({ prompt: o.prompt, resume: o.resume, cols: o.cols, rows: o.rows })),
      restart: (id) => api.restartTerminal(id),
      close: (id) => api.closeTerminal(id),
      socket: (id) => socketTo(`/terminal/${id}/stream`),
    },
    agentStatus: async () => {
      const claude = await api.claudeCodeStatus();
      return claude ? { claude } : null;
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
