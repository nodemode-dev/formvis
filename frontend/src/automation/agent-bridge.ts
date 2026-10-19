import { Raster, SelectionMask, createSurface, ctxOf, toBlob, type BlendMode, type Engine, type Surface } from '../engine';
import { api, whenServiceUp } from '../io/api';
import { PARAM_KINDS } from '../engine/adjust-params';
import { BOX_KINDS, MAX_BOXES, boxWarnings, boxesText } from '../engine/boxes';
import { LIMITS, type BoxKind } from '../engine/types';
import { decodeImage } from '../io/images';
import { VIDEO_PROPS, type VideoProp, type VideoTimeline } from '../engine/video-timeline';
import { localFill, localInpaint, localModels, localUpscale, modelReady, runLocal } from '../io/local-gen';
import { applyPrefs, loadPrefs, savePrefs, updatePrefs, type Prefs } from '../ui/prefs';
import { fontFamilies } from '../ui/fonts';
import { mappedChars } from '../engine/glyph-outlines';

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
  renderVideo?(c: { format: 'mp4' | 'gif' | 'png'; from: number; to: number; scale: number }): Promise<Blob | null>;
  // The window's canvas as the person sees it (get_image view editor), Select Object by points (select_point) and the plugins folder (list_plugins).
  viewCapture?(): Surface | null;
  selectPoints?(inside: Array<[number, number]>, outside: Array<[number, number]>, mode: 'replace' | 'add' | 'subtract' | 'intersect'): Promise<string | null>;
  plugins?(): Promise<Array<Record<string, unknown>>>;
}

const settingsOf = (p: Prefs): Record<string, string | number | boolean> => Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 60))) as Record<string, string | number | boolean>;
const text = (t: string, data?: Record<string, unknown>): McpResult => ({ content: [{ type: 'text', text: t }], ...(data ? { structuredContent: data } : {}) });
const fail = (t: string): McpResult => ({ content: [{ type: 'text', text: t }], isError: true });
const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));
const hex = (v: unknown): { r: number; g: number; b: number } | null => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(v ?? '')); return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null; };
const b64 = async (blob: Blob): Promise<string> => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/** The command catalogue (window.formvis.catalogue, DEV_PLAN 28.4's contract with the catalogue): list_commands,
 *  describe_command, run_command and run_commands go through it, and say so plainly when it is not there. */
interface CommandMeta { id: string; label: string; group?: string; description?: string; when?: string; params?: unknown; mutates?: boolean; risky?: boolean }
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

