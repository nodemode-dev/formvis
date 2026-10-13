export interface HostInit { pluginId: string | null; panelId: string | null; initialState: unknown }
export interface AssignFile { name: string; mime: string; width: number; height: number; dataUrl: string }

/** The link to the portal page that frames this app: receives its init and close messages, sends back ready, save and close. */
export class HostLink {
  readonly embedded = window.parent !== window;
  pluginId: string | null = null;
  panelId: string | null = null;
  ready = false;

  constructor(private readonly onInit: (init: HostInit) => void, private readonly onClose: () => void) {
    if (!this.embedded) return;
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
      if (d.type === 'init') {
        this.pluginId = typeof d.pluginId === 'string' ? d.pluginId : null;
        this.panelId = typeof d.panelId === 'string' ? d.panelId : null;
        this.ready = true;
        this.onInit({ pluginId: this.pluginId, panelId: this.panelId, initialState: d.initialState ?? null });
      } else if (d.type === 'close') {
        this.onClose();
      }
    });
    this.post({ type: 'ready', wantsLiveUpdates: false });
  }

  private post(message: Record<string, unknown>): void { if (this.embedded) window.parent.postMessage(message, '*'); }
  assign(files: AssignFile[]): void { this.post({ type: `plugin:${this.pluginId ?? 'formvis'}:assign`, payload: { files } }); }
  save(state: unknown): void { this.post({ type: 'save', state }); }
  close(): void { this.post({ type: 'close' }); }
}
