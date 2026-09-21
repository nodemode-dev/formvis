import { clamp, type Engine, type RGB, type Transform } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setClass, setText } from '../dom';
import { toast } from '../toast';
import { checkRow, numberRow, selectRow } from './controls';

type Unit = 'px' | 'pct' | 'in' | 'cm';
const UNITS = [['px', 'Pixels'], ['pct', 'Percent'], ['in', 'Inches'], ['cm', 'Centimeters']] as const;
const toPx = (v: number, unit: Unit, base: number, res: number): number => (unit === 'px' ? v : unit === 'pct' ? (v * base) / 100 : unit === 'in' ? v * res : (v * res) / 2.54);
const fromPx = (px: number, unit: Unit, base: number, res: number): number => (unit === 'px' ? px : unit === 'pct' ? (px / base) * 100 : unit === 'in' ? px / res : (px / res) * 2.54);
const tidy = (v: number, unit: Unit): number => (unit === 'px' ? Math.round(v) : Math.round(v * 100) / 100);
const enterTo = (input: HTMLInputElement, run: () => void): void => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

export class CanvasSizeDialog extends Dialog {
  /** Called when the canvas is resized, for Actions to record it. */
  onApplied: ((v: { w: number; h: number; dx: number; dy: number; fill: RGB | null; fromW: number; fromH: number }) => void) | null = null;
  private unit: Unit = 'px';
  private anchor = 4;
  private w = 1;
  private h = 1;
  private readonly note = el('<p class="cv-note"></p>');
  private readonly width = numberRow('Width', 0, 30000, 1, (v) => { this.w = this.px(v, true); });
  private readonly height = numberRow('Height', 0, 30000, 1, (v) => { this.h = this.px(v, false); });
  private readonly units = selectRow('Units', UNITS, (v) => { this.unit = v as Unit; this.fields(); });
  private readonly fill = selectRow('Extension', [['none', 'Transparent'], ['fg', 'Foreground color'], ['bg', 'Background color'], ['white', 'White'], ['black', 'Black']], () => undefined);
  private readonly anchors: HTMLButtonElement[] = [];

  constructor(private readonly engine: Engine) {
    super('Canvas Size', 420);
    const grid = el('<div class="cv-anchor-grid" role="group" aria-label="Anchor"></div>');
    for (let i = 0; i < 9; i++) {
      const b = el<HTMLButtonElement>(`<button type="button" aria-label="Anchor ${i + 1}"></button>`);
      b.addEventListener('click', () => { this.anchor = i; this.syncAnchor(); });
      grid.appendChild(b);
      this.anchors.push(b);
    }
    const anchorRow = el('<div class="cv-field"><span>Anchor</span></div>');
    anchorRow.appendChild(grid);
    this.body.append(this.note, this.width.el, this.height.el, this.units.el, anchorRow, this.fill.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.width.input, () => this.apply());
    enterTo(this.height.input, () => this.apply());
  }

  show(): void {
    const p = this.engine.current;
    if (!p || this.isOpen) return;
    this.w = p.doc.width;
    this.h = p.doc.height;
    this.unit = 'px';
    this.anchor = 4;
    setText(this.note, `Current size: ${p.doc.width} \u00d7 ${p.doc.height} px`);
    this.units.set('px');
    this.fill.set('none');
    this.fields();
    this.syncAnchor();
    this.open(this.width.input);
    this.width.input.select();
  }

  private px(v: number, horizontal: boolean): number {
    const p = this.engine.current;
    if (!p) return 1;
    return Math.round(toPx(v, this.unit, horizontal ? p.doc.width : p.doc.height, p.doc.resolution || 72));
  }

  private fields(): void {
    const p = this.engine.current;
    if (!p) return;
    const res = p.doc.resolution || 72;
    this.width.set(tidy(fromPx(this.w, this.unit, p.doc.width, res), this.unit));
    this.height.set(tidy(fromPx(this.h, this.unit, p.doc.height, res), this.unit));
  }

  private syncAnchor(): void { this.anchors.forEach((b, i) => setClass(b, 'is-active', i === this.anchor)); }

  private apply(): void {
    const p = this.engine.current;
    if (!p) return;
    const W = this.w, H = this.h, w0 = p.doc.width, h0 = p.doc.height;
    const dx = Math.floor(((W - w0) * (this.anchor % 3)) / 2), dy = Math.floor(((H - h0) * Math.floor(this.anchor / 3)) / 2);
    const choice = this.fill.el.querySelector('select')?.value ?? 'none';
    const colors: Record<string, RGB | null> = { none: null, fg: this.engine.fg, bg: this.engine.bg, white: { r: 255, g: 255, b: 255 }, black: { r: 0, g: 0, b: 0 } };
    const fromW = this.engine.current?.doc.width ?? W, fromH = this.engine.current?.doc.height ?? H;
    if (this.engine.resizeCanvas(W, H, dx, dy, colors[choice] ?? null)) { this.onApplied?.({ w: W, h: H, dx, dy, fill: colors[choice] ?? null, fromW, fromH }); this.close(); }
  }
}

