/** Runs a script file's JavaScript in a dedicated worker: no document, no window, no network or storage objects. The only
 *  doors out are `run(id, params)`, which runs one command of the catalogue and returns its result, `commands()`, which
 *  lists the ids, and `log(...)`. The script is an async function body; its return value is the run's result. */

const WORKER = `
const post = self.postMessage.bind(self);
const waiting = new Map();
let seq = 0;
const ask = (type, a, b) => new Promise((res, rej) => { const n = ++seq; waiting.set(n, { res, rej }); post({ type, n, a, b }); });
const BLOCK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel', 'navigator', 'location', 'WebTransport', 'FileReaderSync'];
for (let o = self; o; o = Object.getPrototypeOf(o)) for (const k of BLOCK) { try { Object.defineProperty(o, k, { value: undefined, configurable: true, writable: false }); } catch (e) { /* not definable here */ } }
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'reply') { const w = waiting.get(m.n); if (w) { waiting.delete(m.n); if (m.ok) w.res(m.value); else w.rej(new Error(m.error)); } return; }
  if (m.type !== 'go') return;
  try {
    const F = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new F('run', 'log', 'commands', m.source);
    const value = await fn((id, p) => ask('run', String(id), p === undefined ? {} : p), (...a) => post({ type: 'log', text: a.map((x) => { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (err) { return String(x); } }).join(' ') }), () => ask('list'));
    let sent = value;
    try { structuredClone(value); } catch (err) { sent = String(value); }
    post({ type: 'done', ok: true, value: sent });
  } catch (err) { post({ type: 'done', ok: false, error: err && err.message ? String(err.message) : String(err) }); }
};
`;

export interface ScriptRun { ok: boolean; result?: unknown; log: string[]; error?: string }
export interface ScriptDeps {
  /** Runs one catalogue command; resolves with its result, rejects with the reason it did not run. */
  run(id: string, params: Record<string, unknown>): Promise<unknown>;
  list(): Array<{ id: string; label: string }>;
  timeoutMs?: number;
}

const plain = (v: unknown): unknown => { try { return v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch { return null; } };

export function runScript(source: string, deps: ScriptDeps): Promise<ScriptRun> {
  return new Promise((resolve) => {
    const log: string[] = [];
    let url = '', w: Worker;
    try {
      url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));
      w = new Worker(url);
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      resolve({ ok: false, log, error: `The script sandbox could not start: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    URL.revokeObjectURL(url);
    let over = false;
    const end = (r: ScriptRun): void => { if (over) return; over = true; window.clearTimeout(timer); w.terminate(); resolve(r); };
    const timer = window.setTimeout(() => end({ ok: false, log, error: `The script ran past ${Math.round((deps.timeoutMs ?? 120000) / 1000)} seconds and was stopped.` }), deps.timeoutMs ?? 120000);
    w.onerror = (e) => end({ ok: false, log, error: e.message || 'The script failed to load.' });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; n?: number; a?: string; b?: Record<string, unknown>; text?: string; ok?: boolean; value?: unknown; error?: string };
      if (m.type === 'log') { if (log.length < 200) log.push(String(m.text ?? '').slice(0, 2000)); return; }
      if (m.type === 'done') { end(m.ok ? { ok: true, result: m.value, log } : { ok: false, log, error: m.error ?? 'The script failed.' }); return; }
      if (m.type !== 'run' && m.type !== 'list') return;
      const reply = (ok: boolean, value: unknown, error?: string): void => { if (!over) w.postMessage({ type: 'reply', n: m.n, ok, value, error }); };
      if (m.type === 'list') { reply(true, deps.list()); return; }
      deps.run(String(m.a ?? ''), m.b && typeof m.b === 'object' ? m.b : {}).then((v) => reply(true, plain(v)), (err: unknown) => reply(false, null, err instanceof Error ? err.message : String(err)));
    };
    w.postMessage({ type: 'go', source });
  });
}
