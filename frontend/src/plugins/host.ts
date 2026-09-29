import type { Engine } from '../engine';
import { api } from '../io/api';
import type { AgentBridge } from '../automation/agent-bridge';
import type { Commands } from '../ui/commands';

/** Plugins (1.52.6, the capability plan). Each enabled plugin in the plugins folder runs in its own sandboxed frame
 *  (scripts only, without same-origin, so it cannot reach this page, its storage or its keys) and talks to formvis only
 *  by messages: the tools the assistant uses (formvis.call), the active layer's pixels (formvis.getPixels) and new
 *  ones back (formvis.putPixels), each change an undoable step. Messages are taken only from a plugin's own frame. */
const OFF = 'formvis.plugins.off';

const RUNTIME = `<script>
(() => {
  const pending = new Map(), commands = {}; let n = 0, name = '';
  const send = (m) => parent.postMessage(Object.assign({ formvisPlugin: true }, m), '*');
  const rpc = (op, args) => new Promise((ok, no) => { const id = ++n; pending.set(id, { ok, no }); send({ id, op, args }); });
  addEventListener('message', async (e) => {
    const m = e.data;
    if (!m || e.source !== parent) return;
    if (m.formvisReply && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.no(new Error(m.error)) : p.ok(m.result); return; }
    if (m.formvisRun) {
      try { const f = commands[m.command]; if (!f) throw new Error('No command ' + m.command); await f(); send({ op: 'done', runId: m.runId }); }
      catch (err) { send({ op: 'done', runId: m.runId, error: String(err && err.message || err) }); }
    }
  });
  window.formvis = {
    register(spec) {
      name = String(spec && spec.name || 'Plugin');
      const list = (spec && spec.commands || []).filter((c) => c && c.id && typeof c.run === 'function');
      for (const c of list) commands[c.id] = c.run;
      send({ op: 'register', args: { name, commands: list.map((c) => ({ id: String(c.id), label: String(c.label || c.id) })) } });
    },
    call: (tool, args) => rpc('call', { tool, args: args || {} }),
    getPixels: () => rpc('getPixels', {}),
    putPixels: (image, how) => rpc('putPixels', { image, how: how === 'replace' ? 'replace' : 'new-layer', name }),
  };
})();
<\/script>`;

interface Loaded { name: string; frame: HTMLIFrameElement; label: string; commands: Array<{ id: string; label: string }> }

export class PluginHost {
  private readonly loaded = new Map<string, Loaded>();
  private readonly runs = new Map<number, (error?: string) => void>();
  private runId = 0;
  onChange: () => void = () => {};

  constructor(private readonly engine: Engine, private readonly bridge: AgentBridge, private readonly commands: Commands, private readonly note: (text: string, kind?: 'info' | 'error') => void) {
    window.addEventListener('message', (e) => void this.receive(e));
  }

