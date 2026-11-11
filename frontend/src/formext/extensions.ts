import { ERR, ExtensionHost, HostError, type ExtensionRecord, type Frame, type Theme } from './host-bridge';
import type { Engine } from '../engine';
import type { Commands } from '../ui/commands';
import type { AgentBridge } from '../automation/agent-bridge';
import type { CatalogueEntry, RunResult } from '../automation/catalogue';
import { Dialog } from '../ui/dialogs';
import { el } from '../ui/dom';

export const PRODUCT = 'formvis';
export const APP_NAME = 'FormVis';
export const PORTAL_URL = `formai://extensions?product=${PRODUCT}`;
const CACHE_KEY = 'formvis.formext.list';
const POLL_MS = 2000;

export type ExtState = 'ready' | 'needs-permission' | 'refused';
export interface ExtRow extends ExtensionRecord { kind?: string }

/** The window tools an extension may use as `tool:<name>` ops, with the MCP tool's arguments. */
export const TOOL_OPS: readonly string[] = ['add_layer', 'set_layer', 'delete_layer', 'duplicate_layer', 'move_layer', 'fill', 'place_image', 'add_text', 'draw_shape', 'select', 'transform_layer', 'add_adjustment', 'apply_filter', 'crop', 'resize_image', 'resize_canvas'];

export interface ExtensionsDeps {
  engine: Engine;
  commands: Commands;
  agents: AgentBridge;
  catalogue: { listCommands(): CatalogueEntry[]; describeCommand(id: string): CatalogueEntry | null; runCommand(id: string, params?: Record<string, unknown>): Promise<RunResult> };
  version: string;
  notify(text: string, kind: 'info' | 'error'): void;
  consent(ext: ExtensionRecord): Promise<boolean>;
  dock: { add(id: string, label: string): HTMLElement | null; show(id: string): void; remove(id: string): void; setLabel(id: string, label: string): void };
  overlay(): HTMLElement;
  saveBlob(blob: Blob, name: string): Promise<boolean>;
  openUrl(url: string): void;
}

interface Open { frame: Frame; key: string; dialog?: Dialog }

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const sig = (e: ExtensionRecord): string => JSON.stringify([e.name, e.version, e.source, e.permissions, e.base, e.entryUi, e.panels, e.commands, e.path, e.state, e.reason]);
const cmdId = (ext: string, cmd: string): string => `ext.${ext}.${cmd}`;
const b64 = (bytes: Uint8Array): string => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

function readCache(): ExtRow[] {
  try { const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((r) => isObj(r) && typeof r.id === 'string') as ExtRow[] : []; } catch { return []; }
}

/** The Form Extension Contract host (API 1) of the window: the list the engine resolves (FormPortal's enabled.json and
 *  form.ext's dev.json), the Extensions menu's commands, the contributed panels and dialogs, and the handlers that answer
 *  an extension's calls with formvis's own catalogue, dialogs and toasts. */
export class FormExtensions {
  readonly host: ExtensionHost;
  private rows: ExtRow[] = readCache();
  private stamp = '';
  private readonly open = new Map<string, Open>();
  private readonly registered = new Set<string>();
  private readonly watchers = new Set<(changed: Set<string>) => void>();
  private readonly hidden = el('<div class="cv-ext-hidden" aria-hidden="true"></div>');
  private polling = false;
  private eventTimer = 0;
  private lastProject: string | null = null;

