import { Raster, SelectionMask, createSurface, ctxOf, toBlob, type BlendMode, type Engine, type Pt, type Surface } from '../engine';
import { distortUsable } from '../engine/distort';
import { api, whenServiceUp } from '../io/api';
import { PARAM_KINDS } from '../engine/adjust-params';
import { BOX_KINDS, MAX_BOXES, boxWarnings, boxesText } from '../engine/boxes';
import { LIMITS, type BoxKind } from '../engine/types';
import { decodeImage, rasteriseSvg, svgSize } from '../io/images';
import { writePsdFile } from '../io/psd';
import { writeOra } from '../io/ora';
import { writeLayeredTiff } from '../io/layered-tiff';
import { composeDeep, srgbToLinear } from '../engine/deep';
import { ADJUST_PRESET_STORE, GRADIENT_PRESETS, GRAIN_PRESETS, PHOTO_FILTERS } from '../engine/adjust-presets';
import { VIDEO_PROPS, type VideoProp, type VideoTimeline } from '../engine/video-timeline';
import { depthReady, localDepth, localDepthValues, localFill, localInpaint, localModels, localUpscale, modelReady, runLocal } from '../io/local-gen';
import { applyPrefs, loadPrefs, savePrefs, updatePrefs, type Prefs } from '../ui/prefs';
import { fontFamilies } from '../ui/fonts';
import { mappedChars } from '../engine/glyph-outlines';
import { liveText } from '../engine/text';
import { allBrushPresets } from '../engine/brush-dynamics';
import { isLibKind } from '../engine/filter-library';
import { PACK_TOOLS, labelExport, packTool } from './pack-tools';
import type { UiControl } from './ui-control';

/** Outside agents in the window (1.52.1): while Allow outside agents is on (Preferences > Plugins), the window collects
 *  MCP tool calls from the engine and runs them here, each change an ordinary undoable step. Generative calls cost the
 *  user money, so they ask first. The catalogue itself (names, schemas, hints) is the engine's. */
export interface McpResult { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }
export interface AgentDeps {
  ask(title: string, text: string): Promise<boolean>; note(text: string): void; allow(): void;
  // 1.53.3: what the app does that the engine alone does not (File > Open, the .fmv file, filters without their dialog, Select Subject, Remove Background).
  openFile?(file: File): Promise<void>; projectBlob?(): Promise<Blob | null>; applyFilter?(kind: string, settings: Record<string, unknown>): Promise<boolean> | boolean;
  selectSubject?(): Promise<void>; removeBackground?(): Promise<void>;
  // 1.59.7, DEV_PLAN 25.5: Render Video's file, for timeline_render.
  renderVideo?(c: { format: 'mp4' | 'gif' | 'png'; from: number; to: number; scale: number }, step?: (done: number, total: number) => Promise<boolean> | boolean): Promise<Blob | null>;
  // The window's canvas as the person sees it (get_image view editor), Select Object by points (select_point) and the plugins folder (list_plugins).
  viewCapture?(): Surface | null;
  selectPoints?(inside: Array<[number, number]>, outside: Array<[number, number]>, mode: 'replace' | 'add' | 'subtract' | 'intersect'): Promise<string | null>;
  plugins?(): Promise<Array<Record<string, unknown>>>;
  // The window's error log, for read_log.
  log?(): Array<{ at: number; what: string; message: string }>;
  // The window's own controls: state, screenshots, menus, dialogs, synthetic input (ui_state and the other ui_ tools).
  ui?: UiControl;
  // The status bar's hint slot, for set_status.
  status?(text: string, seconds: number): void;
}

const settingsOf = (p: Prefs): Record<string, string | number | boolean> => Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 60))) as Record<string, string | number | boolean>;
const text = (t: string, data?: Record<string, unknown>): McpResult => ({ content: [{ type: 'text', text: t }], ...(data ? { structuredContent: data } : {}) });
const fail = (t: string): McpResult => ({ content: [{ type: 'text', text: t }], isError: true });
const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));
const hex = (v: unknown): { r: number; g: number; b: number } | null => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(v ?? '')); return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null; };
const modeOf = (v: unknown): 'replace' | 'add' | 'subtract' | 'intersect' => (v === 'add' || v === 'subtract' || v === 'intersect' ? v : 'replace');
const filterSettings = (kind: string, s: Record<string, unknown>): Record<string, unknown> => (isLibKind(kind) && !('lib' in s) ? { lib: { [kind]: s }, seed: typeof s.seed === 'number' ? s.seed : 0 } : s);
const filterKnown = (kind: string): boolean => isLibKind(kind) || ['gaussianBlur', 'motionBlur', 'addNoise', 'lensCorrection', 'unsharpMask', 'develop', 'lensBlur', 'smartSharpen', 'shakeReduction', 'radialBlur', 'surfaceBlur', 'fieldBlur', 'irisBlur', 'tiltShift', 'pathBlur'].includes(kind);
const b64 = async (blob: Blob): Promise<string> => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

const unitOf = (h: string): { red: number; green: number; blue: number } => { const c = hex(h) ?? { r: 0, g: 0, b: 0 }; return { red: c.r / 255, green: c.g / 255, blue: c.b / 255 }; };
const PRESET_KEYS: Record<string, string> = { levels: 'levels', curves: 'curves', exposure: 'exposureSettings', gradientMap: 'gradientMapSettings', hsv: 'hsvSettings', grain: 'grainSettings' };
const savedPresets = (): Record<string, Record<string, unknown>> => { try { const o = JSON.parse(localStorage.getItem(ADJUST_PRESET_STORE) ?? '{}') as unknown; return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, Record<string, unknown>> : {}; } catch { return {}; } };
/** The data a named preset sets on an adjustment of `kind`: a built-in (grain, gradientMap, photoFilter) or one saved in the Adjustments panel. */
function presetPatch(kind: string, name: string): { key: string; merge: boolean; value: unknown; label: string } | null {
  const w = name.trim().toLowerCase(), same = (id: string, label: string): boolean => id.toLowerCase() === w || label.toLowerCase() === w;
  const g = kind === 'grain' ? GRAIN_PRESETS.find((x) => same(x[0], x[1])) : undefined;
  if (g) return { key: 'grainSettings', merge: true, label: g[1], value: { amount: g[2], size: g[3], roughness: g[4], colour: g[5], speckle: g[6] } };
  const m = kind === 'gradientMap' ? GRADIENT_PRESETS.find((x) => same(x.id, x.label)) : undefined;
  if (m) return { key: 'gradientMapSettings', merge: true, label: m.label, value: { stops: m.stops.map(([at, h]) => ({ at, ...unitOf(h) })), preset: m.id, shadows: unitOf(m.stops[0][1]), highlights: unitOf(m.stops[m.stops.length - 1][1]) } };
  const f = kind === 'photoFilter' ? PHOTO_FILTERS.find((x) => same(x[0], x[1])) : undefined;
  if (f) return { key: 'params', merge: true, label: f[1], value: { color: { r: f[2], g: f[3], b: f[4] } } };
  const s = savedPresets()[kind], hit = s ? Object.keys(s).find((k) => k.toLowerCase() === w) : undefined;
  return hit && s ? { key: PRESET_KEYS[kind] ?? 'params', merge: false, label: hit, value: s[hit] } : null;
}
function presetList(kind?: string): Array<{ kind: string; id: string; label: string; source: 'built-in' | 'saved' }> {
  const rows: Array<{ kind: string; id: string; label: string; source: 'built-in' | 'saved' }> = [
    ...GRAIN_PRESETS.map((x) => ({ kind: 'grain', id: x[0], label: x[1], source: 'built-in' as const })),
    ...GRADIENT_PRESETS.map((x) => ({ kind: 'gradientMap', id: x.id, label: x.label, source: 'built-in' as const })),
    ...PHOTO_FILTERS.map((x) => ({ kind: 'photoFilter', id: x[0], label: x[1], source: 'built-in' as const })),
  ];
  for (const [k, set] of Object.entries(savedPresets())) for (const n of Object.keys(set ?? {})) rows.push({ kind: k, id: n, label: n, source: 'saved' });
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}
/** `fn` as one undo step, however many steps it makes inside. */
async function inOneStep<T>(e: Engine, name: string, fn: () => Promise<T> | T): Promise<T> {
  const p = e.current;
  if (!p) return fn();
  p.history.begin(name, p.snapshot());
  try { return await fn(); } finally { p.history.end(p.snapshot()); for (const k of ['doc', 'selection', 'active', 'history', 'render', 'options'] as const) e.emit(k, null); }
}

/** The command catalogue (window.formvis.catalogue, DEV_PLAN 28.4's contract with the catalogue): list_commands,
 *  describe_command, run_command and run_commands go through it, and say so plainly when it is not there. */
interface CommandMeta { id: string; label: string; group?: string; description?: string; when?: string; params?: unknown; mutates?: boolean; risky?: boolean; keys?: string[]; enabled?: boolean }
type CommandRun = { ok: boolean; result?: unknown; error?: string };
interface CatalogueApi {
  listCommands(filter?: { group?: string; text?: string }): CommandMeta[];
  describeCommand(id: string): unknown;
  runCommand(id: string, params?: Record<string, unknown>): Promise<CommandRun>;
  runCommands?(list: Array<{ id: string; params?: Record<string, unknown> }>): Promise<unknown>;
}
const NO_CATALOGUE = 'The command catalogue is not loaded in the formvis window (it may still be starting, or this build has none). Wait a few seconds and call list_commands again; if it keeps failing, use the typed tools such as add_layer, select or apply_filter.';
const LIST_CAP = 150;
const catalogueOf = (): CatalogueApi | null => {
  const c = (window as unknown as { formvis?: { catalogue?: Partial<CatalogueApi> } }).formvis?.catalogue;
  return c && typeof c.listCommands === 'function' && typeof c.describeCommand === 'function' && typeof c.runCommand === 'function' ? c as CatalogueApi : null;
};
const brief = (v: unknown): string => { let s: string; try { s = JSON.stringify(v) ?? ''; } catch { s = String(v); } return s.length > 4000 ? `${s.slice(0, 4000)}...` : s; };

interface BackgroundRun { job: string; command: string; status: 'running' | 'done' | 'failed'; started: number; message: string; result?: unknown }
const background = new Map<string, BackgroundRun>();
let backgroundCount = 0;

async function catalogueTool(name: string, a: Record<string, unknown>, hasDocument = true, menus?: () => Map<string, string>): Promise<McpResult> {
  if (name === 'command_job') {
    const want = typeof a.job === 'string' ? a.job : '';
    if (want && !background.has(want)) return fail(`No background command has the job ${want}: call command_job with no job to list them.`);
    const rows = [...background.values()].filter((j) => !want || j.job === want).map((j) => ({ job: j.job, command: j.command, status: j.status, seconds: Math.round((Date.now() - j.started) / 100) / 10, message: j.message, ...(j.result !== undefined ? { result: j.result } : {}) }));
    return text(rows.length ? `${rows.length} background command${rows.length === 1 ? '' : 's'}. ${brief(rows)}` : 'No command has been started with wait false.', { jobs: rows });
  }
  const cat = catalogueOf();
  if (!cat) return fail(NO_CATALOGUE);
  const id = typeof a.id === 'string' ? a.id : '', params = a.params && typeof a.params === 'object' ? a.params as Record<string, unknown> : undefined;
  if (name === 'list_commands') {
    const found = cat.listCommands({ ...(typeof a.group === 'string' && a.group ? { group: a.group } : {}), ...(typeof a.text === 'string' && a.text ? { text: a.text } : {}) });
    const all = a.enabled === true ? found.filter((c) => c.enabled !== false) : a.enabled === false ? found.filter((c) => c.enabled === false) : found;
    const why = hasDocument ? 'Not available in this state: it may need a selection, a pixel layer or another color mode (describe_command says what it is for).' : 'Needs an open document: call new_document or open_file first.';
    const paths = menus?.() ?? new Map<string, string>();
    const shown = all.slice(0, LIST_CAP).map((c) => ({ id: c.id, label: c.label, ...(paths.has(c.id) ? { menu: paths.get(c.id) } : {}), ...(c.group ? { group: c.group } : {}), ...(c.when ? { when: c.when } : {}), ...(c.params !== undefined ? { params: c.params } : {}), ...(c.risky ? { risky: true } : {}), ...(c.mutates !== undefined ? { mutates: c.mutates } : {}), ...(c.keys?.length ? { keys: c.keys } : {}), ...(c.enabled !== undefined ? { enabled: c.enabled } : {}), ...(c.enabled === false ? { disabledReason: why, ...(hasDocument ? {} : { needsDocument: true }) } : {}) }));
    const data = { total: all.length, commands: shown };
    return text(`${all.length} command${all.length === 1 ? '' : 's'}${all.length > shown.length ? `, the first ${shown.length} shown: narrow with group or text` : ''}. ${brief(shown)}`, data);
  }
  if (!id && name !== 'run_commands') return fail('Give the command id: call list_commands to find one.');
  if (name === 'describe_command') {
    let d = await cat.describeCommand(id);
    if (d && typeof d === 'object' && 'ok' in d && 'result' in d) d = (d as { result: unknown }).result;
    if (!d || typeof d !== 'object') return fail(`No command has the id ${id}: call list_commands with text to find the right one.`);
    return text(brief(d), d as Record<string, unknown>);
  }
  if (name === 'run_command') {
    if (a.wait === false) {
      const job = `cmd:${++backgroundCount}`, row: BackgroundRun = { job, command: id, status: 'running', started: Date.now(), message: 'Running.' };
      background.set(job, row);
      for (const k of [...background.keys()].slice(0, Math.max(0, background.size - 50))) background.delete(k);
      void cat.runCommand(id, params).then((r) => { row.status = r.ok ? 'done' : 'failed'; row.message = r.ok ? `Ran ${id}.` : `${id} did not run: ${r.error ?? 'no reason given'}`; if (r.result !== undefined) row.result = r.result; },
        (err) => { row.status = 'failed'; row.message = `${id} failed: ${err instanceof Error ? err.message : String(err)}`; });
      return text(`Started ${id} in the background as ${job}; call command_job with job ${job} for its result. Do not edit the document until it is done.`, { job, status: 'running' });
    }
    const r = await cat.runCommand(id, params);
    return r.ok ? text(`Ran ${id}.${r.result === undefined ? '' : ` ${brief(r.result)}`}`, r.result && typeof r.result === 'object' ? { result: r.result } : undefined)
      : fail(`${id} did not run: ${r.error ?? 'no reason given'}. Check describe_command for its params, or list_commands for the right id.`);
  }
  const list = Array.isArray(a.commands) ? a.commands.filter((c): c is { id: string; params?: Record<string, unknown> } => !!c && typeof (c as { id?: unknown }).id === 'string') : [];
  if (!list.length) return fail('Give commands as a list of { id, params }: call list_commands for the ids.');
  if (cat.runCommands) {
    const r = await cat.runCommands(list);
    const rows = Array.isArray(r) ? r as CommandRun[] : null, bad = rows ? rows.findIndex((x) => !x.ok) : (r as CommandRun)?.ok === false ? 0 : -1;
    return bad < 0 ? text(`Ran ${list.length} command${list.length === 1 ? '' : 's'} as one undo step.`)
      : fail(`Command ${bad + 1} of ${list.length} (${list[bad]?.id}) failed: ${(rows ? rows[bad]?.error : (r as CommandRun).error) ?? 'no reason given'}. Fix it and run the batch again; undo steps back anything that did run.`);
  }
  for (let i = 0; i < list.length; i++) {
    const r = await cat.runCommand(list[i].id, list[i].params);
    if (!r.ok) return fail(`Command ${i + 1} of ${list.length} (${list[i].id}) failed: ${r.error ?? 'no reason given'}. The ${i} before it ran as separate undo steps: undo ${i} times to put them back.`);
  }
  return text(`Ran ${list.length} commands, each its own undo step (this build has no batch grouping).`);
}

