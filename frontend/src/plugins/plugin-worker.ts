/// <reference lib="webworker" />

/* One folder plugin in its own Worker. The window never imports plugin code: it sends the source here, this file takes the
 * network, storage and spawning globals away, imports the module and hands it the formvis object. The object is a set of
 * messages to the window, which checks every one against the permissions in plugin.json. A worker has no window and no
 * document; a panel is described with ui.text, ui.button and the rest and the window builds the nodes. */

type Fn = (...a: any[]) => any;   // eslint-disable-line @typescript-eslint/no-explicit-any
interface Img { width: number; height: number; data: Uint8ClampedArray }
interface Init { k: 'init'; code: string; plugin: { id: string; name: string; version: string }; storage: Record<string, unknown> | null }

const scope = self as unknown as DedicatedWorkerGlobalScope & Record<string, unknown>;
const send = scope.postMessage.bind(scope) as (m: unknown, t?: Transferable[]) => void;
const SIDE_LIMIT = 200_000;
const fns = new Map<string, Fn>();
const pending = new Map<number, { ok: (v: unknown) => void; no: (e: Error) => void }>();
let seq = 0;

function blocked(name: string): Fn { return () => { throw new Error(`${name} is not available to a plugin.`); }; }

/** Takes the ways out of the worker away, on the global object and on every prototype it inherits from. */
function seal(): void {
  const names = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'IDBFactory', 'caches', 'CacheStorage', 'Notification', 'FileSystemFileHandle', 'FileSystemDirectoryHandle', 'RTCPeerConnection'];
  for (let o: object | null = scope; o; o = Object.getPrototypeOf(o)) {
    for (const n of names) if (Object.prototype.hasOwnProperty.call(o, n)) { try { Object.defineProperty(o, n, { value: blocked(n), writable: false, configurable: false }); } catch { /* kept */ } }
  }
  for (let o: object | null = scope.navigator; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const n of ['serviceWorker', 'storage', 'locks', 'sendBeacon', 'usb', 'bluetooth']) if (Object.prototype.hasOwnProperty.call(o, n)) { try { Object.defineProperty(o, n, { get: () => undefined, configurable: false }); } catch { /* kept */ } }
  }
}

function rpc(op: string, args?: unknown, transfer: Transferable[] = []): Promise<any> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  return new Promise((ok, no) => { const id = ++seq; pending.set(id, { ok, no }); send({ k: 'rpc', id, op, args }, transfer); });
}

function docOf(d: { id: string; name: string; width: number; height: number; activeLayerId: string | null }): Record<string, unknown> {
  const call = (m: string, ...a: unknown[]): Promise<any> => rpc('doc', { id: d.id, m, a });   // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id: d.id, name: d.name, width: d.width, height: d.height, activeLayerId: d.activeLayerId,
    layers: () => call('layers'), activate: () => call('activate'),
    selection: { get: () => call('selection.get'), set: (b: unknown) => call('selection.set', b) },
    flatten: (o?: unknown) => call('flatten', o), getPixels: (layer?: string, box?: unknown) => call('getPixels', layer, box),
    setPixels: (layer: string, image: unknown, box?: unknown) => call('setPixels', layer, image, box), newLayer: (image: unknown, o?: unknown) => call('newLayer', image, o),
  };
}

