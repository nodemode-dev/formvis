import { clamp, LIMITS, type Engine, type ResampleMethod, type RGB, type Transform } from '../../engine';
import { Dialog } from '../dialogs';
import { el, q, setClass, setHidden, setText } from '../dom';
import { toast } from '../toast';
import { loadPrefs } from '../prefs';
import { checkRow, colorRow, numberRow, selectRow } from './controls';

/** The units a size can be typed in. */
type Unit = 'px' | 'pct' | 'in' | 'cm';
const UNITS: ReadonlyArray<readonly [string, string]> = [['px', 'Pixels'], ['pct', 'Percent'], ['in', 'Inches'], ['cm', 'Centimeters']];
/** A value in `unit` to pixels; `base` is the side it is a percentage of, `res` the pixels per inch. */
const toPx = (v: number, unit: Unit, base: number, res: number): number => unit === 'pct' ? base * v / 100 : unit === 'in' ? v * res : unit === 'cm' ? v * res / 2.54 : v;
/** Pixels back to `unit`, the inverse of toPx. */
const fromPx = (px: number, unit: Unit, base: number, res: number): number => unit === 'pct' ? px / base * 100 : unit === 'in' ? px / res : unit === 'cm' ? px * 2.54 / res : px;
/** Whole numbers for pixels, two decimals for the rest. */
const tidy = (v: number, unit: Unit): number => unit === 'px' ? Math.round(v) : Math.round(v * 100) / 100;
/** Run `run` when Enter is pressed in the input, without the key's default. */
const enterTo = (input: HTMLInputElement, run: () => void): void => {
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
};

export class CanvasSizeDialog extends Dialog {
  /** Called when the canvas is resized, for Actions to record it. */
  onApplied: ((v: { w: number; h: number; dx: number; dy: number; fill: RGB | null; fromW: number; fromH: number }) => void) | null = null;
  private unit: Unit = 'px';
  private anchor = 4;   // 0 to 8, row by row from the top-left; 4 is the middle
  private w = 1;
  private h = 1;
  private readonly note = el('<p class="cv-note"></p>');
  private readonly estimate = el('<p class="cv-note"></p>');
  private readonly width = numberRow('Width', 0, 30000, 1, (v) => { this.w = this.px(v, true); this.follow(true); });
  private readonly height = numberRow('Height', 0, 30000, 1, (v) => { this.h = this.px(v, false); this.follow(false); });
  private readonly units = selectRow('Units', UNITS, (v) => { this.unit = v as Unit; this.fields(); });
  private locked = false;
  private readonly lockRow = checkRow('Constrain proportions', (v) => { this.locked = v; });
  private relative = false;
  private readonly relativeRow = checkRow('Relative', (v) => { this.relative = v; this.sizeBounds(); this.fields(); });
  private readonly fill = selectRow('Extension', [['none', 'Transparent'], ['fg', 'Foreground color'], ['bg', 'Background color'], ['white', 'White'], ['black', 'Black'], ['custom', 'Other color']], (v) => { setHidden(this.custom.el, v !== 'custom'); });
  private readonly custom = colorRow('Other color', () => undefined);
  private readonly anchors: HTMLButtonElement[] = [];

