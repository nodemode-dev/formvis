import type { Engine } from '../engine';
import { MEASURE_COLS, type MeasureRec } from './panels/measurement-dialogs';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';

/** The Measurement Log panel (Window > Measurement Log, DEV_PLAN 35.3 part b): the recorded measurements as a compact
 *  table. The skeleton is built once; rows are patched in by record id and their cells updated in place. */
export class MeasurementLogPanel {
  private readonly body: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly count: HTMLElement;
  private readonly foot: HTMLButtonElement[];
  private selected: number | null = null;

  constructor(root: HTMLElement, private readonly engine: Engine, private readonly deliver: (blob: Blob, name: string) => Promise<void> | void) {
    const btn = (cmd: string, title: string, label: string): string => `<button class="cv-icon-btn cv-styles-clear" type="button" data-act="${cmd}" title="${title}" aria-label="${title}">${label}</button>`;
    const heads = MEASURE_COLS.map(([n]) => `<th>${n}</th>`).join('');
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-measure-log" aria-label="Measurement Log">` +
      `<div class="cv-panel-head"><span class="cv-comps-title">${icon('layers', 14)}<span>Measurement Log</span></span><span></span><span class="cv-comps-count"></span></div>` +
      `<div class="cv-measure-wrap"><table class="cv-measure-table"><thead><tr>${heads}</tr></thead><tbody></tbody></table>` +
      `<div class="cv-comps-empty">No records yet. Use Record to measure the selection, the Ruler line or the counts.</div></div>` +
      `<div class="cv-panel-foot">${btn('export', 'Export the log as CSV', 'Export')}${btn('clear', 'Clear the log', 'Clear')}${btn('delete', 'Delete the selected record', 'Delete')}${btn('record', 'Record measurements', 'Record')}</div></section>`);
    const section = q(root, '.cv-measure-log');
    this.body = q(section, 'tbody');
    this.empty = q(section, '.cv-comps-empty');
    this.count = q(section, '.cv-comps-count');
    this.foot = Array.from(section.querySelectorAll<HTMLButtonElement>('.cv-panel-foot [data-act]'));
    section.querySelector('.cv-panel-foot')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
      if (!b || b.disabled) return;
      switch (b.dataset.act) {
        case 'record': this.engine.recordMeasurements(); break;
        case 'delete': if (this.selected !== null) { this.engine.deleteMeasurement(this.selected); this.selected = null; } break;
        case 'clear': this.engine.clearMeasurements(); this.selected = null; break;
        case 'export': void this.exportCsv(); break;
      }
      this.sync();
    });
    this.body.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
      if (!row) return;
      this.selected = Number(row.dataset.id);
      this.sync();
    });
    for (const ev of ['doc', 'history', 'active', 'projects'] as const) engine.on(ev, () => this.sync());
    this.sync();
  }

  private sync(): void {
    const d = this.engine.current?.doc, list: readonly MeasureRec[] = d?.measurements ?? [];
    if (this.selected !== null && !list.some((m) => m.id === this.selected)) this.selected = null;
    setText(this.count, list.length ? String(list.length) : '');
    setHidden(this.empty, list.length > 0 || !d);
    this.foot.forEach((b) => {
      const a = b.dataset.act;
      const off = !d || (a === 'delete' ? this.selected === null : a === 'record' ? false : list.length === 0);
      if (b.disabled !== off) b.disabled = off;
    });
    patchList<MeasureRec>(this.body, [...list], {
      key: (m) => String(m.id),
      create: (m) => {
        const tr = el(`<tr>${MEASURE_COLS.map(() => '<td></td>').join('')}</tr>`);
        this.fill(tr, m);
        return tr;
      },
      update: (tr, m) => this.fill(tr, m),
    });
  }

  private fill(tr: HTMLElement, m: MeasureRec): void {
    if (tr.dataset.id !== String(m.id)) tr.dataset.id = String(m.id);
    const cells = tr.children;
    MEASURE_COLS.forEach(([, f], i) => setText(cells[i], f(m)));
    tr.classList.toggle('is-active', m.id === this.selected);
  }

  private async exportCsv(): Promise<void> {
    const list = this.engine.current?.doc.measurements ?? [];
    if (!list.length) return;
    const cell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [MEASURE_COLS.map(([n]) => n).join(','), ...list.map((m) => MEASURE_COLS.map(([, f]) => cell(f(m))).join(','))];
    await this.deliver(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }), `${this.engine.current?.name ?? 'Untitled'} measurements.csv`);
  }
}
