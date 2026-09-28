import type { Engine } from '../engine';
import type { RGB } from '../engine/types';
import { el } from './dom';
import { icon } from './icons';
import { PanelGroup } from './panel-group';

/** Swatches and Color, one group as the target's (Phase 21, UI_SPEC.md section 6; s20, s22). Swatches: the target's
 *  47 colours (sampled from its screenshot) until changed; a click sets the foreground, Alt-click the background, a
 *  right-click removes one, and + adds the foreground; kept on this device. Color: a saturation and value square beside
 *  a vertical hue strip, bound to the foreground. */
const DEFAULTS = [
  '#000000', '#1a1a1a', '#333333', '#4d4d4d', '#666666', '#808080', '#999999', '#b3b3b3', '#cccccc', '#e6e6e6', '#ffffff', '#f0928f', '#f6c894', '#ffff9b', '#d2fe9a', '#a9fc99',
  '#a9fcca', '#a9fcfe', '#99c5fa', '#8c8cf8', '#be8ff8', '#f092f9', '#f092c4', '#ea3323', '#ef8733', '#ffff55', '#a1fc4e', '#75fb4c', '#75fb8e', '#75fbfd', '#377ef7', '#0000f5',
  '#7514f5', '#ea33f7', '#ea3380', '#80170e', '#834a18', '#8c8c2a', '#588b27', '#3d8a26', '#3d8a4d', '#3d8a8b', '#1b4587', '#000086', '#400787', '#801787', '#801746',
];
const KEY = 'formvis.swatches';
const hex = (c: RGB): string => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const rgb = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

function toHsv(c: RGB): [number, number, number] {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, mx ? d / mx : 0, mx];
}
function fromHsv(h: number, s: number, v: number): RGB {
  const f = (n: number): number => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
  return { r: f(5), g: f(3), b: f(1) };
}

export class SwatchesPanel {
  readonly group: PanelGroup;
  private list: string[];
  private readonly grid: HTMLElement;
  private readonly sv: HTMLCanvasElement;
  private readonly hue: HTMLCanvasElement;
  private hsv: [number, number, number] = [0, 0, 0];

  constructor(host: HTMLElement, private readonly engine: Engine) {
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); this.list = Array.isArray(s) ? s.filter((v) => /^#[0-9a-f]{6}$/i.test(v)) : [...DEFAULTS]; } catch { this.list = [...DEFAULTS]; }
    const swatches = el('<div class="cv-swatches-page"><div class="cv-swatch-grid"></div><p class="cv-swatch-hint"></p></div>');
    this.grid = swatches.querySelector('.cv-swatch-grid') as HTMLElement;
    const hint = swatches.querySelector('.cv-swatch-hint') as HTMLElement;
    hint.innerHTML = `${icon('plus', 12)}<span>Alt-click sets the background. Right-click removes.</span>`;
    hint.title = 'Click sets the foreground, Alt-click the background; right-click removes a swatch; + adds the foreground.';
    const color = el('<div class="cv-color-page"><canvas class="cv-color-sv" aria-label="Saturation and brightness"></canvas><canvas class="cv-color-hue" aria-label="Hue"></canvas></div>');
    this.sv = color.querySelector('.cv-color-sv') as HTMLCanvasElement;
    // Repainted whenever it gains a size: shown while minimised or before layout, it used to stay blank.
    new ResizeObserver(() => { if (this.sv.clientWidth) this.paintColor(); }).observe(this.sv);
    this.hue = color.querySelector('.cv-color-hue') as HTMLCanvasElement;
    this.group = new PanelGroup(host, 'swatches', [{ id: 'swatches', label: 'Swatches', body: swatches }, { id: 'color', label: 'Color', body: color }], 'Swatches and Color');
    this.group.onTab = () => requestAnimationFrame(() => this.paintColor());
    this.group.setMenu(() => ['swatch-add', 'swatches-reset']);
    this.renderGrid();
    this.bindColor();
    engine.on('colors', () => { this.hsv = toHsv(engine.fg); this.paintColor(); });
    this.hsv = toHsv(engine.fg);
  }

