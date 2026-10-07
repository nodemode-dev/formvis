import { runFilterOffThread, type Engine, type FilterSettings } from '../../engine';
import { libFilter, libValues, runLib, type LibColors, type LibEffect, type LibParam, type LibValue, type LibValues } from '../../engine/filter-library';
import { fxDefaults, galleryCategories, galleryFx, newEffect } from '../../engine/filters-lib/filter-gallery';
import type { FxDef } from '../../engine/filters-lib/gallery-fx';
import { el, patchList, q, setClass, setDisabled, setHidden, setHtml, setText, setValue } from '../dom';
import { icon } from '../icons';
import { checkRow, colorRow, selectRow, sliderRow } from './controls';

const TW = 160, TH = 112, MAX_LAYERS = 64;
const ZOOMS: ReadonlyArray<readonly [string, string]> = [['fit', 'Fit in View'], ['0.25', '25%'], ['0.5', '50%'], ['1', '100%'], ['2', '200%']];

interface Shown { readonly img: HTMLCanvasElement; readonly x: number; readonly y: number; readonly k: number }
interface View { readonly z: number; readonly vx: number; readonly vy: number; readonly vw: number; readonly vh: number; readonly pw: number; readonly ph: number; readonly dpr: number }
interface Folder { readonly head: HTMLButtonElement; readonly grid: HTMLElement; readonly keys: readonly string[] }
interface Thumb { readonly btn: HTMLElement; readonly canvas: HTMLCanvasElement; done: boolean }

export class GalleryView {
  readonly el = el(`<div class="cv-fg"><div class="cv-fg-view"><div class="cv-fg-pane"><canvas role="img" aria-label="Filter Gallery preview"></canvas></div><div class="cv-fg-bar"><select class="cv-input" aria-label="Preview zoom"></select><span class="cv-fg-time"></span></div></div><div class="cv-fg-browse" aria-label="Effects"></div><div class="cv-fg-side"><label class="cv-field"><span>Effect</span><select class="cv-input"></select></label><div class="cv-fg-settings"></div><div class="cv-list cv-fg-layers" tabindex="-1" aria-label="Effect layers"></div><div class="cv-fg-tools"></div></div></div>`);
  private readonly pane = q(this.el, '.cv-fg-pane');
  private readonly canvas = q<HTMLCanvasElement>(this.el, '.cv-fg-pane canvas');
  private readonly zoomSel = q<HTMLSelectElement>(this.el, '.cv-fg-bar select');
  private readonly time = q(this.el, '.cv-fg-time');
  private readonly browse = q(this.el, '.cv-fg-browse');
  private readonly pick = q<HTMLSelectElement>(this.el, '.cv-fg-side select');
  private readonly settings = q(this.el, '.cv-fg-settings');
  private readonly layers = q(this.el, '.cv-fg-layers');
  private readonly tools: Record<'up' | 'down' | 'add' | 'remove', HTMLButtonElement>;
  private readonly thumbs = new Map<string, Thumb>();
  private readonly folders: Folder[] = [];
  private readonly sections = new Map<string, { node: HTMLElement; set: (v: LibValues) => void }>();
  private stack: LibEffect[] = [];
  private sel = 0;
  private zoom: 'fit' | number = 1;
  private cx = 0;
  private cy = 0;
  private size: { width: number; height: number } | null = null;
  private shown: Shown | null = null;
  private token = 0;
  private timer = 0;
  private thumbSrc: ImageData | null = null;
  private thumbRun = false;
  private drag: { id: number; x: number; y: number; cx: number; cy: number } | null = null;

