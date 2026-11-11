import type { Engine } from '../../engine';
import { wasmPlugins, runWasmFilter, runWasmPlane, setWasmLimits, wasmLimits, type WasmEntry } from '../../engine/wasm-plugin-host';
import { wasmDefaults, wasmKind, wasmValues, WASM_LIMIT_RANGE, type WasmValues } from '../../engine/wasm-plugin';
import { Dialog } from '../dialogs';
import { el, patchList, q, setDisabled, setHidden, setText, setValue } from '../dom';
import { checkRow, selectRow, sliderRow, type Row } from './controls';

const EXAMPLE_URL = 'wasm-plugins/tint-mix.wasm';

/** Filter > Plug-ins (WebAssembly) > Run: the dialog generated from a plug-in's parameter schema, with a live preview.
 *  One section of rows per plug-in, built once and shown or hidden; OK applies to the layer or joins a smart object's stack. */
export class WasmFilterDialog extends Dialog {
  private entry: WasmEntry | null = null;
  private readonly values = new Map<string, WasmValues>();
  private readonly sections = new Map<string, { node: HTMLElement; rows: Map<string, Row<never>>; note: HTMLElement }>();
  private readonly previewRow: Row<boolean>;
  private readonly status = el('<p class="cv-note" role="status"></p>');
  private readonly okBtn: HTMLButtonElement;
  private preview = true;
  private timer = 0;
  private ctl: AbortController | null = null;
  private busy = false;
  private editing: ((settings: Record<string, unknown>) => void) | null = null;

  constructor(private readonly engine: Engine) {
    super('Plug-in', 420);
    this.previewRow = checkRow('Preview', (v) => { this.preview = v; this.schedule(0); });
    this.previewRow.set(true);
    this.body.append(this.previewRow.el, this.status);
    this.okBtn = this.button('OK', 'primary', () => void this.commit());
    this.button('Cancel', 'ghost', () => this.close());
    this.onClose = () => this.abandon();
  }

  private smart(): boolean { const p = this.engine.current, l = p?.activeLayer; return !!l?.smart && !(p?.maskTarget && l.mask); }

  show(id: string): void {
    const entry = wasmPlugins.get(id);
    if (!entry || this.isOpen) return;
    if (!this.smart() && !this.engine.targetImage()) { this.engine.notice('Select a layer with pixels first.'); return; }
    this.entry = entry;
    this.setTitle(entry.manifest.name);
    if (!this.values.has(id)) this.values.set(id, wasmDefaults(entry.manifest));
    const sec = this.section(entry);
    for (const [k, s] of this.sections) setHidden(s.node, k !== id);
    const v = this.values.get(id) as WasmValues;
    for (const p of entry.manifest.params) (sec.rows.get(p.key) as Row<WasmValue> | undefined)?.set(v[p.key]);
    setHidden(this.previewRow.el, this.smart());
    setText(this.status, '');
    setDisabled(this.okBtn, false);
    this.busy = false;
    this.open(this.okBtn);
    this.schedule(0);
  }

  private section(entry: WasmEntry): { node: HTMLElement; rows: Map<string, Row<never>>; note: HTMLElement } {
    const id = entry.manifest.id, had = this.sections.get(id);
    if (had) return had;
    const node = el('<div class="cv-panel-section"></div>'), note = el('<p class="cv-note"></p>'), rows = new Map<string, Row<never>>();
    setText(note, [entry.manifest.description, `Version ${entry.manifest.version}${entry.manifest.author ? `, ${entry.manifest.author}` : ''}.`].filter(Boolean).join(' '));
    node.append(note);
    const set = (key: string, v: WasmValue): void => { const cur = this.values.get(id); if (cur) cur[key] = v; this.schedule(); };
    for (const p of entry.manifest.params) {
      const row = p.kind === 'range' ? sliderRow(p.label, p.min, p.max, p.step, (v) => set(p.key, v), { def: p.def })
        : p.kind === 'select' ? selectRow(p.label, [], (v) => set(p.key, v))
          : checkRow(p.label, (v) => set(p.key, v));
      if (p.kind === 'select') for (const [v, t] of p.options) q<HTMLSelectElement>(row.el, 'select').add(new Option(t, v));
      rows.set(p.key, row as unknown as Row<never>);
      node.append(row.el);
    }
    this.body.insertBefore(node, this.previewRow.el);
    const made = { node, rows, note };
    this.sections.set(id, made);
    return made;
  }