  private save(): void { try { localStorage.setItem(KEY, JSON.stringify(this.list)); } catch { /* this session only */ } }

  /** Adds the foreground colour, as the + tile does (the panel menu's Add Foreground Color). */
  addForeground(): void { const c = hex(this.engine.fg); if (!this.list.includes(c)) { this.list.push(c); this.save(); this.renderGrid(); } }
  /** The target's swatches again (the panel menu's Reset Swatches). */
  reset(): void { this.list = [...DEFAULTS]; this.save(); this.renderGrid(); }

  private renderGrid(): void {
    this.grid.textContent = '';
    this.list.forEach((c, i) => {
      const b = el<HTMLButtonElement>('<button class="cv-sw-tile" type="button"></button>');
      b.style.background = c;
      b.title = c;
      b.setAttribute('aria-label', `Swatch ${c}`);
      b.addEventListener('click', (e) => { if (e.altKey) this.engine.setColors(undefined, rgb(c)); else this.engine.setColors(rgb(c)); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); this.list.splice(i, 1); this.save(); this.renderGrid(); });
      this.grid.appendChild(b);
    });
    const add = el<HTMLButtonElement>(`<button class="cv-sw-tile cv-sw-add" type="button" title="Add the foreground colour" aria-label="Add the foreground colour">${icon('plus', 12)}</button>`);
    add.addEventListener('click', () => this.addForeground());
    this.grid.appendChild(add);
  }

  private bindColor(): void {
    const drag = (cv: HTMLCanvasElement, on: (x: number, y: number) => void): void => {
      let down = false;
      const at = (e: PointerEvent): void => { const r = cv.getBoundingClientRect(); on(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))); };
      cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); at(e); });
      cv.addEventListener('pointermove', (e) => { if (down) at(e); });
      cv.addEventListener('pointerup', () => { down = false; });
    };
    drag(this.sv, (x, y) => { this.hsv = [this.hsv[0], x, 1 - y]; this.engine.setColors(fromHsv(...this.hsv)); });
    drag(this.hue, (_x, y) => { this.hsv = [y * 359.99, this.hsv[1], this.hsv[2]]; this.engine.setColors(fromHsv(...this.hsv)); });
  }

  private paintColor(): void {
    const dpr = window.devicePixelRatio || 1;
    for (const cv of [this.sv, this.hue]) {
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    }
    const [h, s, v] = this.hsv, W = this.sv.width, H = this.sv.height;
    if (!W || !H) return;
    const g = this.sv.getContext('2d') as CanvasRenderingContext2D;
    const base = fromHsv(h, 1, 1);
    g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
    const white = g.createLinearGradient(0, 0, W, 0); white.addColorStop(0, '#ffffff'); white.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = white; g.fillRect(0, 0, W, H);
    const black = g.createLinearGradient(0, 0, 0, H); black.addColorStop(0, 'rgba(0,0,0,0)'); black.addColorStop(1, '#000000');
    g.fillStyle = black; g.fillRect(0, 0, W, H);
    g.strokeStyle = v > 0.5 ? '#000000' : '#ffffff'; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.arc(s * W, (1 - v) * H, 5 * dpr, 0, Math.PI * 2); g.stroke();
    const hg = this.hue.getContext('2d') as CanvasRenderingContext2D, HW = this.hue.width, HH = this.hue.height;
    if (!HW || !HH) return;
    const grad = hg.createLinearGradient(0, 0, 0, HH);
    for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, hex(fromHsv(i * 60 % 360, 1, 1)));
    hg.fillStyle = grad; hg.fillRect(0, 0, HW, HH);
    hg.fillStyle = '#ffffff'; hg.fillRect(0, (h / 360) * HH - dpr, HW, 2 * dpr);
  }
}
