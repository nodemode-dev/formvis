import type { Engine } from '../engine';
import { api } from '../io/api';
import type { AgentBridge } from '../automation/agent-bridge';
import type { Commands } from '../ui/commands';

/** Plugins (1.52.6, the capability plan). Each enabled plugin in the plugins folder runs in its own sandboxed frame
 *  (scripts only, without same-origin, so it cannot reach this page, its storage or its keys) and talks to formvis only
 *  by messages: the tools the assistant uses (formvis.call), the active layer's pixels (formvis.getPixels) and new
 *  ones back (formvis.putPixels), each change an undoable step. Messages are taken only from a plugin's own frame. */
const OFF = 'formvis.plugins.off';

const FRAME_STYLE = '<style>*,*::before,*::after{scrollbar-width:none!important;-ms-overflow-style:none!important}*::-webkit-scrollbar,*::-webkit-scrollbar-button,*::-webkit-scrollbar-track,*::-webkit-scrollbar-thumb,*::-webkit-scrollbar-corner{display:none!important;width:0!important;height:0!important;background:transparent!important}html,body{scrollbar-width:none!important}</style>';

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
  addEventListener('error', (e) => send({ op: 'error', args: { message: String(e.message || 'Script error') } }));
  addEventListener('unhandledrejection', (e) => send({ op: 'error', args: { message: String(e.reason && e.reason.message || e.reason || 'Rejected') } }));
  window.formvis = {
    register(spec) {
      name = String(spec && spec.name || 'Plugin');
      const list = (spec && spec.commands || []).filter((c) => c && c.id && typeof c.run === 'function');
      for (const c of list) commands[c.id] = c.run;
      send({ op: 'register', args: { name, commands: list.map((c) => ({ id: String(c.id), label: String(c.label || c.id), keys: Array.isArray(c.keys) ? c.keys.map(String) : [] })) } });
    },
    call: (tool, args) => rpc('call', { tool, args: args || {} }),
    getPixels: () => rpc('getPixels', {}),
    putPixels: (image, how) => rpc('putPixels', { image, how: how === 'replace' ? 'replace' : 'new-layer', name }),
  };
})();
<\/script>`;

interface Loaded { name: string; frame: HTMLIFrameElement; label: string; commands: Array<{ id: string; label: string; keys: string[] }>; errors: string[] }

/** A plugin accelerator is well formed when it is written as comboOf writes a press and carries Mod or Alt, so a plugin
 *  cannot take a plain letter from typing. */
const ORDER: Record<string, number> = { Alt: 0, Shift: 1, Mod: 2 };
function wellFormed(combo: string): boolean {
  const parts = combo.split('+'), key = parts.pop() ?? '';
  if (!key || parts.some((p) => !(p in ORDER)) || !(parts.includes('Mod') || parts.includes('Alt'))) return false;
  return parts.every((p, i) => i === 0 || ORDER[parts[i - 1]] < ORDER[p]);
}

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
    frame.srcdoc = `<!doctype html><meta charset="utf-8">${FRAME_STYLE}${RUNTIME}<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n<\/script>`;
    this.loaded.set(name, { name, frame, label: name.replace(/\.js$/, ''), commands: [], errors: [] });
    document.body.appendChild(frame);
    this.onChange();
  }

  /** Reload Plugins: every running plugin is dropped and the enabled ones in the folder are loaded again from disk. */
  async reloadAll(): Promise<number> {
    for (const name of [...this.loaded.keys()]) this.unload(name);
    await this.loadAll();
    return this.loaded.size;
  }

  private fail(p: Loaded, text: string): void { p.errors = [...p.errors, text.slice(0, 200)].slice(-10); this.onChange(); }

  unload(name: string): void {
    const p = this.loaded.get(name);
    if (!p) return;
    for (const c of p.commands) this.commands.remove(this.id(name, c.id));
    p.frame.remove();
    this.loaded.delete(name);
    this.onChange();
  }

  /** Every plugin file with whether it is on and running, and the name and commands it registered (list_plugins). */
  async list(): Promise<Array<Record<string, unknown>>> {
    const off = this.off();
    return (await api.plugins()).map((f) => {
      const p = this.loaded.get(f.name);
      return { file: f.name, size: f.size, on: !off.has(f.name), running: !!p, name: p?.label ?? null, commands: (p?.commands ?? []).map((c) => ({ id: this.id(f.name, c.id), label: c.label, keys: c.keys })), errors: p?.errors ?? [] };
    });
  }

  /** The plugins' commands, for the Plugins menu. */
  commandIds(): string[] { return [...this.loaded.values()].flatMap((p) => p.commands.map((c) => this.id(p.name, c.id))); }

  private id(plugin: string, cmd: string): string { return `plugin:${plugin}:${cmd}`; }

  private run(p: Loaded, command: string, label: string): void {
    const runId = ++this.runId;
    this.runs.set(runId, (error) => { if (error) { this.fail(p, `${label}: ${error}`); this.note(`${label}: ${error}`, 'error'); } });
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
          const cmds = Array.isArray(m.args?.commands) ? (m.args.commands as Array<{ id: string; label: string; keys?: unknown }>).slice(0, 40) : [];
          for (const c of p.commands) this.commands.remove(this.id(p.name, c.id));
          p.label = String(m.args?.name ?? p.label).slice(0, 60);
          p.commands = cmds.map((c) => ({ id: String(c.id).slice(0, 60), label: String(c.label).slice(0, 80), keys: [] as string[] }));
          cmds.forEach((c, i) => {
            const want = Array.isArray(c.keys) ? (c.keys as unknown[]).map((k) => String(k)).filter(wellFormed).slice(0, 2) : [];
            const free = want.filter((k) => !this.commands.forCombo(k));
            if (free.length < want.length) this.fail(p, `${p.commands[i].label}: ${want.filter((k) => !free.includes(k)).join(', ')} is already in use.`);
            p.commands[i].keys = free;
          });
          for (const c of p.commands) this.commands.add({ id: this.id(p.name, c.id), label: `${c.label}`, keys: [...c.keys], enabled: () => !!this.engine.current, run: () => this.run(p, c.id, c.label) });
          this.onChange();
          return;
        }
        case 'error': this.fail(p, String(m.args?.message ?? 'Script error')); return;
        case 'done': { const f = this.runs.get(m.runId ?? -1); this.runs.delete(m.runId ?? -1); f?.(m.error); return; }
        case 'call': case 'getPixels': case 'putPixels': {
          const out = await this.serve(m.op, m.args ?? {}, p.label);
          if ('error' in out) reply(undefined, out.error); else reply(out.result);
          return;
        }
        default: reply(undefined, `Unknown request ${m.op}.`);
      }
    } catch (err) { reply(undefined, err instanceof Error ? err.message : String(err)); }
  }

  /** The three requests a plugin may make (call, getPixels, putPixels), shared by plugin frames and the Script Console. */
  private async serve(op: string, args: Record<string, unknown>, label: string): Promise<{ result: unknown } | { error: string }> {
    switch (op) {
      case 'call': return { result: await this.bridge.run(String(args.tool ?? ''), (args.args ?? {}) as Record<string, unknown>) };
      case 'getPixels': {
        const q = this.engine.current, l = q?.activeLayer;
        if (!q || !l) return { error: 'No document or layer is open.' };
        const s = this.engine.renderLayerAlone(l.id), c = s.getContext('2d') as CanvasRenderingContext2D, img = c.getImageData(0, 0, s.width, s.height);
        return { result: { width: img.width, height: img.height, data: img.data, layer: { id: l.id, name: l.name } } };
      }
      case 'putPixels': {
        const q = this.engine.current, img = args.image as { width?: number; height?: number; data?: Uint8ClampedArray } | undefined;
        if (!q) return { error: 'No document is open.' };
        const W = q.doc.width, H = q.doc.height;
        if (!img || img.width !== W || img.height !== H || !(img.data instanceof Uint8ClampedArray) || img.data.length !== W * H * 4) return { error: `putPixels takes { width: ${W}, height: ${H}, data: a Uint8ClampedArray of ${W * H * 4} } (the document's size).` };
        const data = new ImageData(new Uint8ClampedArray(img.data), W, H);
        if (args.how === 'replace' && q.activeLayer) return { result: this.engine.replaceLayerPixels(q.activeLayer.id, data, label) };
        const { Raster } = await import('../engine');
        const r = new Raster(W, H); r.ctx.putImageData(data, 0, 0); r.touch();
        this.engine.insertRasterLayer(r, label, 0, 0, {}, label);
        return { result: true };
      }
      default: return { error: `Unknown request ${op}.` };
    }
  }

  /** The same API object a plugin's frame gets as window.formvis (call, getPixels, putPixels), for the Script Console under
   *  the name given. It has exactly the plugin's reach: nothing is added, and it asks for nothing more. */
  apiFor(label: string): { call(tool: string, args?: Record<string, unknown>): Promise<unknown>; getPixels(): Promise<unknown>; putPixels(image: unknown, how?: 'new-layer' | 'replace'): Promise<unknown> } {
    const go = async (op: string, args: Record<string, unknown>): Promise<unknown> => { const out = await this.serve(op, args, label); if ('error' in out) throw new Error(out.error); return out.result; };
    return {
      call: (tool, args) => go('call', { tool, args: args ?? {} }),
      getPixels: () => go('getPixels', {}),
      putPixels: (image, how) => go('putPixels', { image, how: how === 'replace' ? 'replace' : 'new-layer' }),
    };
  }
}