function panelUi(panel: string): Record<string, Fn> {
  let n = 0;
  const add = (node: Record<string, unknown>, onChange?: Fn): { set(v: unknown): void; remove(): void } => {
    const id = String(++n);
    if (onChange) fns.set(`ui:${panel}:${id}`, onChange);
    void rpc('panel.add', { panel, node: { ...node, id } });
    return { set: (value) => { void rpc('panel.set', { panel, id, value }); }, remove: () => { fns.delete(`ui:${panel}:${id}`); void rpc('panel.remove', { panel, id }); } };
  };
  return {
    text: (t: unknown) => add({ kind: 'text', value: String(t ?? '') }),
    button: (label: unknown, onClick: Fn) => add({ kind: 'button', label: String(label ?? '') }, onClick),
    slider: (label: unknown, o: { min?: number; max?: number; step?: number; value?: number } | undefined, onChange: Fn) => add({ kind: 'slider', label: String(label ?? ''), min: o?.min ?? 0, max: o?.max ?? 100, step: o?.step ?? 1, value: o?.value ?? o?.min ?? 0 }, onChange),
    checkbox: (label: unknown, value: unknown, onChange: Fn) => add({ kind: 'checkbox', label: String(label ?? ''), value: !!value }, onChange),
    select: (label: unknown, choices: Array<{ id: string; label: string }>, value: unknown, onChange: Fn) => add({ kind: 'select', label: String(label ?? ''), choices: (Array.isArray(choices) ? choices : []).slice(0, 60).map((c) => ({ id: String(c.id), label: String(c.label) })), value: String(value ?? '') }, onChange),
    clear: () => { for (const k of [...fns.keys()]) if (k.startsWith(`ui:${panel}:`)) fns.delete(k); n = 0; return rpc('panel.clear', { panel }); },
  };
}

