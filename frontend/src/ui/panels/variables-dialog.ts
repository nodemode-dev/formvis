import type { DocVariable, Engine, Layer } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText, setValue } from '../dom';
import { checkRow, selectRow, type Row } from './controls';

const isType = (l: Layer): boolean => !!l.text && !l.isGroup;
const isPixel = (l: Layer): boolean => !l.isGroup && !l.adjustment && !l.text && !l.shape && !l.smart;

/** Image > Variables > Define (DEV_PLAN 29.9 part b): a layer, and for it the variables that can be bound: Visibility
 *  always, Text Replacement on a type layer, Pixel Replacement (with its method) on a pixel layer. All three rows
 *  are present from the first frame; a row that does not apply to the chosen layer is dimmed and disabled. */
export class DefineVariablesDialog extends Dialog {
  private readonly layerSel = el('<select class="cv-input" aria-label="Layer"></select>') as HTMLSelectElement;
  private readonly layerRow = el('<label class="cv-field"><span>Layer</span></label>');
  private readonly checks = {} as Record<DocVariable['kind'], Row<boolean>>;
  private readonly names = {} as Record<DocVariable['kind'], HTMLInputElement>;
  private readonly nameRows = {} as Record<DocVariable['kind'], HTMLElement>;
  private readonly methodRow: Row<string>;
  private readonly alignRow: Row<string>;
  private readonly clipRow: Row<boolean>;
  private align = 4;
  private clip = true;
  private readonly want: Record<DocVariable['kind'], boolean> = { visibility: false, text: false, pixels: false };
  private method: NonNullable<DocVariable['method']> = 'fit';

  constructor(private readonly engine: Engine) {
    super('Define Variables', 420);
    this.layerRow.append(this.layerSel);
    this.layerSel.addEventListener('change', () => this.sync(true));
    const mk = (kind: DocVariable['kind'], label: string): HTMLElement[] => {
      const row = checkRow(label, (v) => { this.want[kind] = v; this.sync(false); });
      const input = el('<input class="cv-input" type="text" maxlength="120">') as HTMLInputElement;
      input.setAttribute('aria-label', `${label} name`);
      const nameRow = el('<label class="cv-field"><span>Name</span></label>');
      nameRow.append(input);
      this.checks[kind] = row;
      this.names[kind] = input;
      this.nameRows[kind] = nameRow;
      return [row.el, nameRow];
    };
    const vis = mk('visibility', 'Visibility'), txt = mk('text', 'Text Replacement'), pix = mk('pixels', 'Pixel Replacement');
    this.methodRow = selectRow('Method', [['fit', 'Fit'], ['fill', 'Fill'], ['asis', 'As Is'], ['conform', 'Conform']], (v) => { this.method = v as NonNullable<DocVariable['method']>; });
    this.alignRow = selectRow('Alignment', [['4', 'Centre'], ['0', 'Top left'], ['1', 'Top'], ['2', 'Top right'], ['3', 'Left'], ['5', 'Right'], ['6', 'Bottom left'], ['7', 'Bottom'], ['8', 'Bottom right']], (v) => { this.align = Number(v); });
    this.clipRow = checkRow('Clip to Bounding Box', (v) => { this.clip = v; });
    this.clipRow.set(true);
    this.body.append(this.layerRow, ...vis, ...txt, ...pix, this.methodRow.el, this.alignRow.el, this.clipRow.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.remember([this.layerSel, ...Object.values(this.names)]);
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    this.layerSel.replaceChildren(...p.doc.layers.filter((l) => !l.adjustment).map((l) => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name; return o; }));
    if (p.activeId && [...this.layerSel.options].some((o) => o.value === p.activeId)) this.layerSel.value = p.activeId;
    this.sync(true);
    this.open();
  }

  private layer(): Layer | undefined { return this.engine.current?.doc.layers.find((l) => l.id === this.layerSel.value); }