  constructor(private readonly engine: Engine, private readonly colors: () => LibColors, private readonly put: (v: LibEffect[]) => void) {
    for (const [v, t] of ZOOMS) this.zoomSel.add(new Option(t, v));
    this.zoomSel.value = '1';
    this.zoomSel.addEventListener('change', () => { this.zoom = this.zoomSel.value === 'fit' ? 'fit' : Number(this.zoomSel.value); this.paint(); this.schedule(0); });
    for (const g of galleryCategories()) {
      const block = el('<div class="cv-fg-cat"><button class="cv-fg-folder" type="button" aria-expanded="true"><span class="cv-fg-folder-icon"></span><span></span></button><div class="cv-fg-thumbs"></div></div>');
      const head = q<HTMLButtonElement>(block, 'button'), grid = q(block, '.cv-fg-thumbs'), group = document.createElement('optgroup');
      setHtml(q(head, '.cv-fg-folder-icon'), icon('folderOpen', 14), 'open');
      setText(head.lastElementChild, g.category);
      group.label = g.category;
      for (const fx of g.effects) {
        const b = el(`<button class="cv-fg-thumb" type="button"><canvas width="${TW}" height="${TH}"></canvas><span></span></button>`);
        b.dataset.fx = fx.key;
        b.title = fx.label;
        setText(q(b, 'span'), fx.label);
        grid.appendChild(b);
        this.thumbs.set(fx.key, { btn: b, canvas: q<HTMLCanvasElement>(b, 'canvas'), done: false });
        group.appendChild(new Option(fx.label, fx.key));
      }
      this.pick.appendChild(group);
      const folder: Folder = { head, grid, keys: g.effects.map((f) => f.key) };
      head.addEventListener('click', () => this.fold(folder, !grid.hidden));
      this.folders.push(folder);
      this.browse.appendChild(block);
    }
    this.browse.addEventListener('click', (e) => { const k = (e.target as HTMLElement).closest<HTMLElement>('[data-fx]')?.dataset.fx; if (k) this.choose(k); });
    this.pick.addEventListener('change', () => this.choose(this.pick.value));
    const bar = q(this.el, '.cv-fg-tools');
    const tool = (name: string, label: string, run: () => void): HTMLButtonElement => {
      const b = el<HTMLButtonElement>(`<button class="cv-icon-btn" type="button">${icon(name, 16)}</button>`);
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', run);
      bar.appendChild(b);
      return b;
    };
    this.tools = { up: tool('chevronUp', 'Move effect layer up', () => this.move(1)), down: tool('chevronDown', 'Move effect layer down', () => this.move(-1)), add: tool('add', 'New effect layer', () => this.add()), remove: tool('delete', 'Delete effect layer', () => this.remove()) };
    this.layers.addEventListener('click', (e) => {
      const t = e.target as HTMLElement, row = t.closest<HTMLElement>('[data-key]'), i = Number(row?.dataset.key);
      if (!row || !this.stack[i]) return;
      if (t.closest('[data-act="eye"]')) { this.stack[i] = { ...this.stack[i], visible: !this.stack[i].visible }; this.changed(); return; }
      this.sel = i;
      this.sync();
    });
    this.pane.addEventListener('pointerdown', (e) => this.grab(e));
    this.pane.addEventListener('pointermove', (e) => this.pan(e));
    this.pane.addEventListener('pointerup', (e) => this.release(e));
    this.pane.addEventListener('pointercancel', (e) => this.release(e));
  }

  set(v: LibValue): void {
    this.stack = Array.isArray(v) ? (v as unknown as readonly LibEffect[]).map((e) => ({ ...e, values: { ...e.values } })) : [];
    if (!this.stack.length) { this.stack = [newEffect('')]; this.put(this.stack.slice()); }
    this.sel = this.stack.length - 1;
    this.size = this.engine.targetSize;
    const f = this.engine.targetCrop(0, 0, 1, 1, 1)?.frame, s = this.size;
    this.cx = f ? f.area.x + f.area.w / 2 : (s?.width ?? 0) / 2;
    this.cy = f ? f.area.y + f.area.h / 2 : (s?.height ?? 0) / 2;
    this.shown = null;
    this.token += 1;
    this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    setText(this.time, '');
    this.thumbSrc = null;
    for (const t of this.thumbs.values()) { t.done = false; t.canvas.getContext('2d')?.clearRect(0, 0, TW, TH); }
    this.sync();
    this.schedule(0);
    this.thumbsLater();
  }

  private live(): boolean { return !!this.el.closest('.cv-scrim:not([hidden])'); }

  private changed(resync = true): void {
    this.put(this.stack.slice());
    if (resync) this.sync();
    if (!this.el.contains(document.activeElement)) this.layers.focus({ preventScroll: true });
    this.schedule();
  }

  private choose(key: string): void {
    const e = this.stack[this.sel], fx = galleryFx(key);
    if (!e || !fx || e.filter === key) return;
    this.stack[this.sel] = { filter: key, values: fxDefaults(fx), visible: e.visible };
    this.changed();
  }

  private setValue(key: string, v: LibValue): void {
    const e = this.stack[this.sel];
    if (!e) return;
    this.stack[this.sel] = { ...e, values: { ...e.values, [key]: v } };
    this.changed(false);
  }

  private add(): void {
    if (this.stack.length >= MAX_LAYERS) return;
    this.stack.splice(this.sel + 1, 0, structuredClone(this.stack[this.sel]));
    this.sel += 1;
    this.changed();
  }

  private remove(): void {
    if (this.stack.length <= 1) return;
    this.stack.splice(this.sel, 1);
    this.sel = Math.max(0, Math.min(this.stack.length - 1, this.sel - 1));
    this.changed();
  }

