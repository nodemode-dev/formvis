export interface HostInit { pluginId: string | null; panelId: string | null; initialState: unknown }
export interface AssignFile { name: string; mime: string; width: number; height: number; dataUrl: string }

export class HostLink {
  readonly embedded = window.parent !== window;
  pluginId: string | null = null;
  panelId: string | null = null;
  ready = false;

  constructor(private readonly onInit: (init: HostInit) => void, private readonly onClose: () => void) {
    if (!this.embedded) return;
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent) return;
      const m = e.data as { type?: unknown; pluginId?: unknown; panelId?: unknown; initialState?: unknown } | null;
      if (!m || typeof m.type !== 'string') return;
      if (m.type === 'init') {
        this.pluginId = typeof m.pluginId === 'string' ? m.pluginId : null;
        this.panelId = typeof m.panelId === 'string' ? m.panelId : null;
        this.ready = true;
        this.onInit({ pluginId: this.pluginId, panelId: this.panelId, initialState: m.initialState ?? null });
      } else if (m.type === 'close') this.onClose();
    });
    this.post({ type: 'ready', wantsLiveUpdates: false });
  }

  private post(message: Record<string, unknown>): void { if (this.embedded) window.parent.postMessage(message, '*'); }
  assign(files: AssignFile[]): void { this.post({ type: `plugin:${this.pluginId ?? 'sonny'}:assign`, payload: { files } }); }
  save(state: unknown): void { this.post({ type: 'save', state }); }
  close(): void { this.post({ type: 'close' }); }
}
