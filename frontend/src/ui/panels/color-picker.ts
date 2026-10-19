import type { Engine, RGB } from '../../engine';
import { inkOf, renditionOf, type Ink } from '../../engine/colour-lut';
import { Dialog } from '../dialogs';
import { el, setHidden } from '../dom';
import { numberRow } from './controls';
import { loadPrefs } from '../prefs';

const FIELD = 200, STRIP = 18;

type HSV = { h: number; s: number; v: number };

function toRgb({ h, s, v }: HSV): RGB {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return Math.min(255, Math.max(0, Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))));
  };
  return { r: f(5), g: f(3), b: f(1) };
}

/** RGB back to HSV. A gray has no hue of its own, so the hue passed in is carried over unchanged; that way a drag
 *  that passes through gray keeps its place on the strip. */
function toHsv(c: RGB, hue: number): HSV {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (d === 0) return { h: hue, s: 0, v: max };
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: d / max, v: max };
}

const hexOf = (c: RGB): string => '#' + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('');

function parseHex(text: string): RGB | null {
  let t = text.trim();
  if (t.startsWith('#')) t = t.slice(1);
  if (t.length === 3) t = t.replace(/./g, (ch) => ch + ch);
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return null;
  const n = parseInt(t, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** The color picker: a saturation and brightness field, a vertical hue strip, a swatch pair (new above, current
 *  below) and RGB and hex entry. The canvas behind stays clickable so a color can be sampled straight from the
 *  picture. The rail's swatches open it by dispatching a `cv-pick-color` event. */
export class ColorPickerDialog extends Dialog {
  private which: 'fg' | 'bg' = 'fg';
  private hsv: HSV = { h: 0, s: 0, v: 0 };
  private current: RGB = { r: 0, g: 0, b: 0 };
  private sampler: ((e: PointerEvent) => void) | null = null;
  private sampleDrag: { move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null = null;
  private readonly sbField = el<HTMLCanvasElement>(`<canvas class="cv-pick-field" width="${FIELD}" height="${FIELD}" aria-label="Saturation and brightness"></canvas>`);
  private readonly strip = el<HTMLCanvasElement>(`<canvas class="cv-pick-strip" width="${STRIP}" height="${FIELD}" aria-label="Hue"></canvas>`);
  private readonly swatch = el<HTMLCanvasElement>('<canvas class="cv-pick-swatch" width="56" height="56" aria-label="New color above, current below"></canvas>');
  private readonly red = numberRow('R', 0, 255, 1, (v) => this.setRgb({ ...this.rgb(), r: v }));
  private readonly green = numberRow('G', 0, 255, 1, (v) => this.setRgb({ ...this.rgb(), g: v }));
  private readonly blue = numberRow('B', 0, 255, 1, (v) => this.setRgb({ ...this.rgb(), b: v }));
  private readonly hex = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="7" spellcheck="false" aria-label="Hex">');
  private readonly inks = (['C', 'M', 'Y', 'K'] as const).map((n, k) => numberRow(n, 0, 100, 1, (v) => this.setInk(k, v)));
  private ink: Ink | null = null;

  constructor(private readonly engine: Engine) {
    super('Color Picker', 420);
    const side = el<HTMLElement>('<div class="cv-pick-side"></div>');
    side.append(this.swatch, this.red.el, this.green.el, this.blue.el, this.hex, ...this.inks.map((r) => r.el));
    const wrap = el<HTMLElement>('<div class="cv-pick"></div>');
    wrap.append(this.sbField, this.strip, side);
    this.body.append(wrap, el<HTMLElement>('<p class="cv-note">Click the canvas to sample a color.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => this.commit());
    this.drag(this.sbField, (x, y) => this.applyHsv({ ...this.hsv, s: x, v: 1 - y }));
    this.drag(this.strip, (_x, y) => this.applyHsv({ ...this.hsv, h: Math.min(359.99, y * 360) }));
    this.hex.addEventListener('change', () => {
      const c = parseHex(this.hex.value);
      if (c) this.setRgb(c);
      else this.hex.value = hexOf(this.rgb());
    });
    this.hex.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.hex.blur(); }
    });
    document.addEventListener('cv-pick-color', (e) => this.show((e as CustomEvent).detail === 'bg' ? 'bg' : 'fg'));
  }

  /** Preferences > General > Color Picker: the system's own picker, one hidden input kept for it. */
  private readonly system = Object.assign(document.createElement('input'), { type: 'color' });
  private systemPick(which: 'fg' | 'bg'): void {
    const s = this.system, now = which === 'fg' ? this.engine.fg : this.engine.bg;
    if (!s.isConnected) {
      Object.assign(s.style, { position: 'fixed', left: '50%', top: '40%', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
      s.setAttribute('aria-hidden', 'true'); s.tabIndex = -1;
      document.body.appendChild(s);
      s.addEventListener('input', () => {
        const n = parseInt(s.value.slice(1), 16), c = { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
        if (s.dataset.which === 'bg') this.engine.setColors(undefined, c); else this.engine.setColors(c);
      });
    }
    s.dataset.which = which;
    s.value = hexOf(now);
    try { s.showPicker(); } catch { s.click(); }
  }

  show(which: 'fg' | 'bg'): void {
    if (this.isOpen) return;
    if (loadPrefs().systemPicker) { this.systemPick(which); return; }
    this.which = which;
    this.current = { ...(which === 'fg' ? this.engine.fg : this.engine.bg) };
    this.hsv = toHsv(this.current, 0);
    const p = this.engine.current, cmyk = p?.doc.mode === 'cmyk' && !!p.cmykLut && !!p.cmykIn;
    this.ink = cmyk ? [...(which === 'fg' ? this.engine.fgInk : this.engine.bgInk)] as Ink : null;
    for (const r of this.inks) setHidden(r.el, !cmyk);
    this.setTitle(which === 'fg' ? 'Foreground Color' : 'Background Color');
    this.sync();
    this.open();
    this.scrim.classList.add('cv-scrim-through');
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Element | null;
      if (e.button !== 0 || !target || !target.classList.contains('cv-overlay-canvas') || !this.isOpen) return;
      e.preventDefault();
      e.stopPropagation();
      this.endSampleDrag();
      const original = this.rgb();
      const sample = (ev: PointerEvent): void => {
        const cur = this.engine.current;
        if (!cur) return;
        const box = target.getBoundingClientRect();
        const pt = {
          x: (ev.clientX - box.left - cur.viewport.panX) / cur.viewport.zoom,
          y: (ev.clientY - box.top - cur.viewport.panY) / cur.viewport.zoom,
        };
        const s = this.engine.sampleOriginal(pt, true);
        if (!s) return;
        const color = { r: Math.round(s[0] * 255), g: Math.round(s[1] * 255), b: Math.round(s[2] * 255) };
        this.setRgb(color);
        this.engine.setSampleRing({ at: pt, sampled: color, original });
      };
      sample(e);
      const move = (ev: PointerEvent): void => { ev.preventDefault(); ev.stopPropagation(); sample(ev); };
      const up = (ev: PointerEvent): void => { ev.stopPropagation(); this.endSampleDrag(); };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      this.sampleDrag = { move, up };
    };
    this.sampler = onDown;
    window.addEventListener('pointerdown', onDown, true);
  }

  close(): void {
    if (this.sampler) {
      window.removeEventListener('pointerdown', this.sampler, true);
      this.sampler = null;
    }
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

  /** Take a new HSV (from a field or strip drag), refresh the ink in a CMYK document, and redraw. */
  private applyHsv(next: HSV): void {
    this.hsv = next;
    const p = this.engine.current;
    if (this.ink && p?.cmykIn) this.ink = inkOf(this.rgb(), p.cmykIn);
    this.sync();
  }

  private setRgb(c: RGB): void {
    const ch = (n: number): number => Math.min(255, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));
    this.hsv = toHsv({ r: ch(c.r), g: ch(c.g), b: ch(c.b) }, this.hsv.h);
    const p = this.engine.current;
    if (this.ink && p?.cmykIn) this.ink = inkOf(this.rgb(), p.cmykIn);
    this.sync();
  }

  /** One ink typed in a CMYK document: the ink is exactly what was typed; the swatch and RGB show its rendition. */
  private setInk(k: number, percent: number): void {
    const p = this.engine.current;
    if (!this.ink || !p?.cmykLut) return;
    this.ink[k] = Math.min(1, Math.max(0, (Number.isFinite(percent) ? percent : 0) / 100));
    this.hsv = toHsv(renditionOf(this.ink, p.cmykLut), this.hsv.h);
    this.sync();
  }

  private commit(): void {
    const c = this.rgb();
    this.close();
    if (this.ink) { this.engine.setInk(this.which, this.ink); return; }
    if (this.which === 'fg') this.engine.setColors(c);
    else this.engine.setColors(undefined, c);
  }

  /** Pointer dragging on one of the canvases: a primary-button press captures the pointer and reports where it is
   *  as 0 to 1 fractions of the canvas box, held inside that range, until the pointer is released or cancelled. */
  private drag(target: HTMLCanvasElement, apply: (x: number, y: number) => void): void {
    let down = false;
    const report = (e: PointerEvent): void => {
      const box = target.getBoundingClientRect();
      const frac = (n: number, size: number): number => Math.min(1, Math.max(0, size > 0 ? n / size : 0));
      apply(frac(e.clientX - box.left, box.width), frac(e.clientY - box.top, box.height));
    };
    const end = (): void => { down = false; };
    target.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      down = true;
      target.setPointerCapture(e.pointerId);
      report(e);
    });
    target.addEventListener('pointermove', (e) => { if (down) report(e); });
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  private sync(): void {
    const c = this.rgb();
    const fx = this.sbField.getContext('2d');
    if (fx) {
      fx.fillStyle = hexOf(toRgb({ h: this.hsv.h, s: 1, v: 1 }));
      fx.fillRect(0, 0, FIELD, FIELD);
      const white = fx.createLinearGradient(0, 0, FIELD, 0);
      white.addColorStop(0, '#ffffff');
      white.addColorStop(1, 'rgba(255,255,255,0)');
      fx.fillStyle = white;
      fx.fillRect(0, 0, FIELD, FIELD);
      const black = fx.createLinearGradient(0, 0, 0, FIELD);
      black.addColorStop(0, 'rgba(0,0,0,0)');
      black.addColorStop(1, '#000000');
      fx.fillStyle = black;
      fx.fillRect(0, 0, FIELD, FIELD);
      fx.beginPath();
      fx.arc(this.hsv.s * FIELD, (1 - this.hsv.v) * FIELD, 5, 0, Math.PI * 2);
      fx.lineWidth = 1.5;
      fx.strokeStyle = this.hsv.v > 0.55 ? '#000000' : '#ffffff';
      fx.stroke();
    }
    const sx = this.strip.getContext('2d');
    if (sx) {
      const rainbow = sx.createLinearGradient(0, 0, 0, FIELD);
      for (let i = 0; i <= 6; i++) rainbow.addColorStop(i / 6, hexOf(toRgb({ h: i * 60, s: 1, v: 1 })));
      sx.fillStyle = rainbow;
      sx.fillRect(0, 0, STRIP, FIELD);
      const y = (this.hsv.h / 360) * FIELD;
      sx.fillStyle = 'rgba(0,0,0,0.75)';
      sx.fillRect(0, y - 1.5, STRIP, 3);
      sx.fillStyle = '#ffffff';
      sx.fillRect(0, y - 0.5, STRIP, 1);
    }
    const wx = this.swatch.getContext('2d');
    if (wx) {
      wx.fillStyle = hexOf(c);
      wx.fillRect(0, 0, 56, 28);
      wx.fillStyle = hexOf(this.current);
      wx.fillRect(0, 28, 56, 28);
    }
    this.red.set(c.r);
    this.green.set(c.g);
    this.blue.set(c.b);
    if (this.ink) this.inks.forEach((r, k) => r.set(Math.round(this.ink![k] * 100)));
    if (document.activeElement !== this.hex) this.hex.value = hexOf(c);
  }
}
