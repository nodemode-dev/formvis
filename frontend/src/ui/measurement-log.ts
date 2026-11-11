import type { Engine, Project } from '../engine';
import { MEASURE_COLS_EVENT, visibleMeasureCols, type MeasureRec } from './panels/measurement-dialogs';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';

/** The Measurement Log panel (Window > Measurement Log, DEV_PLAN 35.3 part b): the recorded measurements as a compact
 *  table. The skeleton is built once; rows are patched in by record id and their cells updated in place. */
export class MeasurementLogPanel {
  private readonly body: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly count: HTMLElement;
  private readonly foot: HTMLButtonElement[];
  private readonly selected = new Set<number>();
  private anchor: number | null = null;
  private selectedIn: Project | null = null;
  private cols: ReturnType<typeof visibleMeasureCols>;
  private colKey: string;
  private readonly headRow: HTMLElement;

  constructor(root: HTMLElement, private readonly engine: Engine, private readonly deliver: (blob: Blob, name: string) => Promise<void> | void) {
    const btn = (cmd: string, title: string, label: string): string => `<button class="cv-icon-btn cv-styles-clear" type="button" data-act="${cmd}" title="${title}" aria-label="${title}">${label}</button>`;
    this.cols = visibleMeasureCols();
    this.colKey = this.cols.map(([n]) => n).join('|');
    const heads = this.cols.map(([n]) => `<th>${n}</th>`).join('');
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-measure-log" aria-label="Measurement Log">` +
      `<div class="cv-panel-head"><span class="cv-comps-title">${icon('layers', 14)}<span>Measurement Log</span></span><span></span><span class="cv-comps-count"></span></div>` +
      `<div class="cv-measure-wrap"><table class="cv-measure-table"><thead><tr>${heads}</tr></thead><tbody></tbody></table>` +
      `<div class="cv-comps-empty">No records yet. Use Record to measure the selection, the Ruler line or the counts.</div></div>` +
      `<div class="cv-panel-foot">${btn('all', 'Select every record', 'Select All')}${btn('none', 'Deselect every record', 'Deselect')}${btn('export', 'Export the selected records as CSV, or the whole log when none is selected', 'Export')}${btn('clear', 'Clear the log', 'Clear')}${btn('delete', 'Delete the selected records', 'Delete')}${btn('record', 'Record measurements', 'Record')}</div></section>`);
    const section = q(root, '.cv-measure-log');
    this.body = q(section, 'tbody');
    this.headRow = q(section, 'thead tr');
    window.addEventListener(MEASURE_COLS_EVENT, () => this.sync());
    this.empty = q(section, '.cv-comps-empty');
    this.count = q(section, '.cv-comps-count');
    this.foot = Array.from(section.querySelectorAll<HTMLButtonElement>('.cv-panel-foot [data-act]'));
    section.querySelector('.cv-panel-foot')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
      if (!b || b.disabled) return;
      switch (b.dataset.act) {
        case 'record': this.engine.recordMeasurements(); break;
        case 'delete': for (const id of [...this.selected]) this.engine.deleteMeasurement(id); this.selected.clear(); break;
        case 'clear': this.engine.clearMeasurements(); this.selected.clear(); break;
        case 'all': for (const m of this.engine.current?.doc.measurements ?? []) this.selected.add(m.id); break;
        case 'none': this.selected.clear(); this.anchor = null; break;
        case 'export': void this.exportCsv(); break;
      }
      this.sync();
    });
    this.body.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
      if (!row) return;
      const id = Number(row.dataset.id), ids = (this.engine.current?.doc.measurements ?? []).map((m) => m.id);
      if (e.shiftKey && this.anchor !== null && ids.includes(this.anchor)) {
        const a = ids.indexOf(this.anchor), b = ids.indexOf(id);
        this.selected.clear();
        for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) this.selected.add(x);
      } else if (e.ctrlKey || e.metaKey) {
        if (!this.selected.delete(id)) this.selected.add(id);
        this.anchor = id;
      } else {
        this.selected.clear();
        this.selected.add(id);
        this.anchor = id;
      }
      this.sync();
    });
    for (const ev of ['doc', 'history', 'active', 'projects'] as const) engine.on(ev, () => this.sync());
    this.sync();
  }

  private sync(): void {
    const d = this.engine.current?.doc, list: readonly MeasureRec[] = d?.measurements ?? [];
    if (this.engine.current !== this.selectedIn) { this.selected.clear(); this.anchor = null; this.selectedIn = this.engine.current; }
    for (const id of [...this.selected]) if (!list.some((m) => m.id === id)) this.selected.delete(id);
    const cols = visibleMeasureCols(), key = cols.map(([n]) => n).join('|');
    if (key !== this.colKey) {   // Select Data Points changed the columns: rebuild the header and rows once
      this.cols = cols;
      this.colKey = key;
      this.headRow.replaceChildren(...cols.map(([n]) => el(`<th>${n}</th>`)));
      this.body.replaceChildren();
    }
    setText(this.count, list.length ? String(list.length) : '');
    setHidden(this.empty, list.length > 0 || !d);
    this.foot.forEach((b) => {
      const a = b.dataset.act;
      const off = !d || (a === 'delete' || a === 'none' ? this.selected.size === 0 : a === 'record' ? false : list.length === 0);
      if (b.disabled !== off) b.disabled = off;
    });
    patchList<MeasureRec>(this.body, [...list], {
      key: (m) => String(m.id),
      create: (m) => {
        const tr = el(`<tr>${this.cols.map(() => '<td></td>').join('')}</tr>`);
        this.fill(tr, m);
        return tr;
      },
      update: (tr, m) => this.fill(tr, m),
    });
  }

  private fill(tr: HTMLElement, m: MeasureRec): void {
    if (tr.dataset.id !== String(m.id)) tr.dataset.id = String(m.id);
    const cells = tr.children;
    this.cols.forEach(([, f], i) => setText(cells[i], f(m)));
    tr.classList.toggle('is-active', this.selected.has(m.id));
  }

  private async exportCsv(): Promise<void> {
    const all = this.engine.current?.doc.measurements ?? [], list = this.selected.size ? all.filter((m) => this.selected.has(m.id)) : all;
    if (!list.length) return;
    const cell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [this.cols.map(([n]) => n).join(','), ...list.map((m) => this.cols.map(([, f]) => cell(f(m))).join(','))];
    await this.deliver(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }), `${this.engine.current?.name ?? 'Untitled'} measurements.csv`);
  }
}
