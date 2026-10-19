import type { Engine, RGB } from '../../engine';
import { replaceColorPixels, replacementFor, type ReplaceColorSettings } from '../../engine/adjust';
import { Dialog } from '../dialogs';
import { el, q, setValue } from '../dom';
import { checkRow, sliderRow } from './controls';

const BOX_W = 320, BOX_H = 160;
const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/** Image > Adjustments > Replace Color (1.65.5): click the image to sample the colour to replace
 *  (Shift-click adds one, Alt-click takes one away) or pick it in Color; Fuzziness widens what counts as close, the box
 *  showing what is chosen in grey at one fixed size; Hue, Saturation and Lightness set the replacement, Result showing
 *  the first colour replaced (picking a Result sets them). The layer previews live; OK is one step. */
export class ReplaceColorDialog extends Dialog {
  private s: ReplaceColorSettings = { plus: [], minus: [], fuzziness: 40, hue: 0, saturation: 0, lightness: 0 };
  private readonly colour = el<HTMLInputElement>('<input class="cv-input cv-color" type="color" aria-label="Color to replace">');
  private readonly fuzz = sliderRow('Fuzziness', 0, 200, 1, (v) => { this.s.fuzziness = v; this.refresh(); });
  private readonly note = el<HTMLParagraphElement>('<p class="cv-hint">Click the image to sample a color; Shift-click adds one, Alt-click takes one away.</p>');
  private readonly box = el<HTMLCanvasElement>(`<canvas width="${BOX_W}" height="${BOX_H}" aria-label="Chosen colors"></canvas>`);
  private readonly hue = sliderRow('Hue', -180, 180, 1, (v) => { this.s.hue = v; this.refresh(); });
  private readonly sat = sliderRow('Saturation', -100, 100, 1, (v) => { this.s.saturation = v; this.refresh(); });
  private readonly light = sliderRow('Lightness', -100, 100, 1, (v) => { this.s.lightness = v; this.refresh(); });
  private readonly result = el<HTMLInputElement>('<input class="cv-input cv-color" type="color" aria-label="Result color">');
  private readonly preview = checkRow('Preview', (v) => { this.live = v; this.refresh(); });
  private live = true;
  private handler: ((e: PointerEvent) => void) | null = null;
  private pending = 0;

  constructor(private readonly engine: Engine) {
    super('Replace Color', 380);
    this.field('Color', this.colour);
    this.body.append(this.fuzz.el);
    this.field('', this.note);
    this.field('', this.box);
    this.body.append(this.hue.el, this.sat.el, this.light.el);
    this.field('Result', this.result);
    this.body.append(this.preview.el);
    this.colour.addEventListener('input', () => this.sample(fromHex(this.colour.value), 'set'));
    this.result.addEventListener('input', () => this.toResult(fromHex(this.result.value)));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.apply());
    const c = this.box.getContext('2d');
    if (c) { c.fillStyle = '#000000'; c.fillRect(0, 0, BOX_W, BOX_H); }
    this.remember([this.colour, this.result]);   // the colours are sampled from the picture
  }

  /** Test hook as much as a user path: sample a colour as a click would. */
  sample(rgb: RGB, how: 'set' | 'add' | 'remove'): void {
    if (how === 'set') { this.s.plus = [rgb]; this.s.minus = []; }
    else if (how === 'add') this.s.plus.push(rgb);
    else this.s.minus.push(rgb);
    this.refresh();
  }

  private toResult(to: RGB): void {
    const from = this.s.plus[0];
    if (!from) return;
    const r = replacementFor(from, to);
    this.s.hue = Math.max(-180, Math.min(180, r.hue));
    this.s.saturation = Math.max(-100, Math.min(100, r.saturation));
    this.s.lightness = Math.max(-100, Math.min(100, r.lightness));
    this.hue.set(this.s.hue); this.sat.set(this.s.saturation); this.light.set(this.s.lightness);
    this.refresh();
  }

  private refresh(): void {
    cancelAnimationFrame(this.pending);
    this.pending = requestAnimationFrame(() => this.draw());
  }

  private draw(): void {
    if (!this.isOpen) return;
    const s = structuredClone(this.s), c = this.box.getContext('2d'), r = this.engine.replaceColorScores(s, BOX_W, BOX_H), first = s.plus[0];
    if (c) {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, BOX_W, BOX_H);
      if (r) {
        const img = new ImageData(r.w, r.h);
        for (let i = 0; i < r.mask.length; i++) { const v = r.mask[i], o = i * 4; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255; }
        c.putImageData(img, Math.floor((BOX_W - r.w) / 2), Math.floor((BOX_H - r.h) / 2));
      }
    }
    this.result.disabled = !first;
    if (first) {
      const px = new Uint8ClampedArray([first.r, first.g, first.b, 255]);
      replaceColorPixels(px, { ...s, plus: [first], minus: [] });
      setValue(this.colour, hex(first));
      setValue(this.result, hex({ r: px[0], g: px[1], b: px[2] }));
    }
    if (this.live) this.engine.replaceColor(s, true); else this.engine.setPreview(null);
  }

  show(): void {
    if (this.isOpen || !this.engine.targetImage()) return;
    this.s.plus = [{ ...this.engine.fg }];
    this.s.minus = [];
    this.fuzz.set(this.s.fuzziness); this.hue.set(this.s.hue); this.sat.set(this.s.saturation); this.light.set(this.s.lightness);
    this.preview.set(this.live);
    this.open(q<HTMLInputElement>(this.fuzz.el, 'input[type="range"]'));
    this.draw();
    this.scrim.classList.add('cv-scrim-through');
    const handler = (e: PointerEvent): void => {
      const stage = document.querySelector('.cv-overlay-canvas'), p = this.engine.current;
      if (e.button !== 0 || !stage || e.target !== stage || !p) return;
      e.preventDefault();
      e.stopPropagation();
      const b = stage.getBoundingClientRect(), v = p.viewport, rgb = this.engine.sampleOriginal({ x: (e.clientX - b.left - v.panX) / v.zoom, y: (e.clientY - b.top - v.panY) / v.zoom }, false);
      if (rgb) this.sample({ r: Math.round(rgb[0] * 255), g: Math.round(rgb[1] * 255), b: Math.round(rgb[2] * 255) }, e.shiftKey ? 'add' : e.altKey ? 'remove' : 'set');
    };
    window.addEventListener('pointerdown', handler, true);
    this.handler = handler;
  }

  private apply(): void {
    const s = structuredClone(this.s), changes = s.plus.length > 0 && (s.hue || s.saturation || s.lightness);
    this.close();
    if (changes) this.engine.replaceColor(s);
  }

  close(): void {
    if (!this.isOpen) return;
    if (this.handler) window.removeEventListener('pointerdown', this.handler, true);
    this.handler = null;
    cancelAnimationFrame(this.pending);
    this.scrim.classList.remove('cv-scrim-through');
    this.engine.setPreview(null);
    super.close();
  }
}
