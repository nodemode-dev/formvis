import type { Engine } from '../../engine';
import type { Doc } from '../../engine/types';
import { Dialog } from '../dialogs';
import { el, q, setText, setValue } from '../dom';

/** Image > Analysis > Set Measurement Scale (DEV_PLAN 31.6 part a): pixels per logical length. Built once. */
export class MeasureScaleDialog extends Dialog {
  private readonly pixels = el('<label class="cv-field"><span></span><input class="cv-input" type="number" min="0.001" step="any"></label>');
  private readonly length = el('<label class="cv-field"><span></span><input class="cv-input" type="number" min="0.001" step="any"></label>');
  private readonly units = el('<label class="cv-field"><span></span><input class="cv-input" type="text" maxlength="12"></label>');
  private readonly pIn: HTMLInputElement;
  private readonly lIn: HTMLInputElement;
  private readonly uIn: HTMLInputElement;

  constructor(private readonly engine: Engine) {
    super('Set Measurement Scale', 360);
    setText(q(this.pixels, 'span'), 'Pixel Length');
    setText(q(this.length, 'span'), 'Logical Length');
    setText(q(this.units, 'span'), 'Logical Units');
    this.pIn = q(this.pixels, 'input') as HTMLInputElement;
    this.lIn = q(this.length, 'input') as HTMLInputElement;
    this.uIn = q(this.units, 'input') as HTMLInputElement;
    this.body.append(el('<p class="cv-dialog-note">How many pixels make a logical length. Draw a Ruler line first to fill the pixel length.</p>'), this.pixels, this.length, this.units);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => {
      this.engine.setMeasureScale(Number(this.pIn.value), Number(this.lIn.value), this.uIn.value);
      this.close();
    });
  }

  show(): void {
    const sc = this.engine.current?.doc.measureScale, r = this.engine.measure?.ruler;
    const ruler = r ? Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y) : 0;
    setValue(this.pIn, String(Number((ruler > 0 ? ruler : sc?.pixels ?? 1).toFixed(3))));
    setValue(this.lIn, String(sc?.length ?? 1));
    setValue(this.uIn, sc?.units ?? 'cm');
    this.open();
  }
}

type Rec = NonNullable<Doc['measurements']>[number];

const COLS: ReadonlyArray<readonly [string, (m: Rec) => string]> = [
  ['Label', (m) => m.label],
  ['Scale', (m) => `${num(m.scale)} ${m.units}/px`],
  ['Area', (m) => opt(m.area)],
  ['Perimeter', (m) => opt(m.perimeter)],
  ['Length', (m) => opt(m.length)],
  ['Angle', (m) => opt(m.angle)],
  ['Count', (m) => (m.count === undefined ? '' : String(m.count))],
  ['W', (m) => opt(m.w)],
  ['H', (m) => opt(m.h)],
];
const num = (v: number): string => String(Number(v.toFixed(3)));
const opt = (v: number | undefined): string => (v === undefined ? '' : num(v));

/** Image > Analysis > Measurement Log: the recorded measurements as a table. The shell is built once; only the rows change. */
export class MeasurementLogDialog extends Dialog {
  private readonly tbody = el('<tbody></tbody>');
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private selected: number | null = null;

  constructor(private readonly engine: Engine, private readonly deliver: (blob: Blob, name: string) => Promise<void> | void) {
    super('Measurement Log', 720);
    const table = el('<table class="cv-table" style="width: 100%; border-collapse: collapse"><thead><tr></tr></thead></table>');
    const head = q(table, 'tr');
    for (const [name] of COLS) head.append(el(`<th style="text-align: left; padding: 2px 6px">${name}</th>`));
    table.append(this.tbody);
    const wrap = el('<div style="max-height: 320px; overflow: auto"></div>');
    wrap.append(table);
    this.body.append(wrap, this.note);
    this.button('Record', '', () => { this.engine.recordMeasurements(); this.refresh(); });
    this.button('Delete Selected', '', () => { if (this.selected !== null) this.engine.deleteMeasurement(this.selected); this.selected = null; this.refresh(); });
    this.button('Clear', 'danger', () => { this.engine.clearMeasurements(); this.selected = null; this.refresh(); });
    this.button('Export...', '', () => void this.exportCsv());
    this.button('Done', 'primary', () => this.close());
  }

  show(): void {
    this.selected = null;
    this.refresh();
    this.open();
  }

  private refresh(): void {
    const list = this.engine.current?.doc.measurements ?? [];
    const rows = list.map((m) => {
      const tr = el('<tr style="cursor: pointer"></tr>');
      for (const [, f] of COLS) { const td = el('<td style="padding: 2px 6px"></td>'); setText(td, f(m)); tr.append(td); }
      if (m.id === this.selected) tr.style.background = 'var(--accent-soft, rgba(127,127,255,0.25))';
      tr.addEventListener('click', () => {
        this.selected = m.id;
        for (const r of Array.from(this.tbody.children)) (r as HTMLElement).style.background = '';
        tr.style.background = 'var(--accent-soft, rgba(127,127,255,0.25))';
      });
      return tr;
    });
    this.tbody.replaceChildren(...rows);
    setText(this.note, list.length ? `${list.length} record${list.length === 1 ? '' : 's'}.` : 'No records yet. Press Record to measure the selection, the Ruler line or the counts.');
  }

  private async exportCsv(): Promise<void> {
    const list = this.engine.current?.doc.measurements ?? [];
    if (!list.length) { setText(this.note, 'Nothing to export.'); return; }
    const cell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [COLS.map(([n]) => n).join(','), ...list.map((m) => COLS.map(([, f]) => cell(f(m))).join(','))];
    await this.deliver(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }), `${this.engine.current?.name ?? 'Untitled'} measurements.csv`);
  }
}
