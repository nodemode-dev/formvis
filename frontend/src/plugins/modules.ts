import type { Engine, ID, Project } from '../engine';
import { Raster, createSurface, ctxOf, stripExt } from '../engine';
import { addFormat } from './formats';
import { SelectionMask } from '../engine/selection';
import { api, type PluginManifest } from '../io/api';
import { getTool, registerTool, unregisterTool, type Tool } from '../extensions/registry';
import type { ToolId } from '../engine';
import type { Commands } from '../ui/commands';
import { Dialog } from '../ui/dialogs';
import { el, q, setText } from '../ui/dom';
import { icon } from '../ui/icons';
import { sliderRow } from '../ui/panels/controls';

/* Plugin folders. plugins/<id>/plugin.json names an ES module (main) in the engine's data folder. Its code runs in a
 * dedicated Worker (plugin-worker.ts) with no window, no document and no network, and calls activate(formvis); the object
 * it receives sends messages that fromWorker and dispatch below answer after the permission check. API version 1, the
 * object a plugin receives (each part needs its permission in plugin.json). Document and pixel calls return promises; a
 * panel's render(ui) describes controls (ui.text, button, slider, checkbox, select) that the window builds; a tool's
 * overlay(g, view) is recorded and replayed from a fixed set of canvas calls; storage reads are local to the worker:
 *
 *   formvis.apiVersion, formvis.plugin {id, name, version}
 *   documents    formvis.documents.list() / active() / get(id) / create({width, height, name})
 *                doc: {id, name, width, height, layers(), activeLayerId, activate(),
 *                      selection {get(), set(bitmap | null)}}
 *   pixels       doc.flatten({scale, box, below}) -> {width, height, data}   (box {x,y,w,h}, below: a layer id)
 *                doc.getPixels(layerId?, box?), doc.setPixels(layerId, image, box?), doc.newLayer(image, {name, x, y})
 *                an image is {width, height, data: Uint8ClampedArray}; layer pixels need the document to be the active one
 *   filters      formvis.filters.register({id, label, params: [{id, label, type: 'number' | 'boolean' | 'select', min, max,
 *                step, default, choices}], cpu(image, values), glsl}) / apply(id, values) / list()
 *                glsl is a WebGL2 fragment shader (#version 300 es) with `in vec2 v_uv; uniform sampler2D u_src;
 *                uniform vec2 u_size;` and one `uniform float u_<param id>` per number or boolean param; it runs when cpu is absent
 *   panels       formvis.panels.register({id, label, render(container)})
 *                formvis.panels.registerFrame({id, label, html, height, onMessage(m)}) -> {post(m)}, with the frames permission:
 *                the plugin's own page in a sandboxed frame (scripts only; no network calls, but a frame can still navigate itself
 *                to a web address, which is why it has a permission of its own); the frame talks with parent.postMessage
 *   tools        formvis.tools.register({id, label, hint, down(p), move(p), up(p), overlay(g, view)}); p = {x, y, shift, alt, mod}
 *   sources      formvis.sources.register({id, label, generate({box, doc, image}) -> image}); runs on a document's boxes
 *   events       formvis.events.on(name, fn) -> off, formvis.events.off(name, fn)  (name: doc, selection, active, history, projects, tool)
 *   storage      formvis.storage.get / set / remove / keys / clear   (JSON values, kept per plugin on this device)
 *   ui           formvis.ui.toast / confirm / prompt / form(title, fields) / dialog({title, content, buttons})
 *   commands     formvis.commands.register({id, label, keys, run})
 *   formats      formvis.formats.register({id, label, extensions, decode(bytes, name) -> image, encode(image) -> bytes});
 *                a decoder opens files with those extensions, an encoder adds Export As: label
 *
 * An error in a plugin is caught, kept in its error list and shown in Manage Plugins; it never reaches the app. */

export const PERMISSIONS = ['documents', 'pixels', 'filters', 'panels', 'tools', 'sources', 'events', 'storage', 'ui', 'commands', 'formats', 'frames'] as const;
type Permission = typeof PERMISSIONS[number];

export type Manifest = PluginManifest;
export interface FolderPlugin { id: string; manifest: Manifest | null; error: string | null }
export interface PluginImage { width: number; height: number; data: Uint8ClampedArray }
type Values = Record<string, number | boolean | string>;
interface ParamSpec { id: string; label: string; type: 'number' | 'boolean' | 'select'; min: number; max: number; step: number; default: number | boolean | string; choices: Array<{ id: string; label: string }> }
interface FilterSpec { id: string; label: string; params: ParamSpec[]; cpu?: (image: ImageData, values: Values) => ImageData | void | Promise<ImageData | void>; glsl?: string }
type Fn = (...a: unknown[]) => unknown;
type Api = Record<string, Record<string, Fn>>;
interface PanelState { body: HTMLElement; nodes: Map<string, { el: HTMLElement; set(v: unknown): void }> }
interface OverlayState { ops: unknown[][]; key: string; busy: boolean }
interface FieldSpec { id: string; label: string; type: 'number' | 'boolean' | 'select' | 'text'; min?: number; max?: number; step?: number; default?: number | boolean | string; choices?: Array<{ id: string; label: string }> }

interface Running {
  manifest: Manifest;
  off: Array<() => void>;
  errors: string[];
  filters: Map<string, FilterSpec>;
  counts: { filters: number; panels: number; tools: number; sources: number; commands: number; formats: number };
  /** The Worker the plugin's code runs in, the calls waiting on it, and what the window keeps for it. */
  worker: Worker | null;
  onReady: ((error?: string) => void) | null;
  calls: Map<number, { ok: (v: unknown) => void; no: (e: Error) => void; timer: number }>;
  seq: number;
  api: Api | null;
  panels: Map<string, PanelState>;
  evFns: Map<string, () => void>;
  overlays: Map<string, OverlayState>;
  inflight: Set<Promise<unknown>>;
}

export interface PanelHost { add(id: string, label: string): HTMLElement | null; remove(id: string): void }
export interface ModuleDeps {
  engine: Engine;
  commands: Commands;
  note: (text: string, kind?: 'info' | 'error') => void;
  confirm: (title: string, text: string, ok: string) => Promise<boolean>;
  prompt: (title: string, value: string, ok: string) => Promise<string | null>;
  panels: () => PanelHost | null;
}