  constructor(private readonly engine: Engine) {
    super('Canvas Size', 420);
    const grid = el('<div class="cv-anchor-grid" role="group" aria-label="Anchor"></div>');
    for (let i = 0; i < 9; i++) {
      const b = el(`<button type="button" class="cv-anchor" aria-label="Anchor ${i + 1}"></button>`) as HTMLButtonElement;
      b.addEventListener('click', () => { this.anchor = i; this.syncAnchor(); this.anchorMoved(); });
      this.anchors.push(b);
      grid.append(b);
    }
    const anchorRow = el('<div class="cv-field"><span>Anchor</span></div>');
    anchorRow.append(grid);
    this.body.append(this.note, this.width.el, this.height.el, this.lockRow.el, this.relativeRow.el, this.units.el, this.estimate, anchorRow, this.fill.el, this.custom.el);
    setHidden(this.custom.el, true);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.width.input, () => this.apply());
    enterTo(this.height.input, () => this.apply());
    // The sizes show the document; the unit, the anchor and the extension colour are what the dialog remembers.
    this.remember([this.width.input, this.height.input], {
      read: () => ({ anchor: String(this.anchor) }),
      write: (v) => { const a = Number(v.anchor); if (Number.isInteger(a) && a >= 0 && a <= 8) { this.anchor = a; this.syncAnchor(); } },
      onChange: (notify) => { this.anchorMoved = notify; },
    });
  }

  private anchorMoved: () => void = () => undefined;

  show(): void {
    const d = this.engine.current?.doc;
    if (!d || this.isOpen) return;
    this.w = d.width;
    this.h = d.height;
    this.unit = 'px';
    this.anchor = 4;
    this.relative = false;
    setText(this.note, `Current size: ${d.width} × ${d.height} px`);
    this.units.set('px');
    this.lockRow.set(this.locked);
    this.relativeRow.set(false);
    this.sizeBounds();
    this.fill.set('none');
    setHidden(this.custom.el, true);
    this.fields();
    this.syncAnchor();
    this.open(this.width.input);
    this.width.input.select();
  }

  /** A value in the current unit as whole pixels along one side. */
  private px(v: number, horizontal: boolean): number {
    const d = this.engine.current?.doc;
    if (!d) return 1;
    const base = horizontal ? d.width : d.height, px = toPx(v, this.unit, base, d.resolution || 72);
    return clamp(Math.round(this.relative ? base + px : px), 1, 30000);
  }

  /** Relative sizes may be negative: the typed amount is added to the current size. */
  private sizeBounds(): void {
    const mn = this.relative ? '-30000' : '0';
    for (const r of [this.width, this.height]) if (r.input.min !== mn) r.input.min = mn;
  }

  /** Show the stored size in the current unit. */
  private fields(): void {
    const d = this.engine.current?.doc;
    const res = d?.resolution || 72;
    const dw = this.relative ? (d?.width ?? 0) : 0, dh = this.relative ? (d?.height ?? 0) : 0;
    this.width.set(tidy(fromPx(this.w - dw, this.unit, d?.width ?? this.w, res), this.unit));
    this.height.set(tidy(fromPx(this.h - dh, this.unit, d?.height ?? this.h, res), this.unit));
    this.showEstimate();
  }

  /** With Constrain proportions on, the other side keeps the current document's proportions. */
  private follow(horizontal: boolean): void {
    const d = this.engine.current?.doc;
    if (this.locked && d) {
      if (horizontal) this.h = clamp(Math.round(this.w * d.height / d.width), 1, 30000);
      else this.w = clamp(Math.round(this.h * d.width / d.height), 1, 30000);
    }
    this.fields();
  }

  /** The new canvas in pixels and what one full-size layer of it holds in memory (4 bytes a pixel), against the limit. */
  private showEstimate(): void {
    const px = this.w * this.h, mb = px * 4 / 1048576, over = px > LIMITS.pixels || this.w > LIMITS.side || this.h > LIMITS.side;
    setText(this.estimate, `New canvas: ${this.w} × ${this.h} px · about ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB per full-size layer${over ? ` · past the ${Math.round(LIMITS.pixels / 1e6)} megapixel limit` : ''}`);
  }

  private customColour(): RGB {
    const m = /^#([0-9a-f]{6})$/i.exec(this.custom.el.querySelector('input')?.value ?? '');
    const n = m ? parseInt(m[1], 16) : 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  private syncAnchor(): void { this.anchors.forEach((b, i) => setClass(b, 'is-active', i === this.anchor)); }

  private apply(): void {
    const doc = this.engine.current?.doc;
    if (!doc) return;
    const W = this.w, H = this.h;
    const dx = Math.floor((this.anchor % 3) * (W - doc.width) / 2);
    const dy = Math.floor(Math.floor(this.anchor / 3) * (H - doc.height) / 2);
    const choice = this.fill.el.querySelector('select')?.value ?? 'none';
    const colors: Record<string, RGB | null> = { none: null, fg: this.engine.fg, bg: this.engine.bg, white: { r: 255, g: 255, b: 255 }, black: { r: 0, g: 0, b: 0 }, custom: this.customColour() };
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
  private sampling: ResampleMethod = 'high';
  private readonly note = el('<p class="cv-note"></p>');
  private readonly width = numberRow('Width', 0, 30000, 1, (v) => this.setSize(v, true));
  private readonly height = numberRow('Height', 0, 30000, 1, (v) => this.setSize(v, false));
  private readonly units = selectRow('Units', UNITS, (v) => { this.unit = v as Unit; this.fields(); });
  private readonly resolution = numberRow('Resolution (ppi)', 1, 10000, 1, (v) => { this.res = clamp(v, 1, 10000); this.fields(); });
  private readonly lock = checkRow('Constrain proportions', (v) => { this.constrain = v; });
  private readonly resample = selectRow('Resample', [['high', 'High quality'], ['smooth', 'Smooth'], ['nearest', 'Nearest (hard edges)'], ['bilinear', 'Bilinear'], ['bicubic', 'Bicubic'], ['smoother', 'Bicubic Smoother (enlargement)'], ['sharper', 'Bicubic Sharper (reduction)'], ['lanczos', 'Lanczos']], (v) => { this.sampling = v as ResampleMethod; });
  private resampling = true;
  private readonly resampleOn = checkRow('Resample image', (v) => { this.resampling = v; setHidden(this.resample.el, !v); this.keepPixels(); });
  private scaleStyles = true;
  private readonly styles = checkRow('Scale Styles', (v) => { this.scaleStyles = v; });

  constructor(private readonly engine: Engine) {
    super('Image Size', 420);
    this.body.append(this.note, this.width.el, this.height.el, this.units.el, this.resolution.el, this.lock.el, this.resampleOn.el, this.resample.el, this.styles.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.width.input, () => this.apply());
    enterTo(this.height.input, () => this.apply());
    this.remember([this.width.input, this.height.input, this.resolution.input]);   // the sizes and the resolution show the document
  }

  show(): void {
    const d = this.engine.current?.doc;
    if (!d || this.isOpen) return;
    this.w = d.width;
    this.h = d.height;
    this.res = d.resolution || 72;
    this.unit = 'px';
    this.resampling = true;
    this.sampling = loadPrefs().interpolation;
    setText(this.note, `Current size: ${d.width} × ${d.height} px at ${this.res} ppi`);
    this.units.set('px');
    this.resolution.set(this.res);
    this.lock.set(this.constrain);
    this.resampleOn.set(true);
    this.styles.set(this.scaleStyles);
    setHidden(this.resample.el, false);
    this.resample.set(this.sampling);
    this.fields();
    this.open(this.width.input);
    this.width.input.select();
  }

  /** A typed size in the current unit becomes whole pixels; the other side follows when proportions are held. */
  private setSize(v: number, horizontal: boolean): void {
    const d = this.engine.current?.doc;
    if (!d) return;
    if (!this.resampling) {
      // Without resampling the pixels stay; a printed size typed in inches or centimeters sets the resolution instead.
      const inches = this.unit === 'in' ? v : this.unit === 'cm' ? v / 2.54 : 0;
      if (inches > 0) { this.res = clamp(Math.round((horizontal ? d.width : d.height) / inches * 100) / 100, 1, 10000); this.resolution.set(this.res); }
      this.keepPixels();
      return;
    }
    const px = Math.max(1, Math.round(toPx(v, this.unit, horizontal ? d.width : d.height, this.res)));
    if (horizontal) { this.w = px; if (this.constrain) this.h = Math.max(1, Math.round(px * d.height / d.width)); }
    else { this.h = px; if (this.constrain) this.w = Math.max(1, Math.round(px * d.width / d.height)); }
    this.fields();
  }

  /** Resample off: the size in pixels is the document's own. */
  private keepPixels(): void {
    const d = this.engine.current?.doc;
    if (!this.resampling && d) { this.w = d.width; this.h = d.height; }
    this.fields();
  }

  /** Show the stored size in the current unit, at this dialog's resolution. */
  private fields(): void {
    const d = this.engine.current?.doc;
    this.width.set(tidy(fromPx(this.w, this.unit, d?.width ?? this.w, this.res), this.unit));
    this.height.set(tidy(fromPx(this.h, this.unit, d?.height ?? this.h, this.res), this.unit));
  }

  private apply(): void {
    const fromW = this.engine.current?.doc.width ?? this.w, fromH = this.engine.current?.doc.height ?? this.h;
    if (this.engine.resampleImage(this.w, this.h, this.sampling, this.res, this.scaleStyles)) { this.onApplied?.({ w: this.w, h: this.h, sampling: this.sampling, res: this.res, fromW, fromH }); this.close(); }
  }
}

/** File > Automate > Fit Image (1.65.8): a width and a height in pixels to constrain the image within, and
 *  Don't Enlarge; OK resamples it to fit with its proportions kept (engine.fitImage), and Actions record the box. The
 *  box offered is the last one used, at first the image's own size. */
export class FitImageDialog extends Dialog {
  /** Called on OK, for Actions to record the step. */
  onApplied: ((v: { w: number; h: number; enlarge: boolean }) => void) | null = null;
  private box: { w: number; h: number } | null = null;
  private noEnlarge = false;
  private readonly note = el('<p class="cv-note"></p>');
  private readonly width = numberRow('Width (px)', 1, 30000, 1, () => undefined);
  private readonly height = numberRow('Height (px)', 1, 30000, 1, () => undefined);
  private readonly keep = checkRow('Don’t Enlarge', (v) => { this.noEnlarge = v; });
  private sampling: Transform['sampling'] = 'high';
  private readonly resample = selectRow('Resample', [['high', 'High quality'], ['smooth', 'Smooth'], ['nearest', 'Nearest']], (v) => { this.sampling = v as Transform['sampling']; });

  constructor(private readonly engine: Engine) {
    super('Fit Image', 360);
    this.body.append(this.note, this.width.el, this.height.el, this.keep.el, this.resample.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.width.input, () => this.apply());
    enterTo(this.height.input, () => this.apply());
    this.remember();   // the box offered is the last one used
  }

  show(): void {
    const p = this.engine.current;
    if (!p || this.isOpen) return;
    setText(this.note, `Current size: ${p.doc.width} × ${p.doc.height} px. Constrain within:`);
    this.width.set(this.box?.w ?? p.doc.width);
    this.height.set(this.box?.h ?? p.doc.height);
    this.keep.set(this.noEnlarge);
    this.resample.set(this.sampling);
    this.open(this.width.input);
    this.width.input.select();
  }

  private apply(): void {
    const w = Math.round(Number(this.width.input.value)), h = Math.round(Number(this.height.input.value));
    if (!(w >= 1 && w <= 30000 && h >= 1 && h <= 30000)) { this.engine.notice('Enter a width and a height from 1 to 30,000 pixels.'); return; }
    this.box = { w, h };
    this.close();
    if (this.engine.fitImage(w, h, !this.noEnlarge, false, this.sampling)) this.onApplied?.({ w, h, enlarge: !this.noEnlarge });
  }
}

export class AmountDialog extends Dialog {
  private expand = true;
  private readonly amount = numberRow('Amount (px)', 1, 1024, 1, () => {});
  private readonly bounds = checkRow('Apply effect at canvas bounds', () => {});
  private readonly range = el('<p class="cv-note">From 1 to 1024 pixels.</p>');

  constructor(private readonly engine: Engine) {
    super('Expand Selection', 360);
    this.body.append(this.amount.el, this.bounds.el, this.range);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    enterTo(this.amount.input, () => this.apply());
    this.remember();   // each mode (Expand, Contract, Feather, Border, Smooth) under its own title
  }

  private modify: 'feather' | 'border' | 'smooth' | null = null;

  show(expand: boolean, modify: 'feather' | 'border' | 'smooth' | null = null): void {
    if (this.isOpen) return;
    if (!this.engine.current?.selection) { toast('Make a selection first.'); return; }
    this.expand = expand;
    this.modify = modify;
    this.setTitle(modify ? `${modify[0].toUpperCase()}${modify.slice(1)} Selection` : expand ? 'Expand Selection' : 'Contract Selection');
    const fine = modify === 'feather', hi = fine ? 1000 : 1024;
    const mn = fine ? '0.1' : '1', st = fine ? '0.1' : '1';
    if (this.amount.input.min !== mn) this.amount.input.min = mn;
    if (this.amount.input.max !== String(hi)) this.amount.input.max = String(hi);
    if (this.amount.input.step !== st) this.amount.input.step = st;
    setText(this.range, fine ? 'From 0.1 to 1000 pixels.' : 'From 1 to 1024 pixels.');
    setHidden(this.bounds.el, modify === 'border');
    this.bounds.set(this.engine.selectionAtBounds);
    this.amount.set(modify ? this.engine.selectionAmounts[modify] : expand ? this.engine.selectionAmounts.expand : this.engine.selectionAmounts.contract);
    this.open(this.amount.input);
    this.amount.input.select();
  }

  private apply(): void {
    const typed = Number(this.amount.input.value);
    if (!Number.isFinite(typed)) return;
    const m = this.modify, edge = !this.bounds.el.hidden && q<HTMLInputElement>(this.bounds.el, 'input').checked;
    this.engine.selectionAtBounds = edge;
    if (m) {
      const n = m === 'feather' ? Math.min(1000, Math.max(0.1, Math.round(typed * 10) / 10)) : Math.min(1024, Math.max(1, Math.round(typed)));
      this.engine.selectionAmounts[m] = n;
      this.close();
      this.engine.modifySelection(m, n, edge);
      return;
    }
    const n = Math.min(1024, Math.max(1, Math.round(typed)));
    if (this.expand) this.engine.selectionAmounts.expand = n;
    else this.engine.selectionAmounts.contract = n;
    this.close();
    this.engine.resizeSelection(this.expand ? n : -n, edge);
  }
}