  private sync(rename: boolean): void {
    const l = this.layer(), ok: Record<DocVariable['kind'], boolean> = { visibility: !!l, text: !!l && isType(l), pixels: !!l && isPixel(l) };
    for (const k of ['visibility', 'text', 'pixels'] as const) {
      if (rename) setValue(this.names[k], l?.name ?? '');
      this.checks[k].el.classList.toggle('is-off', !ok[k]);
      this.nameRows[k].classList.toggle('is-off', !ok[k]);
      for (const i of this.checks[k].el.querySelectorAll('input')) { i.disabled = !ok[k]; if (!ok[k] && i.checked) { i.checked = false; this.want[k] = false; } }
      this.names[k].disabled = !ok[k] || !this.want[k];
    }
    this.methodRow.el.classList.toggle('is-off', !ok.pixels || !this.want.pixels);
    for (const i of this.methodRow.el.querySelectorAll('select')) i.disabled = !ok.pixels || !this.want.pixels;
    this.methodRow.set(this.method);
    const off = !ok.pixels || !this.want.pixels;
    for (const r of [this.alignRow, this.clipRow]) { r.el.classList.toggle('is-off', off); for (const i of r.el.querySelectorAll('select, input')) (i as HTMLSelectElement | HTMLInputElement).disabled = off; }
  }

  private apply(): void {
    const l = this.layer();
    if (!l) return;
    this.close();
    for (const kind of ['visibility', 'text', 'pixels'] as const) {
      if (!this.want[kind]) continue;
      this.engine.defineVariable({ name: this.names[kind].value.trim() || l.name, layer: l.id, kind, ...(kind === 'pixels' ? { method: this.method, align: this.align, clip: this.clip } : {}) });
    }
  }
}

/** Image > Variables > Data Sets (DEV_PLAN 29.9 part b): browse the document's data sets with Previous and Next, import
 *  a CSV or text file, Apply one (or with Preview on, apply each as it is browsed), and read what it holds per variable. */
export class DataSetsDialog extends Dialog {
  private readonly sel = el('<select class="cv-input" aria-label="Data set"></select>') as HTMLSelectElement;
  private readonly selRow = el('<label class="cv-field"><span>Data Set</span></label>');
  private readonly prev = el('<button class="cv-btn ghost" type="button">Previous</button>') as HTMLButtonElement;
  private readonly next = el('<button class="cv-btn ghost" type="button">Next</button>') as HTMLButtonElement;
  private readonly imp = el('<button class="cv-btn ghost" type="button">Import...</button>') as HTMLButtonElement;
  private readonly add = el('<button class="cv-btn ghost" type="button">New</button>') as HTMLButtonElement;
  private readonly delim = el('<select class="cv-input" aria-label="Delimiter" title="The character that separates the fields of an imported file"><option value="">Detect</option><option value=",">Comma</option><option value=";">Semicolon</option><option value="\\t">Tab</option><option value="|">Bar</option></select>') as HTMLSelectElement;
  private readonly preview: Row<boolean>;
  private readonly table = el('<div class="cv-field" style="display:block;height:180px;overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Variable</th><th style="text-align:left">Value</th></tr></thead><tbody></tbody></table></div>');
  private readonly rows = this.table.querySelector('tbody') as HTMLTableSectionElement;
  private readonly note = el('<p class="cv-note"></p>');
  private previewOn = false;
  private readonly file = el('<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden>') as HTMLInputElement;

  constructor(private readonly engine: Engine) {
    super('Data Sets', 460);
    const nav = el('<div class="cv-field" style="display:flex;gap:8px"></div>');
    nav.append(this.prev, this.next, this.add, this.imp, this.delim);
    this.selRow.append(this.sel);
    this.preview = checkRow('Preview', (v) => { this.previewOn = v; if (v) void this.go(); });
    this.body.append(this.selRow, nav, this.preview.el, this.table, this.note, this.file);
    this.sel.addEventListener('change', () => { this.fill(); if (this.previewOn) void this.go(); });
    this.prev.addEventListener('click', () => this.step(-1));
    this.next.addEventListener('click', () => this.step(1));
    this.imp.addEventListener('click', () => this.file.click());
    this.add.addEventListener('click', () => this.create());
    this.file.addEventListener('change', () => {
      const f = this.file.files?.[0];
      this.file.value = '';
      if (f) void f.text().then((t) => { this.engine.importDataSets(t, this.delim.value); this.load(); });
    });
    this.button('Close', 'ghost', () => this.close());
    this.button('Apply', 'primary', () => { void this.go(); });
    this.remember([this.sel]);
  }