export class AgentBridge {
  private on = false;
  private looping = false;
  private inflight = 0;
  private callId = '';
  private changed = new Set<string>();
  private changedTimer = 0;
  constructor(private readonly engine: Engine, private readonly deps: AgentDeps) {
    const kinds: Record<string, string> = { selection: 'selection', history: 'history', doc: 'layers', active: 'document', projects: 'document' };
    for (const ev of Object.keys(kinds)) (engine as unknown as { on(k: string, f: () => void): void }).on(ev, () => this.tellChanged(kinds[ev]));
  }

  /** Edits made by hand reach the engine, debounced, so sessions subscribed to a resource are told; a call from an agent is announced by the engine itself. */
  private tellChanged(kind: string): void {
    if (this.inflight > 0) return;
    this.changed.add(kind);
    if (this.changedTimer) return;
    this.changedTimer = window.setTimeout(() => {
      this.changedTimer = 0;
      const kinds = [...this.changed];
      this.changed.clear();
      void fetch('/api/mcp/bridge/changed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kinds }) }).catch(() => undefined);
    }, 400);
  }

  /** True while an outside agent's call is being run here (the Script Console refuses to run then). */
  get agentBusy(): boolean { return this.inflight > 0; }

  setEnabled(on: boolean): void {
    const was = this.on;
    this.on = on;
    if (!this.looping) void this.loop();
    if (was && !on) void fetch('/api/mcp/bridge/stop', { method: 'POST' }).catch(() => undefined);   // refused at once, not left waiting
  }

  /** The window polls whether or not agents are allowed (1.53.3), saying which: with them not allowed the engine sends
   *  only the question, asked here once; Allow turns the setting on and the request goes ahead. */
  private async loop(): Promise<void> {
    this.looping = true;
    for (;;) {
      try {
        await whenServiceUp();   // with the engine service not running there is nothing to poll, and no timer either
        const res = await fetch(`/api/mcp/bridge/next?allowed=${this.on ? 1 : 0}`);
        if (res.status === 200) {
          const item = await res.json() as { id: string; name: string; arguments: Record<string, unknown>; inapp?: boolean };
          if (item.name === '__consent__') {
            const yes = this.on || await this.deps.ask('Allow an outside agent to edit?', 'An AI agent connected to formvis (such as Claude Code, Codex or Cursor) asks to edit your documents. Each change is an undoable step, and anything that costs money asks first. You can turn this off in Preferences > Plugins.');
            if (yes && !this.on) { this.on = true; this.deps.allow(); }
            await fetch('/api/mcp/bridge/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, result: { allowed: yes } }) });
            continue;
          }
          this.inflight++;
          this.callId = item.id;
          let result: McpResult;
          try { result = this.on || item.inapp === true ? await this.run(item.name, item.arguments ?? {}) : fail('formvis stopped taking requests.'); } finally { this.inflight--; }
          await fetch('/api/mcp/bridge/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, result }) });
        } else if (res.status !== 204) await sleep(2000);
      } catch { await sleep(2000); }   // the engine is not answering: try again shortly
    }
    this.looping = false;
  }

  /** One tool call; its MCP result. */
  async run(name: string, a: Record<string, unknown>): Promise<McpResult> {
    const e = this.engine, p = e.current, num = (k: string, d: number): number => (typeof a[k] === 'number' && Number.isFinite(a[k]) ? a[k] as number : d), str = (k: string): string => (typeof a[k] === 'string' ? a[k] as string : '');
    try {
      if (name === 'new_document') {
        const bg = str('background') || 'white';
        let nw = Math.round(num('width', 0)), nh = Math.round(num('height', 0));
        if (!nw && !nh && !str('aspect')) { nw = 1920; nh = 1080; }
        else if (!nw || !nh) {
          const ratio = /^(\d+):(\d+)$/.exec(str('aspect')), long = { '1k': 1024, '2k': 2048, '4k': 4096 }[str('size_class') || '1k'];
          if (!ratio || !long) return fail('Give width and height in pixels, or an aspect such as 16:9 (with size_class 1k, 2k or 4k); with none of them the document is 1920 by 1080.');
          const ra = Number(ratio[1]), rb = Number(ratio[2]), side = (v: number): number => Math.max(16, Math.round(v / 16) * 16);
          [nw, nh] = ra >= rb ? [long, side(long * rb / ra)] : [side(long * ra / rb), long];
        }
        const paint = hex(bg), mode = str('mode') || 'rgb', depth = num('depth', 8);
        if (bg !== 'white' && bg !== 'transparent' && bg !== 'black' && !paint) return fail('background is white, transparent, black or a color #rrggbb.');
        const made = e.newDocument(nw, nh, str('name') || 'Untitled', bg === 'transparent' ? 'transparent' : bg === 'white' ? 'white' : bg === 'black' ? { r: 0, g: 0, b: 0 } : paint ?? 'white');
        if (!made) return fail(`A ${nw} by ${nh} document is outside what formvis allows (300,000 pixels a side, kept in tiles past 30,000 a side or ${Math.round(LIMITS.pixels / 1_000_000)} megapixels on this computer).`);
        const cat = catalogueOf();
        if ((mode !== 'rgb' || depth !== 8) && !cat) return fail(`${NO_CATALOGUE} The document was opened as 8-bit RGB.`);
        if (mode !== 'rgb') {
          const r = await cat!.runCommand(`mode-${mode}`, mode === 'cmyk' ? { profile: str('profile') || 'default' } : {});
          if (!r.ok) return fail(`The document was opened, but ${mode} mode failed: ${r.error ?? 'no reason given'}.`);
          for (let i = 0; mode === 'cmyk' && i < 600 && (e.current?.doc.mode !== 'cmyk' || e.busyWith); i++) await sleep(25);
          if (mode === 'cmyk' && e.current?.doc.mode !== 'cmyk') return fail('The document was opened, but it could not become CMYK: the engine service may not be running or has no CMYK profile (View > Proof Setup).');
        }
        if (depth !== 8) { const r = await cat!.runCommand(`depth-${depth}`, {}); if (!r.ok) return fail(`The document was opened, but ${depth} bits failed: ${r.error ?? 'no reason given'}.`); }
        const d = e.current?.doc;
        return text(`Opened a ${d?.width} by ${d?.height} ${d?.mode ?? 'rgb'} document at ${d?.depth ?? 8} bits.`, { width: d?.width, height: d?.height, mode: d?.mode ?? 'rgb', depth: d?.depth ?? 8 });
      }
      if (name === '__jobs') {
        const jobs = e.jobs.map((j) => ({ id: `window:${j.id}`, source: 'window', kind: 'job', status: j.cancelled ? 'cancelled' : 'running', progress: j.total > 0 ? Math.round(Math.min(1, j.done / j.total) * 1000) / 1000 : null, message: j.name, created: j.startedAt / 1000 }));
        return text(`${jobs.length} window job${jobs.length === 1 ? '' : 's'}.`, { jobs });
      }
      if (name === '__job_stop') {
        const wanted = /^window:(\d+)$/.exec(str('id'));
        const ids = e.jobs.filter((j) => !j.cancelled && (!str('id') || (wanted && j.id === Number(wanted[1])))).map((j) => j.id);
        for (const id of ids) e.cancelJob(id);
        return text(`Asked ${ids.length} window job${ids.length === 1 ? '' : 's'} to stop.`, { stopped: ids });
      }
      if (name === '__open') {   // open_file: the engine read the file at its path (1.53.3)
        const bytes = Uint8Array.from(atob(str('data')), (c) => c.charCodeAt(0)), file = new File([bytes], str('name')), was = p?.id, into = str('into');
        if (into === 'layer' || into === 'replace') {
          if (!p) return fail(`into ${into} needs an open document: call new_document or open_file first, or leave into out to open the picture as a new document.`);
          if (/\.(fmv|fvd|psd|psb|ora)$/i.test(file.name)) return fail(`into ${into} takes a picture, not a project: open ${file.name} without into.`);
        }
        if (into === 'layer') return await this.run('place_image', { data: str('data'), name: file.name.replace(/\.[^.]+$/, '').slice(0, 120), ...(a.svg_width !== undefined ? { svg_width: a.svg_width } : {}), ...(a.reference === true ? { reference: true } : {}) });
        if (/\.(fmv|fvd|psd|psb|ora)$/i.test(file.name)) { if (!this.deps.openFile) return fail('formvis cannot open projects for agents here.'); await this.deps.openFile(file); }
        else if (/\.svg$/i.test(file.name)) e.openImage(await rasteriseSvg(file, file.name, Math.round(num('svg_width', (await svgSize(file))?.width ?? 1024))));
        else e.openImage(await decodeImage(file, file.name));
        if (into === 'replace' && was && e.current && e.current.id !== was) e.closeProject(was);
        const q = e.current;
        return text(q ? `Opened ${file.name}: ${q.doc.width} by ${q.doc.height}, ${q.doc.layers.length} layer${q.doc.layers.length === 1 ? '' : 's'}.` : `Could not open ${file.name}.`, q ? { id: q.id, width: q.doc.width, height: q.doc.height } : undefined);
      }
      if (name === 'list_commands' || name === 'describe_command' || name === 'run_command' || name === 'run_commands' || name === 'command_job') return await catalogueTool(name, a, !!p, this.deps.ui ? () => this.deps.ui!.menuPaths() : undefined);
      if (PACK_TOOLS.has(name)) return await packTool(e, name, a);
      if (name === 'set_status') {
        if (!this.deps.status) return fail('The status bar is not available here.');
        const note = str('text').trim();
        this.deps.status(note, Math.min(600, Math.max(1, num('seconds', 60))));
        return text(note ? `The status bar shows "${note.slice(0, 160)}" for ${Math.min(600, Math.max(1, num('seconds', 60)))} seconds.` : 'Cleared the status bar note.');
      }
      if (name === 'ping') {
        const documents = e.projects.map((q) => ({ id: q.id, name: q.name, active: q === p, width: q.doc.width, height: q.doc.height }));
        return text(`${documents.length} open document${documents.length === 1 ? '' : 's'}.`, { documents, active: p?.id ?? null });
      }
      if (name === 'list_plugins') {
        if (!this.deps.plugins) return fail('Plugins are not available here.');
        const plugins = await this.deps.plugins();
        return text(plugins.length ? JSON.stringify(plugins) : 'No plugins are installed: the person adds .js files in Preferences > Plugins.', { plugins });
      }
      if (name === 'list_recipes') {
        const falOn = (async () => (await api.generativeStatus())?.configured === true)().catch(() => false);
        const [models, lama, up, depth, fal] = await Promise.all([localModels(), modelReady('lama-inpaint'), modelReady('ai-upscale'), modelReady('depth-anything-v2-small'), falOn]);
        const row = (id: string, task: string, where: string, ready: boolean, why: string, tool: string) => ({ id, task, where, ready, reason: ready ? null : why, tool });
        const recipes = [
          row('lama', 'fill: remove what a selection covers', 'this computer', lama, 'Download LaMa in Preferences > Plugins > Local models (about 208 MB).', 'generative_fill'),
          ...models.map((m) => row(m.id.replace(/^local:/, ''), 'generate a picture, fill with a prompt', 'this computer', m.ready, m.reason ?? 'Install it in Preferences > Plugins > Local models.', 'generate_image, generative_fill')),
          row('real-esrgan', 'upscale 2 or 4 times', 'this computer', up, 'Download Real-ESRGAN in Preferences > Plugins > Local models (about 67 MB).', 'upscale'),
          row('depth-anything-v2-small', 'depth map', 'this computer', depth, 'Download it in Preferences > Plugins > Local models.', 'run_command compute-depth-map'),
          row('fal', 'fill, generate and upscale on a hosted service', 'fal, costs money and asks the person each time', fal, 'Add a fal key in Edit > Generative Fill.', 'generative_fill, generate_image, upscale with model fal'),
        ];
        return text(`${recipes.filter((r) => r.ready).length} of ${recipes.length} ready: ${recipes.map((r) => `${r.id} ${r.ready ? 'ready' : 'not ready'}`).join(', ')}.`, { recipes });
      }
      if (name === 'read_log') {
        if (!this.deps.log) return fail('The error log is not available here.');
        const all = [...this.deps.log()].sort((x, y) => x.at - y.at), shown = all.slice(-Math.max(1, Math.min(100, Math.round(num('limit', 30))))).map((x) => ({ at: new Date(x.at).toISOString(), what: x.what, message: x.message }));
        return text(shown.length ? JSON.stringify(shown) : 'The error log is empty.', { total: all.length, entries: shown });
      }
      if (name === 'list_brush_tips') {
        const sh = e.brushShape, tips = allBrushPresets().map((q) => ({ id: q.id, name: q.name, description: q.description, size: q.diameter, hardness: q.hardness, opacity: q.opacity, angle: q.angle ?? 0, roundness: q.roundness ?? 100, spacing: q.spacing ?? 25, sampled: !!q.tip }));
        const now = { preset: e.brushPresetId, size: e.brush.diameter, hardness: e.brush.hardness, opacity: e.brush.opacity, flow: e.brushFlow, angle: sh.angle, roundness: sh.roundness, spacing: sh.spacing ?? 25, follow_direction: sh.angleControl === 'direction' };
        return text(`${tips.length} presets: ${tips.map((q) => q.id).join(', ')}. Now: ${JSON.stringify(now)}`, { tips, current: now });
      }
      if (name === 'set_brush') {
        if (!['size', 'hardness', 'opacity', 'flow', 'preset', 'angle', 'roundness', 'spacing', 'follow_direction'].some((k) => a[k] !== undefined)) return fail('Give at least one of size, hardness, opacity, flow, preset, angle, roundness, spacing, follow_direction.');
        if (a.preset !== undefined) {
          const pr = allBrushPresets().find((q) => q.id === str('preset') || q.name === str('preset'));
          if (!pr) return fail(`No brush preset has the id ${str('preset')}: list_brush_tips lists them.`);
          e.applyBrushPreset(pr);
        }
        const patch: Partial<Engine['brush']> = {};
        if (typeof a.size === 'number') patch.diameter = a.size;
        if (typeof a.hardness === 'number') patch.hardness = a.hardness;
        if (typeof a.opacity === 'number') patch.opacity = a.opacity;
        const shape = { ...e.brushShape };
        if (typeof a.angle === 'number') shape.angle = a.angle;
        if (typeof a.roundness === 'number') shape.roundness = a.roundness;
        if (typeof a.spacing === 'number') shape.spacing = a.spacing;
        if (typeof a.follow_direction === 'boolean') shape.angleControl = a.follow_direction ? 'direction' : 'off';
        if (typeof a.flow === 'number') e.brushFlow = Math.min(1, Math.max(0.01, a.flow));
        e.brushShape = shape;
        e.setBrush(patch);
        return text(`The brush is ${e.brush.diameter} px, hardness ${e.brush.hardness}, opacity ${e.brush.opacity}, flow ${e.brushFlow}, angle ${e.brushShape.angle}, roundness ${e.brushShape.roundness}, spacing ${e.brushShape.spacing ?? 25}.`,
          { size: e.brush.diameter, hardness: e.brush.hardness, opacity: e.brush.opacity, flow: e.brushFlow, angle: e.brushShape.angle, roundness: e.brushShape.roundness, spacing: e.brushShape.spacing ?? 25, preset: e.brushPresetId });
      }
      if (name === 'close_document') {
        const cat = catalogueOf();
        if (!cat) return fail(NO_CATALOGUE);
        if (!e.projects.length) return fail('No document is open.');
        if (str('id') && !e.projects.some((q) => q.id === str('id'))) return fail(`No open document has the id ${str('id')}: see documents in get_document.`);
        const r = await cat.runCommand('close-document', str('id') ? { id: str('id') } : {});
        return r.ok ? text(`Closed ${str('id') || 'the active document'}; ${e.projects.length} left open${e.current ? `, now working on ${e.current.name}` : ''}.`, { documents: e.projects.map((q) => ({ id: q.id, name: q.name })) }) : fail(`${r.error ?? 'The document could not be closed.'}`);
      }
      if (name.startsWith('ui_') && name !== 'ui_inspect' || name === '__menu_id') {
        const ui = this.deps.ui;
        if (!ui) return fail('The window controls are not available here.');
        const shown = (k: string): string => { const v = a[k]; return typeof v === 'string' ? v : ''; };
        if (name === 'ui_state') return await ui.state();
        if (name === 'ui_screenshot') return await ui.screenshot(shown('selector'), num('max_size', 1024), shown('format') === 'jpeg', num('quality', 0.9));
        if (name === 'ui_menu_list') return ui.menuList(shown('path'), Math.max(1, Math.min(4, Math.round(num('depth', 1)))));
        if (name === '__menu_id') { const r = ui.menuId(shown('path')); return r.id ? text(r.id, { id: r.id }) : fail(r.error ?? 'No such menu item.'); }
        if (name === 'ui_menu_invoke') return await ui.menuInvoke(shown('path'), a.params && typeof a.params === 'object' ? a.params as Record<string, unknown> : undefined);
        if (name === 'ui_set') return await ui.set(a);
        if (name === 'ui_dialog') return await ui.dialog(shown('action') || 'list', a.fields && typeof a.fields === 'object' ? a.fields as Record<string, unknown> : undefined, shown('button') || undefined);
        if (name === 'ui_pointer') return await ui.pointer(Array.isArray(a.events) ? a.events as Array<Record<string, unknown>> : [], num('delay_ms', 4), a.keep_down === true);
        if (name === 'ui_key') return await ui.key(Array.isArray(a.keys) ? a.keys.filter((k): k is string => typeof k === 'string') : undefined, shown('text') || undefined);
        if (name === 'ui_window') return await ui.window(shown('action'), typeof a.width === 'number' ? a.width : undefined, typeof a.height === 'number' ? a.height : undefined, a.confirm === true);
        return fail(`formvis has no tool named ${name}.`);
      }
      if (!p) return fail('No document is open: call new_document or open_file first.');
      const layerOf =(): NonNullable<ReturnType<typeof p.layer>> => { const l = p.layer(str('id')); if (!l) throw new Error(`No layer has the id ${str('id')}: call get_document for the ids.`); return l; };
      switch (name) {
        case 'get_document': {
          const d = p.doc, s = p.selection;
          const data = { name: p.name, width: d.width, height: d.height, resolution: d.resolution ?? 72, mode: d.mode ?? 'rgb', depth: d.depth ?? 8, profile: d.profile?.name ?? (d.mode === 'cmyk' ? null : 'sRGB'), activeLayerId: p.activeId,
            selection: s ? { x: s.x, y: s.y, width: s.w, height: s.h } : null,
            history: { steps: e.historySteps.names.length, done: e.historySteps.current, canUndo: p.history.canUndo, canRedo: p.history.canRedo, last: e.historySteps.current ? e.historySteps.names[e.historySteps.current - 1] : null },
            documents: e.projects.map((q) => ({ id: q.id, name: q.name, active: q === p, width: q.doc.width, height: q.doc.height, layers: q.doc.layers.length, modified: q.modified })),
            layers: d.layers.map((l) => ({ id: l.id, name: l.name, kind: l.isGroup ? 'group' : l.adjustment ? `adjustment:${l.adjustment.kind}` : l.fillContent ? `fill:${l.fillContent.kind}` : l.text ? 'text' : l.shape ? 'shape' : l.smart ? 'smart object' : 'pixels',
              visible: l.visible !== false, opacity: l.opacity, blend: l.blend ?? 'normal', parentId: l.parentId ?? null, ...(l.reference ? { reference: true } : {}) })) };
          return text(JSON.stringify(data), data);
        }
        case 'get_image': {
          const view = str('view') || 'document', jpeg = str('format') === 'jpeg';
          if (!['document', 'editor', 'layer'].includes(view)) return fail('view is document, editor or layer.');
          let flat: Surface | null;
          if (view === 'editor') flat = this.deps.viewCapture?.() ?? null;
          else if (view === 'layer') { if (!str('id')) return fail('view layer needs id: a layer id from get_document.'); const l = layerOf(); if (l.isGroup) return fail(`${l.name} is a group: give a layer, or use view document.`); flat = e.renderLayerAlone(l.id); }
          else flat = e.flattened();
          if (!flat) return fail(view === 'editor' ? 'The editor view cannot be captured here: use view document.' : 'Nothing to show.');
          const boxed = view !== 'editor' && ['x', 'y', 'width', 'height'].some((k) => typeof a[k] === 'number');
          const sx = boxed ? Math.min(flat.width - 1, Math.max(0, Math.round(num('x', 0)))) : 0, sy = boxed ? Math.min(flat.height - 1, Math.max(0, Math.round(num('y', 0)))) : 0;
          const sw = boxed ? Math.max(1, Math.min(flat.width - sx, Math.round(num('width', flat.width - sx)))) : flat.width, sh = boxed ? Math.max(1, Math.min(flat.height - sy, Math.round(num('height', flat.height - sy)))) : flat.height;
          const k = Math.min(1, num('max_size', 1024) / Math.max(sw, sh)), s = createSurface(Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k))), c = ctxOf(s);
          if (jpeg) { c.fillStyle = '#ffffff'; c.fillRect(0, 0, s.width, s.height); }
          c.drawImage(flat as CanvasImageSource, sx, sy, sw, sh, 0, 0, s.width, s.height);
          const what = view === 'editor' ? `the editor view, ${flat.width} by ${flat.height}` : `${view === 'layer' ? `${layerOf().name} alone, ` : ''}${p.doc.width} by ${p.doc.height}${boxed ? `, the box ${sx}, ${sy}, ${sw} by ${sh}` : ''}`;
          return { content: [{ type: 'image', data: await b64(await toBlob(s, jpeg ? 'image/jpeg' : 'image/png', jpeg ? Math.min(1, Math.max(0.1, num('quality', 0.9))) : undefined)), mimeType: jpeg ? 'image/jpeg' : 'image/png' }, { type: 'text', text: `${what}, shown at ${s.width} by ${s.height}.` }] };
        }
        case 'select': {
          const shape = str('shape');
          if (shape === 'none') { e.deselect(); return text('Deselected.'); }
          if (shape === 'all') { e.selectAll(); return text('Selected all.'); }
          if (shape === 'invert') { e.invertSelection(); return text('Inverted the selection.'); }
          const x = Math.round(num('x', 0)), y = Math.round(num('y', 0)), w = Math.max(1, Math.round(num('width', 1))), h = Math.max(1, Math.round(num('height', 1)));
          const mode = (['replace', 'add', 'subtract', 'intersect'].includes(str('mode')) ? str('mode') : 'replace') as 'replace';
          const bits = new Uint8Array(w * h);
          if (shape === 'ellipse') { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const u = (i + 0.5) / w * 2 - 1, v = (j + 0.5) / h * 2 - 1; if (u * u + v * v <= 1) bits[j * w + i] = 255; } }
          else bits.fill(255);
          e.applySelection(SelectionMask.cropped(x, y, w, h, bits), mode, shape === 'ellipse' ? 'Elliptical Marquee' : 'Rectangular Marquee');
          const s = e.current?.selection;
          return text(s ? `The selection is now ${s.w} by ${s.h} at ${s.x}, ${s.y}.` : 'Nothing is selected.');
        }
        case 'add_layer': {
          e.addLayer(str('name') ? { name: str('name') } : {});
          return text(`Added ${e.activeLayer?.name} (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id });
        }
        case 'set_layer': {
          const l = layerOf();
          if (a.active === true || typeof a.opacity === 'number' || typeof a.blend === 'string') e.selectLayer(l.id);
          if (typeof a.name === 'string' && a.name !== l.name) e.renameLayer(l.id, a.name);
          if (typeof a.visible === 'boolean' && a.visible !== (l.visible !== false)) e.toggleVisibility(l.id);
          if (typeof a.opacity === 'number') e.setOpacity(Math.min(1, Math.max(0, a.opacity)));
          if (typeof a.blend === 'string') e.setBlend(a.blend as BlendMode);
          if (typeof a.reference === 'boolean' && a.reference !== (l.reference === true)) e.edit('Reference Layer', (q) => { q.updateLayer(l.id, { reference: a.reference as boolean }); });
          if (a.locks && typeof a.locks === 'object') {
            const lk = a.locks as Record<string, unknown>, patch: Record<string, boolean> = {};
            for (const k of ['pixels', 'position', 'transparency', 'all']) if (typeof lk[k] === 'boolean') patch[k] = lk[k] as boolean;
            if (Object.keys(patch).length) { e.selectLayer(l.id); e.setLocks(patch); }
          }
          return text(`Updated ${e.current?.layer(l.id)?.name}.`);
        }
        case 'delete_layer': { const l = layerOf(); e.selectLayer(l.id); e.deleteLayers(); return text(`Deleted ${l.name}.`); }
        case 'fill': {
          const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(str('color'));
          if (!m) return fail('color must be #rrggbb.');
          e.fg = { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
          e.fill('fg');
          return text(`Filled ${p.selection ? 'the selection' : 'the layer'} with ${str('color')}.`);
        }
        case 'add_adjustment': {
          const kind = str('kind');
          const id = e.addAdjustmentLayer(kind as Parameters<Engine['addAdjustmentLayer']>[0]);
          if (!id) return fail(`${kind} is not an adjustment formvis has.`);
          const l = e.current?.layer(id);
          if (l?.adjustment && a.params && typeof a.params === 'object' && (PARAM_KINDS as string[]).includes(kind)) { l.adjustment.data.params = { ...(l.adjustment.data.params as object ?? {}), ...(a.params as object) }; e.emit('render', null); }
          return text(`Added ${l?.name} (id ${id}).`, { id });
        }
        case 'place_image': {
          const bytes = Uint8Array.from(atob(str('data')), (c) => c.charCodeAt(0));
          let r: Raster;
          if (/<svg\b/i.test(new TextDecoder().decode(bytes.subarray(0, 4096)))) {
            const blob = new Blob([bytes], { type: 'image/svg+xml' }), size = await svgSize(blob), img = await rasteriseSvg(blob, str('name') || 'Image', Math.round(num('svg_width', size?.width ?? 1024)));
            r = Raster.from(img.source, img.width, img.height);
          } else {
            const bmp = await createImageBitmap(new Blob([bytes]));
            r = new Raster(bmp.width, bmp.height); r.ctx.drawImage(bmp, 0, 0); bmp.close(); r.touch();
          }
          let placed: string | undefined, smartFailed = '';
          await inOneStep(e, 'Place', async () => {
            e.insertRasterLayer(r, str('name') || 'Placed Image', Math.round(num('x', 0)), Math.round(num('y', 0)), a.reference === true ? { reference: true } : {}, 'Place');
            placed = e.activeLayer?.id;
            if (placed && (typeof a.scale === 'number' || a.fit === 'contain' || a.fit === 'cover')) {
              const k = typeof a.scale === 'number' ? a.scale : Math.min(1000, Math.max(1, (a.fit === 'cover' ? Math.max : Math.min)(p.doc.width / r.width, p.doc.height / r.height) * 100));
              e.scaleLayerTo(k);
            }
            if (placed && (a.center === true || a.fit === 'contain' || a.fit === 'cover')) {
              const t = e.current?.layer(placed)?.transform;
              if (t) e.setLayerTransform({ x: Math.round((p.doc.width - t.w) / 2), y: Math.round((p.doc.height - t.h) / 2) }, 'Place');
            }
            if (placed && a.smart_object === true) {
              const cat = catalogueOf(), r2 = cat ? await cat.runCommand('convert-smart', {}) : null;
              if (!r2?.ok) smartFailed = r2?.error ?? NO_CATALOGUE;
            }
          });
          if (smartFailed) return fail(`The image was placed as a pixel layer (id ${placed}), but it could not become a smart object: ${smartFailed}`);
          const t = e.current?.layer(placed ?? '')?.transform;
          return text(`Placed a ${r.width} by ${r.height} image as ${e.activeLayer?.name} (id ${e.activeLayer?.id})${t ? ` at ${Math.round(t.x)}, ${Math.round(t.y)}, ${Math.round(t.w)} by ${Math.round(t.h)}` : ''}${a.smart_object === true ? ', a smart object' : ''}.`, { id: e.activeLayer?.id });
        }
        case 'undo': case 'redo': {
          const n = Math.min(100, Math.max(1, Math.round(num('steps', 1))));
          for (let i = 0; i < n; i++) name === 'undo' ? e.undo() : e.redo();
          return text(`${name === 'undo' ? 'Undid' : 'Redid'} ${n} step${n === 1 ? '' : 's'}.`);
        }
        // Files (1.53.3): the engine writes what these return.
        case '__project': {
          const blob = await this.deps.projectBlob?.();
          return blob ? text('The project, as a .fvd file.', { data: await b64(blob) }) : fail('formvis could not pack the project.');
        }
        // The video timeline (1.59.7, DEV_PLAN 25.5), as Photon Studio's timeline operations; each edit one undoable step.
        case 'timeline_get': {
          const vt = e.video;
          if (!vt) return text('The document has no video timeline: timeline_create makes one.', { timeline: null });
          const data = { fps: vt.fps, frames: vt.duration, seconds: +(vt.duration / vt.fps).toFixed(3), current: vt.current, work_in: vt.workIn, work_out: vt.workOut, loops: vt.loops,
            tracks: [...p.doc.layers].reverse().filter((l) => vt.tracks[l.id]).map((l) => { const t = vt.tracks[l.id]; return { id: l.id, name: l.name, start: t.start, length: t.length, fade_in: t.fadeIn?.frames ?? 0, fade_out: t.fadeOut?.frames ?? 0, fade_in_color: t.fadeIn?.color ?? null, fade_out_color: t.fadeOut?.color ?? null,
              keyframes: Object.fromEntries(Object.entries(t.keys).map(([k, ks]) => [k, (ks ?? []).map((x) => ({ frame: x.t, value: x.v, interpolation: x.interp }))])) }; }) };
          return text(JSON.stringify(data), data);
        }
        case 'timeline_create': {
          if (e.video) return fail('The document has a video timeline already: timeline_get shows it.');
          if (e.timeline.frames.length) return fail('The document has a frame animation; a document has one or the other.');
          e.createVideoTimeline(Math.min(240, Math.max(1, num('fps', 30))), Math.min(3600, Math.max(0.1, num('seconds', 5))));
          const vt = e.video as VideoTimeline | null;   // read afresh: the check above narrowed e.video to null
          return vt ? text(`Created a video timeline: ${vt.fps} frames a second, ${vt.duration} frames, a track per layer.`) : fail('Could not create a video timeline.');
        }
        case 'timeline_delete': return e.deleteVideoTimeline() ? text('Deleted the video timeline; the layers stay.') : fail('The document has no video timeline.');
        case 'timeline_set': case 'timeline_go_to': case 'timeline_clip': case 'timeline_split': case 'timeline_keyframe': case 'timeline_transition': case 'timeline_frame_image': case '__render': {
          const vt = e.video;
          if (!vt) return fail('The document has no video timeline: call timeline_create first.');
          const frame = (k: string, d: number): number => Math.round(num(k, d));
          if (name === 'timeline_set') {
            const fps = Math.min(240, Math.max(1, num('fps', vt.fps))), secs = Math.min(3600, Math.max(0.01, num('seconds', vt.duration / vt.fps)));
            e.editVideo((v) => {
              v.fps = fps; v.duration = Math.max(1, Math.round(fps * secs));
              v.workIn = Math.min(v.duration - 1, Math.max(0, frame('work_in', Math.min(v.workIn, v.duration - 1))));
              v.workOut = Math.min(v.duration, Math.max(v.workIn + 1, frame('work_out', Math.min(v.workOut, v.duration))));
              v.loops = Math.max(0, frame('loops', v.loops)); v.current = Math.min(v.current, v.duration - 1);
            }, 'Set Timeline');
            const v = e.video as typeof vt;
            return text(`${v.fps} frames a second, ${v.duration} frames, the work area ${v.workIn} to ${v.workOut}.`);
          }
          if (name === 'timeline_go_to') { e.setVideoTime(frame('frame', vt.current)); return text(`The playhead is at frame ${e.video?.current}.`); }
          if (name === 'timeline_frame_image') {
            const f = Math.min(vt.duration - 1, Math.max(0, frame('frame', vt.current))), s = e.renderVideoFrame(f);
            if (!s) return fail('Nothing to show.');
            const k = Math.min(1, num('max_size', 1024) / Math.max(s.width, s.height)), out = createSurface(Math.max(1, Math.round(s.width * k)), Math.max(1, Math.round(s.height * k)));
            ctxOf(out).drawImage(s as CanvasImageSource, 0, 0, out.width, out.height);
            return { content: [{ type: 'image', data: await b64(await toBlob(out)), mimeType: 'image/png' }, { type: 'text', text: `Frame ${f}, shown at ${out.width} by ${out.height}.` }] };
          }
          if (name === '__render') {   // timeline_render: the engine writes the file at its path
            if (!this.deps.renderVideo) return fail('formvis cannot render video for agents here.');
            const from = Math.min(vt.duration - 1, Math.max(0, frame('from', 0))), to = Math.min(vt.duration, Math.max(from + 1, frame('to', vt.duration)));
            let stopped = false;
            const fmt = str('format'), blob = await this.deps.renderVideo({ format: fmt === 'gif' || fmt === 'png' ? fmt : 'mp4', from, to, scale: [1, 0.5, 0.25].includes(num('scale', 1)) ? num('scale', 1) : 1 }, async (done, total) => {
              try {
                const r = await fetch('/api/mcp/bridge/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: this.callId, progress: done, total, message: `Rendered ${done} of ${total} frames` }) });
                if (r.ok && (await r.json() as { cancel?: boolean }).cancel) stopped = true;
              } catch { /* the engine is not answering: the render goes on */ }
              return !stopped;
            });
            if (stopped) return fail(`Render Video stopped after the agent cancelled it; nothing was written.`);
            return blob ? text(`Rendered ${to - from} frames.`, { data: await b64(blob) }) : fail('Nothing was rendered.');
          }
          const l = layerOf(), tr = vt.tracks[l.id];
          if (!tr) return fail(`${l.name} has no track in the timeline.`);
          if (name === 'timeline_clip') {
            e.editVideo((v) => { const t = v.tracks[l.id]; if (!t) return; t.start = Math.min(v.duration - 1, Math.max(-v.duration, frame('start', t.start))); t.length = Math.max(1, frame('length', t.length)); }, 'Move Clip');
            const t = e.video?.tracks[l.id];
            return text(`${l.name}'s clip runs from frame ${t?.start} for ${t?.length} frames.`);
          }
          if (name === 'timeline_split') {
            const at = frame('frame', vt.current), copy = e.splitClip(l.id, at);
            return copy ? text(`Split ${l.name} at frame ${at}; the rest is the layer ${copy}.`, { id: copy }) : fail(`Frame ${at} is not inside ${l.name}'s clip (${tr.start} to ${tr.start + tr.length}).`);
          }
          if (name === 'timeline_transition') {
            const kind = str('kind'), len = Math.max(1, Math.round(num('seconds', 1) * vt.fps));
            if (kind === 'cross_fade') { const why = e.crossFade(l.id); return why ? fail(why) : text(`Cross faded ${l.name}.`); }
            const c = str('color') === 'black' || str('color') === 'white' ? str('color') as 'black' | 'white' : null;   // 1.60.1
            const ok = kind === 'remove' ? e.fadeClip(l.id, 0, true, true) : e.fadeClip(l.id, len, kind !== 'fade_out', kind !== 'fade_in', c);
            return ok ? text(kind === 'remove' ? `Removed ${l.name}'s transitions.` : `${l.name} fades ${kind === 'fade_in' ? 'in' : kind === 'fade_out' ? 'out' : 'in and out'} over ${len} frames${c ? `, with ${c}` : ''}.`) : fail('Could not change the transition.');
          }
          // timeline_keyframe
          const prop = str('property') as VideoProp;
          if (!VIDEO_PROPS.includes(prop)) return fail('property is one of x, y, opacity, fill, style.');
          const at = Math.min(vt.duration - 1, Math.max(0, frame('frame', vt.current)));
          if (a.clear === true) { e.editVideo((v) => { const t = v.tracks[l.id]; if (t) delete t.keys[prop]; }, 'Keyframe Animation'); return text(`Cleared ${l.name}'s ${prop} keyframes.`); }
          if (a.delete === true) {
            if (!(tr.keys[prop] ?? []).some((k) => k.t === at)) return fail(`${l.name} has no ${prop} keyframe at frame ${at}.`);
            e.editVideo((v) => { const t = v.tracks[l.id]; if (!t) return; t.keys[prop] = (t.keys[prop] ?? []).filter((k) => k.t !== at); if (!t.keys[prop]?.length) delete t.keys[prop]; }, 'Delete Keyframe');
            return text(`Deleted ${l.name}'s ${prop} keyframe at frame ${at}.`);
          }
          if (typeof a.value !== 'number' || !Number.isFinite(a.value)) return fail('value is required: pixels for x and y, 0 to 1 for opacity and fill, 1 or 0 for style.');
          const raw = a.value as number, value = prop === 'opacity' || prop === 'fill' ? Math.min(1, Math.max(0, raw)) : prop === 'style' ? (raw >= 0.5 ? 1 : 0) : raw, interp = str('interpolation') === 'hold' ? 'hold' as const : 'linear' as const;
          e.editVideo((v) => {
            const t = v.tracks[l.id];
            if (!t) return;
            const ks = (t.keys[prop] ??= []), k = ks.find((x) => x.t === at);
            if (k) { k.v = value; k.interp = interp; } else { ks.push({ t: at, v: value, interp }); ks.sort((x, y) => x.t - y.t); }
          }, 'Make Keyframe');
          return text(`Keyed ${l.name}'s ${prop} at frame ${at}: ${value} (${interp}).`);
        }
        case '__export': {
          if (['psd', 'psb', 'ora'].includes(str('type'))) {
            const kind = str('type');
            if (kind !== 'ora' && (p.doc.mode === 'cmyk' || p.doc.mode === 'lab')) return fail(`A ${p.doc.mode} document goes out as a PSD from File > Export; through export_image convert it to RGB first (run_command mode-rgb).`);
            if (kind === 'psd' && (p.doc.width > 30000 || p.doc.height > 30000)) return fail('A PSD holds 30000 pixels a side: write a .psb instead.');
            e.settle();
            const flat = e.flattened();
            if (!flat) return fail('Nothing to export.');
            if (kind === 'ora') { const { blob, notes } = await writeOra(p.doc, flat, (l) => e.renderLayerAlone(l.id)); return text(`The layered picture, ${p.doc.layers.length} layers.${notes.length ? ` ${notes.join(' ')}` : ''}`, { data: await b64(blob) }); }
            const { bytes, notes } = await writePsdFile(p.doc, flat, kind === 'psb', e.pathsOf(p), true);
            return text(`The layered picture, ${p.doc.layers.length} layers.${notes.length ? ` ${notes.join(' ')}` : ''}`, { data: await b64(new Blob([bytes])) });
          }
          if (str('type') === 'tiff-layers') {
            e.settle();
            const flat = e.flattened();
            if (!flat) return fail('Nothing to export.');
            const { blob, notes } = await writeLayeredTiff(p.doc, flat, e.pathsOf(p));
            return text(`The layered TIFF, ${p.doc.layers.length} layers.${notes.length ? ` ${notes.join(' ')}` : ''}`, { data: await b64(blob) });
          }
          if (str('type') === 'exr' || str('type') === 'hdr') {
            e.settle();
            let deep: { width: number; height: number; data: Float32Array } | { error: string };
            if (p.doc.depth === 32 && p.doc.mode !== 'lab') deep = composeDeep(p.doc);
            else {
              const flat = e.flattened();
              if (!flat) return fail('Nothing to export.');
              const img = ctxOf(flat).getImageData(0, 0, flat.width, flat.height), d = new Float32Array(img.data.length);
              for (let i = 0; i < d.length; i += 4) { for (let c = 0; c < 3; c++) d[i + c] = srgbToLinear(img.data[i + c] / 255); d[i + 3] = img.data[i + 3] / 255; }
              deep = { width: flat.width, height: flat.height, data: d };
            }
            if ('error' in deep) return fail(deep.error);
            const kind = str('type') as 'exr' | 'hdr', blob = await api.encodeDeep(deep.data, deep.width, deep.height, kind, null, kind === 'exr' ? { compression: str('exr_compression') || 'zip', half: a.half === true } : null);
            return text(`The ${kind} picture, ${deep.width} by ${deep.height}.`, { data: await b64(blob), width: deep.width, height: deep.height });
          }
          const t = (['image/png', 'image/jpeg', 'image/webp'].includes(str('type')) ? str('type') : 'image/png') as 'image/png';
          const q = Math.min(1, Math.max(0.1, num('quality', 0.92))), sc = Math.min(4, Math.max(0.05, num('scale', 1))), label = str('metadata') === 'none' ? async (_e: Engine, b: Blob, _t: string): Promise<Blob> => b : labelExport;
          if (sc !== 1) {
            const flat = e.flattened();
            if (!flat) return fail('Nothing to export.');
            const out = createSurface(Math.max(1, Math.round(flat.width * sc)), Math.max(1, Math.round(flat.height * sc))), oc = ctxOf(out);
            if (str('type') === 'image/jpeg') { oc.fillStyle = '#ffffff'; oc.fillRect(0, 0, out.width, out.height); }
            oc.imageSmoothingQuality = 'high';
            oc.drawImage(flat as CanvasImageSource, 0, 0, out.width, out.height);
            return text(`The picture at ${out.width} by ${out.height}.`, { data: await b64(await label(e, await toBlob(out, t, str('type') === 'image/png' || !str('type') ? undefined : q), t)), width: out.width, height: out.height });
          }
          const blob = await e.exportBlob(t, q);
          return blob ? text('The picture.', { data: await b64(await label(e, blob, t)) }) : fail('Nothing to export.');
        }
        case 'switch_document': {
          if (!e.projects.some((q) => q.id === str('id'))) return fail(`No open document has the id ${str('id')}: see documents in get_document.`);
          e.switchTo(str('id'));
          return text(`Now working on ${e.current?.name}.`);
        }
        // The document's size and shape.
        case 'resize_image': {
          const W = p.doc.width, H = p.doc.height, hasW = typeof a.width === 'number', hasH = typeof a.height === 'number';
          let w: number, h: number;
          if (typeof a.percent === 'number') { w = Math.max(1, Math.round(W * a.percent / 100)); h = Math.max(1, Math.round(H * a.percent / 100)); }
          else if (typeof a.long_side === 'number') { const k = a.long_side / Math.max(W, H); w = Math.max(1, Math.round(W * k)); h = Math.max(1, Math.round(H * k)); }
          else if (hasW || hasH) { w = hasW ? Math.round(num('width', W)) : Math.max(1, Math.round(num('height', H) * W / H)); h = hasH ? Math.round(num('height', H)) : Math.max(1, Math.round(w * H / W)); }
          else return fail('Give width and height, or one of them, or percent, or long_side.');
          return e.resampleImage(w, h, 'high', p.doc.resolution ?? 72) ? text(`Resized to ${w} by ${h}.`) : fail(`The size is outside what formvis allows (30,000 pixels a side, ${Math.round(LIMITS.pixels / 1_000_000)} megapixels on this computer).`);
        }
        case 'resize_canvas': {
          const w = Math.round(num('width', p.doc.width)), h = Math.round(num('height', p.doc.height)), an = str('anchor') || 'center';
          const fx = an.includes('left') ? 0 : an.includes('right') ? 1 : 0.5, fy = an.startsWith('top') ? 0 : an.startsWith('bottom') ? 1 : 0.5;
          return e.resizeCanvas(w, h, Math.round((w - p.doc.width) * fx), Math.round((h - p.doc.height) * fy)) ? text(`The canvas is ${w} by ${h}.`) : fail('The canvas size is outside what formvis allows.');
        }
        case 'crop': {
          const r = { x: Math.round(num('x', 0)), y: Math.round(num('y', 0)), w: Math.round(num('width', 1)), h: Math.round(num('height', 1)) };
          return e.cropTo(r) ? text(`Cropped to ${e.current?.doc.width} by ${e.current?.doc.height}.`) : fail('That rectangle does not overlap the picture.');
        }
        case 'flip_canvas': { e.flipCanvas(str('direction') !== 'vertical'); return text(`Flipped ${str('direction') || 'horizontal'}ly.`); }
        // Layers.
        case 'transform_layer': {
          const l = layerOf(); e.selectLayer(l.id);
          if (a.distort !== undefined && a.warp !== undefined) return fail('Give distort or warp, not both: one transform at a time.');
          const cs = a.distort && typeof a.distort === 'object' ? (a.distort as { corners?: unknown }).corners : undefined;
          const corners = Array.isArray(cs) ? cs.map((c) => (c && typeof (c as Pt).x === 'number' && typeof (c as Pt).y === 'number' ? { x: (c as Pt).x, y: (c as Pt).y } : null)) : [];
          if (a.distort !== undefined && (corners.length !== 4 || corners.some((c) => !c))) return fail('distort.corners is four {x, y} points in document pixels: top left, top right, bottom right, bottom left.');
          if (a.distort !== undefined && !distortUsable(corners as Pt[])) return fail('Those corners cross or collapse. Keep them in order (top left, top right, bottom right, bottom left) with no side crossing another.');
          if (typeof a.scale === 'number') e.scaleLayerTo(a.scale);
          const patch: Record<string, number> = {};
          if (typeof a.x === 'number') patch.x = a.x;
          if (typeof a.y === 'number') patch.y = a.y;
          if (typeof a.rotation === 'number') patch.rotation = a.rotation;
          if (Object.keys(patch).length) e.setLayerTransform(patch, 'Transform Layer');
          if (a.flip === 'horizontal' || a.flip === 'vertical') e.flipLayers(a.flip === 'horizontal');
          const tool = e.tool;
          if (a.distort !== undefined) {
            if (!e.beginDistortMode('distort') || !e.distortEdit) return fail(`${l.name} cannot be distorted: it needs to be a pixel layer or a smart object (rasterize_layer first), with no other transform under way.`);
            e.distortEdit.corners = corners as Pt[];
            e.applyDistort();
            e.setTool(tool);
          }
          if (a.warp !== undefined) {
            const w = (a.warp && typeof a.warp === 'object' ? a.warp : {}) as Record<string, unknown>;
            e.setTool('move');
            if (!e.beginMeshWarp(typeof w.grid === 'number' ? w.grid : undefined)) return fail(`${l.name} cannot be warped: it needs to be a pixel layer or a smart object (rasterize_layer first), with no other transform under way.`);
            if (typeof w.style === 'string' && !e.setMeshWarpPreset({ style: w.style as 'arc', ...(typeof w.bend === 'number' ? { bend: w.bend } : {}), ...(typeof w.horizontal === 'number' ? { horizontal: w.horizontal } : {}), ...(typeof w.vertical === 'number' ? { vertical: w.vertical } : {}), ...(w.orientation === 'vertical' ? { orientation: 'vertical' as const } : {}) })) {
              e.cancelMeshWarp(); e.setTool(tool);
              return fail(`The warp ${w.style} was not applied: the style is not known or that bend would fold the picture. Lower bend, horizontal or vertical.`);
            }
            e.applyMeshWarp();
            e.setTool(tool);
          }
          const t = e.current?.layer(l.id)?.transform;
          return text(`${l.name} is at ${Math.round(t?.x ?? 0)}, ${Math.round(t?.y ?? 0)}, ${Math.round(t?.w ?? 0)} by ${Math.round(t?.h ?? 0)}.`);
        }
        case 'rasterize_layer': { const l = layerOf(); e.selectLayer(l.id); e.rasterizeLayer(); const now = e.current?.layer(l.id); return now && !now.text && !now.shape ? text(`${l.name} is now pixels.`) : fail(`${l.name} could not be rasterized.`); }
        case 'duplicate_layer': { const l = layerOf(); e.selectLayer(l.id); e.duplicateLayers(str('name') || undefined); return text(`Duplicated ${l.name} as ${e.activeLayer?.name} (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id }); }
        case 'move_layer': {
          const l = layerOf(), t = p.layer(str('target'));
          if (!t) return fail(`No layer has the id ${str('target')}: call get_document for the ids.`);
          e.moveLayers([l.id], t.id, str('where') === 'below' ? 'below' : 'above');
          return text(`Moved ${l.name} ${str('where') === 'below' ? 'below' : 'above'} ${t.name}.`);
        }
        case 'merge_layers': {
          const ids = Array.isArray(a.ids) ? (a.ids as unknown[]).map(String) : [];
          const found = ids.map((id) => p.layer(id)).filter((l): l is NonNullable<typeof l> => !!l);
          if (!found.length) return fail('No layer has those ids: call get_document for the ids.');
          const layers = p.doc.layers;
          if (found.length === 1) { const i = layers.findIndex((l) => l.id === found[0].id); if (i < 1) return fail(`${found[0].name} has no layer below it to merge into.`); e.selectLayer(layers[i - 1].id); e.selectLayer(found[0].id, 'toggle'); }
          else { e.selectLayer(found[0].id); for (const l of found.slice(1)) e.selectLayer(l.id, 'toggle'); }
          e.mergeLayers();
          return text(`Merged into ${e.activeLayer?.name} (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id });
        }
        case 'flatten_image': return e.flattenImage() ? text('Flattened into one layer.') : fail('Nothing to flatten.');
        case 'add_text': {
          const color = hex(a.color ?? '#000000');
          if (!color) return fail('color must be #rrggbb.');
          await e.createTextLayer({ x: num('x', 0), y: num('y', 0) }, { content: str('text'), family: str('font') || 'Inter', size: num('size', 48), color, align: (['left', 'center', 'right'].includes(str('align')) ? str('align') : 'left') as 'left',
            bold: a.bold === true, italic: a.italic === true, lineHeight: 1.2, tracking: 0, kerning: 'metrics', antialias: 'smooth', box: null, direction: 'horizontal' });
          return text(`Added the text layer ${e.activeLayer?.name} (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id });
        }
        case 'draw_shape': {
          const fill = a.fill === undefined ? null : hex(a.fill), stroke = a.stroke === undefined ? null : hex(a.stroke);
          if ((a.fill !== undefined && !fill) || (a.stroke !== undefined && !stroke)) return fail('fill and stroke must be #rrggbb.');
          if (!fill && !stroke) return fail('Give a fill, a stroke, or both.');
          const x = num('x', 0), y = num('y', 0), w = Math.max(1, num('width', 1)), h = Math.max(1, num('height', 1));
          if (fill) e.fg = fill;
          if (stroke) e.bg = stroke;
          Object.assign(e.shapeSettings, { kind: str('kind') || 'rectangle', mode: 'shape', fill: fill ? 'fg' : 'none', stroke: stroke ? 'bg' : 'none', strokeWidth: num('stroke_width', 3) });
          e.drawShape({ x, y }, { x: x + w, y: y + h }, { x, y, w, h });
          return text(`Drew ${e.activeLayer?.name} (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id });
        }
        // Selecting.
        case 'select_subject': {
          if (!this.deps.selectSubject) return fail('Select Subject is not available here.');
          await this.deps.selectSubject();
          const s = e.current?.selection;
          return s ? text(`Selected the subject: ${s.w} by ${s.h} at ${s.x}, ${s.y}.`) : fail('No subject was found.');
        }
        case 'select_color_range': {
          const c = hex(a.color);
          if (!c) return fail('color must be #rrggbb.');
          e.selectColorRange({ mode: 'sampled', plus: [c], minus: [], fuzziness: num('fuzziness', 40), invert: false });   // checked by TypeScript, not cast
          const s = e.current?.selection;
          return s ? text(`Selected ${str('color')}: ${s.w} by ${s.h} at ${s.x}, ${s.y}.`) : fail(`Nothing near ${str('color')} was found.`);
        }
        case 'select_feather': case 'select_grow': {
          if (!p.selection) return fail('There is no selection: call select, select_subject or select_color_range first.');
          const feather = name === 'select_feather', amount = feather ? Math.round(num('radius', 0) * 10) / 10 : Math.round(num('amount', 0));
          if (!(amount >= (feather ? 0.1 : 1)) || amount > (feather ? 1000 : 1024)) return fail(feather ? 'radius is 0.1 to 1000 pixels.' : 'amount is 1 to 1024 pixels.');
          if (feather) e.modifySelection('feather', amount, a.at_bounds === true);
          else e.resizeSelection(str('direction') === 'contract' ? -amount : amount, a.at_bounds === true);
          const s = e.current?.selection;
          return s ? text(`${feather ? `Feathered by ${amount} pixels` : `${str('direction') === 'contract' ? 'Contracted' : 'Expanded'} by ${amount} pixels`}: the selection is ${s.w} by ${s.h} at ${s.x}, ${s.y}.`, { x: s.x, y: s.y, width: s.w, height: s.h })
            : fail(`${feather ? 'Feathering' : 'Contracting'} left nothing selected.`);
        }
        case 'select_point': {
          if (!this.deps.selectPoints) return fail('Selecting by points is not available here.');
          const pts = (k: string): Array<[number, number]> => (Array.isArray(a[k]) ? (a[k] as Array<{ x?: unknown; y?: unknown }>) : []).filter((q) => typeof q?.x === 'number' && typeof q?.y === 'number').map((q) => [Math.floor(q.x as number), Math.floor(q.y as number)]);
          const inside = pts('inside'), outside = pts('outside'), mode = (['replace', 'add', 'subtract', 'intersect'].includes(str('mode')) ? str('mode') : 'replace') as 'replace';
          if (!inside.length) return fail('Give at least one inside point as { x, y } in document pixels.');
          if ([...inside, ...outside].some(([x, y]) => x < 0 || y < 0 || x >= p.doc.width || y >= p.doc.height)) return fail(`Every point must lie inside the picture (0 to ${p.doc.width - 1}, 0 to ${p.doc.height - 1}).`);
          const why = await this.deps.selectPoints(inside, outside, mode);
          if (why) return fail(`${why} Try points nearer the middle of the object, or select_subject.`);
          const s = e.current?.selection;
          return s ? text(`Selected the object: ${s.w} by ${s.h} at ${s.x}, ${s.y}.`, { x: s.x, y: s.y, width: s.w, height: s.h }) : fail('Nothing is selected.');
        }
        // Filters and looks.
        case 'apply_filter': {
          if (!this.deps.applyFilter) return fail('Filters are not available here.');
          // The engine's own reason, when it gives one (1.60.2: a memory refusal, a lock), is the agent's answer.
          let said = '';
          const off = e.on('notice', (n) => { said = (n as { text?: string } | null)?.text ?? said; });
          let ok: boolean;
          try { ok = await this.deps.applyFilter(str('kind'), (a.settings && typeof a.settings === 'object' ? a.settings : {}) as Record<string, unknown>); } finally { off?.(); }
          if (!ok && said) return fail(said);
          const al = e.activeLayer;
          return ok ? text(`Applied ${str('kind')} to ${al?.name}.`) : fail(al && (al.text || al.shape || al.smart) ? `${al.name} is a ${al.text ? 'text' : al.shape ? 'shape' : 'smart object'} layer: call rasterize_layer with its id (${al.id}) first, then apply the filter.` : `${str('kind')} could not be applied to ${al?.name}: a pixel layer is needed (see get_document for the kinds).`);
        }
        case 'set_adjustment': {
          const l = layerOf();
          if (!l.adjustment) return fail(`${l.name} is not an adjustment layer.`);
          const own = ({ grain: 'grainSettings', exposure: 'exposureSettings' } as Record<string, string>)[l.adjustment.kind];
          if (!own && !(PARAM_KINDS as string[]).includes(l.adjustment.kind)) return fail(`${l.name}'s settings are not set by parameters (${l.adjustment.kind}): set_adjustment takes the parametric adjustments, grain and exposure; apply_preset sets gradientMap, curves and levels from a preset.`);
          if (!a.params || typeof a.params !== 'object' || !Object.keys(a.params).length) return fail('Give params: the values to change, as add_adjustment takes them.');
          const key = own ?? 'params';
          e.edit('Adjustment', (q) => { const x = q.layer(l.id); if (x?.adjustment) q.updateLayer(l.id, { adjustment: { ...x.adjustment, data: { ...x.adjustment.data, [key]: { ...(x.adjustment.data[key] as object ?? {}), ...(a.params as object) } } } }); });
          return text(`Updated ${l.name}.`);
        }
        case 'apply_preset': {
          const kind = str('kind'), pick = str('name').trim();
          if (!pick) { const rows = presetList(kind || undefined); return text(`${rows.length} preset${rows.length === 1 ? '' : 's'}${kind ? ` for ${kind}` : ''}. ${brief(rows)}`, { presets: rows }); }
          if (!kind) return fail('Give kind: the adjustment the preset belongs to (grain, gradientMap, photoFilter, or the kind a saved preset was made for). Call apply_preset with no name to list them.');
          const patch = presetPatch(kind, pick);
          if (!patch) return fail(`No ${kind} preset is named ${pick}: call apply_preset with kind ${kind} and no name to list them.`);
          const existing = str('id') ? layerOf() : null;
          if (existing && existing.adjustment?.kind !== kind) return fail(`${existing.name} is ${existing.adjustment ? `a ${existing.adjustment.kind}` : 'not an adjustment'} layer, not ${kind}: leave id out to add a new ${kind} layer.`);
          const target = await inOneStep(e, `${patch.label} preset`, () => {
            const lid = existing?.id ?? e.addAdjustmentLayer(kind as Parameters<Engine['addAdjustmentLayer']>[0]);
            if (!lid) return null;
            e.edit('Adjustment', (q) => { const x = q.layer(lid); if (x?.adjustment) q.updateLayer(lid, { adjustment: { ...x.adjustment, data: { ...x.adjustment.data, [patch.key]: patch.merge ? { ...(x.adjustment.data[patch.key] as object ?? {}), ...(patch.value as object) } : structuredClone(patch.value) } } }); });
            return lid;
          });
          return target ? text(`Applied the ${patch.label} preset to ${e.current?.layer(target)?.name} (id ${target}).`, { id: target, preset: patch.label }) : fail(`${kind} is not an adjustment formvis has.`);
        }
        case 'depth_from_layer': {
          const l = str('id') ? layerOf() : e.activeLayer;
          if (!l || l.isGroup) return fail('Give id: a pixel layer from get_document (a group has no pixels of its own).');
          if (!(await depthReady())) return fail('Depth Anything V2 Small is not downloaded: the person can download it in Preferences > Plugins > Local models (99 MB).');
          const ok = await e.task(() => e.computeDepthMap(localDepth, { layer: l.id }));
          const dl = e.depthLayer();
          return ok && dl ? text(`Added the Depth Map layer (id ${dl.id}) read from ${l.name} alone: near is bright, far is dark.`, { id: dl.id, source: l.id }) : fail(`The depth could not be read from ${l.name}: see the formvis window for the reason.`);
        }
        case 'select_by_depth': {
          if (!(await depthReady())) return fail('Depth Anything V2 Small is not downloaded: the person can download it in Preferences > Plugins > Local models (99 MB).');
          const fine = str('quality') === 'detail';
          const d = await e.task(() => e.ensureDocDepth((i, w, h) => localDepthValues(i, w, h, fine), fine));
          if (!d) return fail('The depth could not be read: see the formvis window for the reason.');
          const c = str('combine');
          const ok = e.selectByDepth({ near: num('near', 100), far: num('far', 60), feather: num('feather', 10), mode: c === 'add' || c === 'subtract' || c === 'intersect' ? c : 'replace' });
          const s = e.current?.selection;
          return ok && s ? text(`Selected by depth: ${s.w} by ${s.h} at ${s.x}, ${s.y}.`) : fail('No pixels lie in that depth range.');
        }
        case 'match_edges': {
          const l = layerOf();
          if (!l.raster || l.isGroup) return fail(`${l.name} has no pixels to clean: rasterize_layer a text or shape layer first.`);
          e.selectLayer(l.id);
          const width = Math.min(20, Math.max(1, Math.round(num('width', 2)))), amount = Math.min(100, Math.max(0, num('decontaminate', 100)));
          await inOneStep(e, 'Match Edges', () => { e.matting('defringe', width); if (amount > 0) e.matting('decontaminate', 1, amount, Math.min(100, Math.max(1, num('radius', 6)))); });
          return text(`Cleaned the edge of ${l.name}: defringed ${width} px${amount > 0 ? `, decontaminated ${amount} percent` : ''}.`);
        }
        case 'realism_pass': {
          const l = layerOf(), steps: string[] = [], grain = str('grain') || 'iso400';
          if (!l.raster || l.isGroup) return fail(`${l.name} has no pixels: rasterize_layer a text or shape layer first.`);
          e.selectLayer(l.id);
          await inOneStep(e, 'Realism Pass', () => {
            if (a.colour !== false && e.colorMatch(l.id, 'beneath', Math.min(1, Math.max(0, num('amount', 0.8))))) steps.push('colors matched to what is beneath');
            if (a.edges !== false) { e.selectLayer(l.id); e.matting('defringe', 2); e.matting('decontaminate', 1, 100, 6); steps.push('edge defringed and decontaminated'); }
            const g = grain === 'none' ? null : presetPatch('grain', grain), lid = g ? e.addAdjustmentLayer('grain') : null;
            if (g && lid) { e.edit('Adjustment', (q) => { const x = q.layer(lid); if (x?.adjustment) q.updateLayer(lid, { adjustment: { ...x.adjustment, data: { ...x.adjustment.data, [g.key]: { ...(x.adjustment.data[g.key] as object ?? {}), ...(g.value as object) } } } }); }); steps.push(`a grain layer (${g.label}) on top`); }
          });
          return steps.length ? text(`Realism pass on ${l.name}: ${steps.join('; ')}. One undo step.`) : fail('Nothing was changed: color, edges and grain were all off or could not run.');
        }
        case 'compare': {
          const n = Math.min(50, Math.max(1, Math.round(num('steps', 1)))), layout = str('layout') || 'split', h = e.historySteps;
          if (!['split', 'side_by_side'].includes(layout)) return fail('layout is split or side_by_side.');
          if (h.current < n) return fail(`Only ${h.current} history step${h.current === 1 ? ' is' : 's are'} done, so there is no state ${n} step${n === 1 ? '' : 's'} back: use a smaller steps (list_history shows them).`);
          const copy = (s: Surface | null): Surface | null => { if (!s) return null; const c = createSurface(s.width, s.height); ctxOf(c).drawImage(s as CanvasImageSource, 0, 0); return c; };
          const after = copy(e.flattened());
          for (let i = 0; i < n; i++) e.undo();
          const before = copy(e.flattened());
          for (let i = 0; i < n; i++) e.redo();
          if (!before || !after) return fail('Nothing to compare.');
          const W = after.width, H = after.height, side = layout === 'side_by_side', pos = Math.min(95, Math.max(5, num('position', 50))) / 100, gap = side ? Math.max(4, Math.round(W / 200)) : 0;
          const out = createSurface(side ? W * 2 + gap : W, H), c = ctxOf(out);
          if (side) { c.fillStyle = '#808080'; c.fillRect(0, 0, out.width, out.height); c.drawImage(before as CanvasImageSource, 0, 0); c.drawImage(after as CanvasImageSource, W + gap, 0); }
          else {
            const cut = Math.round(W * pos);
            c.drawImage(after as CanvasImageSource, 0, 0);
            c.save(); c.beginPath(); c.rect(0, 0, cut, H); c.clip(); c.drawImage(before as CanvasImageSource, 0, 0); c.restore();
            c.fillStyle = '#ffffff'; c.fillRect(cut - 1, 0, 2, H);
          }
          const k = Math.min(1, num('max_size', 1024) / Math.max(out.width, out.height)), shown = createSurface(Math.max(1, Math.round(out.width * k)), Math.max(1, Math.round(out.height * k)));
          ctxOf(shown).drawImage(out as CanvasImageSource, 0, 0, shown.width, shown.height);
          return { content: [{ type: 'image', data: await b64(await toBlob(shown, 'image/png')), mimeType: 'image/png' }, { type: 'text', text: `Before (${n} step${n === 1 ? '' : 's'} back, "${h.names[h.current - n]}" undone) on the ${side ? 'left' : 'left of the white line'}, after (now) on the right; the history is back where it was. Shown at ${shown.width} by ${shown.height}.` }] };
        }
        case 'color_match': { const l = layerOf(); return e.colorMatch(l.id, str('to') === 'around' ? 'around' : 'beneath', num('amount', 1)) ? text(`Matched ${l.name}'s colors (a Curves layer clipped to it).`) : fail(`${l.name}'s colors could not be matched.`); }
        case 'add_film_layer': {
          const o = str('kind') === 'frame' ? { kind: 'frame' as const, style: (str('style') || 'film') as 'film' } : { kind: 'leak' as const, color: (str('color') || 'amber') as 'amber', from: (str('from') || 'left') as 'left', size: 60 }   /* a percentage, the Film Layer dialog's default */;
          e.addFilmLayer(o as Parameters<Engine['addFilmLayer']>[0]);
          return text(`Added ${e.activeLayer?.name} (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id });
        }
        case 'remove_background': {
          if (!this.deps.removeBackground) return fail('Remove Background is not available here.');
          await this.deps.removeBackground();
          return text(`Removed the background of ${e.activeLayer?.name}.`);
        }
        // Generative, local-first (1.53.3).
        case 'generative_fill': case 'generative_expand': {
          const prompt = str('prompt').trim(), want = str('model') || 'auto', what = name === 'generative_fill' ? 'Generative Fill' : 'Generative Expand';
          if (name === 'generative_fill' && !p.selection) return fail('Generative Fill needs a selection: call select, select_subject or select_color_range first.');
          const margins = { left: Math.round(num('left', 0)), top: Math.round(num('top', 0)), right: Math.round(num('right', 0)), bottom: Math.round(num('bottom', 0)) };
          if (name === 'generative_expand' && !(margins.left + margins.top + margins.right + margins.bottom)) return fail('Give at least one margin in pixels.');
          const lama = await modelReady('lama-inpaint'), krea = (await localModels()).some((m) => m.id === 'local:krea-2' && m.ready), fal = !!(await api.generativeStatus())?.configured;
          let pick = want, note = '';
          if (want === 'auto') {
            pick = !prompt ? (lama ? 'lama' : krea ? 'krea-2' : 'fal') : krea ? 'krea-2' : fal ? 'fal' : lama ? 'lama' : 'fal';
            if (pick === 'lama' && prompt) note = ' LaMa takes no prompt: it filled from the surroundings (no prompted model is set up here).';
          }
          if (pick === 'lama' && !lama) return fail('LaMa is not downloaded: the person can download it in Preferences > Plugins > Local models (about 208 MB).');
          if (pick === 'krea-2' && !krea) return fail('Krea 2 is not installed: Preferences > Plugins > Local models (Apple silicon or an NVIDIA GPU).');
          if (pick === 'fal') {
            if (!fal) return fail('Nothing can generate here yet: download LaMa (any computer, no prompt) or install Krea 2 in Preferences > Plugins > Local models, or add a fal key in Edit > Generative Fill.');
            if (!await this.deps.ask(`An agent asks to run ${what}`, `${prompt ? `Prompt: "${prompt}". ` : ''}This runs on fal and costs money.`)) return fail(`The person declined ${what} on fal.`);
          }
          let notice = '';
          const gen = pick === 'lama' ? localInpaint() : pick === 'krea-2' ? localFill('local:krea-2', prompt, num('influence', 0.4), (r) => { if (r.notice) { notice = ` ${r.notice}`; this.deps.note(r.notice); } }) : (image: Blob, mask: Blob) => api.generativeFill(image, mask, prompt);
          const ok = name === 'generative_fill' ? await e.task(() => e.generativeFill(prompt, gen)) : await e.task(() => e.generativeExpand(margins, prompt, gen));
          if (ok === false) return fail(`${what} did not complete: see the formvis window.`);
          return text(`${what} done with ${pick === 'lama' ? 'LaMa on this computer' : pick === 'krea-2' ? 'Krea 2 on this computer' : 'fal'}; the result is a new layer (id ${e.activeLayer?.id}).${note}${notice}`, { id: e.activeLayer?.id, model: pick });
        }
        case 'generate_image': {
          const prompt = str('prompt').trim(), want = str('model') || 'auto';
          if (!prompt) return fail('Give a prompt.');
          const locals = (await localModels()).filter((m) => m.ready), fal = !!(await api.generativeStatus())?.configured;
          const local = want === 'auto' ? locals.find((m) => m.id === 'local:krea-2') ?? locals[0] : want === 'fal' ? undefined : locals.find((m) => m.id === `local:${want}`);
          if (want !== 'auto' && want !== 'fal' && !local) return fail(`${want} is not installed: Preferences > Plugins > Local models.`);
          let blob: Blob, used: string, notice = '', generation: import('../engine/types').GenerationInfo | undefined;
          if (local) {
            const W = p.doc.width, H = p.doc.height, k = Math.min(1, 2048 / Math.max(W, H));
            const r = await runLocal({ generator: local.id, prompt, size: `${Math.max(256, Math.round(W * k / 16) * 16)}x${Math.max(256, Math.round(H * k / 16) * 16)}`, count: 1 });
            if (r.notice) { notice = ` ${r.notice}`; this.deps.note(r.notice); }
            blob = r.pictures[0]; generation = r.settings[0]; used = `${local.label} on this computer`;
          } else {
            if (!fal) return fail('Nothing can generate from a prompt here yet: install Krea 2 or FLUX.2 [klein] in Preferences > Plugins > Local models (Apple silicon or an NVIDIA GPU), or add a fal key in Edit > Generate Image.');
            if (!await this.deps.ask('An agent asks to run Generate Image', `Prompt: "${prompt}". This runs on fal and costs money.`)) return fail('The person declined Generate Image on fal.');
            blob = await api.generateImage(prompt, p.doc.width, p.doc.height); used = 'fal';
          }
          const bmp = await createImageBitmap(blob), r = new Raster(p.doc.width, p.doc.height);
          r.ctx.drawImage(bmp, 0, 0, p.doc.width, p.doc.height); bmp.close(); r.touch();
          e.insertRasterLayer(r, 'Generated Image', 0, 0, generation ? { generation } : {}, 'Generate Image');
          return text(`Generated with ${used}; the result is a new layer (id ${e.activeLayer?.id}).${notice}`, { id: e.activeLayer?.id });
        }
        case 'upscale': {
          const scale = num('scale', 2) >= 4 ? 4 : 2, want = str('model') || 'auto', here = await modelReady('ai-upscale');
          const local = want === 'local' || (want === 'auto' && here);
          if (local && !here) return fail('Real-ESRGAN is not downloaded: Preferences > Plugins > Local models (about 67 MB).');
          if (!local) {
            if (!(await api.generativeStatus())?.configured) return fail('Real-ESRGAN is not downloaded here and fal has no key: download it in Preferences > Plugins > Local models (about 67 MB).');
            if (!await this.deps.ask(`An agent asks to upscale ${scale}x`, 'This runs on fal and costs money.')) return fail('The person declined upscaling on fal.');
          }
          const ok = await e.task(() => e.upscaleToDocument(scale, local ? localUpscale(scale) : (image) => api.upscale(image, scale)));
          return ok === false ? fail('Upscale did not complete: see the formvis window.') : text(`Upscaled ${scale}x ${local ? 'on this computer' : 'on fal'} into a new document, ${e.current?.doc.width} by ${e.current?.doc.height}, now the one tools act on.`, { id: e.current?.id });
        }
        case 'get_selection': {
          const s = p.selection, data = { selection: s ? { x: s.x, y: s.y, width: s.w, height: s.h } : null };
          return text(s ? `The selection is ${s.w} by ${s.h} at ${s.x}, ${s.y}.` : 'Nothing is selected.', data);
        }
        case 'get_layer_tree': {
          const doc = (await this.run('get_document', {})).structuredContent as { activeLayerId: string | null; layers: Array<{ id: string; name: string; kind: string; visible: boolean; parentId: string | null }> };
          type Node = { id: string; name: string; kind: string; visible: boolean; children: Node[] };
          const nodes = new Map<string, Node>(), roots: Node[] = [];
          for (const l of doc.layers) nodes.set(l.id, { id: l.id, name: l.name, kind: l.kind, visible: l.visible, children: [] });
          for (const l of doc.layers) (nodes.get(l.parentId ?? '')?.children ?? roots).push(nodes.get(l.id) as Node);
          const data = { activeLayerId: doc.activeLayerId, layers: roots };
          return text(JSON.stringify(data), data);
        }
        case 'select_mask': {
          const src = str('source') || 'transparency', mode = str('mode') || 'replace';
          if (!['transparency', 'mask', 'vector'].includes(src) || !['replace', 'add', 'subtract', 'intersect'].includes(mode)) return fail('source is transparency, mask or vector; mode is replace, add, subtract or intersect.');
          if (str('id')) e.selectLayer(layerOf().id);
          const l = e.activeLayer;
          if (!l) return fail('There is no layer: call get_document.');
          if (src === 'mask' && !l.mask) return fail(`${l.name} has no layer mask.`);
          if (src === 'vector' && !l.vectorMask) return fail(`${l.name} has no vector mask.`);
          e.loadSelection({ channel: src as 'transparency' }, a.invert === true, mode as 'replace');
          const s = e.current?.selection;
          return s ? text(`Selected from ${l.name}'s ${src}: ${s.w} by ${s.h} at ${s.x}, ${s.y}.`, { x: s.x, y: s.y, width: s.w, height: s.h }) : fail(`${l.name}'s ${src} selects nothing.`);
        }
        // Layout boxes, depth, crop, sampling and mask files (1.88.8).
        case 'boxes_list': {
          const list = p.doc.boxes ?? [], boxes = list.map((b) => ({ id: b.id, kind: b.kind, name: b.name, text: b.text, x: b.x, y: b.y, width: b.w, height: b.h })), warnings = boxWarnings(list, p.doc.width, p.doc.height);
          return text(list.length ? `${boxesText(list, p.doc)}${warnings.length ? `\nWarnings: ${warnings.join(' ')}` : ''}` : 'The document has no layout boxes: boxes_add draws one.', { boxes, warnings, max: MAX_BOXES });
        }
        case 'boxes_add': case 'boxes_from_selection': {
          if (a.kind !== undefined && !BOX_KINDS.some((k) => k.id === a.kind)) return fail(`kind is ${BOX_KINDS.map((k) => k.id).join(', ')}.`);
          const kind = (str('kind') || 'new') as BoxKind;
          if ((p.doc.boxes?.length ?? 0) >= MAX_BOXES) return fail(`A picture holds at most ${MAX_BOXES} boxes: boxes_remove or boxes_clear first.`);
          let id: string | null;
          if (name === 'boxes_from_selection') {
            if (!p.selection) return fail('There is no selection: call select, select_subject or select_color_range first.');
            id = e.addBox(p.selection.rect, kind, str('text'));
          } else {
            if (typeof a.width !== 'number' || typeof a.height !== 'number' || !(a.width > 0) || !(a.height > 0)) return fail('Give x, y, width and height in document pixels.');
            id = e.addBox({ x: num('x', 0), y: num('y', 0), w: a.width, h: a.height }, kind, str('text'));
          }
          const b = id ? p.doc.boxes?.find((x) => x.id === id) : undefined;
          return b ? text(`Added ${b.name} (id ${b.id}): ${b.w} by ${b.h} at ${b.x}, ${b.y}.`, { id: b.id, name: b.name, kind: b.kind, x: b.x, y: b.y, width: b.w, height: b.h }) : fail('The box could not be added.');
        }
        case 'boxes_set': {
          const b = p.doc.boxes?.find((x) => x.id === str('id'));
          if (!b) return fail(`No box has the id ${str('id')}: call boxes_list for the ids.`);
          if (a.kind !== undefined && !BOX_KINDS.some((k) => k.id === a.kind)) return fail(`kind is ${BOX_KINDS.map((k) => k.id).join(', ')}.`);
          const patch: Record<string, unknown> = {};
          if (a.kind !== undefined) patch.kind = a.kind;
          if (typeof a.text === 'string') patch.text = a.text;
          if (typeof a.name === 'string' && a.name.trim()) patch.name = a.name.trim();
          for (const [k, to] of [['x', 'x'], ['y', 'y'], ['width', 'w'], ['height', 'h']] as const) if (typeof a[k] === 'number') patch[to] = a[k];
          if (!Object.keys(patch).length) return fail('Give at least one of kind, text, name, x, y, width, height.');
          e.setBox(b.id, patch as Parameters<Engine['setBox']>[1]);
          const n = p.doc.boxes?.find((x) => x.id === b.id) ?? b;
          return text(`${n.name} is ${n.kind}, ${n.w} by ${n.h} at ${n.x}, ${n.y}.`, { id: n.id, name: n.name, kind: n.kind, text: n.text, x: n.x, y: n.y, width: n.w, height: n.h });
        }
        case 'boxes_remove': {
          const b = p.doc.boxes?.find((x) => x.id === str('id'));
          if (!b) return fail(`No box has the id ${str('id')}: call boxes_list for the ids.`);
          e.removeBox(b.id);
          return text(`Removed ${b.name}; ${p.doc.boxes?.length ?? 0} left.`);
        }
        case 'boxes_clear': {
          const n = p.doc.boxes?.length ?? 0;
          if (!n) return text('The document has no layout boxes.');
          e.clearBoxes();
          return text(`Removed all ${n} box${n === 1 ? '' : 'es'}.`);
        }
        case 'sample_box': {
          const b = str('id') ? p.doc.boxes?.find((x) => x.id === str('id')) : undefined;
          if (str('id') && !b) return fail(`No box has the id ${str('id')}: call boxes_list for the ids.`);
          const flat = e.flattened();
          if (!flat) return fail('Nothing to sample.');
          const x0 = Math.max(0, Math.round(b ? b.x : num('x', 0))), y0 = Math.max(0, Math.round(b ? b.y : num('y', 0)));
          const x1 = Math.min(flat.width, Math.round((b ? b.x + b.w : num('x', 0) + num('width', 0)))), y1 = Math.min(flat.height, Math.round((b ? b.y + b.h : num('y', 0) + num('height', 0))));
          if (x1 <= x0 || y1 <= y0) return fail('Give a box id from boxes_list, or x, y, width and height in document pixels inside the picture.');
          const d = ctxOf(flat).getImageData(x0, y0, x1 - x0, y1 - y0).data;
          let r = 0, g = 0, bl = 0, w = 0;
          for (let i = 0; i < d.length; i += 4) { const al = d[i + 3]; r += d[i] * al; g += d[i + 1] * al; bl += d[i + 2] * al; w += al; }
          if (!w) return fail('That area is fully transparent.');
          const c = { r: Math.round(r / w), g: Math.round(g / w), b: Math.round(bl / w) }, code = `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`, opaque = Math.round(w / (255 * d.length / 4) * 1000) / 1000;
          return text(`The average color of ${x1 - x0} by ${y1 - y0} at ${x0}, ${y0} is ${code} (${c.r}, ${c.g}, ${c.b}), ${Math.round(opaque * 100)} percent opaque.`, { hex: code, ...c, opaque, x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
        }
        case 'frequency_separation': {
          const radius = num('radius', 8);
          if (!(radius >= 0.5 && radius <= 100)) return fail('radius is 0.5 to 100 pixels.');
          if (!e.frequencySeparation(radius)) return fail('There is nothing to separate.');
          const named = (n: string) => [...p.doc.layers].reverse().find((l) => l.name === n), lo = named('Low Frequency'), hi = named('High Frequency');
          return text(`Split at ${radius} pixels: Low Frequency (id ${lo?.id}) holds color and tone, High Frequency (id ${hi?.id}, Linear Light) holds the detail. Retouch each alone; together they look as the picture did.`, { low: lo?.id, high: hi?.id, radius });
        }
        case 'sample_depth': {
          const l = e.depthLayer(p);
          if (!l) return fail('This document has no Depth Map layer: compute one first (run_command depth-map-from-layer or compute-depth-map), or name a gray layer Depth Map.');
          const x = Math.floor(num('x', -1)), y = Math.floor(num('y', -1)), n = Math.max(1, Math.min(101, Math.round(num('size', 1))));
          if (x < 0 || y < 0 || x >= p.doc.width || y >= p.doc.height) return fail(`x and y must lie inside the picture (0 to ${p.doc.width - 1}, 0 to ${p.doc.height - 1}).`);
          const s = e.renderLayerAlone(l.id), half = Math.floor(n / 2), x0 = Math.max(0, x - half), y0 = Math.max(0, y - half), x1 = Math.min(s.width, x - half + n), y1 = Math.min(s.height, y - half + n);
          const d = ctxOf(s).getImageData(x0, y0, x1 - x0, y1 - y0).data;
          let sum = 0, w = 0;
          for (let i = 0; i < d.length; i += 4) { sum += d[i] * d[i + 3]; w += d[i + 3]; }
          if (!w) return fail(`${l.name} is transparent at ${x}, ${y}.`);
          const v = Math.round(sum / w), norm = Math.round(v / 255 * 1000) / 1000;
          return text(`Depth at ${x}, ${y}: ${v} of 255 (${norm}); near is bright, far is dark.`, { x, y, value: v, normalized: norm, size: n, layer: l.id });
        }
        case 'depth_edit': {
          const kind = str('kind') as Parameters<Engine['correctDepthMap']>[0];
          if (!['flatten', 'nearer', 'farther', 'smooth'].includes(kind)) return fail('kind is flatten, nearer, farther or smooth.');
          const smooth = kind === 'smooth', edges = smooth && a.edges === true, amount = smooth ? num('radius', 4) : num('amount', kind === 'flatten' ? 50 : 10);
          if (smooth ? !(amount >= 1 && amount <= (edges ? 9 : 32)) : !(amount >= 1 && amount <= 100)) return fail(smooth ? `radius is 1 to ${edges ? 9 : 32} pixels${edges ? ' with edges' : ''}.` : 'amount is 1 to 100 percent.');
          let said = '';
          const off = e.on('notice', (n) => { said = (n as { text?: string } | null)?.text ?? said; });
          let ok: boolean;
          try { ok = e.correctDepthMap(kind, smooth ? amount : amount / 100, edges); } finally { off?.(); }
          return ok ? text(`${{ flatten: 'Flattened', nearer: 'Brought nearer', farther: 'Pushed farther', smooth: edges ? 'Smoothed to the picture\'s edges' : 'Smoothed' }[kind as 'flatten' | 'nearer' | 'farther' | 'smooth']} the depth map${smooth ? ` (radius ${amount})` : ` by ${amount} percent`}${p.selection ? ', inside the selection' : ''}.`) : fail(said || 'The depth map could not be changed.');
        }
        case 'set_crop': {
          if (typeof a.width !== 'number' || typeof a.height !== 'number' || !(a.width >= 1) || !(a.height >= 1)) return fail('Give x, y, width and height of the frame in document pixels.');
          const rect = { x: num('x', 0), y: num('y', 0), w: a.width, h: a.height }, angle = num('angle', 0), ca = a.content_aware === true;
          if (!(angle >= -45 && angle <= 45)) return fail('angle is -45 to 45 degrees.');
          const ow = a.output_width, oh = a.output_height;
          if ((ow === undefined) !== (oh === undefined)) return fail('Give both output_width and output_height, or neither.');
          if (ow !== undefined && (typeof ow !== 'number' || typeof oh !== 'number' || !(ow >= 1) || !(oh >= 1))) return fail('output_width and output_height are pixel counts of at least 1.');
          const ok = ow !== undefined ? e.cropToSize(rect, angle, ca, ow as number, oh as number, num('resolution', p.doc.resolution ?? 72)) : e.straightenCrop(rect, angle, ca);
          const q = e.current?.doc;
          return ok ? text(`Cropped to ${q?.width} by ${q?.height}${angle ? `, straightened ${angle} degrees` : ''}${ow !== undefined ? ` at ${q?.resolution} ppi` : ''}.`, { width: q?.width, height: q?.height }) : fail('That frame is empty or larger than formvis allows.');
        }
        case '__mask': {
          const src = str('source') || 'selection', W = p.doc.width, H = p.doc.height;
          if (!['selection', 'layer_mask', 'layer_pixels'].includes(src)) return fail('source is selection, layer_mask or layer_pixels.');
          let m: SelectionMask | null;
          if (src === 'selection') m = p.selection;
          else { const l = layerOf(); if (src === 'layer_mask' && !l.mask) return fail(`${l.name} has no layer mask.`); m = e.coverageOf(l.id, src === 'layer_mask'); }
          if (!m) return fail(src === 'selection' ? 'Nothing is selected: call select first.' : 'That layer shows nothing, so there is no mask to write.');
          const s = createSurface(W, H), c = ctxOf(s), img = c.createImageData(W, H), px = img.data;
          for (let i = 3; i < px.length; i += 4) px[i] = 255;
          for (let j = Math.max(0, -m.y); j < m.h && m.y + j < H; j++) for (let i = Math.max(0, -m.x); i < m.w && m.x + i < W; i++) {
            const v = m.data[j * m.w + i], o = ((m.y + j) * W + m.x + i) * 4;
            px[o] = v; px[o + 1] = v; px[o + 2] = v;
          }
          c.putImageData(img, 0, 0);
          return text('The mask.', { data: await b64(await toBlob(s, 'image/png')), width: W, height: H });
        }
        case '__layer': {
          const l = layerOf();
          if (l.isGroup) return fail(`${l.name} is a group: give a layer.`);
          const s = e.renderLayerAlone(l.id);
          let out: Surface = s;
          if (a.trim === true) {
            const d = ctxOf(s).getImageData(0, 0, s.width, s.height).data;
            let x0 = s.width, y0 = s.height, x1 = -1, y1 = -1;
            for (let j = 0; j < s.height; j++) for (let i = 0; i < s.width; i++) if (d[(j * s.width + i) * 4 + 3] > 0) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
            if (x1 < 0) return fail(`${l.name} shows nothing, so there is nothing to write.`);
            out = createSurface(x1 - x0 + 1, y1 - y0 + 1);
            ctxOf(out).drawImage(s as CanvasImageSource, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
          }
          return text('The layer.', { data: await b64(await toBlob(out, 'image/png')), width: out.width, height: out.height });
        }
        case 'set_active_layer': {
          const ids = [...new Set(Array.isArray(a.ids) ? (a.ids as unknown[]).map(String) : [])], miss = ids.filter((id) => !p.layer(id));
          if (!ids.length) return fail('Give ids: layer ids from get_document.');
          if (miss.length) return fail(`No layer has the id ${miss.join(', ')}: call get_document for the ids.`);
          ids.forEach((id, i) => { if (i === 0 && a.add !== true) e.selectLayer(id); else if (!p.selectedIds.has(id)) e.selectLayer(id, 'toggle'); });
          const sel = [...p.selectedIds];
          return text(`${sel.length} layer${sel.length === 1 ? '' : 's'} selected; the active layer is ${p.activeLayer?.name}.`, { selected: sel, active: p.activeId });
        }
        case 'select_color': {
          const x = Math.floor(num('x', -1)), y = Math.floor(num('y', -1));
          if (x < 0 || y < 0 || x >= p.doc.width || y >= p.doc.height) return fail(`x and y must lie inside the picture (0 to ${p.doc.width - 1}, 0 to ${p.doc.height - 1}).`);
          const was = { ...e.wand }, before = p.selection;
          e.setWand({ tolerance: Math.min(255, Math.max(0, Math.round(num('tolerance', 32)))), contiguous: a.contiguous !== false, sampleAll: str('source') === 'merged' });
          try { await e.magicWand({ x, y }, modeOf(a.mode)); } finally { e.setWand(was); }
          const s = e.current?.selection;
          return s && s !== before ? text(`Selected the color at ${x}, ${y}: ${s.w} by ${s.h} at ${s.x}, ${s.y}.`, { x: s.x, y: s.y, width: s.w, height: s.h }) : fail(`Nothing was selected at ${x}, ${y}: raise tolerance, or check that source ${str('source') || 'layer'} has pixels there.`);
        }
        case 'select_shape': {
          const shape = str('shape'), feather = Math.min(1000, Math.max(0, num('feather', 0)));
          let m: SelectionMask | null;
          if (shape === 'polygon') {
            const pts = (Array.isArray(a.points) ? a.points as Array<{ x?: unknown; y?: unknown }> : []).filter((q) => typeof q?.x === 'number' && typeof q?.y === 'number').map((q) => ({ x: q.x as number, y: q.y as number }));
            if (pts.length < 3) return fail('A polygon needs points: at least 3 objects { x, y } in document pixels.');
            const x0 = Math.floor(Math.min(...pts.map((q) => q.x))), y0 = Math.floor(Math.min(...pts.map((q) => q.y))), w = Math.max(1, Math.ceil(Math.max(...pts.map((q) => q.x))) - x0), h = Math.max(1, Math.ceil(Math.max(...pts.map((q) => q.y))) - y0);
            if (w * h > 100_000_000) return fail('The polygon is larger than formvis can select at once.');
            const s = createSurface(w, h), c = ctxOf(s);
            c.fillStyle = '#ffffff'; c.beginPath();
            pts.forEach((q, i) => (i ? c.lineTo(q.x - x0, q.y - y0) : c.moveTo(q.x - x0, q.y - y0)));
            c.closePath(); c.fill();
            const d = c.getImageData(0, 0, w, h).data, bits = new Uint8Array(w * h);
            for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4 + 3];
            m = SelectionMask.cropped(x0, y0, w, h, bits);
          } else if (shape === 'rectangle' || shape === 'ellipse') {
            if (typeof a.width !== 'number' || typeof a.height !== 'number') return fail('Give x, y, width and height in document pixels.');
            const x = Math.round(num('x', 0)), y = Math.round(num('y', 0)), w = Math.max(1, Math.round(a.width)), h = Math.max(1, Math.round(a.height)), bits = new Uint8Array(w * h);
            if (shape === 'ellipse') { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const u = (i + 0.5) / w * 2 - 1, v = (j + 0.5) / h * 2 - 1; if (u * u + v * v <= 1) bits[j * w + i] = 255; } }
            else bits.fill(255);
            m = SelectionMask.cropped(x, y, w, h, bits);
          } else return fail('shape is rectangle, ellipse or polygon.');
          if (m && feather > 0) m = e.featherMask(m, feather) ?? m;
          if (!m) return fail('The shape selects nothing inside the picture.');
          e.applySelection(m,modeOf(a.mode), shape === 'polygon' ? 'Polygon Selection' : shape === 'ellipse' ? 'Elliptical Marquee' : 'Rectangular Marquee');
          const s = e.current?.selection;
          return s ? text(`The selection is now ${s.w} by ${s.h} at ${s.x}, ${s.y}${feather > 0 ? `, feathered ${feather} pixels` : ''}.`, { x: s.x, y: s.y, width: s.w, height: s.h }) : fail('The shape selects nothing inside the picture.');
        }
        case 'select_range': {
          const kind = str('kind'), mode = modeOf(a.mode), lo = Math.round(num('lo', 0)), hi = Math.round(num('hi', 255)), fz = Math.min(200, Math.max(0, num('fuzziness', 40))), before = p.selection;
          if (lo > hi) return fail('lo must not be above hi.');
          if (kind === 'luminosity') {
            const l = e.activeLayer;
            if (str('source') !== 'merged' && !l) return fail('There is no active layer: call set_layer with active true, or use source merged.');
            const src = str('source') === 'merged' ? e.flattened() : e.renderLayerAlone((l as NonNullable<typeof l>).id), W = p.doc.width, H = p.doc.height;
            if (!src || src.width !== W || src.height !== H) return fail('That source cannot be read at the document size.');
            const d = ctxOf(src).getImageData(0, 0, W, H).data, bits = new Uint8Array(W * H), ramp = Math.max(1, fz);
            for (let i = 0; i < bits.length; i++) {
              const o = i * 4, v = 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2], wt = Math.min(1, Math.max(0, 1 - Math.max(lo - v, v - hi, 0) / ramp)), k = Math.round(255 * wt * d[o + 3] / 255);
              bits[i] = a.invert === true ? 255 - k : k;
            }
            if (!bits.some((v) => v)) return fail(`No pixels have a luminosity from ${lo} to ${hi}: widen lo and hi, or raise fuzziness.`);
            e.applySelection(SelectionMask.cropped(0, 0, W, H, bits), mode, 'Luminosity Range');
          } else {
            const c = hex(a.color);
            if (kind === 'color' && !c) return fail('kind color needs color as #rrggbb.');
            if (kind === 'depth' && !e.depthLayer()) return fail('This document has no Depth Map layer: run_command compute-depth-map first.');
            let said = '';
            const off = e.on('notice', (n) => { said = (n as { text?: string } | null)?.text ?? said; });
            try { e.selectColorRange({ mode: (kind === 'color' ? 'sampled' : kind) as 'sampled', plus: c ? [c] : [], minus: [], fuzziness: fz, invert: a.invert === true, combine: mode, lo, hi }); } finally { off?.(); }
            if (e.current?.selection === before) return fail(said || `Nothing matched kind ${kind}.`);
          }
          const s = e.current?.selection;
          return s ? text(`Selected the ${kind} range: ${s.w} by ${s.h} at ${s.x}, ${s.y}.`, { x: s.x, y: s.y, width: s.w, height: s.h }) : fail(`Nothing matched kind ${kind}.`);
        }
        case 'sample_mean_color': {
          let src: Surface | null;
          if (str('id')) { const l = layerOf(); if (l.isGroup) return fail(`${l.name} is a group: give a layer, or leave id out.`); src = e.renderLayerAlone(l.id); } else src = e.flattened();
          if (!src) return fail('Nothing to sample.');
          const sel = p.selection, x0 = sel ? Math.max(0, sel.x) : 0, y0 = sel ? Math.max(0, sel.y) : 0, x1 = sel ? Math.min(src.width, sel.x + sel.w) : src.width, y1 = sel ? Math.min(src.height, sel.y + sel.h) : src.height;
          if (x1 <= x0 || y1 <= y0) return fail('The selection lies outside the picture.');
          const bw = x1 - x0, d = ctxOf(src).getImageData(x0, y0, bw, y1 - y0).data;
          let r = 0, g = 0, bl = 0, ws = 0, as = 0, n = 0;
          for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
            const o = ((j - y0) * bw + (i - x0)) * 4, m = sel ? (sel.data[(j - sel.y) * sel.w + (i - sel.x)] ?? 0) / 255 : 1;
            if (!m) continue;
            const w = m * d[o + 3]; n += m; as += w / 255; ws += w; r += d[o] * w; g += d[o + 1] * w; bl += d[o + 2] * w;
          }
          if (!ws) return fail('That area is fully transparent or not selected.');
          const c = { r: Math.round(r / ws), g: Math.round(g / ws), b: Math.round(bl / ws) }, code = `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`, opaque = Math.round(as / n * 1000) / 1000;
          return text(`The mean color of ${sel ? 'the selection' : 'the picture'}${str('id') ? ` (layer ${str('id')})` : ''} is ${code} (${c.r}, ${c.g}, ${c.b}), ${Math.round(opaque * 100)} percent opaque.`, { hex: code, ...c, opaque, pixels: Math.round(n) });
        }
        case 'align_layers': case 'group_layers': {
          if (Array.isArray(a.ids)) {
            const ids = [...new Set((a.ids as unknown[]).map(String))], miss = ids.filter((id) => !p.layer(id));
            if (miss.length) return fail(`No layer has the id ${miss.join(', ')}: call get_document for the ids.`);
            ids.forEach((id, i) => (i ? e.selectLayer(id, 'toggle') : e.selectLayer(id)));
          } else if (name === 'group_layers' || !p.selectedIds.size) return fail('Give ids: layer ids from get_document.');
          if (name === 'group_layers') {
            e.groupLayers(str('name') || undefined);
            const g = e.activeLayer;
            return g?.isGroup ? text(`Grouped into ${g.name} (id ${g.id}).`, { id: g.id }) : fail('The layers could not be grouped.');
          }
          const edges = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'], spread = [...edges, 'hspace', 'vspace'];
          if (!str('align') && !str('distribute')) return fail('Give align (left, hcenter, right, top, vcenter, bottom) or distribute (those, or hspace, vspace).');
          if ((str('align') && !edges.includes(str('align'))) || (str('distribute') && !spread.includes(str('distribute')))) return fail('align is left, hcenter, right, top, vcenter or bottom; distribute is also hspace or vspace.');
          const to = ['auto', 'selection', 'canvas'].includes(str('to')) ? str('to') as 'auto' : 'auto', was = e.alignTo;
          let said = '';
          const off = e.on('notice', (n) => { said = (n as { text?: string } | null)?.text ?? said; });
          e.alignTo = to;
          try { if (str('align')) e.alignLayers(str('align') as 'left'); if (str('distribute') && !said) e.distributeLayers(str('distribute') as 'left'); } finally { off?.(); e.alignTo = was; }
          if (said) return fail(said);
          const boxes = [...p.selectedIds].map((id) => { const t = p.layer(id)?.transform; return { id, x: Math.round(t?.x ?? 0), y: Math.round(t?.y ?? 0), width: Math.round(t?.w ?? 0), height: Math.round(t?.h ?? 0) }; });
          return text(`${str('align') ? `Aligned ${str('align')}` : ''}${str('align') && str('distribute') ? ' and ' : ''}${str('distribute') ? `Distributed ${str('distribute')}` : ''} ${boxes.length} layers.`, { layers: boxes });
        }
        case 'set_group': {
          const g = layerOf();
          if (!g.isGroup) return fail(`${g.name} is not a group: call get_layer_tree for the groups.`);
          if (typeof a.name === 'string' && a.name !== g.name) e.renameLayer(g.id, a.name);
          if (typeof a.visible === 'boolean' && a.visible !== (g.visible !== false)) e.toggleVisibility(g.id);
          if (typeof a.locked === 'boolean') { e.selectLayer(g.id); e.setLocks({ all: a.locked }); }
          if (typeof a.collapsed === 'boolean' && a.collapsed !== p.collapsed.has(g.id)) e.toggleCollapsed(g.id);
          const n = p.layer(g.id);
          return text(`${n?.name}: ${n?.visible === false ? 'hidden' : 'shown'}, ${n?.locks?.all ? 'locked' : 'unlocked'}, ${p.collapsed.has(g.id) ? 'collapsed' : 'open'}.`, { id: g.id, name: n?.name, visible: n?.visible !== false, locked: !!n?.locks?.all, collapsed: p.collapsed.has(g.id) });
        }
        case 'set_mask': {
          const l = layerOf(), act = str('action');
          e.selectLayer(l.id);
          const mask = () => p.layer(l.id)?.mask ?? null;
          if (act === 'reveal_all' || act === 'hide_all') e.addMask(act === 'hide_all', false);
          else if (act === 'reveal_selection' || act === 'hide_selection') {
            if (l.mask) return fail(`${l.name} has a mask already: delete it first, or use invert or copy_from.`);
            if (!p.selection) return fail('There is no selection: call select, select_shape or select_subject first.');
            e.addMask(act === 'hide_selection', true);
          } else if (act === 'enable' || act === 'disable') {
            if (!l.mask) return fail(`${l.name} has no layer mask.`);
            if (l.mask.enabled !== (act === 'enable')) e.toggleMaskEnabled();
          } else if (act === 'delete' || act === 'apply') {
            if (!l.mask) return fail(`${l.name} has no layer mask.`);
            e.deleteMask(act === 'apply');
          } else if (act === 'invert') {
            const w = l.raster?.width ?? p.doc.width, h = l.raster?.height ?? p.doc.height;
            if (!l.mask) return fail(`${l.name} has no layer mask.`);
            e.edit('Invert Layer Mask', (q) => {
              const x = q.layer(l.id);
              if (!x?.mask) return false;
              const r = new Raster(x.mask.raster?.width ?? w, x.mask.raster?.height ?? h), img = r.read(), src = x.mask.raster?.read().data;
              for (let o = 0; o < img.data.length; o += 4) { img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = src ? 255 - src[o + 3] : 0; }
              r.write(img);
              q.updateLayer(l.id, { mask: { ...x.mask, raster: r } });
            });
          } else if (act === 'copy_from') {
            const from = p.layer(str('from_id'));
            if (!from?.mask) return fail(`from_id must be a layer that has a mask (call get_document for the ids).`);
            e.copyMask(from.id, l.id);
          } else return fail('action is reveal_all, hide_all, reveal_selection, hide_selection, enable, disable, invert, delete, apply or copy_from.');
          const m = mask();
          return text(`${l.name}: ${m ? `${m.enabled ? 'mask on' : 'mask off'}` : 'no mask'}.`, { id: l.id, mask: !!m, enabled: m?.enabled ?? null });
        }
        case 'set_text': {
          const l = layerOf();
          if (!l.text || !liveText(l)) return fail(`${l.name} is not a live text layer (it may be rasterized): add_text makes one.`);
          const spec = { ...l.text };
          if (typeof a.text === 'string') spec.content = a.text;
          if (typeof a.font === 'string' && a.font) spec.family = a.font;
          if (typeof a.size === 'number') spec.size = a.size;
          if (a.color !== undefined) { const c = hex(a.color); if (!c) return fail('color must be #rrggbb.'); spec.color = c; }
          if (typeof a.bold === 'boolean') spec.bold = a.bold;
          if (typeof a.italic === 'boolean') spec.italic = a.italic;
          if (['left', 'center', 'right', 'justify'].includes(str('align'))) spec.align = str('align') as 'left';
          if (typeof a.line_height === 'number') spec.lineHeight = a.line_height;
          if (typeof a.tracking === 'number') spec.tracking = a.tracking;
          await e.updateTextLayer(l.id, spec);
          if (typeof a.angle === 'number') { e.selectLayer(l.id); e.setLayerTransform({ rotation: a.angle }, 'Transform Layer'); }
          const n = p.layer(l.id);
          return text(`Updated ${n?.name}: "${n?.text?.content.slice(0, 60)}", ${n?.text?.family} ${n?.text?.size}.`, { id: l.id, content: n?.text?.content, family: n?.text?.family, size: n?.text?.size, rotation: n?.transform.rotation ?? 0 });
        }
        case 'list_history': {
          const h = e.historySteps, steps = h.names.map((n, i) => ({ index: i, name: n, done: i < h.current })).slice(-200), snaps = e.snapshots.map((s) => ({ id: s.id, name: s.name, kind: s.kind, bytes: s.bytes }));
          return text(`${h.names.length} steps, ${h.current} done; ${snaps.length} snapshot${snaps.length === 1 ? '' : 's'}. ${brief({ steps: steps.slice(-30), snapshots: snaps })}`, { current: h.current, count: h.names.length, steps, snapshots: snaps });
        }
        case 'take_snapshot': {
          const had = new Set(e.snapshots.map((s) => s.id)), kind = (['document', 'merged', 'layer'].includes(str('kind')) ? str('kind') : 'document') as 'document';
          let said = '';
          const off = e.on('notice', (n) => { said = (n as { text?: string } | null)?.text ?? said; });
          try { e.takeSnapshot(str('name') || undefined, kind); } finally { off?.(); }
          const s = e.snapshots.find((x) => !had.has(x.id));
          return s ? text(`Took the snapshot ${s.name} (id ${s.id}).`, { id: s.id, name: s.name, kind: s.kind, bytes: s.bytes }) : fail(said || 'No snapshot was taken: the document may be too large to keep one.');
        }
        case 'restore_snapshot': case 'delete_snapshot': {
          const all = e.snapshots, hit = str('id') ? all.find((s) => s.id === str('id')) : str('name') ? [...all].reverse().find((s) => s.name === str('name')) : undefined;
          if (!hit) return fail(`No snapshot has that ${str('id') ? 'id' : 'name'}: list_history shows the snapshots.`);
          if (name === 'restore_snapshot') e.revertToSnapshot(hit.id); else e.deleteSnapshot(hit.id);
          return text(`${name === 'restore_snapshot' ? 'Returned to' : 'Deleted'} the snapshot ${hit.name}.`, { id: hit.id, name: hit.name });
        }
        case 'extend_canvas': {
          const l = Math.round(num('left', 0)), t = Math.round(num('top', 0)), r = Math.round(num('right', 0)), b = Math.round(num('bottom', 0)), f = str('fill') || 'transparent';
          if (!(l || t || r || b)) return fail('Give at least one of left, top, right, bottom in pixels.');
          const col = f === 'transparent' ? null : f === 'foreground' ? e.fg : f === 'background' ? e.bg : hex(f);
          if (f !== 'transparent' && !col) return fail('fill is transparent, #rrggbb, foreground or background.');
          const w = p.doc.width + l + r, h = p.doc.height + t + b;
          return e.resizeCanvas(w, h, l, t, col, 'Extend Canvas') ? text(`The canvas is ${w} by ${h}: ${l} left, ${t} top, ${r} right, ${b} bottom added.`, { width: w, height: h }) : fail('The canvas size is outside what formvis allows.');
        }
        case 'add_filter': {
          const l = str('id') ? layerOf() : e.activeLayer;
          if (!l) return fail('There is no layer: give id from get_document.');
          if (l.isGroup || l.adjustment || l.fillContent || l.text || l.shape) return fail(`${l.name} is not a pixel layer: rasterize_layer a text or shape layer first.`);
          const kind = str('kind'), settings = filterSettings(kind, (a.settings && typeof a.settings === 'object' ? a.settings : {}) as Record<string, unknown>);
          if (!filterKnown(kind)) return fail(`${kind} is not a filter formvis can keep editable: use a kind from apply_filter (not average).`);
          e.selectLayer(l.id);
          if (!l.smart) e.convertToSmartObject();
          const t = e.activeLayer;
          if (!t?.smart) return fail(`${l.name} could not become a smart object.`);
          const had = new Set((e.smartFiltersShown(t.id) ?? t.smart.filters).map((f) => f.id));
          e.addSmartFilter(kind, settings);
          const now = e.current?.layer(t.id), list = (e.smartFiltersShown(t.id) ?? now?.smart?.filters ?? []).map((f) => ({ id: f.id, kind: f.kind, enabled: f.enabled })), added = list.find((f) => !had.has(f.id));
          return added ? text(`Added the smart filter ${kind} (id ${added.id}) to ${now?.name} (layer id ${t.id}).`, { layer: t.id, filter: added.id, filters: list }) : fail(`${kind} could not be added as a smart filter: apply_filter lists the kinds.`);
        }
        case 'set_filter': {
          const l = layerOf();
          if (!l.smart) return fail(`${l.name} has no smart filters: add_filter makes one.`);
          const cur = e.smartFiltersShown(l.id) ?? l.smart.filters, show = (list: typeof cur) => list.map((f) => ({ id: f.id, kind: f.kind, enabled: f.enabled, opacity: f.opacity ?? 100, blend: f.blend ?? 'normal' }));
          const change = ['kind', 'settings', 'enabled', 'opacity', 'blend'].some((k) => a[k] !== undefined) || a.remove === true;
          if (!change) return text(`${cur.length} smart filter${cur.length === 1 ? '' : 's'}: ${brief(show(cur))}`, { layer: l.id, filters: show(cur) });
          const f = str('filter_id') ? cur.find((x) => x.id === str('filter_id')) : cur[cur.length - 1];
          if (!f) return fail(str('filter_id') ? `No filter has the id ${str('filter_id')}: set_filter with only id lists them.` : `${l.name} has no smart filters.`);
          if (str('kind') && !filterKnown(str('kind'))) return fail(`${str('kind')} is not a filter formvis can keep editable: use a kind from apply_filter (not average).`);
          const kind = str('kind') || f.kind, next = a.remove === true ? cur.filter((x) => x.id !== f.id)
            : cur.map((x) => (x.id !== f.id ? x : { ...x, kind, settings: a.settings && typeof a.settings === 'object' ? filterSettings(kind, a.settings as Record<string, unknown>) : kind !== f.kind ? filterSettings(kind, {}) : x.settings,
              enabled: typeof a.enabled === 'boolean' ? a.enabled : x.enabled, ...(typeof a.opacity === 'number' ? { opacity: a.opacity } : {}), ...(typeof a.blend === 'string' ? { blend: a.blend as BlendMode } : {}) }));
          e.setSmartFilters(l.id, next, a.remove === true ? 'Delete Smart Filter' : 'Smart Filter');
          const after = e.smartFiltersShown(l.id) ?? p.layer(l.id)?.smart?.filters ?? [];
          return text(a.remove === true ? `Removed the filter ${f.kind}; ${after.length} left.` : `Updated the filter ${kind}.`, { layer: l.id, filters: show(after) });
        }
        case 'list_settings': {
          const values = settingsOf(loadPrefs());
          return text(JSON.stringify(values), { settings: values });
        }
        case 'list_fonts': {
          const families = fontFamilies(), family = str('family');
          if (!family) return text(JSON.stringify(families), { families });
          if (!families.includes(family)) return fail(`${family} is not a listed family: call list_fonts without family for the names.`);
          const faces = await Promise.all([[false, false], [true, false], [false, true], [true, true]].map(async ([bold, italic]) => {
            const chars = await mappedChars(family, bold, italic);
            return { bold, italic, readable: !!chars, characters: chars?.length ?? 0 };
          }));
          return text(JSON.stringify({ family, faces }), { family, faces });
        }
        case 'set_settings': {
          const want = a.values && typeof a.values === 'object' ? a.values as Record<string, unknown> : {}, have = settingsOf(loadPrefs()), patch: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(want)) {
            if (!(k in have)) return fail(`${k} is not a simple setting: call list_settings for the names.`);
            if (typeof v !== typeof have[k] || (typeof v === 'number' && !Number.isFinite(v))) return fail(`${k} takes a ${typeof have[k]}.`);
            patch[k] = v;
          }
          if (!Object.keys(patch).length) return fail('Give at least one setting in values.');
          if (!await this.deps.ask('An agent asks to change settings', Object.entries(patch).map(([k, v]) => `${k}: ${String(have[k])} to ${String(v)}`).join('; '))) return fail('The person declined the change.');
          updatePrefs(patch as Partial<Prefs>);
          const now = loadPrefs();
          savePrefs(now);   // loadPrefs keeps each value in its range
          applyPrefs(e, now);
          const after = settingsOf(now);
          return text(`Changed ${Object.keys(patch).join(', ')}.`, { settings: Object.fromEntries(Object.keys(patch).map((k) => [k, after[k]])) });
        }
        case 'ui_inspect': {
          let found: Element[];
          try { found = Array.from(document.querySelectorAll(str('selector'))); } catch { return fail('selector is not a valid CSS selector.'); }
          const shown = found.slice(0, Math.max(1, Math.min(50, Math.round(num('limit', 10)))));
          const items = shown.map((n) => {
            const r = n.getBoundingClientRect(), s = getComputedStyle(n), btn = n as HTMLButtonElement;
            return { tag: n.tagName.toLowerCase(), id: n.id || undefined, text: (n.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120), label: n.getAttribute('aria-label') || n.getAttribute('title') || undefined,
              visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none', disabled: btn.disabled === true || n.getAttribute('aria-disabled') === 'true',
              pressed: n.getAttribute('aria-pressed') === 'true' || n.getAttribute('aria-checked') === 'true' || n.getAttribute('aria-selected') === 'true',
              x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
          });
          return text(`${found.length} element${found.length === 1 ? '' : 's'} match${found.length === 1 ? 'es' : ''}${found.length > items.length ? `, the first ${items.length} shown` : ''}: ${JSON.stringify(items)}`, { count: found.length, elements: items });
        }
        default: return fail(`formvis has no tool named ${name}.`);
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    } finally { this.deps.note(`An agent used ${name}.`); }
  }
}
