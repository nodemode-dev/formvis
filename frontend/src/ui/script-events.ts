export type ScriptEvent = 'everything' | 'start' | 'new' | 'open' | 'save' | 'close' | 'export' | 'print';

export const SCRIPT_EVENTS: ReadonlyArray<readonly [ScriptEvent, string]> = [
  ['everything', 'Everything'], ['start', 'Start Application'], ['new', 'New Document'], ['open', 'Open Document'], ['save', 'Save Document'],
  ['close', 'Close Document'], ['export', 'Export Document'], ['print', 'Print Document'],
];

/** A pair of an event and what it runs: the recorded action named `action`, or, when `script` is set, that JavaScript
 *  source (`action` then holds its file name). `off` leaves the pair listed but silent. */
export interface EventBinding { event: ScriptEvent; action: string; script?: string; off?: boolean }

/** One run of a binding, newest last. */
export interface EventResult { at: number; event: ScriptEvent; target: string; ok: boolean; note: string }
const MAX_SCRIPT = 200000;

const KEY = 'formvis.scriptEvents';

/** File > Scripts > Script Events Manager (DEV_PLAN 30.6): which saved action runs when the app starts, or a document is
 *  made, opened, saved, closed, exported or printed. Saved in localStorage. */
export class ScriptEvents {
  enabled = false;
  bindings: EventBinding[] = [];
  results: EventResult[] = [];
  onResult: (() => void) | null = null;
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
            if (!x || typeof x.action !== 'string' || !SCRIPT_EVENTS.some(([id]) => id === x.event)) return [];
            const script = typeof x.script === 'string' && x.script.length <= MAX_SCRIPT ? { script: x.script } : {};
            return [{ event: x.event as ScriptEvent, action: x.action, ...script, ...(x.off === true ? { off: true } : {}) }];
          });
        }
      }
    } catch { this.enabled = false; this.bindings = []; }
  }

  save(): void { try { localStorage.setItem(KEY, JSON.stringify({ enabled: this.enabled, bindings: this.bindings })); } catch { /* storage unavailable: lasts this session */ } }

  /** Runs each pair listed for `e` (and for Everything) that is not switched off, in order, and logs how each went. Fires
   *  that arrive while one is running are ignored, so an action that saves or exports does not set itself off again. A
   *  pair that fails is logged and the rest still run. */
  async fire(e: ScriptEvent, play: (b: EventBinding) => Promise<string | void>): Promise<void> {
    if (!this.enabled || this.busy) return;
    const hits = this.bindings.filter((b) => !b.off && (b.event === e || b.event === 'everything'));
    if (!hits.length) return;
    this.busy = true;
    try {
      for (const b of hits) {
        let ok = true, note = '';
        try { note = (await play(b)) ?? ''; } catch (err) { ok = false; note = err instanceof Error ? err.message : String(err); }
        this.results.push({ at: Date.now(), event: e, target: b.action, ok, note: note.slice(0, 200) });
        if (this.results.length > 40) this.results.shift();
        this.onResult?.();
      }
    } finally { this.busy = false; }
  }
}