  show(): void {
    if (this.isOpen || !this.engine.current) return;
    this.load();
    this.open();
  }

  private sets() { return this.engine.current?.doc.dataSets ?? []; }

  private load(): void {
    const sets = this.sets(), active = this.engine.current?.doc.activeDataSet;
    this.sel.replaceChildren(...sets.map((d) => { const o = document.createElement('option'); o.value = d.name; o.textContent = d.name; return o; }));
    if (active && sets.some((d) => d.name === active)) this.sel.value = active;
    this.fill();
  }

  private fill(): void {
    const sets = this.sets(), cur = sets.find((d) => d.name === this.sel.value), vars = this.engine.current?.doc.variables ?? [];
    this.rows.replaceChildren(...(cur ? vars.map((v) => {
      const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'), box = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false">');
      a.textContent = v.name; box.value = cur.values[v.name] ?? ''; box.setAttribute('aria-label', `${v.name} value`);
      box.addEventListener('change', () => this.setValue(cur.name, v.name, box.value));
      b.append(box);
      tr.append(a, b);
      return tr;
    }) : []));
    const i = sets.findIndex((d) => d.name === this.sel.value);
    this.prev.disabled = i <= 0;
    this.next.disabled = i < 0 || i >= sets.length - 1;
    this.sel.disabled = !sets.length;
    setText(this.note, sets.length ? `${sets.length} data set${sets.length === 1 ? '' : 's'}, ${vars.length} variable${vars.length === 1 ? '' : 's'}` : 'No data sets yet. Import a CSV or text file.');
  }

  /** The data sets written as CSV, a leading Data Set column holding each name, so the engine's importer keeps names and values. */
  private csv(sets: readonly { name: string; values: Record<string, string> }[]): string {
    const keys: string[] = [];
    for (const v of this.engine.current?.doc.variables ?? []) if (!keys.includes(v.name)) keys.push(v.name);
    for (const s of sets) for (const k of Object.keys(s.values)) if (!keys.includes(k)) keys.push(k);
    const cols = keys.filter((k) => k !== 'Data Set'), q = (t: string): string => `"${t.replace(/\t/g, ' ').replace(/"/g, '""')}"`;
    return [['Data Set', ...cols].map(q).join(','), ...sets.map((s) => [s.name, ...cols.map((k) => s.values[k] ?? '')].map(q).join(','))].join('\n');
  }

  /** Sets one variable's value in one data set; the rows on show stay as they are. */
  private setValue(set: string, variable: string, value: string): void {
    const next = this.sets().map((s) => (s.name === set ? { ...s, values: { ...s.values, [variable]: value } } : s));
    this.engine.importDataSets(this.csv(next), ',');
  }

  /** New: an empty data set after the others, chosen so its values can be typed in. */
  private create(): void {
    const sets = this.sets(), vars = this.engine.current?.doc.variables ?? [];
    if (!this.engine.current) return;
    if (!vars.length) { setText(this.note, 'Define a variable first (Image > Variables > Define).'); return; }
    let n = sets.length + 1, name = `Data Set ${n}`;
    while (sets.some((s) => s.name === name)) name = `Data Set ${++n}`;
    if (!this.engine.importDataSets(this.csv([...sets, { name, values: {} }]), ',')) return;
    this.load();
    this.sel.value = name;
    this.fill();
  }

  private step(d: number): void {
    const sets = this.sets(), i = sets.findIndex((x) => x.name === this.sel.value), n = sets[i + d];
    if (!n) return;
    this.sel.value = n.name;
    this.fill();
    if (this.previewOn) void this.go();
  }

  private async go(): Promise<void> {
    if (this.sel.value) await this.engine.applyDataSet(this.sel.value);
  }
}