  private schedule(delay = 140): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.runPreview(), delay);
  }

  private stop(): void { this.ctl?.abort(); this.ctl = null; }

  private runPreview(): void {
    const e = this.entry;
    if (!this.isOpen || !e || this.busy) return;
    this.stop();
    if (!this.preview || this.smart()) { this.engine.setPreview(null); setText(this.status, ''); return; }
    const ctl = new AbortController(), v = { ...(this.values.get(e.manifest.id) as WasmValues) };
    this.ctl = ctl;
    this.engine.previewImageEdit(async (src) => {
      setText(this.status, 'Running...');
      try {
        const out = await runWasmFilter(e, v, src, { signal: ctl.signal, onProgress: (p) => { if (this.ctl === ctl) setText(this.status, `Running ${p}%`); } });
        if (this.ctl === ctl) setText(this.status, '');
        return out;
      } catch (err) {
        if (this.ctl === ctl) setText(this.status, err instanceof Error && err.name !== 'AbortError' ? err.message : '');
        return src;
      }
    }, e.manifest.reach);
  }

  private async commit(): Promise<void> {
    const e = this.entry;
    if (!e || this.busy) return;
    window.clearTimeout(this.timer);
    this.stop();
    const v = { ...(this.values.get(e.manifest.id) as WasmValues) };
    if (this.editing) { const done = this.editing; this.close(); done({ values: v }); return; }
    if (this.smart()) { this.engine.setPreview(null); this.close(); this.engine.addSmartFilter(wasmKind(e.manifest.id), { values: v }); return; }
    this.busy = true;
    setDisabled(this.okBtn, true);
    const ctl = new AbortController();
    this.ctl = ctl;
    const ok = await applyWasm(this.engine, e, v, { signal: ctl.signal, onProgress: (p) => setText(this.status, `Running ${p}%`) });
    this.busy = false;
    if (this.ctl === ctl) this.ctl = null;
    if (ok || !ctl.signal.aborted) this.close();
  }

  /** Opens a smart filter's plug-in with its `settings`; OK hands the new settings to `done`. */
  showFor(id: string, settings: Record<string, unknown>, done: (settings: Record<string, unknown>) => void): void {
    const e = wasmPlugins.get(id);
    if (!e || this.isOpen) return;
    this.values.set(id, wasmValues(e.manifest, settings.values));
    this.editing = done;
    this.show(id);
    if (!this.isOpen) this.editing = null;
  }

  private abandon(): void {
    this.editing = null;
    window.clearTimeout(this.timer);
    this.stop();
    this.engine.setPreview(null);
  }
}

type WasmValue = number | string | boolean;

/** The plug-in applied to the active layer as one undo step, honouring the selection; false when it did not run (said in a notice). */
export async function applyWasm(engine: Engine, entry: WasmEntry, values: WasmValues, opts: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {}): Promise<boolean> {
  const clean = wasmValues(entry.manifest, values);
  const p = engine.current, l = p?.activeLayer;
  if (l?.smart && !(p?.maskTarget && l.mask)) { engine.addSmartFilter(wasmKind(entry.manifest.id), { values: clean }); return true; }
  try {
    const ch = l?.channels;
    if (ch && entry.manifest.abi === 2 && p && !engine.alphaTargeted()) {
      const out = await runWasmPlane(entry, clean, { n: ch.n, alpha: true, width: ch.width, height: ch.height, data: ch.data }, ch.mode, p.doc.depth ?? 8, opts);
      return engine.applyDeepFilter(entry.manifest.name, (d) => ({ ...d, data: out.data }));
    }
    return await engine.applyImageEditAsync(entry.manifest.name, (src) => runWasmFilter(entry, clean, src, opts), entry.manifest.reach, (src) => src, 4);
  } catch (err) {
    engine.setPreview(null);
    if (!(err instanceof Error) || err.name !== 'AbortError') engine.notice(`${entry.manifest.name}: ${err instanceof Error ? err.message : 'it failed.'}`, 'error');
    return false;
  }
}

