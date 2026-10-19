import type { Engine, RGB } from '../../engine';
import { inkOf, renditionOf, type Ink } from '../../engine/colour-lut';
import { labToSrgb, srgbToLab } from '../../engine/lab';
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

/** The nine components the strip can run along; the field shows the other two of the same family (HSB, RGB or Lab). */
type Axis = 'h' | 's' | 'v' | 'r' | 'g' | 'b' | 'l' | 'a' | 'k';
type Family = 'hsb' | 'rgb' | 'lab';
const LAYOUT: Record<Axis, { x: Axis; y: Axis; family: Family }> = {
  h: { x: 's', y: 'v', family: 'hsb' }, s: { x: 'h', y: 'v', family: 'hsb' }, v: { x: 'h', y: 's', family: 'hsb' },
  r: { x: 'b', y: 'g', family: 'rgb' }, g: { x: 'b', y: 'r', family: 'rgb' }, b: { x: 'r', y: 'g', family: 'rgb' },
  l: { x: 'a', y: 'k', family: 'lab' }, a: { x: 'k', y: 'l', family: 'lab' }, k: { x: 'a', y: 'l', family: 'lab' },
};
const AXIS_NAME: Record<Axis, string> = { h: 'H', s: 'S', v: 'B', r: 'R', g: 'G', b: 'B', l: 'L', a: 'a', k: 'b' };

/** A component of colour c as 0 to 1; hue is carried in for grays. */
function axisValue(a: Axis, c: RGB, hue: number): number {
  switch (a) {
    case 'h': return hue / 360;
    case 's': return toHsv(c, hue).s;
    case 'v': return toHsv(c, hue).v;
    case 'r': return c.r / 255;
    case 'g': return c.g / 255;
    case 'b': return c.b / 255;
    default: { const lab = srgbToLab(c.r, c.g, c.b); return a === 'l' ? lab[0] / 100 : ((a === 'a' ? lab[1] : lab[2]) + 128) / 255; }
  }
}

/** The colour whose strip component is `sv` and whose field components are `xv` and `yv` (all 0 to 1). */
function colourFrom(strip: Axis, sv: number, xv: number, yv: number): RGB {
  const L = LAYOUT[strip], v: Partial<Record<Axis, number>> = { [strip]: sv, [L.x]: xv, [L.y]: yv };
  const n = (a: Axis): number => Math.min(1, Math.max(0, v[a] ?? 0));
  if (L.family === 'hsb') return toRgb({ h: Math.min(359.99, n('h') * 360), s: n('s'), v: n('v') });
  if (L.family === 'rgb') return { r: Math.round(n('r') * 255), g: Math.round(n('g') * 255), b: Math.round(n('b') * 255) };
  const [r, g, b] = labToSrgb(n('l') * 100, n('a') * 255 - 128, n('k') * 255 - 128);
  return { r, g, b };
}

