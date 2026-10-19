import type { Engine } from '../../engine';
import type { Doc } from '../../engine/types';
import { Dialog } from '../dialogs';
import { el, q, setText, setValue } from '../dom';
import { MEASURE_POINTS, loadPrefs, updatePrefs } from '../prefs';
import { tn } from '../i18n';

/** The Set Measurement Scale presets: a pixel length that stands for a logical length. Custom keeps what is typed. */
export const SCALE_PRESETS: ReadonlyArray<{ label: string; pixels: number; length: number; units: string; custom?: boolean }> = [
  { label: 'Custom', pixels: 1, length: 1, units: 'px', custom: true },
  { label: '1 pixel = 1 pixel', pixels: 1, length: 1, units: 'px' },
  { label: '10 pixels = 1 millimeter', pixels: 10, length: 1, units: 'mm' },
  { label: '100 pixels = 1 centimeter', pixels: 100, length: 1, units: 'cm' },
  { label: '96 pixels = 1 inch', pixels: 96, length: 1, units: 'in' },
  { label: '72 pixels = 1 inch', pixels: 72, length: 1, units: 'in' },
  { label: '300 pixels = 1 inch', pixels: 300, length: 1, units: 'in' },
  { label: '10 pixels = 1 micrometer', pixels: 10, length: 1, units: 'um' },
];

/** Image > Analysis > Set Measurement Scale (DEV_PLAN 31.6 part a): pixels per logical length. Built once. */
export class MeasureScaleDialog extends Dialog {
  private readonly preset = el<HTMLSelectElement>('<select class="cv-input"></select>');
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
    this.body.append(el('<p class="cv-dialog-note">How many pixels make a logical length. Draw a Ruler line first to fill the pixel length.</p>'), this.field('Preset', this.preset), this.pixels, this.length, this.units);
    for (const [i, p] of SCALE_PRESETS.entries()) this.preset.append(el(`<option value="${i}">${p.label}</option>`));
    this.preset.addEventListener('change', () => {
      const p = SCALE_PRESETS[Number(this.preset.value)];
      if (!p || p.custom) return;
      setValue(this.pIn, String(p.pixels));
      setValue(this.lIn, String(p.length));
      setValue(this.uIn, p.units);
    });
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
    setValue(this.preset, '0');
    this.open();
  }
}

/** Image > Analysis > Place Scale Marker: the bar's length in logical units, its colour, and the text's font, size,
 *  wording and position. Built once; the length starts at about a fifth of the width. */
export class ScaleMarkerDialog extends Dialog {
  private readonly length = el<HTMLInputElement>('<input class="cv-input" type="number" min="0.001" step="any">');
  private readonly show$ = el<HTMLInputElement>('<input type="checkbox" checked>');
  private readonly textIn = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="40" placeholder="Length and units">');
  private readonly font = el<HTMLSelectElement>('<select class="cv-input"><option value="sans-serif">Sans-serif</option><option value="serif">Serif</option><option value="monospace">Monospace</option></select>');
  private readonly size = el<HTMLInputElement>('<input class="cv-input" type="number" min="6" max="200" step="1" value="12">');
  private readonly pos = el<HTMLSelectElement>('<select class="cv-input"><option value="above">Above</option><option value="below">Below</option></select>');
  private readonly color = el<HTMLSelectElement>('<select class="cv-input"><option value="black">Black</option><option value="white">White</option></select>');

  constructor(private readonly engine: Engine) {
    super('Place Scale Marker', 360);
    this.body.append(el('<p class="cv-dialog-note">A bar as long as the length below, on a new layer at the lower left.</p>'));
    this.field('Length', this.length);
    this.field('Display Text', this.show$).classList.add('cv-check');
    this.field('Text', this.textIn);
    this.field('Font', this.font);
    this.field('Font Size', this.size);
    this.field('Text Position', this.pos);
    this.field('Colour', this.color);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => {
      const len = Number(this.length.value);
      if (!(len > 0)) return;
      this.engine.placeScaleMarker({ lengthUnits: len, text: this.show$.checked, color: this.color.value === 'white' ? 'white' : 'black', fontSize: Number(this.size.value) || 12, font: this.font.value, textBelow: this.pos.value === 'below', label: this.textIn.value });
      this.close();
    });
  }

  show(): void {
    const d = this.engine.current?.doc, sc = d?.measureScale;
    if (d && sc) setValue(this.length, String(autoMarkerLength(d.width, sc)));
    this.open();
  }
}

/** About a fifth of the width in logical units, rounded to 1, 2, 5 or 10 times a power of ten. */
export function autoMarkerLength(width: number, sc: { pixels: number; length: number }): number {
  const raw = (width / 5) * (sc.length / sc.pixels), pow = Math.pow(10, Math.floor(Math.log10(raw)));
  return pow * ([1, 2, 5, 10].reduce((best, m) => (Math.abs(m * pow - raw) < Math.abs(best * pow - raw) ? m : best), 1));
}

type Rec = NonNullable<Doc['measurements']>[number];
export type MeasureRec = Rec;