/** Filter > Plug-ins (WebAssembly) > Manage: the installed plug-ins, Install and Remove, the example, and the limits every run keeps. */
export class WasmPluginsDialog extends Dialog {
  private readonly list = el('<div class="cv-plugins-list"></div>');
  private readonly empty = el('<p class="cv-note">No WebAssembly plug-ins yet.</p>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly file = el<HTMLInputElement>('<input type="file" accept=".wasm,.json,application/wasm,application/json" multiple aria-label="Plug-in files" hidden>');
  private readonly time = el<HTMLInputElement>(`<input class="cv-input" type="number" min="${WASM_LIMIT_RANGE.ms[0] / 1000}" max="${WASM_LIMIT_RANGE.ms[1] / 1000}" step="1" aria-label="Time limit in seconds">`);
  private readonly mem = el<HTMLInputElement>(`<input class="cv-input" type="number" min="${WASM_LIMIT_RANGE.memoryMb[0]}" max="${WASM_LIMIT_RANGE.memoryMb[1]}" step="16" aria-label="Memory limit in megabytes">`);

  constructor(private readonly run: (id: string) => void) {
    super('Plug-ins (WebAssembly)', 460);
    const install = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Install...</button>');
    const example = el<HTMLButtonElement>('<button type="button" class="cv-btn cv-btn-ghost">Install Example</button>');
    install.addEventListener('click', () => this.file.click());
    example.addEventListener('click', () => void this.installExample());
    this.file.addEventListener('change', () => void this.installFiles());
    const tf = el('<label class="cv-field"><span>Time limit (s)</span></label>'), mf = el('<label class="cv-field"><span>Memory limit (MB)</span></label>');
    tf.append(this.time); mf.append(this.mem);
    const keep = (): void => {
      const got = setWasmLimits({ ms: Number(this.time.value) * 1000, memoryMb: Number(this.mem.value) });
      setValue(this.time, String(got.ms / 1000)); setValue(this.mem, String(got.memoryMb));
    };
    this.time.addEventListener('change', keep); this.mem.addEventListener('change', keep);
    this.body.append(
      el('<p class="cv-note">A plug-in is one WebAssembly module run in a sandbox: it sees only the pixels it is given, has no network or files, and is stopped when it passes the limits below.</p>'),
      this.list, this.empty, tf, mf, this.note, this.file);
    const row = el('<div class="cv-plugins-row"></div>');
    row.append(install, example);
    this.body.insertBefore(row, this.list);
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'), id = b?.closest<HTMLElement>('[data-key]')?.dataset.key;
      if (!b || !id) return;
      if (b.dataset.act === 'run') { this.close(); this.run(id); } else void this.remove(id);
    });
    wasmPlugins.watch(() => { if (this.isOpen) this.refresh(); });
    this.button('Close', 'ghost', () => this.close());
  }

  show(): void {
    const l = wasmLimits();
    setValue(this.time, String(l.ms / 1000)); setValue(this.mem, String(l.memoryMb));
    setText(this.note, wasmPlugins.persistent ? '' : 'Browser storage is not available here, so plug-ins last until the window closes.');
    this.refresh();
    this.open();
  }

  /** Opens the file chooser for Install, from the Filter menu. */
  pick(): void { this.show(); this.file.click(); }

  refresh(): void {
    const rows = wasmPlugins.list();
    patchList<WasmEntry>(this.list, rows, {
      key: (e) => e.manifest.id,
      create: (e) => {
        const row = el('<div class="cv-plugins-row"><span class="cv-plugins-name"></span><span><button type="button" class="cv-btn cv-btn-ghost" data-act="run">Run...</button> <button type="button" class="cv-btn cv-btn-ghost" data-act="remove">Remove</button></span><span class="cv-note cv-plugins-state"></span></div>');
        this.fill(row, e);
        return row;
      },
      update: (row, e) => this.fill(row, e),
    });
    setHidden(this.empty, rows.length > 0);
  }

  private fill(row: HTMLElement, e: WasmEntry): void {
    const m = e.manifest;
    setText(q(row, '.cv-plugins-name'), `${m.name} ${m.version}`);
    setText(q(row, '.cv-plugins-state'), `${m.description || m.id} · ${m.params.length} parameter${m.params.length === 1 ? '' : 's'} · ${(e.bytes.byteLength / 1024).toFixed(1)} KB${m.author ? ` · ${m.author}` : ''}`);
  }

  private async remove(id: string): Promise<void> {
    const name = wasmPlugins.get(id)?.manifest.name ?? id;
    await wasmPlugins.remove(id);
    setText(this.note, `${name} removed.`);
  }

  async installExample(): Promise<boolean> {
    try {
      const res = await fetch(new URL(EXAMPLE_URL, document.baseURI));
      if (!res.ok) throw new Error('The example module is missing from this build.');
      const e = await wasmPlugins.install(await res.arrayBuffer());
      setText(this.note, `${e.manifest.name} installed; it is under Filter > Plug-ins (WebAssembly).`);
      return true;
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The example could not be installed.'); return false; }
  }

  private async installFiles(): Promise<void> {
    const files = Array.from(this.file.files ?? []);
    this.file.value = '';
    const stem = (n: string): string => n.replace(/\.[^.]+$/, '');
    const mods = files.filter((f) => /\.wasm$/i.test(f.name)), side = files.filter((f) => /\.json$/i.test(f.name));
    if (!mods.length) { setText(this.note, 'Choose a .wasm file, with its .json schema beside it if the module carries none.'); return; }
    const done: string[] = [];
    for (const m of mods) {
      const json = side.find((s) => stem(s.name) === stem(m.name)) ?? (mods.length === 1 && side.length === 1 ? side[0] : undefined);
      try { done.push((await wasmPlugins.install(await m.arrayBuffer(), json ? await json.text() : null)).manifest.name); }
      catch (err) { setText(this.note, `${m.name}: ${err instanceof Error ? err.message : 'it could not be installed.'}`); return; }
    }
    setText(this.note, `Installed ${done.join(', ')}.`);
  }
}