const labDist = (p: RGB, q: RGB): number => { const a = srgbToLab(p.r, p.g, p.b), b = srgbToLab(q.r, q.g, q.b); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
const snapWeb = (c: RGB): RGB => ({ r: Math.round(c.r / 51) * 51, g: Math.round(c.g / 51) * 51, b: Math.round(c.b / 51) * 51 });

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
  private readonly hex = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="7" spellcheck="false" aria-label="Hex">');
  private readonly inks = (['C', 'M', 'Y', 'K'] as const).map((n, k) => numberRow(n, 0, 100, 1, (v) => this.setInk(k, v)));
  private ink: Ink | null = null;
  /** The component the strip runs along, picked with the radio beside its field (default Hue). */
  private axis: Axis = 'h';
  private readonly axisRows = new Map<Axis, ReturnType<typeof numberRow>>();
  private readonly radios = new Map<Axis, HTMLInputElement>();
  private readonly gamutWarn = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button" title="Out of gamut for printing: click for the closest printable colour" hidden>Out of gamut</button>');
  private readonly webWarn = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button" title="Not a web-safe colour: click for the closest one" hidden>Not web safe</button>');

  /** A numeric row for one component with the radio that makes it the strip's axis. */
  private axisRow(a: Axis, max: number, min = 0): HTMLElement {
    const fam = LAYOUT[a].family;
    const row = numberRow(AXIS_NAME[a], min, max, 1, (v) => this.typeAxis(a, v));
    this.axisRows.set(a, row);
    const radio = el<HTMLInputElement>(`<input type="radio" name="cv-pick-axis" aria-label="Strip axis ${fam} ${AXIS_NAME[a]}">`);
    radio.checked = a === this.axis;
    radio.addEventListener('change', () => { if (radio.checked) { this.axis = a; this.sync(); } });
    this.radios.set(a, radio);
    const wrap = el<HTMLElement>('<div class="cv-pick-axis"></div>');
    wrap.append(radio, row.el);
    return wrap;
  }

  /** A component typed into its field. */
  private typeAxis(a: Axis, v: number): void {
    if (!Number.isFinite(v)) return;
    const L = LAYOUT[a], c = this.rgb();
    if (L.family === 'rgb') { this.setRgb({ ...c, [a]: v }); return; }
    if (L.family === 'hsb') {
      const n = { ...this.hsv };
      if (a === 'h') n.h = Math.min(359.99, Math.max(0, v)); else if (a === 's' || a === 'v') n[a] = Math.min(1, Math.max(0, v / 100));
      this.applyHsv(n);
      return;
    }
    const lab = srgbToLab(c.r, c.g, c.b);
    if (a === 'l') lab[0] = Math.min(100, Math.max(0, v)); else lab[a === 'a' ? 1 : 2] = Math.min(127, Math.max(-128, v));
    const [r, g, b] = labToSrgb(lab[0], lab[1], lab[2]);
    this.setRgb({ r, g, b });
  }

  /** The strip and field components moved to a new place (all 0 to 1). */
  private place(sv: number, xv: number, yv: number): void {
    const L = LAYOUT[this.axis];
    if (L.family === 'hsb') {
      const v: Partial<Record<Axis, number>> = { [this.axis]: sv, [L.x]: xv, [L.y]: yv };
      this.applyHsv({ h: Math.min(359.99, (v.h ?? 0) * 360), s: v.s ?? 0, v: v.v ?? 0 });
      return;
    }
    this.setRgb(colourFrom(this.axis, sv, xv, yv));
  }

  /** Pick a colour anywhere on the screen with the browser's eyedropper. */
  private async fromScreen(): Promise<void> {
    const Eye = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!Eye) return;
    try { const r = await new Eye().open(), c = parseHex(r.sRGBHex); if (c) this.setRgb(c); } catch { /* cancelled */ }
  }

  constructor(private readonly engine: Engine) {
    super('Color Picker', 600);
    const side = el<HTMLElement>('<div class="cv-pick-side"></div>');
    const comps = el<HTMLElement>('<div class="cv-pick-side"></div>');
    side.append(this.swatch, this.gamutWarn, this.webWarn, this.hex);
    comps.append(this.axisRow('h', 359), this.axisRow('s', 100), this.axisRow('v', 100), this.axisRow('r', 255), this.axisRow('g', 255), this.axisRow('b', 255), this.axisRow('l', 100), this.axisRow('a', 127, -128), this.axisRow('k', 127, -128), ...this.inks.map((r) => r.el));
    const wrap = el<HTMLElement>('<div class="cv-pick"></div>');
    wrap.append(this.sbField, this.strip, side, comps);
    this.body.append(wrap, el<HTMLElement>('<p class="cv-note">Click the canvas to sample a color. The radio beside a component makes the strip run along it.</p>'));
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Add to Swatches', 'ghost', () => document.dispatchEvent(new CustomEvent('cv-add-swatch', { detail: hexOf(this.rgb()) })));
    if ('EyeDropper' in window) this.button('Pick from Screen', 'ghost', () => void this.fromScreen());
    this.button('OK', 'primary', () => this.commit());
    this.gamutWarn.addEventListener('click', () => { const p = this.engine.current; if (this.ink && p?.cmykLut) this.setRgb(renditionOf(this.ink, p.cmykLut)); });
    this.webWarn.addEventListener('click', () => this.setRgb(snapWeb(this.rgb())));
    this.drag(this.sbField, (x, y) => this.place(axisValue(this.axis, this.rgb(), this.hsv.h), x, 1 - y));
    this.drag(this.strip, (_x, y) => {
      const L = LAYOUT[this.axis], c = this.rgb();
      this.place(this.axis === 'h' ? y : 1 - y, axisValue(L.x, c, this.hsv.h), axisValue(L.y, c, this.hsv.h));
    });
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
    const fx = this.sbField.getContext('2d'), ax = this.axis, L = LAYOUT[ax], sv = axisValue(ax, c, this.hsv.h);
    const xv = axisValue(L.x, c, this.hsv.h), yv = axisValue(L.y, c, this.hsv.h);
    if (fx) {
      if (ax === 'h') {
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
      } else {
        const img = fx.createImageData(FIELD, FIELD), d = img.data;
        for (let j = 0; j < FIELD; j++) for (let i = 0; i < FIELD; i++) {
          const k = colourFrom(ax, sv, i / (FIELD - 1), 1 - j / (FIELD - 1)), o = (j * FIELD + i) * 4;
          d[o] = k.r; d[o + 1] = k.g; d[o + 2] = k.b; d[o + 3] = 255;
        }
        fx.putImageData(img, 0, 0);
      }
      fx.beginPath();
      fx.arc(xv * FIELD, (1 - yv) * FIELD, 5, 0, Math.PI * 2);
      fx.lineWidth = 1.5;
      fx.strokeStyle = (ax === 'h' ? this.hsv.v : yv) > 0.55 ? '#000000' : '#ffffff';
      fx.stroke();
    }
    const sx = this.strip.getContext('2d');
    if (sx) {
      if (ax === 'h') {
        const rainbow = sx.createLinearGradient(0, 0, 0, FIELD);
        for (let i = 0; i <= 6; i++) rainbow.addColorStop(i / 6, hexOf(toRgb({ h: i * 60, s: 1, v: 1 })));
        sx.fillStyle = rainbow;
        sx.fillRect(0, 0, STRIP, FIELD);
      } else {
        const img = sx.createImageData(STRIP, FIELD), d = img.data;
        for (let j = 0; j < FIELD; j++) {
          const k = colourFrom(ax, 1 - j / (FIELD - 1), xv, yv);
          for (let i = 0; i < STRIP; i++) { const o = (j * STRIP + i) * 4; d[o] = k.r; d[o + 1] = k.g; d[o + 2] = k.b; d[o + 3] = 255; }
        }
        sx.putImageData(img, 0, 0);
      }
      const y = (ax === 'h' ? sv : 1 - sv) * FIELD;
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
    const lab = srgbToLab(c.r, c.g, c.b), hv = this.hsv;
    const shown: Record<Axis, number> = { h: Math.round(hv.h), s: Math.round(hv.s * 100), v: Math.round(hv.v * 100), r: c.r, g: c.g, b: c.b, l: Math.round(lab[0]), a: Math.round(lab[1]), k: Math.round(lab[2]) };
    for (const [a, row] of this.axisRows) if (document.activeElement !== row.input) row.set(shown[a]);
    for (const [a, r] of this.radios) r.checked = a === this.axis;
    const p = this.engine.current;
    setHidden(this.gamutWarn, !(this.ink && p?.cmykLut && p.cmykIn && labDist(c, renditionOf(inkOf(c, p.cmykIn), p.cmykLut)) > 3));
    setHidden(this.webWarn, [c.r, c.g, c.b].every((n) => n % 51 === 0));
    if (this.ink) this.inks.forEach((r, k) => r.set(Math.round(this.ink![k] * 100)));
    if (document.activeElement !== this.hex) this.hex.value = hexOf(c);
  }
}