export class ImageSizeDialog extends Dialog {
  /** Called when the image is resampled, for Actions to record it. */
  onApplied: ((v: { w: number; h: number; sampling: string; res: number; fromW: number; fromH: number }) => void) | null = null;
  private unit: Unit = 'px';
  private w = 1;
  private h = 1;
  private res = 72;
  private constrain = true;
  private sampling: Transform['sampling'] = 'high';
  private readonly note = el('<p class="cv-note"></p>');
  private readonly width = numberRow('Width', 0, 30000, 1, (v) => this.setSize(v, true));
  private readonly height = numberRow('Height', 0, 30000, 1, (v) => this.setSize(v, false));
  private readonly units = selectRow('Units', UNITS, (v) => { this.unit = v as Unit; this.fields(); });
  private readonly resolution = numberRow('Resolution (ppi)', 1, 10000, 1, (v) => { this.res = clamp(v, 1, 10000); this.fields(); });
  private readonly lock = checkRow('Constrain proportions', (v) => { this.constrain = v; });
  private readonly resample = selectRow('Resample', [['high', 'High quality'], ['smooth', 'Smooth'], ['nearest', 'Nearest']], (v) => { this.sampling = v as Transform['sampling']; });

  constructor(private readonly engine: Engine) {
    super('Image Size', 420);
    this.body.append(this.note, this.width.el, this.height.el, this.units.el, this.resolution.el, this.lock.el, this.resample.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.width.input, () => this.apply());
    enterTo(this.height.input, () => this.apply());
  }

  show(): void {
    const p = this.engine.current;
    if (!p || this.isOpen) return;
    this.w = p.doc.width;
    this.h = p.doc.height;
    this.res = p.doc.resolution || 72;
    this.unit = 'px';
    setText(this.note, `Current size: ${p.doc.width} \u00d7 ${p.doc.height} px at ${this.res} ppi`);
    this.units.set('px');
    this.resolution.set(this.res);
    this.lock.set(this.constrain);
    this.resample.set(this.sampling);
    this.fields();
    this.open(this.width.input);
    this.width.input.select();
  }

  private setSize(v: number, horizontal: boolean): void {
    const p = this.engine.current;
    if (!p) return;
    const px = Math.round(toPx(v, this.unit, horizontal ? p.doc.width : p.doc.height, this.res));
    if (horizontal) { this.w = px; if (this.constrain) this.h = Math.max(1, Math.round((px * p.doc.height) / p.doc.width)); }
    else { this.h = px; if (this.constrain) this.w = Math.max(1, Math.round((px * p.doc.width) / p.doc.height)); }
    this.fields();
  }

  private fields(): void {
    const p = this.engine.current;
    if (!p) return;
    this.width.set(tidy(fromPx(this.w, this.unit, p.doc.width, this.res), this.unit));
    this.height.set(tidy(fromPx(this.h, this.unit, p.doc.height, this.res), this.unit));
  }

  private apply(): void {
    const fromW = this.engine.current?.doc.width ?? this.w, fromH = this.engine.current?.doc.height ?? this.h;
    if (this.engine.resampleImage(this.w, this.h, this.sampling, this.res)) { this.onApplied?.({ w: this.w, h: this.h, sampling: this.sampling, res: this.res, fromW, fromH }); this.close(); }
  }
}

export class AmountDialog extends Dialog {
  private expand = true;
  private readonly amount = numberRow('Amount (px)', 1, 500, 1, () => undefined);

  constructor(private readonly engine: Engine) {
    super('Expand Selection', 360);
    this.body.append(this.amount.el, el('<p class="cv-note">From 1 to 500 pixels.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.amount.input, () => this.apply());
  }

  show(expand: boolean): void {
    if (this.isOpen) return;
    if (!this.engine.current?.selection) { toast('Make a selection first.'); return; }
    this.expand = expand;
    this.setTitle(expand ? 'Expand Selection' : 'Contract Selection');
    this.amount.set(expand ? this.engine.selectionAmounts.expand : this.engine.selectionAmounts.contract);
    this.open(this.amount.input);
    this.amount.input.select();
  }

  private apply(): void {
    const n = clamp(Math.round(Number(this.amount.input.value)), 1, 500);
    if (!Number.isFinite(n)) return;
    if (this.expand) this.engine.selectionAmounts.expand = n;
    else this.engine.selectionAmounts.contract = n;
    this.close();
    this.engine.resizeSelection(this.expand ? n : -n);
  }
}