  private move(by: number): void {
    const to = this.sel + by;
    if (to < 0 || to >= this.stack.length) return;
    [this.stack[this.sel], this.stack[to]] = [this.stack[to], this.stack[this.sel]];
    this.sel = to;
    this.changed();
  }

  private sync(): void {
    const e = this.stack[this.sel], fx = e ? galleryFx(e.filter) : undefined;
    patchList<number>(this.layers, this.stack.map((_, i) => i).reverse(), {
      key: (i) => String(i),
      create: (i) => { const row = el('<div class="cv-list-row cv-fg-layer"><button class="cv-fg-eye" type="button" data-act="eye" aria-label="Show this effect layer"></button><button class="cv-fg-name" type="button"></button></div>'); this.fill(row, i); return row; },
      update: (row, i) => this.fill(row, i),
    });
    setDisabled(this.tools.remove, this.stack.length <= 1);
    setDisabled(this.tools.add, this.stack.length >= MAX_LAYERS);
    setDisabled(this.tools.up, this.sel >= this.stack.length - 1);
    setDisabled(this.tools.down, this.sel <= 0);
    if (!e || !fx) return;
    setValue(this.pick, fx.key);
    for (const [k, t] of this.thumbs) setClass(t.btn, 'is-selected', k === fx.key);
    const sec = this.section(fx);
    for (const [k, s] of this.sections) setHidden(s.node, k !== fx.key);
    sec.set(e.values);
    const folder = this.folders.find((f) => f.keys.includes(fx.key));
    if (folder?.grid.hidden) this.fold(folder, false);
  }

  private fill(row: HTMLElement, i: number): void {
    const e = this.stack[i], eye = q<HTMLButtonElement>(row, '[data-act="eye"]');
    setText(q(row, '.cv-fg-name'), galleryFx(e.filter)?.label ?? e.filter);
    setHtml(eye, icon(e.visible ? 'eye' : 'eyeOff', 14), e.visible ? 'on' : 'off');
    if (eye.getAttribute('aria-pressed') !== String(e.visible)) eye.setAttribute('aria-pressed', String(e.visible));
    setClass(row, 'is-selected', i === this.sel);
    setClass(row, 'is-off', !e.visible);
  }

  private section(fx: FxDef): { node: HTMLElement; set: (v: LibValues) => void } {
    const have = this.sections.get(fx.key);
    if (have) return have;
    const rows = fx.params.map((p) => this.row(p, (v) => this.setValue(p.key, v)));
    const node = el('<div class="cv-panel-section" hidden></div>');
    node.append(...rows.map((r) => r.el));
    if (fx.note) { const n = el('<p class="cv-note"></p>'); n.textContent = fx.note; node.appendChild(n); }
    this.settings.appendChild(node);
    const made = { node, set: (v: LibValues) => fx.params.forEach((p, i) => rows[i].set(v[p.key])) };
    this.sections.set(fx.key, made);
    return made;
  }

  private row(p: LibParam, put: (v: LibValue) => void): { el: HTMLElement; set: (v: LibValue) => void } {
    if (p.kind === 'range') { const r = sliderRow(p.label, p.min, p.max, p.step, put); return { el: r.el, set: (v) => r.set(v as number) }; }
    if (p.kind === 'select') { const r = selectRow(p.label, p.options, put); return { el: r.el, set: (v) => r.set(v as string) }; }
    if (p.kind === 'check') { const r = checkRow(p.label, put); return { el: r.el, set: (v) => r.set(v as boolean) }; }
    const r = colorRow(p.label, put);
    return { el: r.el, set: (v) => r.set(v as string) };
  }

  private fold(f: Folder, close: boolean): void {
    setHidden(f.grid, close);
    if (f.head.getAttribute('aria-expanded') !== String(!close)) f.head.setAttribute('aria-expanded', String(!close));
    setHtml(q(f.head, '.cv-fg-folder-icon'), icon(close ? 'folder' : 'folderOpen', 14), close ? 'shut' : 'open');
    if (!close) this.thumbsLater();
  }

  private thumbsLater(): void {
    if (this.thumbRun) return;
    this.thumbRun = true;
    const step = (): void => {
      const src = this.live() ? (this.thumbSrc ??= this.thumbSource()) : null;
      if (!src) { this.thumbRun = false; return; }
      const t0 = performance.now(), colors = this.colors();
      for (const f of this.folders) {
        if (f.grid.hidden) continue;
        for (const key of f.keys) {
          const t = this.thumbs.get(key);
          if (!t || t.done) continue;
          if (performance.now() - t0 > 8) { requestAnimationFrame(step); return; }
          t.canvas.getContext('2d')?.putImageData(runLib('filterGallery', { effects: [newEffect(key)] }, 0, src, 1, null, colors), 0, 0);
          t.done = true;
        }
      }
      this.thumbRun = false;
    };
    requestAnimationFrame(step);
  }