const RECORDED = new Set(['beginPath', 'closePath', 'moveTo', 'lineTo', 'rect', 'arc', 'stroke', 'fill', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'setLineDash', 'save', 'restore']);
const PROPS = new Set(['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'globalAlpha', 'textAlign']);
function recorder(): { g: unknown; ops: unknown[][] } {
  const ops: unknown[][] = [];
  const g = new Proxy({}, {
    get: (_t, k) => (typeof k === 'string' && RECORDED.has(k) ? (...a: unknown[]) => { if (ops.length < 4000) ops.push([k, ...a.filter((x) => typeof x === 'number' || typeof x === 'string' || Array.isArray(x))]); } : undefined),
    set: (_t, k, v) => { if (typeof k === 'string' && PROPS.has(k) && ops.length < 4000) ops.push(['=' + k, v]); return true; },
  });
  return { g, ops };
}

function makeApi(init: Init): unknown {
  const handlers = new Map<string, Set<Fn>>();
  const cache = new Map<string, unknown>(Object.entries(init.storage ?? {}));
  const size = (skip?: string): number => { let s = 0; for (const [k, v] of cache) if (k !== skip) s += (JSON.stringify(v) ?? 'null').length; return s; };
  const doc = async (call: Promise<any>) => { const d = await call; return d ? docOf(d) : null; };   // eslint-disable-line @typescript-eslint/no-explicit-any
  const documents = {
    list: () => rpc('documents.list'), active: () => doc(rpc('documents.active')), get: (id: string) => doc(rpc('documents.get', { id })), create: (o?: unknown) => doc(rpc('documents.create', { o })),
  };
  const filters = {
    register: (spec: { id: string; label?: string; params?: unknown; glsl?: string; cpu?: Fn }) => {
      const id = String(spec?.id ?? '');
      if (typeof spec?.cpu === 'function') {
        fns.set(`filter:${id}`, (image: Img, values: Record<string, unknown>) => {
          const given = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
          const out = spec.cpu!(given, values) ?? given;
          return { width: out.width, height: out.height, data: out.data };
        });
      }
      return rpc('filters.register', { id, label: spec?.label, params: spec?.params, glsl: spec?.glsl, cpu: typeof spec?.cpu === 'function' });
    },
    apply: (id: string, values?: unknown) => rpc('filters.apply', { id, values }), list: () => rpc('filters.list'),
  };
  const panels = {
    register: (spec: { id: string; label: string; render: Fn }) => {
      const id = String(spec?.id ?? '');
      fns.set(`panel:${id}`, () => spec.render(panelUi(id)));
      return rpc('panels.register', { id, label: spec?.label });
    },
    registerFrame: (spec: { id: string; label: string; html: string; height?: number; onMessage?: Fn }) => {
      const id = String(spec?.id ?? '');
      fns.set(`frame:${id}`, typeof spec?.onMessage === 'function' ? spec.onMessage : () => {});
      return rpc('panels.frame', { id, label: spec?.label, html: String(spec?.html ?? ''), height: spec?.height }).then(() => ({ post: (message: unknown) => rpc('panel.post', { panel: id, message }) }));
    },
  };
  const tools = {
    register: (spec: { id: string; label: string; hint?: string; down?: Fn; move?: Fn; up?: Fn; overlay?: Fn }) => {
      const id = String(spec?.id ?? '');
      for (const m of ['down', 'move', 'up'] as const) if (typeof spec?.[m] === 'function') fns.set(`tool:${id}:${m}`, spec[m]!);
      if (typeof spec?.overlay === 'function') {
        fns.set(`tool:${id}:overlay`, (view: { zoom: number; m: number[] }) => {
          const [x0, y0, ax, ay, bx, by] = view.m, det = ax * by - bx * ay || 1;
          const r = recorder();
          spec.overlay!(r.g, { zoom: view.zoom, toScreen: (p: { x: number; y: number }) => ({ x: x0 + p.x * ax + p.y * bx, y: y0 + p.x * ay + p.y * by }), toDoc: (p: { x: number; y: number }) => { const dx = p.x - x0, dy = p.y - y0; return { x: (dx * by - bx * dy) / det, y: (ax * dy - ay * dx) / det }; } });
          return r.ops;
        });
      }
      return rpc('tools.register', { id, label: spec?.label, hint: spec?.hint, has: { down: typeof spec?.down === 'function', move: typeof spec?.move === 'function', up: typeof spec?.up === 'function', overlay: typeof spec?.overlay === 'function' } });
    },
  };
  const sources = {
    register: (spec: { id: string; label: string; generate: Fn }) => {
      const id = String(spec?.id ?? '');
      if (typeof spec?.generate === 'function') fns.set(`src:${id}`, spec.generate);
      return rpc('sources.register', { id, label: spec?.label, ok: typeof spec?.generate === 'function' });
    },
  };
  const events = {
    on: (name: string, fn: Fn) => {
      if (typeof fn !== 'function') throw new Error('An event handler must be a function.');
      const set = handlers.get(name) ?? new Set<Fn>();
      handlers.set(name, set);
      if (!set.size) void rpc('events.on', { name });
      set.add(fn);
      return () => events.off(name, fn);
    },
    off: (name: string, fn: Fn) => { const set = handlers.get(name); if (!set?.delete(fn)) return; if (!set.size) void rpc('events.off', { name }); },
  };
  fns.set('event', (name: string) => { for (const f of [...(handlers.get(name) ?? [])]) f({ name }); });
  const storage = {
    get: (k: string, fallback: unknown = null) => (cache.has(k) ? cache.get(k) : fallback),
    set: (k: string, v: unknown) => {
      const text = JSON.stringify(v) ?? 'null';
      if (size(k) + text.length > SIDE_LIMIT) throw new Error('A plugin may keep up to 200 KB.');
      const key = String(k).slice(0, 60);
      cache.set(key, JSON.parse(text));
      void rpc('storage.set', { k: key, v: JSON.parse(text) });
    },
    remove: (k: string) => { cache.delete(k); void rpc('storage.remove', { k }); },
    keys: () => [...cache.keys()],
    clear: () => { cache.clear(); void rpc('storage.clear'); },
  };
  const ui = {
    toast: (text: string, kind?: string) => { void rpc('ui.toast', { text, kind }); },
    confirm: (title: string, text: string, ok?: string) => rpc('ui.confirm', { title, text, ok }),
    prompt: (title: string, value?: string, ok?: string) => rpc('ui.prompt', { title, value, ok }),
    form: (title: string, fields: unknown) => rpc('ui.form', { title, fields }),
    dialog: (o: { title: string; content?: string; buttons?: unknown }) => rpc('ui.dialog', { title: o?.title, content: typeof o?.content === 'string' ? o.content : undefined, buttons: o?.buttons }),
  };
  const commands = {
    register: (spec: { id: string; label: string; keys?: string[]; run: Fn }) => {
      const id = String(spec?.id ?? '');
      if (typeof spec?.run === 'function') fns.set(`cmd:${id}`, spec.run);
      return rpc('commands.register', { id, label: spec?.label, keys: spec?.keys, ok: typeof spec?.run === 'function' });
    },
  };
  const formats = {
    register: (spec: { id: string; label?: string; extensions?: string[]; decode?: Fn; encode?: Fn }) => {
      const id = String(spec?.id ?? '');
      if (typeof spec?.decode === 'function') {
        fns.set(`format:${id}:decode`, async (bytes: Uint8Array, name: string) => { const out = await spec.decode!(bytes, name); return { width: out.width, height: out.height, data: out.data }; });
      }
      if (typeof spec?.encode === 'function') {
        fns.set(`format:${id}:encode`, async (image: Img) => { const out = await spec.encode!({ width: image.width, height: image.height, data: image.data }); return out instanceof Uint8Array ? out : new Uint8Array(out); });
      }
      return rpc('formats.register', { id, label: spec?.label, extensions: spec?.extensions, decode: typeof spec?.decode === 'function', encode: typeof spec?.encode === 'function' });
    },
  };
  return Object.freeze({ apiVersion: 1, plugin: Object.freeze({ ...init.plugin }), documents, filters, panels, tools, sources, events, storage, ui, commands, formats });
}

async function start(init: Init): Promise<void> {
  seal();
  const url = URL.createObjectURL(new Blob([init.code], { type: 'text/javascript' }));
  let mod: { activate?: Fn; deactivate?: Fn };
  try { mod = await import(/* @vite-ignore */ url) as typeof mod; } finally { URL.revokeObjectURL(url); }
  if (typeof mod.activate !== 'function') throw new Error('The module must export an activate(formvis) function.');
  if (typeof mod.deactivate === 'function') fns.set('deactivate', mod.deactivate);
  await mod.activate(makeApi(init));
}

scope.addEventListener('unhandledrejection', (e) => { send({ k: 'fail', text: String((e.reason && (e.reason as Error).message) || e.reason || 'Rejected') }); });
scope.addEventListener('error', (e) => { send({ k: 'fail', text: String(e.message || 'Script error') }); });

scope.addEventListener('message', (e: MessageEvent) => {
  const m = e.data as { k?: string; id?: number; result?: unknown; error?: string; target?: string; args?: unknown[] };
  if (m.k === 'init') {
    start(m as unknown as Init).then(() => send({ k: 'ready' }), (err: unknown) => send({ k: 'ready', error: err instanceof Error ? err.message : String(err) }));
    return;
  }
  if (m.k === 'reply') {
    const p = pending.get(m.id ?? -1);
    if (p) { pending.delete(m.id!); if (m.error) p.no(new Error(m.error)); else p.ok(m.result); }
    return;
  }
  if (m.k === 'call') {
    const fn = fns.get(String(m.target));
    const done = (result?: unknown, error?: string): void => { if (m.id) send({ k: 'reply', id: m.id, result, error }); else if (error) send({ k: 'fail', text: `${m.target}: ${error}` }); };
    if (!fn) { done(undefined, `The plugin has no ${m.target}.`); return; }
    const args = Array.isArray(m.args) ? m.args : [];
    const wrap = m.target === 'deactivate' ? [] : args;
    Promise.resolve().then(() => fn(...wrap)).then((r) => done(r), (err: unknown) => done(undefined, err instanceof Error ? err.message : String(err)));
  }
});
