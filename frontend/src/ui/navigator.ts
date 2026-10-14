import type { Engine } from '../engine';
import { Viewport } from '../engine/viewport';
import { el } from './dom';
import { PanelGroup } from './panel-group';
import { applyDuotoneLut, duotoneLut } from '../engine/duotone';

/** The Navigator (Phase 21, UI_SPEC.md section 6, the target's s20): the whole document in a rounded card with the
 *  visible area outlined in red; a click or drag there moves the view to that point; Fit, 100%, 150% and 200% as a pill
 *  segmented control; and a Zoom slider on a logarithmic scale over formvis's range (1% to 6400%). The preview is redrawn
 *  at most every 120 ms, so painting on a large document stays smooth. */
const LOG_MIN = Math.log(Viewport.MIN), LOG_MAX = Math.log(Viewport.MAX);
const toSlider = (z: number): number => Math.round(((Math.log(z) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000);
const fromSlider = (v: number): number => Math.exp(LOG_MIN + (v / 1000) * (LOG_MAX - LOG_MIN));

export class NavigatorPanel {
  readonly group: PanelGroup;
  private readonly canvas: HTMLCanvasElement;
  private readonly slider: HTMLInputElement;
  private timer = 0;
  /** Where the document sits in the preview: its scale and offset, in CSS pixels. */
  private place = { s: 1, ox: 0, oy: 0 };

  constructor(host: HTMLElement, private readonly engine: Engine) {
    const body = el(`<div class="cv-nav">
      <div class="cv-nav-card"><canvas class="cv-nav-preview"></canvas>
        <div class="cv-nav-zooms" role="group" aria-label="Zoom presets">
          <button type="button" data-zoom="fit">Fit</button><button type="button" data-zoom="1">100%</button><button type="button" data-zoom="1.5">150%</button><button type="button" data-zoom="2">200%</button>
        </div></div>
      <label class="cv-nav-zoom"><span>Zoom</span><input class="cv-slider" type="range" min="0" max="1000" step="1" aria-label="Zoom"></label>
    </div>`);
    this.canvas = body.querySelector('.cv-nav-preview') as HTMLCanvasElement;
    this.slider = body.querySelector('input') as HTMLInputElement;
    this.group = new PanelGroup(host, 'navigator', [{ id: 'navigator', label: 'Navigator', body }], 'Navigator');
    this.group.setMenu(() => ['zoom-in', 'zoom-out', 'fit', 'actual']);
    for (const b of body.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
      b.addEventListener('click', () => { const z = b.dataset.zoom as string; if (z === 'fit') engine.fit(); else engine.zoomTo(Number(z)); });
    }
    this.slider.addEventListener('input', () => engine.zoomTo(fromSlider(Number(this.slider.value))));
    let dragging = false;
    const move = (e: PointerEvent): void => {
      const p = engine.current, r = this.canvas.getBoundingClientRect();
      if (!p) return;
      const x = (e.clientX - r.left - this.place.ox) / this.place.s, y = (e.clientY - r.top - this.place.oy) / this.place.s, v = p.viewport;
      engine.pan(v.centerX - x * v.zoom - v.panX, v.height / 2 - y * v.zoom - v.panY);
    };
    this.canvas.addEventListener('pointerdown', (e) => { dragging = true; this.canvas.setPointerCapture(e.pointerId); move(e); });
    this.canvas.addEventListener('pointermove', (e) => { if (dragging) move(e); });
    this.canvas.addEventListener('pointerup', () => { dragging = false; });
    for (const ev of ['render', 'viewport', 'projects'] as const) engine.on(ev, () => this.schedule());
    new ResizeObserver(() => this.schedule()).observe(this.canvas);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = window.setTimeout(() => { this.timer = 0; this.draw(); }, 120);
  }

  private draw(): void {
    const c = this.canvas, dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const p = this.engine.current;
    if (!p) return;
    const pad = 12, dw = p.doc.width, dh = p.doc.height, s = Math.min((w - pad * 2) / dw, (h - pad * 2) / dh);
    const ox = (w - dw * s) / 2, oy = (h - dh * s) / 2;
    this.place = { s, ox, oy };
    this.engine.compose(c, [s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr], 'medium');
    // A duotone document (31.3) is shown as its inks overprinted, as on the canvas.
    if (p.doc.mode === 'duotone' && p.doc.duotone) {
      const img = g.getImageData(0, 0, c.width, c.height);
      applyDuotoneLut(img.data, duotoneLut(p.doc.duotone));
      g.putImageData(img, 0, 0);
    }
    // The visible area, in red, as the target's.
    const v = p.viewport, a = v.toDoc(0, 0), b = v.toDoc(v.width, v.height);
    const x0 = Math.max(0, a.x), y0 = Math.max(0, a.y), x1 = Math.min(dw, b.x), y1 = Math.min(dh, b.y);
    if (x1 > x0 && y1 > y0) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.strokeStyle = '#e5533c';
      g.lineWidth = 1.5;
      g.strokeRect(ox + x0 * s, oy + y0 * s, (x1 - x0) * s, (y1 - y0) * s);
    }
    if (document.activeElement !== this.slider) this.slider.value = String(toSlider(v.zoom));
  }
}
