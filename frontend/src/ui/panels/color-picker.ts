import type { Engine, RGB } from '../../engine';
import { Dialog } from '../dialogs';
import { el } from '../dom';
import { numberRow } from './controls';

const FIELD = 200, STRIP = 18;

type HSV = { h: number; s: number; v: number };

const toRgb = ({ h, s, v }: HSV): RGB => {
  const f = (n: number): number => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); };
  return { r: f(5), g: f(3), b: f(1) };
};

/** HSV from RGB; a gray keeps the hue it is given, so dragging to gray and back does not lose it. */
const toHsv = ({ r, g, b }: RGB, hue: number): HSV => {
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), d = max - Math.min(R, G, B);
  let h = hue;
  if (d > 0) { h = 60 * (max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4); if (h < 0) h += 360; }
  return { h, s: max > 0 ? d / max : 0, v: max };
};

const hexOf = (c: RGB): string => `#${[c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;

const parseHex = (text: string): RGB | null => {
 let t = text.trim().replace(/^#/, '');
 if (/^[0-9a-f]{3}$/i.test(t)) t = t.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(t)) return null;
  return { r: parseInt(t.slice(0, 2), 16), g: parseInt(t.slice(2, 4), 16), b: parseInt(t.slice(4, 6), 16) };
};

/** the Photoshop-style picker: a saturation and brightness field, a vertical hue strip, new and current
 * swatches, and RGB and hex entry. The canvas stays clickable to sample a color, as keeps its picker in a
 * floating panel beside the canvas. The rail's swatches open it through the `cv-pick-color` event. */
export class ColorPickerDialog extends Dialog {
 private which: 'fg' | 'bg' = 'fg';
  private hsv: HSV = { h: 0, s: 0, v: 0 };
  private current: RGB = { r: 0, g: 0, b: 0 };
  private sampler: ((e: PointerEvent) => void) | null = null;
  private sampleDrag: { move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null = null;
 private readonly sbField = el<HTMLCanvasElement>(`<canvas class="cv-pick-field" width="${FIELD}" height="${FIELD}" aria-label="Saturation and brightness"></canvas>`);
 private readonly strip = el<HTMLCanvasElement>(`<canvas class="cv-pick-strip" width="${STRIP}" height="${FIELD}" aria-label="Hue"></canvas>`);
 private readonly swatch = el<HTMLCanvasElement>('<canvas class="cv-pick-swatch" width="56" height="56" aria-label="New color above, current below"></canvas>');
 private readonly red = numberRow('R', 0, 255, 1, (v) => this.setRgb({...this.rgb(), r: v }));
 private readonly green = numberRow('G', 0, 255, 1, (v) => this.setRgb({...this.rgb(), g: v }));
 private readonly blue = numberRow('B', 0, 255, 1, (v) => this.setRgb({...this.rgb(), b: v }));
 private readonly hex = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="7" spellcheck="false" aria-label="Hex">');

  constructor(private readonly engine: Engine) {
 super('Color Picker', 420);
 const side = el('<div class="cv-pick-side"></div>');
    side.append(this.swatch, this.red.el, this.green.el, this.blue.el, this.hex);
 const row = el('<div class="cv-pick"></div>');
    row.append(this.sbField, this.strip, side);
 this.body.append(row, el('<p class="cv-note">Click the canvas to sample a color.</p>'));
 this.button('Cancel', 'ghost', () => this.close());
 this.button('OK', 'primary', () => this.commit());
    this.drag(this.sbField, (x, y) => { this.hsv = { ...this.hsv, s: x, v: 1 - y }; this.sync(); });
    this.drag(this.strip, (_x, y) => { this.hsv = { ...this.hsv, h: Math.min(359.99, y * 360) }; this.sync(); });
    const commitHex = (): void => { const c = parseHex(this.hex.value); if (c) this.setRgb(c); else this.hex.value = hexOf(this.rgb()); };
 this.hex.addEventListener('change', commitHex);
 this.hex.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); this.hex.blur(); } });
 document.addEventListener('cv-pick-color', (e) => this.show((e as CustomEvent<'fg' | 'bg'>).detail === 'bg' ? 'bg': 'fg'));
  }

 show(which: 'fg' | 'bg'): void {
    if (this.isOpen) return;
    this.which = which;
 this.current = {...(which === 'fg' ? this.engine.fg: this.engine.bg) };
    this.hsv = toHsv(this.current, 0);
 this.setTitle(which === 'fg' ? 'Foreground Color': 'Background Color');
    this.sync();
    this.open();
 this.scrim.classList.add('cv-scrim-through');
    const sampler = (e: PointerEvent): void => {
 const stage = document.querySelector('.cv-overlay-canvas'), p = this.engine.current;
      if (e.button !== 0 || !stage || e.target !== stage || !p) return;
      e.preventDefault();
      e.stopPropagation();
      this.endSampleDrag();
      const original = this.rgb();
      const at = (ev: PointerEvent): void => {
        const b = stage.getBoundingClientRect(), v = p.viewport, pt = { x: (ev.clientX - b.left - v.panX) / v.zoom, y: (ev.clientY - b.top - v.panY) / v.zoom };
        const rgb = this.engine.sampleOriginal(pt, true);
        if (!rgb) return;
        const c = { r: Math.round(rgb[0] * 255), g: Math.round(rgb[1] * 255), b: Math.round(rgb[2] * 255) };
        this.setRgb(c);
        this.engine.setSampleRing({ at: pt, sampled: c, original });
      };
      const move = (ev: PointerEvent): void => { ev.preventDefault(); ev.stopPropagation(); at(ev); };
      const up = (ev: PointerEvent): void => { ev.stopPropagation(); this.endSampleDrag(); };
 window.addEventListener('pointermove', move, true);
 window.addEventListener('pointerup', up, true);
      this.sampleDrag = { move, up };
      at(e);
    };
 window.addEventListener('pointerdown', sampler, true);
    this.sampler = sampler;
  }

  close(): void {
 if (this.sampler) window.removeEventListener('pointerdown', this.sampler, true);
    this.sampler = null;
    this.endSampleDrag();
 this.scrim.classList.remove('cv-scrim-through');
    super.close();
  }

  private endSampleDrag(): void {
    const d = this.sampleDrag;
    if (!d) return;
 window.removeEventListener('pointermove', d.move, true);
 window.removeEventListener('pointerup', d.up, true);
    this.sampleDrag = null;
    this.engine.setSampleRing(null);
  }

  private rgb(): RGB { return toRgb(this.hsv); }

  private setRgb(c: RGB): void {
    const clamp = (x: number): number => Math.min(255, Math.max(0, Math.round(Number.isFinite(x) ? x : 0)));
    this.hsv = toHsv({ r: clamp(c.r), g: clamp(c.g), b: clamp(c.b) }, this.hsv.h);
    this.sync();
  }

  private commit(): void {
    const c = this.rgb();
    this.close();
 if (this.which === 'fg') this.engine.setColors(c);
    else this.engine.setColors(undefined, c);
  }

 /** A pointer drag across a canvas, reported as 0 to 1 fractions of its box, held by pointer capture. */
  private drag(target: HTMLCanvasElement, apply: (x: number, y: number) => void): void {
    let on = false;
    const at = (e: PointerEvent): void => {
      const b = target.getBoundingClientRect();
      apply(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)));
    };
 target.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; on = true; target.setPointerCapture(e.pointerId); at(e); });
 target.addEventListener('pointermove', (e) => { if (on) at(e); });
 target.addEventListener('pointerup', () => { on = false; });
 target.addEventListener('pointercancel', () => { on = false; });
  }

  private sync(): void {
 const c = this.rgb(), f = this.sbField.getContext('2d'), s = this.strip.getContext('2d'), w = this.swatch.getContext('2d');
    if (f) {
 f.fillStyle = `hsl(${this.hsv.h} 100% 50%)`;
      f.fillRect(0, 0, FIELD, FIELD);
      const white = f.createLinearGradient(0, 0, FIELD, 0);
 white.addColorStop(0, 'rgba(255, 255, 255, 1)');
 white.addColorStop(1, 'rgba(255, 255, 255, 0)');
      f.fillStyle = white;
      f.fillRect(0, 0, FIELD, FIELD);
      const black = f.createLinearGradient(0, 0, 0, FIELD);
 black.addColorStop(0, 'rgba(0, 0, 0, 0)');
 black.addColorStop(1, 'rgba(0, 0, 0, 1)');
      f.fillStyle = black;
      f.fillRect(0, 0, FIELD, FIELD);
      f.lineWidth = 1.5;
 f.strokeStyle = this.hsv.v > 0.55 ? 'rgba(0, 0, 0, 0.9)': 'rgba(255, 255, 255, 0.9)';
      f.beginPath();
      f.arc(this.hsv.s * FIELD, (1 - this.hsv.v) * FIELD, 5, 0, Math.PI * 2);
      f.stroke();
    }
    if (s) {
      const g = s.createLinearGradient(0, 0, 0, FIELD);
 for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60} 100% 50%)`);
      s.fillStyle = g;
      s.fillRect(0, 0, STRIP, FIELD);
      const y = Math.round((this.hsv.h / 360) * FIELD) + 0.5;
 s.fillStyle = 'rgba(0, 0, 0, 0.9)';
      s.fillRect(0, y - 1.5, STRIP, 3);
 s.fillStyle = 'rgba(255, 255, 255, 0.9)';
      s.fillRect(0, y - 0.5, STRIP, 1);
    }
    if (w) {
      w.fillStyle = hexOf(c);
      w.fillRect(0, 0, 56, 28);
      w.fillStyle = hexOf(this.current);
      w.fillRect(0, 28, 56, 28);
    }
    this.red.set(c.r);
    this.green.set(c.g);
    this.blue.set(c.b);
    if (document.activeElement !== this.hex) this.hex.value = hexOf(c);
  }
}