export const MEASURE_COLS:ReadonlyArray<readonly [string, (m: Rec) => string]> = [
  ['Label', (m) => m.label],
  ['Scale', (m) => `${num(m.scale)} ${m.units}/px`],
  ['Area', (m) => opt(m.area)],
  ['Perimeter', (m) => opt(m.perimeter)],
  ['Length', (m) => opt(m.length)],
  ['Angle', (m) => opt(m.angle)],
  ['Count', (m) => (m.count === undefined ? '' : String(m.count))],
  ['W', (m) => opt(m.w)],
  ['H', (m) => opt(m.h)],
  ['Gray Value', (m) => (m.gray === undefined ? '' : m.gray.toFixed(1))],
  ['Min Gray', (m) => (m.grayMin === undefined ? '' : m.grayMin.toFixed(1))],
  ['Max Gray', (m) => (m.grayMax === undefined ? '' : m.grayMax.toFixed(1))],
  ['Integrated Density', (m) => opt(m.intDen)],
  ['Centroid X', (m) => opt(m.cx)],
  ['Centroid Y', (m) => opt(m.cy)],
  ['Circularity', (m) => (m.area === undefined || !m.perimeter ? '' : num((4 * Math.PI * m.area) / (m.perimeter * m.perimeter)))],
  ['Histogram', (m) => (m.hist ? m.hist.map((b) => String(Math.round(b))).join(';') : '')],
];
/** The columns Select Data Points keeps, in log order; Label is always shown. */
export function visibleMeasureCols(): ReadonlyArray<readonly [string, (m: Rec) => string]> {
  const on = loadPrefs().measureDataPoints;
  return MEASURE_COLS.filter(([n]) => n === 'Label' || on.includes(n));
}
export const MEASURE_COLS_EVENT = 'formvis:measure-columns';

/** Image > Analysis > Select Data Points: which measurements the Measurement Log and its CSV show. Built once. */
export class MeasureDataPointsDialog extends Dialog {
  private readonly boxes: Array<readonly [string, HTMLInputElement]> = [];

  constructor() {
    super('Select Data Points', 460);
    this.body.append(el('<p class="cv-dialog-note">Record Measurements keeps every value; these choose the columns the Measurement Log and its CSV show.</p>'));
    // One cv-field row per data point (label column, then the box), the layout the other dialogs' checkboxes use.
    for (const name of MEASURE_POINTS) {
      const box = el<HTMLInputElement>('<input type="checkbox">');
      box.setAttribute('aria-label', name);
      if (name === 'Label') { box.checked = true; box.disabled = true; }
      this.boxes.push([name, box]);
      this.field(name === 'W' ? 'Width (W)' : name === 'H' ? 'Height (H)' : name, box).classList.add('cv-check');
    }
    const all = (on: boolean): void => { for (const [n, b] of this.boxes) if (n !== 'Label') b.checked = on; };
    this.button('Select All', 'ghost', () => all(true));
    this.button('Select None', 'ghost', () => all(false));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => {
      updatePrefs({ measureDataPoints: this.boxes.filter(([, b]) => b.checked).map(([n]) => n) });
      window.dispatchEvent(new Event(MEASURE_COLS_EVENT));
      this.close();
    });
  }

  show(): void {
    const on = loadPrefs().measureDataPoints;
    for (const [n, b] of this.boxes) if (n !== 'Label') b.checked = on.includes(n);
    this.open();
  }
}
const num = (v: number): string => String(Number(v.toFixed(3)));
const opt = (v: number | undefined): string => (v === undefined ? '' : num(v));

/** Image > Analysis > Measurement Log: the recorded measurements as a table. The shell is built once; only the rows change. */
export class MeasurementLogDialog extends Dialog {
  private readonly tbody = el('<tbody></tbody>');
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private selected: number | null = null;
  private readonly head: HTMLElement;

  constructor(private readonly engine: Engine, private readonly deliver: (blob: Blob, name: string) => Promise<void> | void) {
    super('Measurement Log', 720);
    const table = el('<table class="cv-table" style="width: 100%; border-collapse: collapse"><thead><tr></tr></thead></table>');
    this.head = q(table, 'tr');
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
    const cols = visibleMeasureCols();
    this.head.replaceChildren(...cols.map(([name]) => el(`<th style="text-align: left; padding: 2px 6px">${name}</th>`)));
    const rows = list.map((m) => {
      const tr = el('<tr style="cursor: pointer"></tr>');
      for (const [, f] of cols) { const td = el('<td style="padding: 2px 6px"></td>'); setText(td, f(m)); tr.append(td); }
      if (m.id === this.selected) tr.style.background = 'var(--accent-soft, rgba(127,127,255,0.25))';
      tr.addEventListener('click', () => {
        this.selected = m.id;
        for (const r of Array.from(this.tbody.children)) (r as HTMLElement).style.background = '';
        tr.style.background = 'var(--accent-soft, rgba(127,127,255,0.25))';
      });
      return tr;
    });
    this.tbody.replaceChildren(...rows);
    setText(this.note, list.length ? tn(list.length, '{n} record.', '{n} records.') :'No records yet. Press Record to measure the selection, the Ruler line or the counts.');
  }

  private async exportCsv(): Promise<void> {
    const list = this.engine.current?.doc.measurements ?? [];
    if (!list.length) { setText(this.note, 'Nothing to export.'); return; }
    const cell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const cols = visibleMeasureCols();
    const lines = [cols.map(([n]) => n).join(','), ...list.map((m) => cols.map(([, f]) => cell(f(m))).join(','))];
    await this.deliver(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }), `${this.engine.current?.name ?? 'Untitled'} measurements.csv`);
  }
}
