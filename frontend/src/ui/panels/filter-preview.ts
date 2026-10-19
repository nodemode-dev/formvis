import type { Engine } from '../../engine';
import type { LibFrame } from '../../engine/filter-library';
import { el, q, setClass, setText } from '../dom';

type Run = (src: ImageData, scale: number, frame: LibFrame) => ImageData | Promise<ImageData>;
interface Shown { readonly img: HTMLCanvasElement; readonly x: number; readonly y: number; readonly k: number }

const ZOOMS: ReadonlyArray<readonly [string, string]> = [['fit', 'Fit'], ['0.25', '25%'], ['0.5', '50%'], ['1', '100%'], ['2', '200%']];

/** The filter dialog's own zoomable preview: a window onto the processed layer, dragged to pan. Built once; the canvas is repainted in place. */
export class FilterPreview {
  readonly el = el('<div class="cv-fp"><div class="cv-fp-pane"><canvas role="img" aria-label="Filter preview"></canvas></div><div class="cv-fp-bar"><select class="cv-input" aria-label="Preview zoom"></select><span class="cv-fp-time"></span></div></div>');
  private readonly pane = q(this.el, '.cv-fp-pane');
  private readonly canvas = q<HTMLCanvasElement>(this.el, 'canvas');
  private readonly zoomSel = q<HTMLSelectElement>(this.el, 'select');
  private readonly time = q(this.el, '.cv-fp-time');
  private zoom: 'fit' | number = 1;
  private cx = 0;
  private cy = 0;
  private size: { width: number; height: number } | null = null;
  private shown: Shown | null = null;
  private token = 0;
  private drag: { id: number; x: number; y: number; cx: number; cy: number } | null = null;

  constructor(private readonly engine: Engine, private readonly again: () => void) {
    for (const [v, t] of ZOOMS) this.zoomSel.add(new Option(t, v));
    this.zoomSel.value = '1';
    this.zoomSel.addEventListener('change', () => { this.zoom = this.zoomSel.value === 'fit' ? 'fit' : Number(this.zoomSel.value); this.paint(); this.again(); });
    this.pane.addEventListener('pointerdown', (e) => this.grab(e));
    this.pane.addEventListener('pointermove', (e) => this.pan(e));
    this.pane.addEventListener('pointerup', (e) => this.release(e));
    this.pane.addEventListener('pointercancel', (e) => this.release(e));
  }

  /** Point the window at the layer being filtered (its selection's centre, else its middle). */
  begin(): void {
    this.size = this.engine.targetSize;
    const f = this.engine.targetCrop(0, 0, 1, 1, 1)?.frame, s = this.size;
    this.cx = f ? f.area.x + f.area.w / 2 : (s?.width ?? 0) / 2;
    this.cy = f ? f.area.y + f.area.h / 2 : (s?.height ?? 0) / 2;
    this.shown = null;
    this.token += 1;
    this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    setText(this.time, '');
  }

  get visible(): boolean { return !this.el.hidden && !!this.size && this.pane.clientWidth > 1; }

  private view(): { z: number; vx: number; vy: number; vw: number; vh: number; pw: number; ph: number; dpr: number } | null {
    const s = this.size, pw = this.pane.clientWidth, ph = this.pane.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!s || pw < 2 || ph < 2) return null;
    const z = this.zoom === 'fit' ? Math.min(1, pw / s.width, ph / s.height) : this.zoom, vw = pw / z, vh = ph / z;
    const cx = vw >= s.width ? s.width / 2 : Math.min(s.width - vw / 2, Math.max(vw / 2, this.cx));
    const cy = vh >= s.height ? s.height / 2 : Math.min(s.height - vh / 2, Math.max(vh / 2, this.cy));
    return { z, vx: cx - vw / 2, vy: cy - vh / 2, vw, vh, pw, ph, dpr };
  }

  /** Run the filter on the part of the layer in view (plus `apron` pixels around it) and paint the result. */
  render(run: Run, apron: number): void {
    const v = this.view(), s = this.size;
    if (!v || !s) return;
    const x0 = Math.max(0, Math.floor(v.vx)), y0 = Math.max(0, Math.floor(v.vy)), x1 = Math.min(s.width, Math.ceil(v.vx + v.vw)), y1 = Math.min(s.height, Math.ceil(v.vy + v.vh));
    if (x1 <= x0 || y1 <= y0) return;
    const k = Math.min(1, v.z * v.dpr), a = Math.ceil(Math.max(apron, 16) / k) + 1;
    const cx0 = Math.max(0, x0 - a), cy0 = Math.max(0, y0 - a), cw = Math.min(s.width, x1 + a) - cx0, ch = Math.min(s.height, y1 + a) - cy0, crop = this.engine.targetCrop(cx0, cy0, cw, ch, k);
    if (!crop) return;
    const token = ++this.token, t0 = performance.now();
    void Promise.resolve(run(crop.image, k, crop.frame)).then((out) => {
      if (token !== this.token) return;
      const img = document.createElement('canvas');
      img.width = out.width;
      img.height = out.height;
      img.getContext('2d')?.putImageData(out, 0, 0);
      this.shown = { img, x: cx0, y: cy0, k: out.width / cw };
      this.paint();
      setText(this.time, `${Math.round(performance.now() - t0)} ms`);
    }).catch(() => undefined);
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
    this.again();
  }
}
