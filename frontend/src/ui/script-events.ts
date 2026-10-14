export type ScriptEvent = 'start' | 'new' | 'open' | 'save' | 'close' | 'export' | 'print';

export const SCRIPT_EVENTS: ReadonlyArray<readonly [ScriptEvent, string]> = [
  ['start', 'Start Application'], ['new', 'New Document'], ['open', 'Open Document'], ['save', 'Save Document'],
  ['close', 'Close Document'], ['export', 'Export Document'], ['print', 'Print Document'],
];

export interface EventBinding { event: ScriptEvent; action: string }

const KEY = 'formvis.scriptEvents';

/** File > Scripts > Script Events Manager (DEV_PLAN 30.6): which saved action runs when the app starts, or a document is
 *  made, opened, saved, closed, exported or printed. Saved in localStorage. */
export class ScriptEvents {
  enabled = false;
  bindings: EventBinding[] = [];
  private busy = false;

  constructor() {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      if (v && typeof v === 'object') {
        const o = v as { enabled?: unknown; bindings?: unknown };
        this.enabled = o.enabled === true;
        if (Array.isArray(o.bindings)) {
          this.bindings = o.bindings.flatMap((b: unknown) => {
            const x = b as Partial<EventBinding> | null;
            return x && typeof x.action === 'string' && SCRIPT_EVENTS.some(([id]) => id === x.event) ? [{ event: x.event as ScriptEvent, action: x.action }] : [];
          });
        }
      }
    } catch { this.enabled = false; this.bindings = []; }
  }

  save(): void { try { localStorage.setItem(KEY, JSON.stringify({ enabled: this.enabled, bindings: this.bindings })); } catch { /* storage unavailable: lasts this session */ } }

  /** Plays each action bound to `e`, in order. Fires that arrive while one is playing are ignored, so an action that
   *  saves or exports does not set itself off again. */
  async fire(e: ScriptEvent, play: (name: string) => Promise<void>): Promise<void> {
    if (!this.enabled || this.busy) return;
    const names = this.bindings.filter((b) => b.event === e).map((b) => b.action);
    if (!names.length) return;
    this.busy = true;
    try { for (const n of names) await play(n); } catch { /* an action that fails stops the rest for this event */ } finally { this.busy = false; }
  }
}
