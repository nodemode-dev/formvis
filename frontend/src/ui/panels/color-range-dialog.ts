import type { Engine, RGB } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';

const BOX_W = 320, BOX_H = 200;

/** Select > Color Range: click the image to sample colours (Shift adds another, Alt takes one away), or choose
 *  Highlights, Midtones or Shadows; Fuzziness widens what counts as close. The preview shows the selection in grey,
 *  white where fully selected, at one fixed size so the dialog never shifts. */
export class ColorRangeDialog extends Dialog {
  private plus: RGB[] = [];
  private minus: RGB[] = [];
  private readonly pick = el<HTMLSelectElement>('<select class="cv-input"><option value="sampled">Sampled Colors</option><option value="highlights">Highlights</option><option value="midtones">Midtones</option><option value="shadows">Shadows</option></select>');
  private readonly fuzz = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" max="200" step="1" value="40">');
  private readonly invert = el<HTMLInputElement>('<input type="checkbox">');
  private readonly note = el<HTMLParagraphElement>('<p class="cv-hint">Click the image to sample a color; Shift-click adds one, Alt-click takes one away.</p>');
  private readonly preview = el<HTMLCanvasElement>(`<canvas class="cv-jpeg-preview" width="${BOX_W}" height="${BOX_H}" aria-label="Selection preview"></canvas>`);
  private handler: ((e: PointerEvent) => void) | null = null;
  private pending = 0;

  constructor(private readonly engine: Engine) {
    super('Color Range', 380);
    this.field('Select', this.pick);
    this.field('Fuzziness', this.fuzz);
    const inv = el<HTMLLabelElement>('<label class="cv-check"></label>');
    inv.append(this.invert, document.createTextNode(' Invert'));
    this.field('', inv);
    this.field('', this.note);
    this.field('', this.preview);
    for (const c of [this.pick, this.fuzz, this.invert]) c.addEventListener('input', () => this.refresh());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => { const o = this.options(); this.close(); this.engine.selectColorRange(o); });
    this.remember();
  }

  private options(): Parameters<Engine['colorRangeMask']>[0] {
    const mode = this.pick.value === 'highlights' || this.pick.value === 'midtones' || this.pick.value === 'shadows' ? this.pick.value : 'sampled';
    return { mode, plus: this.plus, minus: this.minus, fuzziness: Math.min(200, Math.max(0, Number(this.fuzz.value) || 0)), invert: this.invert.checked };
  }

  /** Test hook as much as a user path: sample a colour as a click would. */
  sample(rgb: RGB, how: 'set' | 'add' | 'remove'): void {
    if (how === 'set') { this.plus = [rgb]; this.minus = []; }
    else if (how === 'add') this.plus.push(rgb);
    else this.minus.push(rgb);
    if (this.pick.value !== 'sampled') this.pick.value = 'sampled';
    this.refresh();
  }

  private refresh(): void {
    cancelAnimationFrame(this.pending);
    this.pending = requestAnimationFrame(() => {
      const p = this.engine.current, c = this.preview.getContext('2d');
      if (!p || !c) return;
      const scale = Math.min(1, BOX_W / p.doc.width, BOX_H / p.doc.height), r = this.engine.colorRangeMask(this.options(), scale);
      c.fillStyle = '#000000';
      c.fillRect(0, 0, BOX_W, BOX_H);
      if (!r) return;
      const img = new ImageData(r.w, r.h);
      for (let i = 0; i < r.mask.length; i++) { const v = r.mask[i], o = i * 4; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255; }
      c.putImageData(img, Math.floor((BOX_W - r.w) / 2), Math.floor((BOX_H - r.h) / 2));
    });
  }

  show(): void {
    if (!this.engine.current) return;
    this.open();
    this.refresh();
    this.scrim.classList.add('cv-scrim-through');
    const handler = (e: PointerEvent): void => {
      const stage = document.querySelector('.cv-overlay-canvas'), p = this.engine.current;
      if (e.button !== 0 || !stage || e.target !== stage || !p) return;
      e.preventDefault();
      e.stopPropagation();
      const b = stage.getBoundingClientRect(), v = p.viewport, rgb = this.engine.sampleOriginal({ x: (e.clientX - b.left - v.panX) / v.zoom, y: (e.clientY - b.top - v.panY) / v.zoom }, true);
      // sampleOriginal gives channels from 0 to 1.
      if (rgb) this.sample({ r: Math.round(rgb[0] * 255), g: Math.round(rgb[1] * 255), b: Math.round(rgb[2] * 255) }, e.shiftKey ? 'add' : e.altKey ? 'remove' : 'set');
    };
    window.addEventListener('pointerdown', handler, true);
    this.handler = handler;
  }

  close(): void {
    if (this.handler) window.removeEventListener('pointerdown', this.handler, true);
    this.handler = null;
    this.scrim.classList.remove('cv-scrim-through');
    super.close();
  }
}