  constructor(private readonly deps: ExtensionsDeps) {
    this.host = new ExtensionHost({
      product: PRODUCT, app: APP_NAME, appVersion: deps.version,
      theme: () => this.theme(),
      notify: (ext, message, level) => deps.notify(`${ext.name}: ${message}`, level === 'error' || level === 'warning' ? 'error' : 'info'),
      setTitle: (ext, frame, title) => { for (const o of this.open.values()) if (o.frame.frame === frame) { const t = title ? `${ext.name}: ${title}` : ext.name; if (o.dialog) o.dialog.setTitle(t); else deps.dock.setLabel(o.key, t); } },
      readDocument: (_ext, params) => this.read(params as Record<string, unknown>),
      applyDocument: (_ext, label, ops) => this.apply(label, ops),
      commands: () => this.catalogueList(),
      run: async (_ext, command, args) => { const r = await this.op(command, args); if (!r.ok) throw new HostError(ERR.REFUSED, r.error ?? `${command} did not run`); return r.result ?? null; },
      openFiles: (_ext, accept, multiple) => this.pick(accept, multiple),
      saveFile: async (_ext, name, type, data) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const saved = await deps.saveBlob(new Blob([bytes], { type }), name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'file');
        if (!saved) throw new HostError(ERR.CANCELLED, 'the person cancelled the save');
        return { saved: true, name };
      },
      consent: (ext) => deps.consent(ext),
    });
    this.hidden.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    deps.overlay().appendChild(this.hidden);
    for (const r of this.rows) this.register(r);
    this.watchEngine();
    document.addEventListener('nm:ui-settings-changed', () => requestAnimationFrame(() => this.host.setTheme(this.theme())));
  }

  /** The rows as the panel shows them, sorted as the engine sends them. */
  list(): ExtRow[] { return this.rows; }
  get(id: string): ExtRow | undefined { return this.rows.find((r) => r.id === id); }
  stateOf(r: ExtRow): ExtState { return r.state === 'refused' ? 'refused' : this.host.isGranted(r) ? 'ready' : 'needs-permission'; }
  onChange(fn: (changed: Set<string>) => void): () => void { this.watchers.add(fn); return () => this.watchers.delete(fn); }

  /** The Extensions menu: one item per contributed command, then the panel, Reload and Manage in FormPortal. */
  menuItems(): string[] {
    const ids = this.rows.filter((r) => r.state === 'ready').flatMap((r) => r.commands.map((c) => cmdId(r.id, c.id))).filter((id) => this.registered.has(id));
    return [...ids, ...(ids.length ? ['-'] : []), 'extensions-panel', 'extensions-reload', 'extensions-manage'];
  }

  /** The list for agents (extensions_list). */
  summary(): Array<Record<string, unknown>> {
    return this.rows.map((r) => ({ id: r.id, name: r.name, version: r.version, source: r.source, state: this.stateOf(r), ...(r.reason ? { reason: r.reason } : {}), permissions: r.permissions,
      commands: r.commands.map((c) => ({ id: c.id, title: c.title, ...(c.panel ? { panel: c.panel } : {}) })), panels: r.panels, ...(r.path ? { path: r.path } : {}) }));
  }

  /** Polls the engine's stamp every 2 s while the window has focus; a change reloads the list. */
  start(): void {
    void this.refresh(false);
    if (this.polling) return;
    this.polling = true;
    window.setInterval(() => { if (document.hasFocus() && !document.hidden) void this.poll(); }, POLL_MS);
    window.addEventListener('focus', () => void this.poll());
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch('/api/extensions/stamp', { cache: 'no-store' });
      if (!res.ok) return;
      const s = JSON.stringify(((await res.json()) as { stamp: number[] }).stamp);
      if (s !== this.stamp) await this.refresh(false);
    } catch { return; }
  }

  /** Reads the list again (Reload Extensions passes force, which also re-reads every manifest); only rows that changed
   *  are touched, and an open frame of a changed extension is closed. Resolves to how many are ready. */
  async refresh(force: boolean): Promise<number> {
    let body: { stamp: number[]; extensions: ExtRow[] };
    try {
      const res = await fetch(`/api/extensions${force ? '?reload=1' : ''}`, { cache: 'no-store' });
      if (!res.ok) return this.rows.filter((r) => r.state === 'ready').length;
      body = await res.json();
    } catch { return this.rows.filter((r) => r.state === 'ready').length; }
    this.stamp = JSON.stringify(body.stamp);
    const next = (body.extensions ?? []).map((r) => ({ ...r, path: r.path ?? undefined, reason: r.reason || undefined }));
    const before = new Map(this.rows.map((r) => [r.id, r])), changed = new Set<string>();
    for (const r of next) { const was = before.get(r.id); if (!was || sig(was) !== sig(r) || (force && r.source === 'development')) changed.add(r.id); }
    for (const id of before.keys()) if (!next.some((r) => r.id === id)) changed.add(id);
    const order = (a: ExtRow[]): string => a.map((r) => r.id).join('\n');
    if (!changed.size && order(next) === order(this.rows)) return next.filter((r) => r.state === 'ready').length;
    for (const id of changed) { const was = before.get(id); if (was) { this.unregister(was); this.closeAll(id); } }
    this.rows = next;
    for (const id of changed) { const r = this.get(id); if (r) this.register(r); }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(this.rows)); } catch { /* the list is read again at the next start */ }
    for (const w of this.watchers) w(changed);
    return next.filter((r) => r.state === 'ready').length;
  }

  private register(r: ExtRow): void {
    if (r.state !== 'ready') return;
    for (const c of r.commands) {
      const id = cmdId(r.id, c.id);
      if (this.registered.has(id) || this.deps.commands.get(id)) continue;
      this.deps.commands.add({ id, label: `${r.name}: ${c.title}`, group: 'Extensions', mutates: true,
        description: `Runs ${c.title} from the ${r.name} extension ${r.version} (${r.source === 'development' ? 'in development' : r.source === 'sideload' ? 'installed from a file' : 'from the catalogue'})${c.panel ? ', opening its panel' : ''}.`,
        when: `Use when you want the ${r.name} extension to ${c.title.charAt(0).toLowerCase()}${c.title.slice(1)}.`,
        run: () => this.run(r.id, c.id, {}).catch((err) => this.deps.notify(`${r.name}: ${(err as Error).message}`, 'error')) });
      this.registered.add(id);
    }
  }

  private unregister(r: ExtRow): void {
    for (const c of r.commands) { const id = cmdId(r.id, c.id); if (this.registered.delete(id)) this.deps.commands.remove(id); }
  }

  /** Runs a contributed command: one with a panel opens that panel and sends it the command; one without runs headless. */
  async run(id: string, command: string, args: unknown): Promise<unknown> {
    const r = this.get(id);
    if (!r) throw new HostError(ERR.NOT_FOUND, `No extension has the id ${id}`);
    if (r.state !== 'ready') throw new HostError(ERR.REFUSED, `${r.name} is refused: ${r.reason ?? 'it is not valid'}`);
    const c = r.commands.find((x) => x.id === command);
    if (!c) throw new HostError(ERR.NOT_FOUND, `${r.name} has no command ${command}`);
    if (c.panel) {
      const f = await this.openPanel(id, c.panel);
      return f.activate({ reason: 'command', panel: c.panel, command, args });
    }
    const out = await this.host.runCommand(r, command, args, this.hidden);
    this.notifyRows(id);
    return out;
  }

  /** Opens (or brings forward) a contributed panel; the consent question comes first, once per version. */
  async openPanel(id: string, panelId: string): Promise<Frame> {
    const r = this.get(id);
    if (!r || r.state !== 'ready') throw new HostError(ERR.REFUSED, `${r?.name ?? id} cannot open: ${r?.reason ?? 'it is not installed'}`);
    const panel = r.panels.find((p) => p.id === panelId);
    if (!panel) throw new HostError(ERR.NOT_FOUND, `${r.name} has no panel ${panelId}`);
    const key = `ext-${r.id}-${panel.id}`.slice(0, 80);
    const title = panel.title === r.name ? r.name : `${r.name}: ${panel.title}`;
    const had = this.open.get(key);
    if (had) { if (had.dialog) had.dialog.open(); else this.deps.dock.show(key); return had.frame; }
    const allowed = await this.host.ensureConsent(r);
    this.notifyRows(id);
    if (!allowed) throw new HostError(ERR.PERMISSION, `${r.name} was not allowed to open`);
    const resize = (h: number): void => { const f = this.open.get(key)?.frame; if (f) f.frame.style.height = `${h}px`; };
    if (panel.location === 'dialog') {
      const dialog = new Dialog(title, 520);
      dialog.body.classList.add('cv-ext-dialog-body');
      dialog.button('Close', 'ghost', () => dialog.close());
      const frame = await this.host.open(r, dialog.body, { onResize: resize });
      if (!frame) { dialog.scrim.remove(); throw new HostError(ERR.PERMISSION, `${r.name} was not allowed to open`); }
      dialog.onClose = () => { frame.dispose(); this.open.delete(key); dialog.scrim.remove(); };
      this.open.set(key, { frame, key, dialog });
      dialog.open();
      void frame.activate({ reason: 'panel', panel: panel.id }).catch(() => undefined);
      return frame;
    }
    const body = this.deps.dock.add(key, title);
    if (!body) throw new HostError(ERR.UNAVAILABLE, `${title} could not be placed in the dock`);
    let frame: Frame | null;
    try { frame = await this.host.open(r, body, { onResize: resize }); } catch (e) { this.deps.dock.remove(key); throw e; }
    if (!frame) { this.deps.dock.remove(key); throw new HostError(ERR.PERMISSION, `${r.name} was not allowed to open`); }
    this.open.set(key, { frame, key });
    this.deps.dock.show(key);
    void frame.activate({ reason: 'panel', panel: panel.id }).catch(() => undefined);
    return frame;
  }

  /** Closes every frame of an extension: its dock panels leave the dock, its dialogs close, headless runs stop. */
  closeAll(id: string): void {
    for (const [key, o] of [...this.open]) {
      if (o.frame.ext.id !== id) continue;
      this.open.delete(key);
      if (o.dialog) { o.dialog.onClose = null; o.dialog.close(); o.dialog.scrim.remove(); }
      else this.deps.dock.remove(key);
    }
    this.host.disposeExtension(id);
  }

  /** Allow from the panel: the same consent question the first activation asks. */
  async allow(id: string): Promise<void> { const r = this.get(id); if (r && r.state === 'ready') { await this.host.ensureConsent(r); this.notifyRows(id); } }

  private notifyRows(id: string): void { const s = new Set([id]); for (const w of this.watchers) w(s); }

  theme(): Theme {
    const css = getComputedStyle(document.documentElement), v = (n: string): string => css.getPropertyValue(n).trim();
    const tokens: Record<string, string> = {
      '--bg': v('--bg-primary'), '--panel': v('--bg-secondary'), '--panel-2': v('--bg-tertiary'), '--text': v('--text-primary'), '--muted': v('--text-secondary'),
      '--accent': v('--accent-color'), '--accent-text': '#ffffff', '--border': v('--border-color'), '--radius': v('--radius') || '6px', '--danger': v('--danger'),
    };
    for (const k of Object.keys(tokens)) if (!tokens[k]) delete tokens[k];
    return { mode: document.body.classList.contains('theme-light') ? 'light' : 'dark', tokens };
  }

  private async read(params: Record<string, unknown>): Promise<unknown> {
    const what = typeof params.what === 'string' ? params.what : 'document', a = this.deps.agents, e = this.deps.engine;
    if (!['document', 'layers', 'selection', 'history', 'image', 'file'].includes(what)) throw new HostError(ERR.INVALID, 'what is document, layers, selection, history, image or file');
    if (!e.current) return what === 'document' ? { open: false, documents: [] } : null;
    if (what === 'file') {
      const name = e.current.name, r = await a.runFor('__project', {}), data = (r.structuredContent as { data?: string } | undefined)?.data;
      if (r.isError || !data) throw new HostError(ERR.REFUSED, 'formvis could not pack the document (the engine service may not be running)');
      const size = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
      if (size > 200 * 1024 * 1024) throw new HostError(ERR.REFUSED, 'the document is larger than 200 MB as a file');
      return { name: `${name.replace(/\.[A-Za-z0-9]{2,5}$/, '')}.fvd`, type: 'application/x-formvis-project', size, data };
    }
    if (what === 'image') {
      const args: Record<string, unknown> = { max_size: Math.min(4096, Math.max(16, typeof params.max_size === 'number' ? params.max_size : 1024)) };
      if (typeof params.id === 'string') { args.view = 'layer'; args.id = params.id; }
      for (const k of ['x', 'y', 'width', 'height']) if (typeof params[k] === 'number') args[k] = params[k];
      const r = await a.runFor('get_image', args);
      const img = r.content.find((c) => c.type === 'image') as { data?: string; mimeType?: string } | undefined, said = r.content.find((c) => c.type === 'text') as { text?: string } | undefined;
      if (r.isError || !img?.data) throw new HostError(ERR.REFUSED, said?.text ?? 'The picture could not be read');
      const m = /shown at (\d+) by (\d+)/.exec(said?.text ?? '');
      return { mimeType: img.mimeType ?? 'image/png', data: img.data, width: m ? Number(m[1]) : null, height: m ? Number(m[2]) : null };
    }
    const tool = { document: 'get_document', layers: 'get_layer_tree', selection: 'get_selection', history: 'list_history' }[what as 'document'];
    const r = await a.runFor(tool, {});
    if (r.isError) throw new HostError(ERR.REFUSED, (r.content[0] as { text?: string } | undefined)?.text ?? 'The document could not be read');
    const data = (r.structuredContent ?? {}) as Record<string, unknown>;
    return what === 'document' ? { open: true, ...data } : data;
  }

  private catalogueList(): Array<Record<string, unknown>> {
    const tools = TOOL_OPS.map((n) => ({ id: `tool:${n}`, title: n.replace(/_/g, ' '), group: 'Window tools' }));
    return [...this.deps.catalogue.listCommands().filter((c) => !c.risky && !c.id.startsWith('ext.')).map((c) => ({ id: c.id, title: c.label, group: c.group, ...(c.params ? { args: c.params } : {}) })), ...tools];
  }

  /** One op through formvis's own surface: a catalogue command, or `tool:<name>` for the window tools listed. */
  private async op(command: string, rawArgs: unknown): Promise<RunResult> {
    const args = isObj(rawArgs) ? { ...rawArgs } : {};
    if (command.startsWith('tool:')) {
      const name = command.slice(5);
      if (!TOOL_OPS.includes(name)) return { ok: false, error: `${command} is not a tool extensions may use; app.commands lists them` };
      delete args.path;
      const r = await this.deps.agents.runFor(name, args);
      const said = r.content.filter((c) => c.type === 'text').map((c) => (c as { text?: string }).text ?? '').join(' ');
      return r.isError ? { ok: false, error: said || `${name} failed` } : { ok: true, result: r.structuredContent ?? { message: said } };
    }
    if (command.startsWith('ext.')) return { ok: false, error: 'an extension cannot run another extension\'s command' };
    if (['load-actions', 'insert-action-step', 'insert-conditional', 'action-options'].includes(command)) return { ok: false, error: `${command} cannot be run by an extension, because it writes steps into the person's actions` };
    const entry = this.deps.catalogue.describeCommand(command);
    if (entry?.risky) return { ok: false, error: `${entry.label} cannot be run by an extension, because undo cannot reverse it` };
    return this.deps.catalogue.runCommand(command, args);
  }

  /** document.apply: every op in one history step named by the extension; a failing op undoes the ones before it. */
  private async apply(label: string, ops: { command: string; args?: unknown }[]): Promise<{ applied: number; results: unknown[] }> {
    const e = this.deps.engine, p = e.current;
    if (!p) throw new HostError(ERR.REFUSED, 'No document is open in formvis');
    if (!ops.length) return { applied: 0, results: [] };
    const results: unknown[] = [];
    let failed = '', recorded = false;
    p.history.begin(label.slice(0, 80) || 'Extension', p.snapshot());
    try {
      for (const [i, o] of ops.entries()) {
        const r = await this.op(o.command, o.args);
        if (!r.ok) { failed = `step ${i + 1} of ${ops.length} (${o.command}): ${r.error ?? 'it did not run'}`; break; }
        results.push(r.result ?? null);
      }
    } catch (err) {
      failed = `step ${results.length + 1} of ${ops.length}: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      for (let i = 0; i < 2400 && e.busyWith; i++) await sleep(25);
      recorded = p.history.end(p.snapshot());
      for (const k of ['doc', 'selection', 'active', 'history', 'render', 'options'] as const) e.emit(k, null);
    }
    if (failed) {
      if (recorded && e.current === p) e.undo();
      throw new HostError(ERR.REFUSED, `Nothing was changed: ${failed}`);
    }
    return { applied: results.length, results };
  }

  private pick(accept: string[], multiple: boolean): Promise<{ name: string; type: string; size: number; data: string }[]> {
    const input = el<HTMLInputElement>('<input type="file" hidden>');
    if (accept.length) input.accept = accept.filter((a) => /^(\.[A-Za-z0-9]{1,12}|[a-z]+\/[A-Za-z0-9.+*-]+)$/.test(a)).join(',');
    input.multiple = multiple;
    this.hidden.appendChild(input);
    return new Promise((resolve, reject) => {
      const done = (): void => input.remove();
      input.addEventListener('cancel', () => { done(); reject(new HostError(ERR.CANCELLED, 'the person cancelled')); });
      input.addEventListener('change', () => void (async () => {
        const files = Array.from(input.files ?? []);
        done();
        if (!files.length) { reject(new HostError(ERR.CANCELLED, 'the person cancelled')); return; }
        if (files.reduce((n, f) => n + f.size, 0) > 200 * 1024 * 1024) { reject(new HostError(ERR.REFUSED, 'the files are larger than 200 MB together')); return; }
        resolve(await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: b64(new Uint8Array(await f.arrayBuffer())) }))));
      })());
      input.click();
    });
  }

  /** ext.event: document.changed (debounced), selection.changed, layer.activated, document.switched. */
  private watchEngine(): void {
    const e = this.deps.engine;
    const changed = (): void => {
      if (this.eventTimer) return;
      this.eventTimer = window.setTimeout(() => {
        this.eventTimer = 0;
        const p = e.current;
        if (p) this.host.broadcast('document.changed', { name: p.name, width: p.doc.width, height: p.doc.height, layers: p.doc.layers.length, revision: p.history.revision });
      }, 150);
    };
    e.on('doc', changed);
    e.on('history', changed);
    e.on('selection', () => { const s = e.current?.selection; this.host.broadcast('selection.changed', { selection: s ? { x: s.x, y: s.y, width: s.w, height: s.h } : null }); });
    e.on('active', () => this.host.broadcast('layer.activated', { activeLayerId: e.current?.activeId ?? null }));
    e.on('projects', () => {
      const p = e.current, id = p?.id ?? null;
      if (id === this.lastProject) return;
      this.lastProject = id;
      this.host.broadcast('document.switched', p ? { id: p.id, name: p.name } : null);
    });
  }

  /** Opens FormPortal's page for formvis's extensions. */
  manage(): void { this.deps.openUrl(PORTAL_URL); }
}
