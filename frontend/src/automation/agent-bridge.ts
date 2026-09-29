import { Raster, SelectionMask, createSurface, ctxOf, toBlob, type BlendMode, type Engine } from '../engine';
import { api } from '../io/api';
import { PARAM_KINDS } from '../engine/adjust-params';

/** Outside agents in the window (1.52.1): while Allow outside agents is on (Preferences > Plugins), the window collects
 *  MCP tool calls from the engine and runs them here, each change an ordinary undoable step. Generative calls cost the
 *  user money, so they ask first. The catalogue itself (names, schemas, hints) is the engine's. */
export interface McpResult { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }
export interface AgentDeps { ask(title: string, text: string): Promise<boolean>; note(text: string): void }

const text = (t: string, data?: Record<string, unknown>): McpResult => ({ content: [{ type: 'text', text: t }], ...(data ? { structuredContent: data } : {}) });
const fail = (t: string): McpResult => ({ content: [{ type: 'text', text: t }], isError: true });
const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));
const b64 = async (blob: Blob): Promise<string> => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

export class AgentBridge {
  private on = false;
  private looping = false;
  constructor(private readonly engine: Engine, private readonly deps: AgentDeps) {}

  setEnabled(on: boolean): void {
    const was = this.on;
    this.on = on;
    if (on && !this.looping) void this.loop();
    if (was && !on) void fetch('/api/mcp/bridge/stop', { method: 'POST' }).catch(() => undefined);   // refused at once, not left waiting
  }

  private async loop(): Promise<void> {
    this.looping = true;
    while (this.on) {
      try {
        const res = await fetch('/api/mcp/bridge/next');
        if (res.status === 200) {
          const item = await res.json() as { id: string; name: string; arguments: Record<string, unknown> };
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
      if (!p) return fail('No document is open: call new_document first.');
      const layerOf = (): NonNullable<ReturnType<typeof p.layer>> => { const l = p.layer(str('id')); if (!l) throw new Error(`No layer has the id ${str('id')}: call get_document for the ids.`); return l; };
      switch (name) {
        case 'get_document': {
          const d = p.doc, s = p.selection;
          const data = { name: p.name, width: d.width, height: d.height, resolution: d.resolution ?? 72, mode: d.mode ?? 'rgb', activeLayerId: p.activeId,
            selection: s ? { x: s.x, y: s.y, width: s.w, height: s.h } : null,
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
          const x = Math.round(num('x', 0)), y = Math.round(num('y', 0)), w = Math.max(1, Math.round(num('width', 1))), h = Math.max(1, Math.round(num('height', 1)));
          const mode = (['replace', 'add', 'subtract', 'intersect'].includes(str('mode')) ? str('mode') : 'replace') as 'replace';
          e.applySelection(SelectionMask.cropped(x, y, w, h, new Uint8Array(w * h).fill(255)), mode, 'Rectangular Marquee');
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
        case 'generative_fill': case 'generate_image': {
          const prompt = str('prompt').trim();
          if (!prompt) return fail('Give a prompt.');
          if (name === 'generative_fill' && !p.selection) return fail('Generative Fill needs a selection: call select first.');
          const st = await api.generativeStatus();
          if (!st?.configured) return fail('formvis has no fal key set, so it cannot generate. The user can add one in Edit > Generative Fill.');
          const what = name === 'generative_fill' ? 'Generative Fill' : 'Generate Image';
          if (!await this.deps.ask(`An agent asks to run ${what}`, `Prompt: "${prompt}". This runs on fal and costs money.`)) return fail(`The user declined ${what}.`);
          if (name === 'generative_fill') await e.task(() => e.generativeFill(prompt, (image, mask) => api.generativeFill(image, mask, prompt)));
          else {
            const bmp = await createImageBitmap(await api.generateImage(prompt, p.doc.width, p.doc.height)), r = new Raster(p.doc.width, p.doc.height);
            r.ctx.drawImage(bmp, 0, 0, p.doc.width, p.doc.height); bmp.close(); r.touch();
            e.insertRasterLayer(r, 'Generated Image', 0, 0, {}, 'Generate Image');
          }
          return text(`${what} done; the result is a new layer (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id });
        }
        default: return fail(`formvis has no tool named ${name}.`);
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    } finally { this.deps.note(`An agent used ${name}.`); }
  }
}
