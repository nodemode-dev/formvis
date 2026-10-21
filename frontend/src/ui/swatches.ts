import type { Engine } from '../engine';
import type { RGB } from '../engine/types';
import { el } from './dom';
import { icon } from './icons';
import { PanelGroup } from './panel-group';
import type { SwatchItem } from '../io/swatch-files';

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
const KEY_SET = 'formvis.swatch-set';
/** One swatch: its colour, an optional name and an optional group; the order of the list is the order shown. */
type SwatchEntry = SwatchItem;
const HEX = /^#[0-9a-f]{6}$/i;
const SOURCE_LEN = { cmyk: 4, lab: 3, gray: 1 } as const;
/** The full-precision source colour and the global or spot type a swatch brought from its file, when valid. */
function extras(e: { src?: unknown; kind?: unknown; book?: unknown; raw?: unknown }): Pick<SwatchEntry, 'src' | 'kind' | 'book' | 'raw'> {
  const s = e.src as { m?: string; v?: unknown } | undefined;
  const ok = !!s && (s.m === 'cmyk' || s.m === 'lab' || s.m === 'gray') && Array.isArray(s.v) && s.v.length === SOURCE_LEN[s.m] && s.v.every((n) => typeof n === 'number' && Number.isFinite(n));
  const r = e.raw, rawOk = Array.isArray(r) && r.length === 5 && r.every((n) => Number.isInteger(n) && n >= 0 && n <= 65535);
  return { ...(ok ? { src: { m: s!.m as 'cmyk' | 'lab' | 'gray', v: [...(s!.v as number[])] } } : {}), ...(e.kind === 'spot' || e.kind === 'global' ? { kind: e.kind } : {}), ...(typeof e.book === 'string' && e.book ? { book: e.book.slice(0, 24) } : {}), ...(rawOk ? { raw: [...(r as number[])] as [number, number, number, number, number] } : {}) };
}
const KIND_WORD = { spot: 'spot', global: 'global' } as const;
function loadEntries(): SwatchEntry[] {
  try {
    const s = JSON.parse(localStorage.getItem(KEY_SET) ?? 'null');
    if (Array.isArray(s)) return s.flatMap((e) => (e && typeof e.c === 'string' && HEX.test(e.c) ? [{ c: e.c.toLowerCase(), ...(typeof e.name === 'string' && e.name ? { name: e.name.slice(0, 60) } : {}), ...(typeof e.group === 'string' && e.group ? { group: e.group.slice(0, 40) } : {}), ...extras(e) }] : []));
    const old = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (Array.isArray(old)) return old.filter((v) => typeof v === 'string' && HEX.test(v)).map((c) => ({ c: c.toLowerCase() }));
  } catch { /* defaults */ }
  return DEFAULTS.map((c) => ({ c }));
}
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
  private list: SwatchEntry[];
  private picked = -1;
  private readonly grid: HTMLElement;
  private readonly editor: HTMLElement;
  private readonly nameIn = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="60" placeholder="Name" aria-label="Swatch name">');
  private readonly groupIn = el<HTMLInputElement>('<input class="cv-input" type="text" maxlength="40" placeholder="Group" aria-label="Swatch group" list="cv-swatch-groups">');
  private readonly groupList = el<HTMLDataListElement>('<datalist id="cv-swatch-groups"></datalist>');
  private readonly sv: HTMLCanvasElement;
  private readonly hue: HTMLCanvasElement;
  private hsv: [number, number, number] = [0, 0, 0];
  private fields!: HTMLElement;
  private editBg = false;

  constructor(host: HTMLElement, private readonly engine: Engine) {
    this.list = loadEntries();
    const swatches = el('<div class="cv-swatches-page"><div class="cv-swatch-grid"></div><div class="cv-swatch-edit" hidden></div><p class="cv-swatch-hint"></p></div>');
    this.grid = swatches.querySelector('.cv-swatch-grid') as HTMLElement;
    this.editor = swatches.querySelector('.cv-swatch-edit') as HTMLElement;
    const mk = (label: string, tip: string, run: () => void): HTMLButtonElement => { const b = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost" type="button"></button>'); b.textContent = label; b.title = tip; b.setAttribute('aria-label', tip); b.addEventListener('click', run); return b; };
    this.editor.append(this.nameIn, this.groupIn, this.groupList, mk('<', 'Move earlier', () => this.move(-1)), mk('>', 'Move later', () => this.move(1)), mk('Remove', 'Remove this swatch', () => this.removePicked()));
    this.nameIn.addEventListener('change', () => this.describePicked());
    this.groupIn.addEventListener('change', () => this.describePicked());
    for (const i of [this.nameIn, this.groupIn]) i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
    document.addEventListener('cv-add-swatch', (e) => { const c = String((e as CustomEvent).detail ?? '').toLowerCase(); if (HEX.test(c)) this.addColor(c); });
    const hint = swatches.querySelector('.cv-swatch-hint') as HTMLElement;
    hint.innerHTML = `${icon('plus', 12)}<span>Alt-click sets the background. Double-click names, groups or moves. Right-click removes.</span>`;
    hint.title = 'Click sets the foreground, Alt-click the background; double-click to name, group or reorder a swatch; right-click removes a swatch; + adds the foreground.';
    const color = el(`<div class="cv-color-page"><div class="cv-color-pick"><canvas class="cv-color-sv" aria-label="Saturation and brightness"></canvas><canvas class="cv-color-hue" aria-label="Hue"></canvas></div><div class="cv-color-fields"><div class="cv-color-chips"><button class="cv-color-chip" type="button" data-chip="fg" title="Edit the foreground color" aria-label="Foreground color" aria-pressed="true"></button><button class="cv-color-chip" type="button" data-chip="bg" title="Edit the background color" aria-label="Background color" aria-pressed="false"></button><button class="cv-btn cv-btn-ghost" type="button" data-swap title="Swap foreground and background" aria-label="Swap foreground and background">${icon('swap', 12)}</button></div>${['H', 'S', 'B'].map((k, i) => `<span>${k}</span><input type="range" min="0" max="${i ? 100 : 360}" step="1" data-hsb="${i}" aria-label="${['Hue', 'Saturation', 'Brightness'][i]}"><input class="cv-input" type="number" min="0" max="${i ? 100 : 360}" step="1" data-hsbn="${i}" aria-label="${['Hue', 'Saturation', 'Brightness'][i]} value">`).join('')}<span>#</span><input class="cv-input cv-color-hex" type="text" maxlength="7" spellcheck="false" aria-label="Hex color" data-hex></div></div>`);
    this.fields = color;
    this.sv = color.querySelector('.cv-color-sv') as HTMLCanvasElement;
    // Repainted whenever it gains a size: shown while minimised or before layout, it used to stay blank.
    new ResizeObserver(() => { if (this.sv.clientWidth) this.paintColor(); }).observe(this.sv);
    this.hue = color.querySelector('.cv-color-hue') as HTMLCanvasElement;
    this.group = new PanelGroup(host, 'swatches', [{ id: 'swatches', label: 'Swatches', body: swatches }, { id: 'color', label: 'Color', body: color }], 'Swatches and Color');
    this.group.onTab = () => requestAnimationFrame(() => this.paintColor());
    this.group.setMenu(() => ['swatch-add', 'swatches-reset', '-', 'swatches-load', 'swatches-save']);
    this.renderGrid();
    this.bindColor();
    this.bindFields();
    engine.on('colors', () => { this.pull(); this.paintColor(); });
    window.addEventListener('formvis:dynamic-sliders', () => this.pull());
    this.pull();
  }

  private target(): RGB { return this.editBg ? this.engine.bg : this.engine.fg; }
  private push(c: RGB): void { if (this.editBg) this.engine.setColors(undefined, c); else this.engine.setColors(c); }

  /** Reads the colour being edited into the square, the sliders, the hex field and the two chips, in place. */
  private pull(): void {
    const c = this.target(), h = toHsv(c);
    // A grey keeps the hue the person last chose.
    this.hsv = h[1] === 0 || h[2] === 0 ? [this.hsv[0], h[1], h[2]] : h;
    const q = <T extends HTMLElement>(s: string): T => this.fields.querySelector(s) as T;
    const vals = [Math.round(this.hsv[0]), Math.round(this.hsv[1] * 100), Math.round(this.hsv[2] * 100)];
    for (let i = 0; i < 3; i++) {
      const r = q<HTMLInputElement>(`[data-hsb="${i}"]`), n = q<HTMLInputElement>(`[data-hsbn="${i}"]`);
      if (r.value !== String(vals[i])) r.value = String(vals[i]);
      if (document.activeElement !== n && n.value !== String(vals[i])) n.value = String(vals[i]);
      const dyn = this.engine.toolPrefs.dynamicSliders;
      if (r.classList.contains('is-dynamic') !== dyn) r.classList.toggle('is-dynamic', dyn);
      const [hh, ss, vv] = this.hsv, hs = (x: number, y: number, z: number): string => hex(fromHsv(x, y, z));
      const track = !dyn ? '' : i === 0 ? `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 359.99].map((x) => hs(x, Math.max(ss, 0.01), Math.max(vv, 0.01))).join(', ')})`
        : i === 1 ? `linear-gradient(to right, ${hs(hh, 0, Math.max(vv, 0.01))}, ${hs(hh, 1, Math.max(vv, 0.01))})` : `linear-gradient(to right, ${hs(hh, ss, 0)}, ${hs(hh, ss, 1)})`;
      if (r.style.getPropertyValue('--dyn-track') !== track) r.style.setProperty('--dyn-track', track);
    }
    const hx = q<HTMLInputElement>('[data-hex]');
    if (document.activeElement !== hx) hx.value = hex(c);
    q<HTMLElement>('[data-chip="fg"]').style.background = hex(this.engine.fg);
    q<HTMLElement>('[data-chip="bg"]').style.background = hex(this.engine.bg);
  }

  private bindFields(): void {
    const q = <T extends HTMLElement>(s: string): T => this.fields.querySelector(s) as T;
    const setHsb = (i: number, v: number): void => {
      if (!Number.isFinite(v)) return;
      const next: [number, number, number] = [this.hsv[0], this.hsv[1], this.hsv[2]];
      next[i] = i === 0 ? Math.min(360, Math.max(0, v)) : Math.min(100, Math.max(0, v)) / 100;
      this.hsv = next;
      this.push(fromHsv(next[0] >= 360 ? 359.99 : next[0], next[1], next[2]));
    };
    for (let i = 0; i < 3; i++) {
      q<HTMLInputElement>(`[data-hsb="${i}"]`).addEventListener('input', (e) => { const v = (e.target as HTMLInputElement).valueAsNumber; setHsb(i, v); });
      const n = q<HTMLInputElement>(`[data-hsbn="${i}"]`);
      n.addEventListener('change', () => setHsb(i, n.valueAsNumber));
      n.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') n.blur(); });
    }
    const hx = q<HTMLInputElement>('[data-hex]');
    const commit = (): void => {
      const t = hx.value.trim().replace(/^#?/, '#').toLowerCase();
      const full = /^#[0-9a-f]{3}$/.test(t) ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : t;
      if (HEX.test(full)) this.push(rgb(full)); else hx.value = hex(this.target());
    };
    hx.addEventListener('change', commit);
    hx.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { commit(); hx.blur(); } });
    for (const which of ['fg', 'bg'] as const) {
      q<HTMLElement>(`[data-chip="${which}"]`).addEventListener('click', () => {
        this.editBg = which === 'bg';
        for (const w of ['fg', 'bg']) q<HTMLElement>(`[data-chip="${w}"]`).setAttribute('aria-pressed', String(w === which));
        this.pull(); this.paintColor();
      });
    }
    q<HTMLElement>('[data-swap]').addEventListener('click', () => this.engine.swapColors());
  }

  /** Brings one of this group's tabs to the front (Window > Color). */
  showTab(tab: 'swatches' | 'color'): void { this.group.show(tab); }

  private save(): void { try { localStorage.setItem(KEY, JSON.stringify(this.list.map((e) => e.c))); localStorage.setItem(KEY_SET, JSON.stringify(this.list)); } catch { /* this session only */ } }

  /** Adds the foreground colour, as the + tile does (the panel menu's Add Foreground Color). */
  addForeground(): void { this.addColor(hex(this.engine.fg)); }
  /** Adds one colour ('#rrggbb') unless it is already there (the Color Picker's Add to Swatches). */
  addColor(c: string): void { if (!this.list.some((e) => e.c === c)) { this.list.push({ c }); this.save(); this.renderGrid(); } }
  /** The target's swatches again (the panel menu's Reset Swatches). */
  reset(): void { this.list = DEFAULTS.map((c) => ({ c })); this.picked = -1; this.save(); this.renderGrid(); }
  /** Every swatch as '#rrggbb', in order. */
  all(): string[] { return this.list.map((e) => e.c); }
  /** Names swatch `i` (the Preset Manager's Rename); an empty name clears it. */
  rename(i: number, name: string): void {
    const e = this.list[i];
    if (!e) return;
    const n = name.trim().slice(0, 60);
    if (n) e.name = n; else delete e.name;
    this.save(); this.renderGrid();
  }
  /** Every swatch with its name and group, in order. */
  entries(): ReadonlyArray<Readonly<SwatchEntry>> { return this.list.map((e) => ({ ...e })); }
  /** Replaces the whole set with colours that bring their own names and groups (a loaded .aco or .ase). */
  setEntries(list: ReadonlyArray<SwatchItem>): void {
    this.list = list.filter((e) => HEX.test(e.c)).map((e) => ({ c: e.c.toLowerCase(), ...(e.name ? { name: e.name.slice(0, 60) } : {}), ...(e.group ? { group: e.group.slice(0, 40) } : {}), ...extras(e) }));
    this.picked = -1; this.save(); this.renderGrid();
  }
  /** Replaces the whole set (Load Swatches, the Preset Manager); anything not '#rrggbb' is dropped; a colour that was already here keeps its name and group. */
  setAll(list: string[]): void {
    const old = this.list.slice();
    this.list = list.filter((v) => HEX.test(v)).map((v) => v.toLowerCase()).map((c) => { const k = old.findIndex((e) => e.c === c); return k >= 0 ? old.splice(k, 1)[0] : { c }; });
    this.picked = -1; this.save(); this.renderGrid();
  }

  private move(dir: number): void {
    const i = this.picked, g = this.list[i]?.group;
    let j = i + dir;
    while (j >= 0 && j < this.list.length && this.list[j].group !== g) j += dir;
    if (i < 0 || j < 0 || j >= this.list.length) return;
    [this.list[i], this.list[j]] = [this.list[j], this.list[i]];
    this.picked = j; this.save(); this.renderGrid();
  }
  private removePicked(): void { if (this.picked < 0) return; this.list.splice(this.picked, 1); this.picked = -1; this.save(); this.renderGrid(); }
  private describePicked(): void {
    const e = this.list[this.picked];
    if (!e) return;
    const n = this.nameIn.value.trim().slice(0, 60), g = this.groupIn.value.trim().slice(0, 40);
    const regroup = (e.group ?? '') !== g;
    if (n) e.name = n; else delete e.name;
    if (g) e.group = g; else delete e.group;
    this.save();
    if (regroup) { this.renderGrid(); return; }
    const t = this.grid.querySelector<HTMLElement>(`.cv-sw-tile[data-i="${this.picked}"]`);
    if (t) { t.title = e.name ? `${e.name} ${e.c}` : e.c; t.setAttribute('aria-label', `Swatch ${e.name ?? e.c}`); }
  }
  private pick(i: number): void {
    this.picked = i;
    const e = this.list[i];
    this.editor.hidden = !e;
    if (e) { this.nameIn.value = e.name ?? ''; this.groupIn.value = e.group ?? ''; }
    this.grid.querySelectorAll<HTMLElement>('.cv-sw-tile[data-i]').forEach((t) => t.setAttribute('aria-pressed', String(Number(t.dataset.i) === i)));
  }

  private renderGrid(): void {
    this.grid.textContent = '';
    const groups = [...new Set(this.list.map((e) => e.group ?? ''))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
    this.groupList.textContent = '';
    for (const g of groups) if (g) { const o = document.createElement('option'); o.value = g; this.groupList.appendChild(o); }
    for (const g of groups) {
      if (g) { const h = el<HTMLElement>('<div class="cv-sw-group"></div>'); h.textContent = g; this.grid.appendChild(h); }
      this.list.forEach((e, i) => {
        if ((e.group ?? '') !== g) return;
        const c = e.c, b = el<HTMLButtonElement>('<button class="cv-sw-tile" type="button"></button>');
        b.style.background = c;
        b.title = `${e.name ? `${e.name} ${c}` : c}${e.kind ? ` (${KIND_WORD[e.kind]} color)` : ''}${e.src ? ` (${e.src.m.toUpperCase()}: ${e.src.v.map((n) => +n.toFixed(3)).join(', ')})` : ''}`;
        b.dataset.i = String(i);
        b.setAttribute('aria-pressed', String(i === this.picked));
        b.setAttribute('aria-label', `Swatch ${e.name ?? c}`);
        b.addEventListener('click', (ev) => { if (ev.altKey) this.engine.setColors(undefined, rgb(c)); else this.engine.setColors(rgb(c)); });
        b.addEventListener('dblclick', () => this.pick(i));
        b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.list.splice(i, 1); this.picked = -1; this.editor.hidden = true; this.save(); this.renderGrid(); });
        this.grid.appendChild(b);
      });
    }
    const add = el<HTMLButtonElement>(`<button class="cv-sw-tile cv-sw-add" type="button" title="Add the foreground color" aria-label="Add the foreground color">${icon('plus', 12)}</button>`);
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
    drag(this.sv, (x, y) => { this.hsv = [this.hsv[0], x, 1 - y]; this.push(fromHsv(...this.hsv)); });
    drag(this.hue, (_x, y) => { this.hsv = [y * 359.99, this.hsv[1], this.hsv[2]]; this.push(fromHsv(...this.hsv)); });
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