  private thumbSource(): ImageData | null {
    const s = this.size;
    if (!s) return null;
    let rw = Math.min(s.width, Math.max(TW / 2, s.width / 4)), rh = (rw * TH) / TW;
    if (rh > s.height) { rh = s.height; rw = (rh * TW) / TH; }
    return this.engine.targetCrop((s.width - rw) / 2, (s.height - rh) / 2, rw, rh, TW / rw)?.image ?? null;
  }

  private view(): View | null {
    const s = this.size, pw = this.pane.clientWidth, ph = this.pane.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!s || pw < 2 || ph < 2) return null;
    const z = this.zoom === 'fit' ? Math.min(1, pw / s.width, ph / s.height) : this.zoom, vw = pw / z, vh = ph / z;
    const cx = vw >= s.width ? s.width / 2 : Math.min(s.width - vw / 2, Math.max(vw / 2, this.cx));
    const cy = vh >= s.height ? s.height / 2 : Math.min(s.height - vh / 2, Math.max(vh / 2, this.cy));
    return { z, vx: cx - vw / 2, vy: cy - vh / 2, vw, vh, pw, ph, dpr };
  }

  private schedule(delay = 80): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), delay);
  }

  private render(): void {
    const v = this.view(), s = this.size;
    if (!v || !s || !this.live()) return;
    const x0 = Math.max(0, Math.floor(v.vx)), y0 = Math.max(0, Math.floor(v.vy)), x1 = Math.min(s.width, Math.ceil(v.vx + v.vw)), y1 = Math.min(s.height, Math.ceil(v.vy + v.vh));
    if (x1 <= x0 || y1 <= y0) return;
    const k = Math.min(1, v.z * v.dpr), values = { effects: this.stack }, reach = libFilter('filterGallery').reach?.(libValues('filterGallery', values), k) ?? 0, a = Math.ceil(reach / k) + 1;
    const cx0 = Math.max(0, x0 - a), cy0 = Math.max(0, y0 - a), cw = Math.min(s.width, x1 + a) - cx0, ch = Math.min(s.height, y1 + a) - cy0, crop = this.engine.targetCrop(cx0, cy0, cw, ch, k);
    if (!crop) return;
    const token = ++this.token, t0 = performance.now(), colors = this.colors();
    const done = (out: ImageData): void => {
      if (token !== this.token) return;
      const img = document.createElement('canvas');
      img.width = out.width;
      img.height = out.height;
      img.getContext('2d')?.putImageData(out, 0, 0);
      this.shown = { img, x: cx0, y: cy0, k: out.width / cw };
      this.paint();
      setText(this.time, `${Math.round(performance.now() - t0)} ms`);
    };
    const job = runFilterOffThread('filterGallery', { lib: { filterGallery: values }, colors } as unknown as FilterSettings, k, 0, crop.image, crop.frame);
    if (job) void job.then(done);
    else done(runLib('filterGallery', values, 0, crop.image, k, crop.frame, colors));
  }

  private paint(): void {
    const v = this.view(), cv = this.canvas;
    if (!v) return;
    const W = Math.round(v.pw * v.dpr), H = Math.round(v.ph * v.dpr), s = this.size;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    setClass(this.pane, 'is-pannable', !!s && (v.vw < s.width || v.vh < s.height));
    const c = cv.getContext('2d'), sh = this.shown;
    if (!c) return;
    c.clearRect(0, 0, W, H);
    if (!sh) return;
    const f = v.z * v.dpr;
    c.imageSmoothingEnabled = f < sh.k;
    c.drawImage(sh.img, (sh.x - v.vx) * f, (sh.y - v.vy) * f, (sh.img.width / sh.k) * f, (sh.img.height / sh.k) * f);
  }

  private grab(e: PointerEvent): void {
    const v = this.view(), s = this.size;
    if (!v || !s || e.button !== 0 || (v.vw >= s.width && v.vh >= s.height)) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: v.vx + v.vw / 2, cy: v.vy + v.vh / 2 };
    this.pane.setPointerCapture(e.pointerId);
    setClass(this.pane, 'is-dragging', true);
  }

  private pan(e: PointerEvent): void {
    const d = this.drag, v = this.view();
    if (!d || e.pointerId !== d.id || !v) return;
    this.cx = d.cx - (e.clientX - d.x) / v.z;
    this.cy = d.cy - (e.clientY - d.y) / v.z;
    const w = this.view();
    if (w) { this.cx = w.vx + w.vw / 2; this.cy = w.vy + w.vh / 2; }
    this.paint();
  }

  private release(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    setClass(this.pane, 'is-dragging', false);
    this.schedule(0);
  }
}