  off(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(OFF) ?? '[]') as string[]); } catch { return new Set(); } }
  setOn(name: string, on: boolean): void {
    const s = this.off(); on ? s.delete(name) : s.add(name);
    try { localStorage.setItem(OFF, JSON.stringify([...s])); } catch { /* this session only */ }
    on ? void this.load(name) : this.unload(name);
  }

  /** The plugins folder's enabled plugins, each in its frame. */
  async loadAll(): Promise<void> {
    const off = this.off();
    for (const p of await api.plugins()) if (!off.has(p.name) && !this.loaded.has(p.name)) await this.load(p.name);
  }

  async load(name: string): Promise<void> {
    this.unload(name);
    let code = '';
    try { code = await api.pluginCode(name); } catch { this.note(`${name} could not be read.`, 'error'); return; }
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');   // no allow-same-origin: an opaque origin, away from this page
    frame.hidden = true;
    frame.title = `Plugin ${name}`;
    frame.srcdoc = `<!doctype html><meta charset="utf-8">${RUNTIME}<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n<\/script>`;
    this.loaded.set(name, { name, frame, label: name.replace(/\.js$/, ''), commands: [] });
    document.body.appendChild(frame);
  }

  unload(name: string): void {
    const p = this.loaded.get(name);
    if (!p) return;
    for (const c of p.commands) this.commands.remove(this.id(name, c.id));
    p.frame.remove();
    this.loaded.delete(name);
    this.onChange();
  }

  /** The plugins' commands, for the Plugins menu. */
  commandIds(): string[] { return [...this.loaded.values()].flatMap((p) => p.commands.map((c) => this.id(p.name, c.id))); }

  private id(plugin: string, cmd: string): string { return `plugin:${plugin}:${cmd}`; }

  private run(p: Loaded, command: string, label: string): void {
    const runId = ++this.runId;
    this.runs.set(runId, (error) => { if (error) this.note(`${label}: ${error}`, 'error'); });
    p.frame.contentWindow?.postMessage({ formvisRun: true, runId, command }, '*');
  }

  private async receive(e: MessageEvent): Promise<void> {
    const p = [...this.loaded.values()].find((x) => x.frame.contentWindow === e.source);   // only a plugin's own frame
    const m = e.data as { formvisPlugin?: boolean; id?: number; op?: string; args?: Record<string, unknown>; runId?: number; error?: string };
    if (!p || !m || m.formvisPlugin !== true) return;
    const reply = (result?: unknown, error?: string): void => { p.frame.contentWindow?.postMessage({ formvisReply: true, id: m.id, result, error }, '*'); };
    try {
      switch (m.op) {
        case 'register': {
          const cmds = Array.isArray(m.args?.commands) ? (m.args.commands as Array<{ id: string; label: string }>).slice(0, 40) : [];
          for (const c of p.commands) this.commands.remove(this.id(p.name, c.id));
          p.label = String(m.args?.name ?? p.label).slice(0, 60);
          p.commands = cmds.map((c) => ({ id: String(c.id).slice(0, 60), label: String(c.label).slice(0, 80) }));
          for (const c of p.commands) this.commands.add({ id: this.id(p.name, c.id), label: `${c.label}`, enabled: () => !!this.engine.current, run: () => this.run(p, c.id, c.label) });
          this.onChange();
          return;
        }
        case 'done': { const f = this.runs.get(m.runId ?? -1); this.runs.delete(m.runId ?? -1); f?.(m.error); return; }
        case 'call': reply(await this.bridge.run(String(m.args?.tool ?? ''), (m.args?.args ?? {}) as Record<string, unknown>)); return;
        case 'getPixels': {
          const q = this.engine.current, l = q?.activeLayer;
          if (!q || !l) { reply(undefined, 'No document or layer is open.'); return; }
          const s = this.engine.renderLayerAlone(l.id), c = s.getContext('2d') as CanvasRenderingContext2D, img = c.getImageData(0, 0, s.width, s.height);
          reply({ width: img.width, height: img.height, data: img.data, layer: { id: l.id, name: l.name } });
          return;
        }
        case 'putPixels': {
          const q = this.engine.current, img = m.args?.image as { width?: number; height?: number; data?: Uint8ClampedArray } | undefined;
          if (!q) { reply(undefined, 'No document is open.'); return; }
          const W = q.doc.width, H = q.doc.height;
          if (!img || img.width !== W || img.height !== H || !(img.data instanceof Uint8ClampedArray) || img.data.length !== W * H * 4) { reply(undefined, `putPixels takes { width: ${W}, height: ${H}, data: a Uint8ClampedArray of ${W * H * 4} } (the document's size).`); return; }
          const data = new ImageData(new Uint8ClampedArray(img.data), W, H), label = p.label;
          if (m.args?.how === 'replace' && q.activeLayer) reply(this.engine.replaceLayerPixels(q.activeLayer.id, data, label));
          else {
            const { Raster } = await import('../engine');
            const r = new Raster(W, H); r.ctx.putImageData(data, 0, 0); r.touch();
            this.engine.insertRasterLayer(r, label, 0, 0, {}, label);
            reply(true);
          }
          return;
        }
        default: reply(undefined, `Unknown request ${m.op}.`);
      }
    } catch (err) { reply(undefined, err instanceof Error ? err.message : String(err)); }
  }
}