const APPROVED = 'formvis.plugins.folders.on';
const SIDE_LIMIT = 200_000;
const ACTIVATE_MS = 5000;
const FILTER_MS = 30_000, SOURCE_MS = 60_000, FORMAT_MS = 60_000, OVERLAY_MS = 2000, PANEL_NODES = 200, FRAME_CHARS = 200_000;
const FRAME_POLICY = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'";
interface OverlayView { zoom: number; toScreen(p: { x: number; y: number }): { x: number; y: number } }
const OVERLAY_PROPS = new Set(['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'globalAlpha', 'textAlign']);
const OVERLAY_CALLS = new Set(['beginPath', 'closePath', 'moveTo', 'lineTo', 'rect', 'arc', 'stroke', 'fill', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'setLineDash', 'save', 'restore']);
const EVENTS = { doc: 'doc', selection: 'selection', active: 'active', history: 'history', projects: 'projects', tool: 'tool' } as const;
const rect = (v: unknown): { x: number; y: number; w: number; h: number } | null => {
  const b = v as { x?: number; y?: number; w?: number; h?: number } | undefined;
  return b && [b.x, b.y, b.w, b.h].every((n) => typeof n === 'number' && Number.isFinite(n)) ? { x: Math.round(b.x!), y: Math.round(b.y!), w: Math.round(b.w!), h: Math.round(b.h!) } : null;
};
const toImage = (s: { width: number; height: number; getContext(k: '2d'): unknown }, box?: { x: number; y: number; w: number; h: number } | null): PluginImage => {
  const c = s.getContext('2d') as CanvasRenderingContext2D;
  const r = box ?? { x: 0, y: 0, w: s.width, h: s.height };
  const img = c.getImageData(r.x, r.y, r.w, r.h);
  return { width: img.width, height: img.height, data: img.data };
};
function asImageData(v: unknown): ImageData {
  const i = v as Partial<PluginImage> | undefined;
  if (!i || !Number.isInteger(i.width) || !Number.isInteger(i.height) || !(i.data instanceof Uint8ClampedArray) || i.data.length !== i.width! * i.height! * 4) throw new Error('An image is { width, height, data: Uint8ClampedArray of width * height * 4 }.');
  return new ImageData(new Uint8ClampedArray(i.data), i.width!, i.height!);
}

const VERT = '#version 300 es\nin vec2 p; out vec2 v_uv; void main() { v_uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
/** One WebGL2 pass of a plugin's fragment shader over an image; null where WebGL2 is not there. */
export function runGlsl(src: ImageData, frag: string, uniforms: Record<string, number>): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = src.width; canvas.height = src.height;
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, text: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, text); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader: ${(gl.getShaderInfoLog(s) ?? '').slice(0, 200)}`);
    return s;
  };
  const prog = gl.createProgram()!;
  try {
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Shader: ${(gl.getProgramInfoLog(prog) ?? '').slice(0, 200)}`);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_src'), 0);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_size'), src.width, src.height);
    for (const [k, v] of Object.entries(uniforms)) gl.uniform1f(gl.getUniformLocation(prog, `u_${k}`), v);
    gl.viewport(0, 0, src.width, src.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const out = new Uint8ClampedArray(src.width * src.height * 4);
    gl.readPixels(0, 0, src.width, src.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return new ImageData(out, src.width, src.height);
  } finally { gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}

/** The one dialog behind formvis.ui.form and formvis.ui.dialog: built once, its body replaced for each use. */
class PluginDialog extends Dialog {
  private done: ((v: unknown) => void) | null = null;
  private readonly bar: HTMLElement;
  constructor() { super('Plugin', 420); this.bar = this.foot; this.onClose = () => this.finish(null); }
  private finish(v: unknown): void { const d = this.done; this.done = null; if (this.isOpen) this.close(); d?.(v); }
  ask(title: string, build: (body: HTMLElement) => () => unknown, buttons: Array<{ label: string; primary?: boolean }>): Promise<{ label: string; value: unknown } | null> {
    this.done?.(null);
    this.setTitle(title);
    this.body.replaceChildren();
    this.bar.replaceChildren();
    const read = build(this.body);
    return new Promise((resolve) => {
      this.done = (v) => resolve(v as { label: string; value: unknown } | null);
      for (const b of buttons) this.button(b.label, b.primary ? 'primary' : 'ghost', () => this.finish({ label: b.label, value: read() }));
      this.open();
    });
  }
}

export class FolderPlugins {
  private readonly running = new Map<string, Running>();
  private readonly cache = new Map<string, FolderPlugin>();
  private readonly frames = new Map<string, HTMLIFrameElement>();
  private dlg: PluginDialog | null = null;
  onChange: () => void = () => {};

  constructor(private readonly d: ModuleDeps) {}

  private approved(): Record<string, string> { try { const v: unknown = JSON.parse(localStorage.getItem(APPROVED) ?? '{}'); return v && typeof v === 'object' ? v as Record<string, string> : {}; } catch { return {}; } }
  private stamp(m: Manifest): string { return `${m.version}|${m.permissions.join(',')}`; }
  private setApproved(id: string, stamp: string | null): void {
    const a = this.approved(); if (stamp) a[id] = stamp; else delete a[id];
    try { localStorage.setItem(APPROVED, JSON.stringify(a)); } catch { /* this session only */ }
  }

  /** The plugin folders in the data folder with what each is doing (Manage Plugins, list_plugins). */
  async list(): Promise<Array<Record<string, unknown>>> {
    const rows = await api.pluginFolders();
    this.cache.clear();
    for (const r of rows) this.cache.set(r.id, r);
    const ok = this.approved();
    return rows.map((r) => {
      const run = this.running.get(r.id);
      return { id: r.id, name: r.manifest?.name ?? r.id, version: r.manifest?.version ?? '', description: r.manifest?.description ?? '', permissions: r.manifest?.permissions ?? [], invalid: r.error, on: !!r.manifest && ok[r.id] === this.stamp(r.manifest), running: !!run,
        registered: run ? { ...run.counts } : null, errors: run?.errors ?? [] };
    });
  }

  /** Starts every plugin the person approved; a plugin whose version or permissions changed asks again before it runs. */
  async loadAll(): Promise<void> {
    const ok = this.approved();
    for (const r of await api.pluginFolders()) {
      this.cache.set(r.id, r);
      if (r.manifest && ok[r.id] === this.stamp(r.manifest) && !this.running.has(r.id)) await this.load(r);
    }
  }

  async setOn(id: string, on: boolean): Promise<void> {
    if (!on) { this.setApproved(id, null); this.unload(id); this.onChange(); return; }
    const row = this.cache.get(id) ?? (await api.pluginFolders()).find((r) => r.id === id);
    if (!row?.manifest) { this.d.note(row?.error ?? `There is no plugin ${id}.`, 'error'); return; }
    const m = row.manifest;
    if (!(await this.d.confirm(`Turn on ${m.name}?`, `This plugin's code runs in its own isolated worker, with no access to the page, and reaches formvis only through these permissions: ${m.permissions.join(', ') || 'none'}.`, 'Turn On'))) { this.onChange(); return; }
    this.setApproved(id, this.stamp(m));
    await this.load(row);
  }

  async reloadAll(): Promise<number> {
    for (const id of [...this.running.keys()]) this.unload(id);
    await this.loadAll();
    return this.running.size;
  }

  async remove(id: string): Promise<void> { this.unload(id); this.setApproved(id, null); await api.removePluginFolder(id); this.onChange(); }

  private fail(p: Running, text: string): void { p.errors = [...p.errors, text.slice(0, 200)].slice(-10); this.onChange(); }

  /** Runs a plugin's callback so that a throw or a rejection is kept as the plugin's error and goes no further. */
  private guard<T>(p: Running, what: string, fn: () => T): T | undefined {
    try {
      const out = fn();
      if (out && typeof (out as { then?: unknown }).then === 'function') (out as unknown as Promise<unknown>).catch((e: unknown) => this.fail(p, `${what}: ${e instanceof Error ? e.message : String(e)}`));
      return out;
    } catch (e) { this.fail(p, `${what}: ${e instanceof Error ? e.message : String(e)}`); return undefined; }
  }

  private async load(row: FolderPlugin): Promise<void> {
    const m = row.manifest;
    if (!m) return;
    this.unload(m.id);
    const p: Running = { manifest: m, off: [], errors: [], filters: new Map(), counts: { filters: 0, panels: 0, tools: 0, sources: 0, commands: 0, formats: 0 }, worker: null, calls: new Map(), seq: 0, api: null, panels: new Map(), evFns: new Map(), overlays: new Map(), inflight: new Set(), onReady: null };
    this.running.set(m.id, p);
    this.onChange();
    try {
      const code = await api.pluginFolderFile(m.id, m.main);
      const host = this.apiFor(p) as Api;
      p.api = host;
      const w = new Worker(new URL('./plugin-worker.ts', import.meta.url), { type: 'module', name: `plugin-${m.id}` });
      p.worker = w;
      w.onmessage = (ev: MessageEvent) => { void this.fromWorker(p, ev.data as Record<string, unknown>); };
      w.onerror = (ev) => { this.fail(p, ev.message || 'The plugin worker failed.'); };
      const ready = new Promise<void>((ok, no) => { p.onReady = (error) => { if (error) no(new Error(error)); else ok(); }; });
      const store = m.permissions.includes('storage') ? Object.fromEntries((host.storage.keys() as string[]).map((k) => [k, host.storage.get(k)])) : null;
      w.postMessage({ k: 'init', code, plugin: { id: m.id, name: m.name, version: m.version }, storage: store });
      await Promise.race([ready, new Promise((_, no) => setTimeout(() => no(new Error('activate took more than 5 seconds.')), ACTIVATE_MS))]);
      await Promise.all([...p.inflight]);
    } catch (e) {
      this.fail(p, e instanceof Error ? e.message : String(e));
      this.d.note(`${m.name}: ${p.errors[p.errors.length - 1]}`, 'error');
      this.stop(p, false);
      this.running.set(m.id, p);
    }
    this.onChange();
  }

  private stop(p: Running, call = true): void {
    const w = p.worker;
    if (call && w) void this.callIn(p, 'deactivate', [], 1500).catch(() => { /* none exported */ }).finally(() => this.halt(p, w));
    else this.halt(p, w);
    for (const f of p.off.splice(0).reverse()) { try { f(); } catch { /* the plugin is going anyway */ } }
    this.running.delete(p.manifest.id);
  }

  /** Ends the plugin's Worker and answers every call still waiting on it. */
  private halt(p: Running, w: Worker | null = p.worker): void {
    w?.terminate();
    if (p.worker === w) p.worker = null;
    for (const c of p.calls.values()) { window.clearTimeout(c.timer); c.no(new Error('The plugin has stopped.')); }
    p.calls.clear();
  }

  /** Runs a function the plugin registered, inside its Worker; ms of 0 waits for as long as the plugin takes (a dialog it opened). */
  private callIn(p: Running, target: string, args: unknown[], ms = 0): Promise<unknown> {
    const w = p.worker;
    if (!w) return Promise.reject(new Error('The plugin is not running.'));
    return new Promise((ok, no) => {
      const id = ++p.seq;
      const timer = ms ? window.setTimeout(() => { p.calls.delete(id); this.fail(p, `${target} took more than ${ms / 1000} seconds and the plugin was stopped.`); this.halt(p, w); no(new Error(`${target} timed out.`)); }, ms) : 0;
      p.calls.set(id, { ok, no, timer });
      w.postMessage({ k: 'call', id, target, args });
    });
  }

  /** Sends the plugin an event or a pointer point and does not wait for an answer. */
  private tell(p: Running, target: string, args: unknown[]): void { p.worker?.postMessage({ k: 'call', id: 0, target, args }); }

  private async fromWorker(p: Running, m: Record<string, unknown>): Promise<void> {
    switch (m.k) {
      case 'ready': p.onReady?.(typeof m.error === 'string' ? m.error : undefined); return;
      case 'fail': this.fail(p, String(m.text ?? 'Script error')); return;
      case 'reply': {
        const c = p.calls.get(Number(m.id));
        if (!c) return;
        p.calls.delete(Number(m.id)); window.clearTimeout(c.timer);
        if (typeof m.error === 'string' && m.error) c.no(new Error(m.error)); else c.ok(m.result);
        return;
      }
      case 'rpc': {
        const id = Number(m.id), w = p.worker;
        const reply = (result?: unknown, error?: string): void => {
          try { w?.postMessage({ k: 'reply', id, result, error }); } catch { w?.postMessage({ k: 'reply', id, error: 'The answer could not be sent to the plugin.' }); }
        };
        const job = (async () => this.dispatch(p, String(m.op), (m.args ?? {}) as Record<string, unknown>))();
        p.inflight.add(job);
        try { reply(await job); } catch (e) { reply(undefined, e instanceof Error ? e.message : String(e)); } finally { p.inflight.delete(job); }
        return;
      }
      default: return;
    }
  }

  /** The requests a plugin's code may make. Each goes through the same permission checks as before; nothing here hands over a window object. */
  private async dispatch(p: Running, op: string, a: Record<string, unknown>): Promise<unknown> {
    const api = p.api!;
    const doc = (d: unknown): unknown => { const x = d as { id: string; name: string; width: number; height: number; activeLayerId: string | null } | null; return x ? { id: x.id, name: x.name, width: x.width, height: x.height, activeLayerId: x.activeLayerId } : null; };
    const id = String(a.id ?? '');
    switch (op) {
      case 'documents.list': return api.documents.list();
      case 'documents.active': return doc(api.documents.active());
      case 'documents.get': return doc(api.documents.get(id));
      case 'documents.create': return doc(api.documents.create(a.o));
      case 'doc': return this.docCall(p, id, String(a.m), Array.isArray(a.a) ? a.a : []);
      case 'filters.register':
        api.filters.register({ id, label: a.label, params: a.params, glsl: typeof a.glsl === 'string' ? a.glsl : undefined,
          cpu: a.cpu ? (img: unknown, values: unknown) => { const i = img as ImageData; return this.callIn(p, `filter:${id}`, [{ width: i.width, height: i.height, data: i.data }, values], FILTER_MS).then((r) => asImageData(r)); } : undefined });
        return true;
      case 'filters.apply': return api.filters.apply(id, a.values);
      case 'filters.list': return api.filters.list();
      case 'panels.register':
        api.panels.register({ id, label: a.label, render: (body: HTMLElement) => { p.panels.set(id, { body, nodes: new Map() }); void this.callIn(p, `panel:${id}`, []).catch((e: unknown) => this.fail(p, `panel ${id}: ${e instanceof Error ? e.message : String(e)}`)); } });
        return true;
      case 'panel.add': case 'panel.set': case 'panel.remove': case 'panel.clear': return this.panelOp(p, op, a);
      case 'panels.frame': {
        this.need(p, 'frames');
        const host = this.d.panels(), pid = `plug-${p.manifest.id}-${id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30)}`.replace(/[._]/g, '-'), key = `${p.manifest.id}:${id}`, label = String(a.label ?? id).slice(0, 40);
        const body = host?.add(pid, label);
        if (!host || !body) throw new Error('Panels are not available here.');
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.title = label;
        frame.style.width = '100%'; frame.style.border = '0'; frame.style.height = `${Math.min(600, Math.max(40, Number(a.height) || 160))}px`;
        frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_POLICY}">${String(a.html ?? '').slice(0, FRAME_CHARS)}`;
        const heard = (ev: MessageEvent): void => { if (ev.source === frame.contentWindow && JSON.stringify(ev.data ?? null).length <= FRAME_CHARS) this.tell(p, `frame:${id}`, [ev.data]); };
        window.addEventListener('message', heard);
        this.frames.set(key, frame);
        body.appendChild(frame);
        p.counts.panels++;
        p.off.push(() => { window.removeEventListener('message', heard); this.frames.delete(key); host.remove(pid); });
        return true;
      }
      case 'panel.post': {
        const frame = this.frames.get(`${p.manifest.id}:${String(a.panel)}`), text = JSON.stringify(a.message ?? null);
        if (!frame) throw new Error('That panel is not open.');
        if (text.length > FRAME_CHARS) throw new Error(`A message to a panel may hold up to ${FRAME_CHARS.toLocaleString()} characters.`);
        frame.contentWindow?.postMessage(JSON.parse(text), '*');
        return true;
      }
      case 'tools.register': {
        const has = (a.has ?? {}) as Record<string, boolean>, st: OverlayState = { ops: [], key: '', busy: false };
        p.overlays.set(id, st);
        const point = (m: string) => (pt: unknown) => { st.key = ''; this.tell(p, `tool:${id}:${m}`, [pt]); };
        api.tools.register({ id, label: a.label, hint: a.hint, down: has.down ? point('down') : undefined, move: has.move ? point('move') : undefined, up: has.up ? point('up') : undefined,
          overlay: has.overlay ? (g: unknown, view: unknown) => this.overlay(p, id, st, g as CanvasRenderingContext2D, view as OverlayView) : undefined });
        return true;
      }
      case 'sources.register':
        if (a.ok) api.sources.register({ id, label: a.label, generate: (arg: unknown) => this.callIn(p, `src:${id}`, [arg], SOURCE_MS) });
        return true;
      case 'events.on': { const name = String(a.name); if (!p.evFns.has(name)) p.evFns.set(name, api.events.on(name, () => this.tell(p, 'event', [name])) as () => void); return true; }
      case 'events.off': { const name = String(a.name); p.evFns.get(name)?.(); p.evFns.delete(name); return true; }
      case 'storage.set': api.storage.set(String(a.k), a.v); return true;
      case 'storage.remove': api.storage.remove(String(a.k)); return true;
      case 'storage.clear': api.storage.clear(); return true;
      case 'ui.toast': api.ui.toast(String(a.text ?? ''), a.kind); return true;
      case 'ui.confirm': return api.ui.confirm(String(a.title ?? ''), String(a.text ?? ''), a.ok);
      case 'ui.prompt': return api.ui.prompt(String(a.title ?? ''), a.value, a.ok);
      case 'ui.form': return api.ui.form(String(a.title ?? ''), a.fields);
      case 'ui.dialog': return api.ui.dialog({ title: a.title, content: typeof a.content === 'string' ? a.content : undefined, buttons: a.buttons });
      case 'commands.register':
        if (a.ok) api.commands.register({ id, label: a.label, keys: a.keys, run: () => this.callIn(p, `cmd:${id}`, []) });
        return true;
      case 'formats.register':
        api.formats.register({ id, label: a.label, extensions: a.extensions,
          decode: a.decode ? (bytes: Uint8Array, name: string) => this.callIn(p, `format:${id}:decode`, [bytes, name], FORMAT_MS).then((r) => { const i = asImageData(r); return { width: i.width, height: i.height, data: i.data }; }) : undefined,
          encode: a.encode ? (image: PluginImage) => this.callIn(p, `format:${id}:encode`, [image], FORMAT_MS).then((r) => { if (!(r instanceof Uint8Array)) throw new Error('An encoder returns a Uint8Array of the file.'); return r; }) : undefined });
        return true;
      default: throw new Error(`Unknown request ${op}.`);
    }
  }

  private async docCall(p: Running, id: string, m: string, a: unknown[]): Promise<unknown> {
    this.need(p, 'documents');
    const pr = this.d.engine.projects.find((x) => x.id === id);
    if (!pr) throw new Error('That document is closed.');
    const d = this.docApi(p, pr);
    if (m === 'selection.get' || m === 'selection.set') return (d.selection as Record<string, Fn>)[m.slice(10)](...a);
    if (!['layers', 'activate', 'flatten', 'getPixels', 'setPixels', 'newLayer'].includes(m)) throw new Error(`Unknown request ${m}.`);
    const out = await (d[m] as Fn)(...a);
    return m === 'activate' ? true : out;
  }

  /** A panel is built here from what the plugin describes: text, buttons, sliders, check boxes and lists, made once and updated in place. */
  private panelOp(p: Running, op: string, a: Record<string, unknown>): boolean {
    const panel = String(a.panel), st = p.panels.get(panel);
    if (!st) throw new Error('That panel is not open.');
    if (op === 'panel.clear') { st.nodes.clear(); st.body.replaceChildren(); return true; }
    if (op === 'panel.remove') { st.nodes.get(String(a.id))?.el.remove(); st.nodes.delete(String(a.id)); return true; }
    if (op === 'panel.set') { st.nodes.get(String(a.id))?.set(a.value); return true; }
    const n = (a.node ?? {}) as Record<string, unknown>, key = String(n.id), label = String(n.label ?? '').slice(0, 80), tell = (...v: unknown[]) => this.tell(p, `ui:${panel}:${key}`, v);
    if (st.nodes.size >= PANEL_NODES) throw new Error(`A panel may hold ${PANEL_NODES} controls.`);
    let node: { el: HTMLElement; set(v: unknown): void };
    if (n.kind === 'button') {
      const b = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button"></button>');
      setText(b, label); b.addEventListener('click', () => tell());
      node = { el: b, set: (v) => setText(b, String(v).slice(0, 80)) };
    } else if (n.kind === 'slider') {
      const row = sliderRow(label, Number(n.min ?? 0), Number(n.max ?? 100), Number(n.step ?? 1), (v) => tell(v), { def: Number(n.value ?? 0) });
      row.set(Number(n.value ?? 0));
      node = { el: row.el, set: (v) => row.set(Number(v)) };
    } else if (n.kind === 'checkbox') {
      const box = el<HTMLInputElement>('<input type="checkbox">'), row = el('<label class="cv-field"><span></span></label>');
      box.checked = !!n.value; box.setAttribute('aria-label', label); setText(q(row, 'span'), label); row.appendChild(box);
      box.addEventListener('change', () => tell(box.checked));
      node = { el: row, set: (v) => { box.checked = !!v; } };
    } else if (n.kind === 'select') {
      const sel = el<HTMLSelectElement>('<select class="cv-input"></select>'), row = el('<label class="cv-field"><span></span></label>');
      for (const c of Array.isArray(n.choices) ? n.choices as Array<{ id: string; label: string }> : []) { const o = document.createElement('option'); o.value = String(c.id); o.textContent = String(c.label); sel.appendChild(o); }
      sel.value = String(n.value ?? ''); sel.setAttribute('aria-label', label); setText(q(row, 'span'), label); row.appendChild(sel);
      sel.addEventListener('change', () => tell(sel.value));
      node = { el: row, set: (v) => { sel.value = String(v); } };
    } else {
      const t = el('<p class="cv-note"></p>');
      setText(t, String(n.value ?? '').slice(0, 2000));
      node = { el: t, set: (v) => setText(t, String(v).slice(0, 2000)) };
    }
    st.nodes.set(key, node); st.body.appendChild(node.el);
    return true;
  }

  /** Draws the last list of drawing steps the plugin's overlay produced, from a fixed set of canvas calls; asks for a new list when the view or the tool state moved. */
  private overlay(p: Running, id: string, st: OverlayState, g: CanvasRenderingContext2D, view: OverlayView): void {
    const o = view.toScreen({ x: 0, y: 0 }), ex = view.toScreen({ x: 1, y: 0 }), ey = view.toScreen({ x: 0, y: 1 });
    const m = [o.x, o.y, ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y], key = `${view.zoom}|${m.join(',')}`;
    g.save();
    try {
      const to = g as unknown as Record<string, unknown>;
      for (const op of st.ops) {
        const name = String(op[0]);
        if (name.startsWith('=')) { const prop = name.slice(1), v = op[1]; if (OVERLAY_PROPS.has(prop) && (typeof v === 'string' || typeof v === 'number')) to[prop] = typeof v === 'string' ? v.slice(0, 120) : v; }
        else if (OVERLAY_CALLS.has(name)) (to[name] as Fn).apply(g, op.slice(1).map((x) => typeof x === 'string' ? x.slice(0, 200) : x));
      }
    } catch { /* a bad step ends the drawing */ }
    g.restore();
    if (key === st.key || st.busy) return;
    st.busy = true; st.key = key;
    void this.callIn(p, `tool:${id}:overlay`, [{ zoom: view.zoom, m }], OVERLAY_MS)
      .then((r) => { st.ops = Array.isArray(r) ? (r as unknown[]).filter(Array.isArray).slice(0, 4000) as unknown[][] : []; }, () => { st.ops = []; })
      .finally(() => { st.busy = false; this.d.engine.emit('tool', null); });
  }

  unload(id: string): void { const p = this.running.get(id); if (p) { this.stop(p); this.onChange(); } }

  /** Every command id the plugins registered, for the Plugins menu. */
  commandIds(): string[] { return this.d.commands.all().map((c) => c.id).filter((id) => /^plugin:[a-z0-9._-]+:(filter|tool|source|cmd):/.test(id) && this.running.has(id.split(':')[1])); }

  private need(p: Running, perm: Permission): void { if (!p.manifest.permissions.includes(perm)) throw new Error(`This plugin did not ask for the ${perm} permission in plugin.json.`); }
  private cid(p: Running, kind: string, id: string): string { return `plugin:${p.manifest.id}:${kind}:${String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`; }

  private addCommand(p: Running, id: string, label: string, keys: string[], run: () => unknown, enabled?: () => boolean): void {
    const free = keys.filter((k) => /^(Alt|Shift|Mod)(\+(Alt|Shift|Mod))*\+.+$/.test(k) && /Mod|Alt/.test(k) && !this.d.commands.forCombo(k)).slice(0, 2);
    this.d.commands.add({ id, label: label.slice(0, 80), keys: free, enabled: enabled ?? (() => true), run: () => { this.guard(p, label, run); } });
    p.off.push(() => this.d.commands.remove(id));
    p.counts.commands++;
  }

  private docApi(p: Running, pr: Project): Record<string, unknown> {
    const e = this.d.engine;
    const here = (): Project => { if (e.current !== pr) throw new Error('Activate the document first: doc.activate().'); return pr; };
    const layerOf = (id?: ID) => { const l = id ? here().layer(id) : here().activeLayer; if (!l) throw new Error('There is no such layer.'); return l; };
    const sel = {
      get: (): { x: number; y: number; width: number; height: number; data: Uint8Array } | null => { const s = pr.selection; return s ? { x: s.x, y: s.y, width: s.w, height: s.h, data: s.data.slice() } : null; },
      set: (b: { x?: number; y?: number; width: number; height: number; data: Uint8Array } | null): void => {
        here();
        if (!b) { e.applySelection(null, 'replace', 'Plugin: deselect'); return; }
        if (!Number.isInteger(b.width) || !Number.isInteger(b.height) || b.width < 1 || b.height < 1 || !(b.data instanceof Uint8Array) || b.data.length !== b.width * b.height) throw new Error('A selection bitmap is { x, y, width, height, data: Uint8Array of width * height }.');
        e.applySelection(new SelectionMask(Math.round(b.x ?? 0), Math.round(b.y ?? 0), b.width, b.height, b.data.slice()), 'replace', `Plugin: ${p.manifest.name}`);
      },
    };
    const api: Record<string, unknown> = {
      get id() { return pr.id; }, get name() { return pr.name; }, get width() { return pr.doc.width; }, get height() { return pr.doc.height; },
      get activeLayerId() { return pr.activeLayer?.id ?? null; },
      layers: () => pr.doc.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, group: !!l.isGroup })),
      activate: () => e.switchTo(pr.id),
      selection: sel,
      flatten: (o?: { scale?: number; box?: unknown; below?: ID }): PluginImage => {
        this.need(p, 'pixels');
        const src = o?.below ? (here(), e.renderBelow(o.below)) : e.flattenedOf(pr);
        if (!src) throw new Error('The document could not be flattened.');
        const box = rect(o?.box);
        let img = toImage(src, box ? { x: Math.max(0, box.x), y: Math.max(0, box.y), w: Math.max(1, Math.min(box.w, pr.doc.width - Math.max(0, box.x))), h: Math.max(1, Math.min(box.h, pr.doc.height - Math.max(0, box.y))) } : null);
        const k = typeof o?.scale === 'number' && o.scale > 0 && o.scale < 1 ? o.scale : 1;
        if (k < 1) {
          const from = createSurface(img.width, img.height); ctxOf(from).putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
          const to = createSurface(Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
          const g = ctxOf(to); g.imageSmoothingQuality = 'high'; g.drawImage(from as CanvasImageSource, 0, 0, to.width, to.height);
          img = toImage(to);
        }
        return img;
      },
      getPixels: (layer?: ID, box?: unknown): PluginImage => { this.need(p, 'pixels'); return toImage(e.renderLayerAlone(layerOf(layer).id), rect(box)); },
      setPixels: (layer: ID, image: unknown, box?: unknown): boolean => {
        this.need(p, 'pixels');
        const l = layerOf(layer), part = asImageData(image), W = pr.doc.width, H = pr.doc.height, b = rect(box) ?? { x: 0, y: 0, w: part.width, h: part.height };
        if (b.w !== part.width || b.h !== part.height || b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H) throw new Error(`The image must fit inside the ${W} by ${H} document at its box.`);
        const whole = ctxOf(e.renderLayerAlone(l.id)).getImageData(0, 0, W, H);
        for (let y = 0; y < b.h; y++) whole.data.set(part.data.subarray(y * b.w * 4, (y + 1) * b.w * 4), ((b.y + y) * W + b.x) * 4);
        return e.replaceLayerPixels(l.id, whole, `Plugin: ${p.manifest.name}`);
      },
      newLayer: (image: unknown, o?: { name?: string; x?: number; y?: number }): boolean => {
        this.need(p, 'pixels'); here();
        const img = asImageData(image), r = new Raster(img.width, img.height);
        r.ctx.putImageData(img, 0, 0); r.touch();
        e.insertRasterLayer(r, String(o?.name ?? p.manifest.name).slice(0, 60), Math.round(o?.x ?? 0), Math.round(o?.y ?? 0), {}, `Plugin: ${p.manifest.name}`);
        return true;
      },
    };
    return api;
  }

  private values(specs: ParamSpec[], v: Values): Values {
    const out: Values = {};
    for (const s of specs) {
      const x = v[s.id] ?? s.default;
      out[s.id] = s.type === 'number' ? Math.min(s.max, Math.max(s.min, Number(x))) : s.type === 'boolean' ? !!x : String(x);
    }
    return out;
  }

  /** The active pixel layer through a plugin filter, inside the selection when there is one; one undo step. */
  private async applyFilter(p: Running, f: FilterSpec, given: Values): Promise<boolean> {
    const e = this.d.engine, pr = e.current, l = pr?.activeLayer;
    if (!pr || !l) throw new Error('No document or layer is open.');
    const values = this.values(f.params, given), W = pr.doc.width, H = pr.doc.height;
    const src = ctxOf(e.renderLayerAlone(l.id)).getImageData(0, 0, W, H);
    let out: ImageData | null | void = null;
    if (f.glsl) {
      const uniforms: Record<string, number> = {};
      for (const s of f.params) if (s.type !== 'select') uniforms[s.id] = Number(values[s.id]);
      out = runGlsl(src, f.glsl, uniforms);
    }
    if (!out && f.cpu) out = await f.cpu(new ImageData(new Uint8ClampedArray(src.data), W, H), values);
    if (!out) throw new Error(f.glsl ? 'WebGL2 is not available and the filter has no cpu function.' : 'The filter returned no image.');
    const res = out as ImageData, mask = pr.selection;
    if (res.width !== W || res.height !== H) throw new Error('A filter must return an image of the same size.');
    if (mask) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const a = mask.valueAt(x, y) / 255, i = (y * W + x) * 4;
        if (a < 1) for (let c = 0; c < 4; c++) res.data[i + c] = Math.round(src.data[i + c] + (res.data[i + c] - src.data[i + c]) * a);
      }
    }
    return e.replaceLayerPixels(l.id, res, `${f.label} (${p.manifest.name})`);
  }

  private fields(specs: FieldSpec[], body: HTMLElement): () => Values {
    const get: Array<() => [string, number | boolean | string]> = [];
    for (const s of specs) {
      const label = String(s.label ?? s.id);
      if (s.type === 'number') {
        const min = s.min ?? 0, max = s.max ?? 100, row = sliderRow(label, min, max, s.step ?? 1, (v) => { cur = v; }, { def: Number(s.default ?? min) });
        let cur = Number(s.default ?? min);
        row.set(cur); body.appendChild(row.el);
        get.push(() => [s.id, cur]);
      } else if (s.type === 'boolean') {
        const box = el<HTMLInputElement>('<input type="checkbox">'); box.checked = !!s.default; box.setAttribute('aria-label', label);
        const row = el('<label class="cv-field"><span></span></label>'); setText(q(row, 'span'), label); row.appendChild(box); body.appendChild(row);
        get.push(() => [s.id, box.checked]);
      } else if (s.type === 'select') {
        const sel = el<HTMLSelectElement>('<select class="cv-input"></select>'); sel.setAttribute('aria-label', label);
        for (const c of s.choices ?? []) { const o = document.createElement('option'); o.value = String(c.id); o.textContent = String(c.label); sel.appendChild(o); }
        if (s.default !== undefined) sel.value = String(s.default);
        const row = el('<label class="cv-field"><span></span></label>'); setText(q(row, 'span'), label); row.appendChild(sel); body.appendChild(row);
        get.push(() => [s.id, sel.value]);
      } else {
        const inp = el<HTMLInputElement>('<input class="cv-input" type="text">'); inp.value = String(s.default ?? ''); inp.setAttribute('aria-label', label);
        const row = el('<label class="cv-field"><span></span></label>'); setText(q(row, 'span'), label); row.appendChild(inp); body.appendChild(row);
        get.push(() => [s.id, inp.value]);
      }
    }
    return () => Object.fromEntries(get.map((g) => g()));
  }

  private async form(title: string, specs: FieldSpec[]): Promise<Values | null> {
    this.dlg ??= new PluginDialog();
    const r = await this.dlg.ask(title, (body) => this.fields(specs, body), [{ label: 'Cancel' }, { label: 'OK', primary: true }]);
    return r && r.label === 'OK' ? r.value as Values : null;
  }

  private paramSpecs(raw: unknown): ParamSpec[] {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 12).map((r: Partial<ParamSpec>) => ({ id: String(r.id ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 30), label: String(r.label ?? r.id ?? ''), type: (r.type === 'boolean' || r.type === 'select' ? r.type : 'number') as ParamSpec['type'], min: Number(r.min ?? 0), max: Number(r.max ?? 100), step: Number(r.step ?? 1), default: r.default ?? (r.type === 'boolean' ? false : r.type === 'select' ? '' : Number(r.min ?? 0)), choices: Array.isArray(r.choices) ? r.choices : [] })).filter((s) => s.id);
  }

  private apiFor(p: Running): unknown {
    const m = p.manifest, e = this.d.engine;
    const docs = {
      list: () => { this.need(p, 'documents'); return e.projects.map((x) => ({ id: x.id, name: x.name, width: x.doc.width, height: x.doc.height, active: x === e.current })); },
      active: () => { this.need(p, 'documents'); return e.current ? this.docApi(p, e.current) : null; },
      get: (id: string) => { this.need(p, 'documents'); const x = e.projects.find((q2) => q2.id === id); return x ? this.docApi(p, x) : null; },
      create: (o?: { width?: number; height?: number; name?: string }) => { this.need(p, 'documents'); const x = e.newDocument(Math.round(o?.width ?? 512), Math.round(o?.height ?? 512), String(o?.name ?? 'Plugin document').slice(0, 60), 'white'); return x ? this.docApi(p, x) : null; },
    };
    const filters = {
      register: (spec: FilterSpec) => {
        this.need(p, 'filters');
        const id = String(spec?.id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
        if (!id || (typeof spec.cpu !== 'function' && typeof spec.glsl !== 'string')) throw new Error('A filter needs an id and a cpu function or a glsl shader.');
        const f: FilterSpec = { id, label: String(spec.label ?? id).slice(0, 60), params: this.paramSpecs(spec.params), cpu: spec.cpu, glsl: spec.glsl };
        p.filters.set(id, f); p.counts.filters++;
        p.off.push(() => p.filters.delete(id));
        this.addCommand(p, this.cid(p, 'filter', id), `${f.label}...`, [], async () => {
          const v = f.params.length ? await this.form(f.label, f.params.map((s) => ({ ...s }))) : {};
          if (v) await this.applyFilter(p, f, v);
        }, () => !!e.current?.activeLayer);
      },
      apply: (id: string, values?: Values) => { this.need(p, 'filters'); const f = p.filters.get(id); if (!f) throw new Error(`There is no filter ${id}.`); return this.applyFilter(p, f, values ?? {}); },
      list: () => [...p.filters.values()].map((f) => ({ id: f.id, label: f.label, glsl: !!f.glsl, cpu: !!f.cpu })),
    };
    const panels = {
      register: (spec: { id: string; label: string; render: (container: HTMLElement) => unknown }) => {
        this.need(p, 'panels');
        const host = this.d.panels(), id = `plug-${m.id}-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30)}`.replace(/[._]/g, '-');
        const body = host?.add(id, String(spec.label ?? spec.id).slice(0, 40));
        if (!host || !body) throw new Error('Panels are not available here.');
        p.counts.panels++;
        p.off.push(() => host.remove(id));
        this.guard(p, `panel ${spec.id}`, () => spec.render(body));
      },
    };
    const tools = {
      register: (spec: { id: string; label: string; hint?: string; down?: (pt: unknown) => void; move?: (pt: unknown) => void; up?: (pt: unknown) => void; overlay?: (g: CanvasRenderingContext2D, view: unknown) => void }) => {
        this.need(p, 'tools');
        const id = `plugin-${m.id}-${String(spec.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30)}` as ToolId;
        if (getTool(id)) throw new Error(`Tool ${spec.id} is already registered.`);
        const pt = (q2: { doc: { x: number; y: number }; shift: boolean; alt: boolean; mod: boolean; pressure: number }) => ({ x: q2.doc.x, y: q2.doc.y, shift: q2.shift, alt: q2.alt, mod: q2.mod, pressure: q2.pressure });
        const tool: Tool = {
          id, plugin: m.id, label: String(spec.label ?? spec.id).slice(0, 40), key: '', order: 900 + p.counts.tools, hidden: true,
          icon: () => icon('layers', 20), hint: () => String(spec.hint ?? ''),
          down: (_c, q2) => { if (spec.down) this.guard(p, `${spec.id} down`, () => spec.down!(pt(q2))); },
          move: (_c, q2) => { if (spec.move) this.guard(p, `${spec.id} move`, () => spec.move!(pt(q2))); },
          up: (_c, q2) => { if (spec.up) this.guard(p, `${spec.id} up`, () => spec.up!(pt(q2))); },
          overlay: spec.overlay ? (c, g) => { const v = c.view(); this.guard(p, `${spec.id} overlay`, () => spec.overlay!(g, { zoom: v.zoom, toScreen: v.toScreen, toDoc: v.toDoc })); } : undefined,
        };
        registerTool(tool); p.counts.tools++;
        p.off.push(() => { if (e.tool === id) e.setTool('move'); unregisterTool(id); });
        this.addCommand(p, this.cid(p, 'tool', spec.id), `${tool.label} Tool`, [], () => e.setTool(id), () => !!e.current);
      },
    };
    const sources = {
      register: (spec: { id: string; label: string; generate: (a: { box: unknown; doc: unknown; image: PluginImage }) => unknown }) => {
        this.need(p, 'sources');
        if (typeof spec?.generate !== 'function') throw new Error('A source needs a generate function.');
        p.counts.sources++;
        this.addCommand(p, this.cid(p, 'source', spec.id), `Fill Boxes: ${String(spec.label ?? spec.id).slice(0, 50)}`, [], async () => {
          const pr = e.current, boxes = pr?.doc.boxes ?? [];
          if (!pr || !boxes.length) { this.d.note('The document has no boxes: draw some with the Boxes tool.', 'error'); return; }
          const flat = e.flattenedOf(pr);
          for (const b of boxes.filter((x) => x.kind === 'new' || x.kind === 'text')) {
            const crop = flat ? toImage(flat, { x: b.x, y: b.y, w: b.w, h: b.h }) : { width: b.w, height: b.h, data: new Uint8ClampedArray(b.w * b.h * 4) };
            const res = await spec.generate({ box: { id: b.id, kind: b.kind, name: b.name, text: b.text, x: b.x, y: b.y, w: b.w, h: b.h }, doc: { width: pr.doc.width, height: pr.doc.height }, image: crop });
            const img = asImageData(res), r = new Raster(img.width, img.height);
            r.ctx.putImageData(img, 0, 0); r.touch();
            e.insertRasterLayer(r, `${b.name} (${String(spec.label ?? spec.id)})`, b.x, b.y, {}, `Plugin: ${m.name}`);
          }
        }, () => !!e.current);
      },
    };
    const listeners = new Map<string, Map<(payload: unknown) => void, () => void>>();
    const events = {
      on: (name: keyof typeof EVENTS, fn: (payload: unknown) => void) => {
        this.need(p, 'events');
        const key = EVENTS[name];
        if (!key || typeof fn !== 'function') throw new Error(`Events are: ${Object.keys(EVENTS).join(', ')}.`);
        const un = e.on(key, () => { this.guard(p, `event ${name}`, () => fn({ name })); });
        p.off.push(un);
        const set = listeners.get(name) ?? new Map(); set.set(fn, un); listeners.set(name, set);
        return un;
      },
      off: (name: keyof typeof EVENTS, fn: (payload: unknown) => void) => { this.need(p, 'events'); const un = listeners.get(name)?.get(fn); if (un) { un(); listeners.get(name)!.delete(fn); } },
    };
    const prefix = `formvis.plugin.${m.id}.`;
    const keys = (): string[] => { const out: string[] = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(prefix)) out.push(k.slice(prefix.length)); } } catch { /* none */ } return out; };
    const storage = {
      get: (k: string, fallback: unknown = null) => { this.need(p, 'storage'); try { const v = localStorage.getItem(prefix + k); return v === null ? fallback : JSON.parse(v) as unknown; } catch { return fallback; } },
      set: (k: string, v: unknown) => {
        this.need(p, 'storage');
        const text = JSON.stringify(v) ?? 'null', used = keys().filter((x) => x !== k).reduce((n, x) => n + (localStorage.getItem(prefix + x)?.length ?? 0), 0);
        if (used + text.length > SIDE_LIMIT) throw new Error('A plugin may keep up to 200 KB.');
        localStorage.setItem(prefix + String(k).slice(0, 60), text);
      },
      remove: (k: string) => { this.need(p, 'storage'); try { localStorage.removeItem(prefix + k); } catch { /* none */ } },
      keys: () => { this.need(p, 'storage'); return keys(); },
      clear: () => { this.need(p, 'storage'); for (const k of keys()) { try { localStorage.removeItem(prefix + k); } catch { /* none */ } } },
    };
    const ui = {
      toast: (text: string, kind?: 'info' | 'error') => { this.need(p, 'ui'); this.d.note(String(text).slice(0, 300), kind === 'error' ? 'error' : 'info'); },
      confirm: (title: string, text: string, ok?: string) => { this.need(p, 'ui'); return this.d.confirm(String(title), String(text), String(ok ?? 'OK')); },
      prompt: (title: string, value?: string, ok?: string) => { this.need(p, 'ui'); return this.d.prompt(String(title), String(value ?? ''), String(ok ?? 'OK')); },
      form: (title: string, fields: FieldSpec[]) => { this.need(p, 'ui'); return this.form(String(title), Array.isArray(fields) ? fields.slice(0, 12) : []); },
      dialog: async (o: { title: string; content?: HTMLElement | string; buttons?: Array<{ label: string; primary?: boolean }> }) => {
        this.need(p, 'ui');
        this.dlg ??= new PluginDialog();
        const r = await this.dlg.ask(String(o?.title ?? m.name), (body) => { if (typeof o?.content === 'string') body.appendChild(el(`<p class="cv-note"></p>`)).textContent = o.content; else if (o?.content instanceof HTMLElement) body.appendChild(o.content); return () => null; }, (o?.buttons?.length ? o.buttons : [{ label: 'OK', primary: true }]).slice(0, 4));
        return r ? r.label : null;
      },
    };
    const commands = {
      register: (spec: { id: string; label: string; keys?: string[]; run: () => unknown }) => {
        this.need(p, 'commands');
        if (typeof spec?.run !== 'function') throw new Error('A command needs a run function.');
        this.addCommand(p, this.cid(p, 'cmd', spec.id), String(spec.label ?? spec.id), Array.isArray(spec.keys) ? spec.keys.map(String) : [], spec.run, () => !!e.current);
      },
    };
    const formats = {
      register: (spec: { id: string; label: string; extensions: string[]; decode?: (bytes: Uint8Array, name: string) => Promise<PluginImage>; encode?: (image: PluginImage) => Promise<Uint8Array> }) => {
        this.need(p, 'formats');
        const id = String(spec?.id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), label = String(spec?.label ?? spec?.id ?? '').slice(0, 60);
        const extensions = (Array.isArray(spec?.extensions) ? spec.extensions : []).map((x) => String(x).toLowerCase().replace(/^\./, '')).filter((x) => /^[a-z0-9]{1,8}$/.test(x)).slice(0, 8);
        if (!id || !extensions.length || (typeof spec.decode !== 'function' && typeof spec.encode !== 'function')) throw new Error('A format needs an id, extensions and a decode or encode function.');
        const encode = typeof spec.encode === 'function' ? spec.encode : null;
        p.off.push(addFormat({ id: `${m.id}:${id}`, label, extensions, decode: typeof spec.decode === 'function' ? spec.decode : null, encode }));
        p.counts.formats++;
        if (encode) {
          this.addCommand(p, this.cid(p, 'format', id), `Export As: ${label}...`, [], async () => {
            const pr = e.current, flat = pr ? e.flattenedOf(pr) : null;
            if (!pr || !flat) { this.d.note('Open a document to export.', 'error'); return; }
            const bytes = await encode(toImage(flat)), url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })), link = document.createElement('a');
            link.href = url; link.download = `${stripExt(pr.name)}.${extensions[0]}`; link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
          }, () => !!e.current);
        }
      },
    };
    return Object.freeze({ apiVersion: 1, plugin: Object.freeze({ id: m.id, name: m.name, version: m.version }), documents: docs, filters, panels, tools, sources, events, storage, ui, commands, formats });
  }
}
