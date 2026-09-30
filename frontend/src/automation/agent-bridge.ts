import { Raster, SelectionMask, createSurface, ctxOf, toBlob, type BlendMode, type Engine } from '../engine';
import { api } from '../io/api';
import { PARAM_KINDS } from '../engine/adjust-params';
import { decodeImage } from '../io/images';
import { localFill, localInpaint, localModels, localUpscale, modelReady, runLocal } from '../io/local-gen';

/** Outside agents in the window (1.52.1): while Allow outside agents is on (Preferences > Plugins), the window collects
 *  MCP tool calls from the engine and runs them here, each change an ordinary undoable step. Generative calls cost the
 *  user money, so they ask first. The catalogue itself (names, schemas, hints) is the engine's. */
export interface McpResult { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }
export interface AgentDeps {
  ask(title: string, text: string): Promise<boolean>; note(text: string): void; allow(): void;
  // 1.53.3: what the app does that the engine alone does not (File > Open, the .fmv file, filters without their dialog, Select Subject, Remove Background).
  openFile?(file: File): Promise<void>; projectBlob?(): Promise<Blob | null>; applyFilter?(kind: string, settings: Record<string, unknown>): Promise<boolean> | boolean;
  selectSubject?(): Promise<void>; removeBackground?(): Promise<void>;
}

const text = (t: string, data?: Record<string, unknown>): McpResult => ({ content: [{ type: 'text', text: t }], ...(data ? { structuredContent: data } : {}) });
const fail = (t: string): McpResult => ({ content: [{ type: 'text', text: t }], isError: true });
const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));
const hex = (v: unknown): { r: number; g: number; b: number } | null => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(v ?? '')); return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null; };
const b64 = async (blob: Blob): Promise<string> => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

export class AgentBridge {
  private on = false;
  private looping = false;
  constructor(private readonly engine: Engine, private readonly deps: AgentDeps) {}

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
        const res = await fetch(`/api/mcp/bridge/next?allowed=${this.on ? 1 : 0}`);
        if (res.status === 200) {
          const item = await res.json() as { id: string; name: string; arguments: Record<string, unknown> };
          if (item.name === '__consent__') {
            const yes = this.on || await this.deps.ask('Allow an outside agent to edit?', 'An AI agent connected to formvis (such as Claude Code, Codex or Cursor) asks to edit your documents. Each change is an undoable step, and anything that costs money asks first. You can turn this off in Preferences > Plugins.');
            if (yes && !this.on) { this.on = true; this.deps.allow(); }
            await fetch('/api/mcp/bridge/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, result: { allowed: yes } }) });
            continue;
          }
          const result = this.on ? await this.run(item.name, item.arguments ?? {}) : fail('formvis stopped taking requests.');
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
        e.newDocument(Math.round(num('width', 1024)), Math.round(num('height', 1024)), str('name') || 'Untitled', bg === 'transparent' ? 'transparent' : 'white');
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
      if (!p) return fail('No document is open: call new_document or open_file first.');
      const layerOf = (): NonNullable<ReturnType<typeof p.layer>> => { const l = p.layer(str('id')); if (!l) throw new Error(`No layer has the id ${str('id')}: call get_document for the ids.`); return l; };
      switch (name) {
        case 'get_document': {
          const d = p.doc, s = p.selection;
          const data = { name: p.name, width: d.width, height: d.height, resolution: d.resolution ?? 72, mode: d.mode ?? 'rgb', activeLayerId: p.activeId,
            selection: s ? { x: s.x, y: s.y, width: s.w, height: s.h } : null,
            documents: e.projects.map((q) => ({ id: q.id, name: q.name, active: q === p })),
            layers: d.layers.map((l) => ({ id: l.id, name: l.name, kind: l.isGroup ? 'group' : l.adjustment ? `adjustment:${l.adjustment.kind}` : l.text ? 'text' : l.shape ? 'shape' : l.smart ? 'smart object' : 'pixels',
              visible: l.visible !== false, opacity: l.opacity, blend: l.blend ?? 'normal', parentId: l.parentId ?? null })) };
          return text(JSON.stringify(data), data);
        }
        case 'get_image': {
          const flat = e.flattened();
          if (!flat) return fail('Nothing to show.');
          const k = Math.min(1, num('max_size', 1024) / Math.max(flat.width, flat.height)), s = createSurface(Math.max(1, Math.round(flat.width * k)), Math.max(1, Math.round(flat.height * k)));
          ctxOf(s).drawImage(flat as CanvasImageSource, 0, 0, s.width, s.height);
          return { content: [{ type: 'image', data: await b64(await toBlob(s)), mimeType: 'image/png' }, { type: 'text', text: `${p.doc.width} by ${p.doc.height}, shown at ${s.width} by ${s.height}.` }] };
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
          return blob ? text('The project, as a .fmv file.', { data: await b64(blob) }) : fail('formvis could not pack the project.');
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
          return e.resampleImage(w, h, 'high', p.doc.resolution ?? 72) ? text(`Resized to ${w} by ${h}.`) : fail('The size is outside what formvis allows (30,000 pixels a side, 100 megapixels).');
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
        // Filters and looks.
        case 'apply_filter': {
          if (!this.deps.applyFilter) return fail('Filters are not available here.');
          const ok = await this.deps.applyFilter(str('kind'), (a.settings && typeof a.settings === 'object' ? a.settings : {}) as Record<string, unknown>);
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
          let blob: Blob, used: string, notice = '';
          if (local) {
            const W = p.doc.width, H = p.doc.height, k = Math.min(1, 2048 / Math.max(W, H));
            const r = await runLocal({ generator: local.id, prompt, size: `${Math.max(256, Math.round(W * k / 16) * 16)}x${Math.max(256, Math.round(H * k / 16) * 16)}`, count: 1 });
            if (r.notice) { notice = ` ${r.notice}`; this.deps.note(r.notice); }
            blob = r.pictures[0]; used = `${local.label} on this computer`;
          } else {
            if (!fal) return fail('Nothing can generate from a prompt here yet: install Krea 2 or FLUX.2 [klein] in Preferences > Plugins > Local models (Apple silicon or an NVIDIA GPU), or add a fal key in Edit > Generate Image.');
            if (!await this.deps.ask('An agent asks to run Generate Image', `Prompt: "${prompt}". This runs on fal and costs money.`)) return fail('The person declined Generate Image on fal.');
            blob = await api.generateImage(prompt, p.doc.width, p.doc.height); used = 'fal';
          }
          const bmp = await createImageBitmap(blob), r = new Raster(p.doc.width, p.doc.height);
          r.ctx.drawImage(bmp, 0, 0, p.doc.width, p.doc.height); bmp.close(); r.touch();
          e.insertRasterLayer(r, 'Generated Image', 0, 0, {}, 'Generate Image');
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
        default: return fail(`formvis has no tool named ${name}.`);
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    } finally { this.deps.note(`An agent used ${name}.`); }
  }
}
