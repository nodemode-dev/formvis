import type { Engine, Pt } from '../engine';
import { el } from './dom';
import { PanelGroup } from './panel-group';

/** The Info panel (1.49.6, the owner's tool list), as Photoshop's: the colour and position under the pointer, the
 *  selection's size, the Ruler's measurements and each Color Sampler's colour. It reads the image only while shown,
 *  and only again after a change. */
export class InfoPanel {
  readonly group: PanelGroup;
  private readonly body = el('<div class="cv-info-body"></div>');
  private pixels: { data: Uint8ClampedArray; w: number; h: number } | null = null;
  private pointer: Pt | null = null;
  private frame = 0;

  constructor(host: HTMLElement, private readonly engine: Engine, stage: HTMLElement) {
    this.group = new PanelGroup(host, 'info', [{ id: 'info', label: 'Info', body: this.body }], 'Info');
    for (const ev of ['doc', 'history', 'active', 'projects', 'render'] as const) engine.on(ev, () => { this.pixels = null; this.soon(); });
    for (const ev of ['overlay', 'options', 'selection'] as const) engine.on(ev, () => this.soon());
    stage.addEventListener('pointermove', (e) => {
      const v = engine.current?.viewport, r = stage.getBoundingClientRect();
      this.pointer = v ? v.toDoc(e.clientX - r.left, e.clientY - r.top) : null;
      this.soon();
    });
    stage.addEventListener('pointerleave', () => { this.pointer = null; this.soon(); });
    new ResizeObserver(() => this.soon()).observe(this.body);
    this.render();
  }

  private soon(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  /** The composite colour at a document point (null outside it). */
  private colorAt(pt: Pt): [number, number, number, number] | null {
    const p = this.engine.current;
    if (!p) return null;
    if (!this.pixels) {
      const s = this.engine.flattened();
      if (!s) return null;
      const d = (s.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, s.width, s.height);
      this.pixels = { data: d.data, w: s.width, h: s.height };
    }
    const x = Math.floor(pt.x), y = Math.floor(pt.y), px = this.pixels;
    if (x < 0 || y < 0 || x >= px.w || y >= px.h) return null;
    const i = (y * px.w + x) * 4;
    return [px.data[i], px.data[i + 1], px.data[i + 2], px.data[i + 3]];
  }

  private render(): void {
    if (!this.body.clientWidth) return;   // hidden: nothing to read
    const e = this.engine, p = e.current, m = e.measure;
    const rows: Array<[string, string]> = [];
    const rgb = (c: [number, number, number, number] | null): string => (c ? (c[3] === 0 ? 'transparent' : `R ${c[0]}  G ${c[1]}  B ${c[2]}`) : '-');
    if (p && this.pointer) {
      rows.push(['Colour', rgb(this.colorAt(this.pointer))]);
      rows.push(['X, Y', `${Math.floor(this.pointer.x)}, ${Math.floor(this.pointer.y)} px`]);
    } else rows.push(['Colour', '-'], ['X, Y', '-']);
    const sel = p?.selection;
    rows.push(['W, H', sel ? `${sel.w} x ${sel.h} px` : '-']);
    const r = m?.ruler;
    if (r) {
      const dx = r.b.x - r.a.x, dy = r.b.y - r.a.y;
      rows.push(['Ruler', `A ${(-Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}\u00b0  L ${Math.hypot(dx, dy).toFixed(1)} px`]);
    }
    for (const [i, s] of (m?.samplers ?? []).entries()) rows.push([`#${i + 1}`, rgb(this.colorAt(s))]);
    const html = rows.map(([k, v]) => `<div class="cv-info-row"><span class="cv-info-key">${k}</span><span class="cv-info-val">${v}</span></div>`).join('');
    if (this.body.innerHTML !== html) this.body.innerHTML = html;
  }
}