async function catalogueTool(name: string, a: Record<string, unknown>): Promise<McpResult> {
  const cat = catalogueOf();
  if (!cat) return fail(NO_CATALOGUE);
  const id = typeof a.id === 'string' ? a.id : '', params = a.params && typeof a.params === 'object' ? a.params as Record<string, unknown> : undefined;
  if (name === 'list_commands') {
    const all = cat.listCommands({ ...(typeof a.group === 'string' && a.group ? { group: a.group } : {}), ...(typeof a.text === 'string' && a.text ? { text: a.text } : {}) });
    const shown = all.slice(0, LIST_CAP).map((c) => ({ id: c.id, label: c.label, ...(c.group ? { group: c.group } : {}), ...(c.when ? { when: c.when } : {}), ...(c.params !== undefined ? { params: c.params } : {}), ...(c.risky ? { risky: true } : {}) }));
    const data = { total: all.length, commands: shown };
    return text(`${all.length} command${all.length === 1 ? '' : 's'}${all.length > shown.length ? `, the first ${shown.length} shown: narrow with group or text` : ''}. ${brief(shown)}`, data);
  }
  if (!id) return fail('Give the command id: call list_commands to find one.');
  if (name === 'describe_command') {
    let d = await cat.describeCommand(id);
    if (d && typeof d === 'object' && 'ok' in d && 'result' in d) d = (d as { result: unknown }).result;
    if (!d || typeof d !== 'object') return fail(`No command has the id ${id}: call list_commands with text to find the right one.`);
    return text(brief(d), d as Record<string, unknown>);
  }
  if (name === 'run_command') {
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
  constructor(private readonly engine: Engine, private readonly deps: AgentDeps) {}

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
          const item = await res.json() as { id: string; name: string; arguments: Record<string, unknown> };
          if (item.name === '__consent__') {
            const yes = this.on || await this.deps.ask('Allow an outside agent to edit?', 'An AI agent connected to formvis (such as Claude Code, Codex or Cursor) asks to edit your documents. Each change is an undoable step, and anything that costs money asks first. You can turn this off in Preferences > Plugins.');
            if (yes && !this.on) { this.on = true; this.deps.allow(); }
            await fetch('/api/mcp/bridge/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, result: { allowed: yes } }) });
            continue;
          }
          this.inflight++;
          let result: McpResult;
          try { result = this.on ? await this.run(item.name, item.arguments ?? {}) : fail('formvis stopped taking requests.'); } finally { this.inflight--; }
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
        if (!nw || !nh) {
          const ratio = /^(\d+):(\d+)$/.exec(str('aspect')), long = { '1k': 1024, '2k': 2048, '4k': 4096 }[str('size_class') || '1k'];
          if (!ratio || !long) return fail('Give width and height in pixels, or an aspect such as 16:9 (with size_class 1k, 2k or 4k).');
          const ra = Number(ratio[1]), rb = Number(ratio[2]), side = (v: number): number => Math.max(16, Math.round(v / 16) * 16);
          [nw, nh] = ra >= rb ? [long, side(long * rb / ra)] : [side(long * ra / rb), long];
        }
        e.newDocument(nw, nh, str('name') || 'Untitled', bg === 'transparent' ? 'transparent' : 'white');
        if (bg === 'black') { e.fg = { r: 0, g: 0, b: 0 }; e.fill('fg'); }
        return text(`Opened a ${e.current?.doc.width} by ${e.current?.doc.height} document.`);
      }
      if (name === '__open') {   // open_file: the engine read the file at its path (1.53.3)
        const bytes = Uint8Array.from(atob(str('data')), (c) => c.charCodeAt(0)), file = new File([bytes], str('name'));
        if (/\.(fmv|psd|psb|ora)$/i.test(file.name)) { if (!this.deps.openFile) return fail('formvis cannot open projects for agents here.'); await this.deps.openFile(file); }
        else e.openImage(await decodeImage(file, file.name));
        const q = e.current;
        return text(q ? `Opened ${file.name}: ${q.doc.width} by ${q.doc.height}, ${q.doc.layers.length} layer${q.doc.layers.length === 1 ? '' : 's'}.` : `Could not open ${file.name}.`, q ? { id: q.id, width: q.doc.width, height: q.doc.height } : undefined);
      }
      if (name === 'list_commands' || name === 'describe_command' || name === 'run_command' || name === 'run_commands') return await catalogueTool(name, a);
      if (name === 'ping') {
        const documents = e.projects.map((q) => ({ id: q.id, name: q.name, active: q === p, width: q.doc.width, height: q.doc.height }));
        return text(`${documents.length} open document${documents.length === 1 ? '' : 's'}.`, { documents, active: p?.id ?? null });
      }
      if (name === 'list_plugins') {
        if (!this.deps.plugins) return fail('Plugins are not available here.');
        const plugins = await this.deps.plugins();
        return text(plugins.length ? JSON.stringify(plugins) : 'No plugins are installed: the person adds .js files in Preferences > Plugins.', { plugins });
      }
      if (name === 'close_document') {
        const cat = catalogueOf();
        if (!cat) return fail(NO_CATALOGUE);
        if (!e.projects.length) return fail('No document is open.');
        if (str('id') && !e.projects.some((q) => q.id === str('id'))) return fail(`No open document has the id ${str('id')}: see documents in get_document.`);
        const r = await cat.runCommand('close-document', str('id') ? { id: str('id') } : {});
        return r.ok ? text(`Closed ${str('id') || 'the active document'}; ${e.projects.length} left open${e.current ? `, now working on ${e.current.name}` : ''}.`, { documents: e.projects.map((q) => ({ id: q.id, name: q.name })) }) : fail(`${r.error ?? 'The document could not be closed.'}`);
      }
      if (!p) return fail('No document is open: call new_document or open_file first.');
      const layerOf = (): NonNullable<ReturnType<typeof p.layer>> => { const l = p.layer(str('id')); if (!l) throw new Error(`No layer has the id ${str('id')}: call get_document for the ids.`); return l; };
      switch (name) {
        case 'get_document': {
          const d = p.doc, s = p.selection;
          const data = { name: p.name, width: d.width, height: d.height, resolution: d.resolution ?? 72, mode: d.mode ?? 'rgb', depth: d.depth ?? 8, profile: d.profile?.name ?? (d.mode === 'cmyk' ? null : 'sRGB'), activeLayerId: p.activeId,
            selection: s ? { x: s.x, y: s.y, width: s.w, height: s.h } : null,
            documents: e.projects.map((q) => ({ id: q.id, name: q.name, active: q === p, width: q.doc.width, height: q.doc.height, layers: q.doc.layers.length, modified: q.modified })),
            layers: d.layers.map((l) => ({ id: l.id, name: l.name, kind: l.isGroup ? 'group' : l.adjustment ? `adjustment:${l.adjustment.kind}` : l.fillContent ? `fill:${l.fillContent.kind}` : l.text ? 'text' : l.shape ? 'shape' : l.smart ? 'smart object' : 'pixels',
              visible: l.visible !== false, opacity: l.opacity, blend: l.blend ?? 'normal', parentId: l.parentId ?? null })) };
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
          const bytes = Uint8Array.from(atob(str('data')), (c) => c.charCodeAt(0)), bmp = await createImageBitmap(new Blob([bytes]));
          const r = new Raster(bmp.width, bmp.height); r.ctx.drawImage(bmp, 0, 0); bmp.close(); r.touch();
          e.insertRasterLayer(r, str('name') || 'Placed Image', Math.round(num('x', 0)), Math.round(num('y', 0)), {}, 'Place');
          return text(`Placed a ${r.width} by ${r.height} image as ${e.activeLayer?.name} (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id });
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
            const fmt = str('format'), blob = await this.deps.renderVideo({ format: fmt === 'gif' || fmt === 'png' ? fmt : 'mp4', from, to, scale: [1, 0.5, 0.25].includes(num('scale', 1)) ? num('scale', 1) : 1 });
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
          const t = (['image/png', 'image/jpeg', 'image/webp'].includes(str('type')) ? str('type') : 'image/png') as 'image/png';
          const blob = await e.exportBlob(t, Math.min(1, Math.max(0.1, num('quality', 0.92))));
          return blob ? text('The picture.', { data: await b64(blob) }) : fail('Nothing to export.');
        }
        case 'switch_document': {
          if (!e.projects.some((q) => q.id === str('id'))) return fail(`No open document has the id ${str('id')}: see documents in get_document.`);
          e.switchTo(str('id'));
          return text(`Now working on ${e.current?.name}.`);
        }
        // The document's size and shape.
        case 'resize_image': {
          const w = Math.round(num('width', p.doc.width)), h = Math.round(num('height', p.doc.height));
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
          if (typeof a.scale === 'number') e.scaleLayerTo(a.scale);
          const patch: Record<string, number> = {};
          if (typeof a.x === 'number') patch.x = a.x;
          if (typeof a.y === 'number') patch.y = a.y;
          if (typeof a.rotation === 'number') patch.rotation = a.rotation;
          if (Object.keys(patch).length) e.setLayerTransform(patch, 'Transform Layer');
          if (a.flip === 'horizontal' || a.flip === 'vertical') e.flipLayers(a.flip === 'horizontal');
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
          if (!(PARAM_KINDS as string[]).includes(l.adjustment.kind)) return fail(`${l.name}'s settings are not set by parameters.`);
          e.edit('Adjustment', (q) => { const x = q.layer(l.id); if (x?.adjustment) q.updateLayer(l.id, { adjustment: { ...x.adjustment, data: { ...x.adjustment.data, params: { ...(x.adjustment.data.params as object ?? {}), ...(a.params as object ?? {}) } } } }); });
          return text(`Updated ${l.name}.`);
        }
        case 'color_match': { const l = layerOf(); return e.colorMatch(l.id, str('to') === 'around' ? 'around' : 'beneath', num('amount', 1)) ? text(`Matched ${l.name}'s colours (a Curves layer clipped to it).`) : fail(`${l.name}'s colours could not be matched.`); }
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
          return text(`The average colour of ${x1 - x0} by ${y1 - y0} at ${x0}, ${y0} is ${code} (${c.r}, ${c.g}, ${c.b}), ${Math.round(opaque * 100)} percent opaque.`, { hex: code, ...c, opaque, x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
        }
        case 'frequency_separation': {
          const radius = num('radius', 8);
          if (!(radius >= 0.5 && radius <= 100)) return fail('radius is 0.5 to 100 pixels.');
          if (!e.frequencySeparation(radius)) return fail('There is nothing to separate.');
          const named = (n: string) => [...p.doc.layers].reverse().find((l) => l.name === n), lo = named('Low Frequency'), hi = named('High Frequency');
          return text(`Split at ${radius} pixels: Low Frequency (id ${lo?.id}) holds colour and tone, High Frequency (id ${hi?.id}, Linear Light) holds the detail. Retouch each alone; together they look as the picture did.`, { low: lo?.id, high: hi?.id, radius });
        }
        case 'sample_depth': {
          const l = e.depthLayer(p);
          if (!l) return fail('This document has no Depth Map layer: compute one first (run_command depth-map-from-layer or compute-depth-map), or name a grey layer Depth Map.');
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
          return ok ? text(`${{ flatten: 'Flattened', nearer: 'Brought nearer', farther: 'Pushed farther', smooth: edges ? 'Smoothed to the picture\'s edges' : 'Smoothed' }[kind]} the depth map${smooth ? ` (radius ${amount})` : ` by ${amount} percent`}${p.selection ? ', inside the selection' : ''}.`) : fail(said || 'The depth map could not be changed.');
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
