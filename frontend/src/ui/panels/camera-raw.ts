import { api, RAW_DEVELOP_ZERO, type RawDevelop, type RawInfo, type RawWhiteBalance } from '../../io/api';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { loadPrefs } from '../prefs';
import { selectRow, sliderRow, type Row } from './controls';

/** The summary line the dialog shows for a RAW: camera, sensor, CFA pattern, white balance multipliers, orientation, baseline exposure. */
export function rawSummary(i: RawInfo): string {
  const turn: Record<number, string> = { 1: 'upright', 3: 'rotated 180 degrees', 6: 'rotated 90 degrees clockwise', 8: 'rotated 90 degrees counter-clockwise' };
  const camera = [i.make, i.model].filter(Boolean).join(' ') || 'Unknown camera';
  const bits = [`${camera}`, `sensor ${i.rawWidth} by ${i.rawHeight} (${i.width} by ${i.height} used)`, `${i.cfa || 'no'} pattern`, `white balance ${i.whiteBalance.join(' / ')}`, turn[i.orientation] ?? 'upright'];
  if (i.baselineExposure !== null) bits.push(`baseline exposure ${i.baselineExposure > 0 ? '+' : ''}${i.baselineExposure} EV`);
  return bits.join(', ') + '.';
}

/** What the person chose in Camera Raw: the white balance applied at the RAW stage and the bit depth to open at. */
export type RawChoice = { wb: RawWhiteBalance; bits: 8 | 16 };

/** Camera Raw on open (DEV_PLAN 36.21): a camera RAW file opens here first, into Camera Raw. The
 *  preview is the engine's half-size decode with the white balance set (rawpy's user_wb multipliers), so it is fast;
 *  Open resolves with the choice and the app does the full decode, Cancel (or closing) resolves null and the file is
 *  not opened. The rest of Develop (curve, colour mixer, grading, optics, geometry) follows on the opened layer. */
