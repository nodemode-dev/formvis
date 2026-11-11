import { SelectionMask, type Engine, type SelectionMode } from '../../engine';
import { DEFAULT_FOCUS, focusArea, type FocusSettings } from '../../engine/focus-area';
import { ctxOf } from '../../engine/surface';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, sliderRow } from './controls';

const PW = 360, PH = 240;

/** Select > Focus Area (1.57.6, the parity plan's L5): the in-focus parts of what the document shows, found from local
 *  sharpness (engine/focus-area.ts). The preview shows the found area over a dimmed picture as the sliders move; OK
 *  replaces the selection with it as one step. Rows and the preview are built once. */
export class FocusAreaDialog extends Dialog {
  private s: FocusSettings = { ...DEFAULT_FOCUS };
  private readonly canvas = el(`<canvas width="${PW}" height="${PH}" style="display: block; width: ${PW}px; height: ${PH}px; background: var(--surface-2, #222)"></canvas>`) as HTMLCanvasElement;
  private readonly note = el('<p class="cv-dialog-note" role="status" style="min-height: 1.4em"></p>');
  private readonly mode = el<HTMLSelectElement>('<select class="cv-input"><option value="replace">New Selection</option><option value="add">Add to Selection</option><option value="subtract">Subtract from Selection</option><option value="intersect">Intersect with Selection</option></select>');
  private sampleRow: ReturnType<typeof checkRow> | null = null;
  private img: ImageData | null = null;
  private mask: Uint8Array | null = null;
  private timer = 0;

  constructor(private readonly engine: Engine) {
    super('Focus Area', 400);
    const range = sliderRow('In-Focus Range', 0, 100, 1, (v) => { this.s = { ...this.s, range: v }; this.soon(); });
    const noise = sliderRow('Image Noise Level', 0, 100, 1, (v) => { this.s = { ...this.s, noise: v }; this.soon(); });
    const soften = checkRow('Soften Edge', (v) => { this.s = { ...this.s, soften: v }; this.soon(); });
    const sampleAll = checkRow('Sample All Layers', (v) => { this.engine.setAutoSel({ sampleAll: v }); this.load(); this.compute(); });
    this.sampleRow = sampleAll;
    this.body.append(this.canvas, range.el, noise.el, soften.el, sampleAll.el);
    this.field('Mode', this.mode);
    this.body.append(this.note);
    range.set(this.s.range); noise.set(this.s.noise); soften.set(this.s.soften);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    this.remember([this.mode, sampleAll.el.querySelector('input') as HTMLInputElement]);
  }

  show(): void {
    if (!this.load()) return;
    this.mode.value = this.engine.selectionMode;
    this.sampleRow?.set(this.engine.autoSel.sampleAll);
    this.open();
    this.compute();
  }

  private load(): boolean {
    const flat = this.engine.autoSelSource();
    if (!flat) return false;
    this.img = ctxOf(flat).getImageData(0, 0, flat.width, flat.height);
    return true;
  }

  private soon(): void { if (this.timer) clearTimeout(this.timer); this.timer = window.setTimeout(() => { this.timer = 0; this.compute(); }, 120); }

  private compute(): void {
    const img = this.img;
    if (!img) return;
    const m = focusArea(img, this.s), W = img.width, H = img.height, k = Math.min(PW / W, PH / H), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    this.mask = m;
    const g = this.canvas.getContext('2d') as CanvasRenderingContext2D, out = g.createImageData(w, h);
    let kept = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(W - 1, Math.floor(x / k)), sy = Math.min(H - 1, Math.floor(y / k)), o = (sy * W + sx) * 4, a = m[sy * W + sx] / 255, q = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) out.data[q + c] = img.data[o + c] * (0.25 + 0.75 * a);
      out.data[q + 3] = 255;
    }
    for (let i = 0; i < m.length; i++) if (m[i] >= 128) kept++;
    g.clearRect(0, 0, PW, PH); g.putImageData(out, Math.floor((PW - w) / 2), Math.floor((PH - h) / 2));
    setText(this.note, `In focus: ${Math.round((kept / m.length) * 100)}% of the picture (bright in the preview).`);
  }

  private apply(): void {
    const m = this.mask, img = this.img, p = this.engine.current;
    this.close();
    if (!m || !img || !p || !m.some((v) => v >= 128)) { if (m) this.engine.notice('Nothing in focus was found; raise the In-Focus Range.'); return; }
    this.engine.applySelection(SelectionMask.cropped(0, 0, img.width, img.height, m), this.mode.value as SelectionMode, 'Focus Area');
  }
}
