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
    this.body.append(this.layerRow, ...vis, ...txt, ...pix, this.methodRow.el);
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
  }

  private apply(): void {
    const l = this.layer();
    if (!l) return;
    this.close();
    for (const kind of ['visibility', 'text', 'pixels'] as const) {
      if (!this.want[kind]) continue;
      this.engine.defineVariable({ name: this.names[kind].value.trim() || l.name, layer: l.id, kind, ...(kind === 'pixels' ? { method: this.method } : {}) });
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
  private readonly preview: Row<boolean>;
  private readonly table = el('<div class="cv-field" style="display:block;height:180px;overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Variable</th><th style="text-align:left">Value</th></tr></thead><tbody></tbody></table></div>');
  private readonly rows = this.table.querySelector('tbody') as HTMLTableSectionElement;
  private readonly note = el('<p class="cv-note"></p>');
  private previewOn = false;
  private readonly file = el('<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden>') as HTMLInputElement;

  constructor(private readonly engine: Engine) {
    super('Data Sets', 460);
    const nav = el('<div class="cv-field" style="display:flex;gap:8px"></div>');
    nav.append(this.prev, this.next, this.imp);
    this.selRow.append(this.sel);
    this.preview = checkRow('Preview', (v) => { this.previewOn = v; if (v) void this.go(); });
    this.body.append(this.selRow, nav, this.preview.el, this.table, this.note, this.file);
    this.sel.addEventListener('change', () => { this.fill(); if (this.previewOn) void this.go(); });
    this.prev.addEventListener('click', () => this.step(-1));
    this.next.addEventListener('click', () => this.step(1));
    this.imp.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => {
      const f = this.file.files?.[0];
      this.file.value = '';
      if (f) void f.text().then((t) => { this.engine.importDataSets(t); this.load(); });
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
      const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td');
      a.textContent = v.name; b.textContent = cur.values[v.name] ?? '';
      tr.append(a, b);
      return tr;
    }) : []));
    const i = sets.findIndex((d) => d.name === this.sel.value);
    this.prev.disabled = i <= 0;
    this.next.disabled = i < 0 || i >= sets.length - 1;
    this.sel.disabled = !sets.length;
    setText(this.note, sets.length ? `${sets.length} data set${sets.length === 1 ? '' : 's'}, ${vars.length} variable${vars.length === 1 ? '' : 's'}` : 'No data sets yet. Import a CSV or text file.');
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