export class CameraRawDialog extends Dialog {
  private readonly canvas = el<HTMLCanvasElement>('<canvas class="cv-raw-preview" aria-label="Preview"></canvas>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private readonly preset = selectRow('White Balance', [['as_shot', 'As Shot'], ['auto', 'Auto'], ['daylight', 'Daylight']], (v) => { this.wb.wb = v as RawWhiteBalance['wb']; this.schedule(); });
  private readonly temperature = sliderRow('Temperature', -100, 100, 1, (v) => { this.wb.temperature = v; this.schedule(); });
  private readonly tint = sliderRow('Tint', -100, 100, 1, (v) => { this.wb.tint = v; this.schedule(); });
  private readonly depth = selectRow('Depth', [['8', '8 Bits/Channel'], ['16', '16 Bits/Channel'], ['16w', '16 Bits/Channel, ProPhoto RGB']], (v) => { this.bits = v === '8' ? 8 : 16; this.wb.space = v === '16w' ? 'prophoto' : 'srgb'; });
  private readonly dev: RawDevelop = { ...RAW_DEVELOP_ZERO };
  private readonly devRows: Array<{ key: keyof RawDevelop; row: Row<number> | Row<string> }> = [];
  private readonly info = el('<p class="cv-note" role="status"></p>');
  private readonly wb: RawWhiteBalance = { wb: 'as_shot', temperature: 0, tint: 0 };
  private bits: 8 | 16 = 8;
  private file: File | null = null;
  private timer = 0;
  private seq = 0;
  private settle: ((choice: RawChoice | null) => void) | null = null;

  constructor() {
    super('Camera Raw', 460);
    const slider = (key: Exclude<keyof RawDevelop, 'recovery' | 'blackPoint'>, label: string, min: number, max: number, step: number): void => {
      const row = sliderRow(label, min, max, step, (v) => { this.dev[key] = v; this.schedule(); });
      this.devRows.push({ key, row });
    };
    const choice = (key: 'recovery' | 'blackPoint', label: string, options: ReadonlyArray<readonly [string, string]>): void => {
      const row = selectRow(label, options, (v) => { (this.dev[key] as string) = v; this.schedule(); });
      this.devRows.push({ key, row });
    };
    slider('exposure', 'Exposure', -5, 5, 0.05);
    choice('recovery', 'Highlight Recovery', [['clip', 'Off'], ['unclip', 'Unclipped'], ['blend', 'Blend'], ['rebuild', 'Rebuild']]);
    choice('blackPoint', 'Black Point', [['as_shot', 'As Shot'], ['auto', 'Adaptive']]);
    slider('shadows', 'Shadows', -100, 100, 1);
    slider('highlights', 'Highlights', -100, 100, 1);
    slider('clarity', 'Clarity', -100, 100, 1);
    slider('texture', 'Texture', -100, 100, 1);
    slider('dehaze', 'Dehaze', -100, 100, 1);
    slider('noise', 'Noise Reduction', 0, 100, 1);
    this.body.append(this.canvas, this.preset.el, this.temperature.el, this.tint.el, ...this.devRows.map((r) => r.row.el), this.depth.el, this.info, this.note);
    this.button('Reset to As Shot', 'ghost', () => this.reset('as_shot')).classList.add('cv-btn-apart');
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Open', 'primary', () => this.finish({ wb: this.choice(), bits: this.bits }));
    this.onClose = () => { window.clearTimeout(this.timer); this.seq++; this.finish(null); };
  }

  /** Opens the panel on `file`; resolves with the choice on Open and null on Cancel. */
  ask(file: File): Promise<RawChoice | null> {
    return new Promise((resolve) => {
      if (this.isOpen) { resolve(null); return; }
      this.file = file;
      this.settle = resolve;
      const d = loadPrefs();   // Preferences > Camera Raw Defaults
      this.reset(d.rawWb);
      this.bits = d.rawBits; this.wb.space = 'srgb'; this.depth.set(String(d.rawBits));
      setText(this.note, `${file.name}: preview at half size; Open develops the whole picture.`);
      setText(this.info, '');
      this.open();
      this.schedule(0);
      void api.rawInfo(file, file.name).then((i) => { if (this.file === file && this.isOpen) setText(this.info, rawSummary(i)); }, () => undefined);
    });
  }

  /** Every control back to the file's own white balance (or the stored default) and no RAW-stage change. */
  private reset(wb: RawWhiteBalance['wb'] = loadPrefs().rawWb): void {
    this.wb.wb = wb; this.wb.temperature = 0; this.wb.tint = 0;
    this.preset.set(wb); this.temperature.set(0); this.tint.set(0);
    Object.assign(this.dev, RAW_DEVELOP_ZERO);
    for (const { key, row } of this.devRows) (row as Row<number | string>).set(RAW_DEVELOP_ZERO[key]);
    if (this.isOpen) this.schedule(0);
  }

  /** The white balance and, when any RAW-stage control moved, the develop options. */
  private choice(): RawWhiteBalance {
    const moved = (Object.keys(RAW_DEVELOP_ZERO) as Array<keyof RawDevelop>).some((k) => this.dev[k] !== RAW_DEVELOP_ZERO[k]);
    return { ...this.wb, ...(moved ? { develop: { ...this.dev } } : {}) };
  }

  private finish(choice: RawChoice | null): void {
    const settle = this.settle;
    this.settle = null;
    if (!settle) return;
    settle(choice);
    if (this.isOpen) this.close();   // onClose then finds nothing waiting
  }

  private schedule(delay = 180): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.preview(), delay);
  }

  /** The half-size decode with the current white balance, drawn into the same canvas (never replaced). */
  private async preview(): Promise<void> {
    const f = this.file, n = ++this.seq;
    if (!f || !this.isOpen) return;
    try {
      const bmp = await createImageBitmap(await api.decode(f, f.name, 0, undefined, { ...this.choice(), half: true }));
      if (n !== this.seq || !this.isOpen) { bmp.close(); return; }
      if (this.canvas.width !== bmp.width) this.canvas.width = bmp.width;
      if (this.canvas.height !== bmp.height) this.canvas.height = bmp.height;
      this.canvas.style.width = '100%';
      this.canvas.style.height = 'auto';
      this.canvas.getContext('2d')?.drawImage(bmp, 0, 0);
      bmp.close();
    } catch (err) {
      if (n === this.seq) setText(this.note, err instanceof Error ? err.message : 'The preview could not be developed.');
    }
  }
}
