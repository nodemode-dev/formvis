import type { Engine, Pt } from '../engine';
import { el } from './dom';
import { composeChannels } from '../engine/channels';
import { composeFloat } from '../engine/compose-float';
import { decodeLab } from '../engine/lab';
import { inkOf } from '../engine/colour-lut';
import { printable } from './panels/color-picker';
import { PanelGroup } from './panel-group';
import { armMeasures } from '../extensions/tools/ruler';

/** The Info panel (1.49.6, the owner's tool list): the colour and position under the pointer, the
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
    for (const ev of ['doc', 'history', 'active', 'projects', 'render'] as const) engine.on(ev, () => { this.pixels = null; this.ink = null; this.soon(); });
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
  private colorAt(pt: Pt, size = 1): [number, number, number, number] | null {
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
    if (size > 1) {   // the square of `size` pixels about the point, averaged over the pixels it holds
      const r = size >> 1, sum = [0, 0, 0, 0];
      let n = 0;
      for (let j = Math.max(0, y - r); j <= Math.min(px.h - 1, y + r); j++) {
        for (let k = Math.max(0, x - r); k <= Math.min(px.w - 1, x + r); k++) { const o = (j * px.w + k) * 4; for (let c = 0; c < 4; c++) sum[c] += px.data[o + c]; n++; }
      }
      return [Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n), Math.round(sum[3] / n)];
    }
    const i = (y * px.w + x) * 4;
    return [px.data[i], px.data[i + 1], px.data[i + 2], px.data[i + 3]];
  }

  private tables: Awaited<ReturnType<typeof printable>> = null;
  private tablesAsked = false;
  private ink: { data: Float32Array; w: number; h: number } | null = null;
  private inkAt(pt: Pt): string | null {
    const p = this.engine.current;
    if (p?.doc.mode === 'lab') {
      if (!this.ink) { const c = composeFloat(p.doc, 3, false); if ('error' in c) return null; this.ink = { data: c.data, w: c.width, h: c.height }; }
      const x = Math.floor(pt.x), y = Math.floor(pt.y), k = this.ink;
      if (x < 0 || y < 0 || x >= k.w || y >= k.h) return '-';
      const i = (y * k.w + x) * 4, [L, a, b] = decodeLab(k.data[i], k.data[i + 1], k.data[i + 2]);
      return k.data[i + 3] === 0 ? 'transparent' : `L ${Math.round(L)}  a ${Math.round(a)}  b ${Math.round(b)}`;
    }
    if (!p || p.doc.mode !== 'cmyk') return null;
    if (!this.ink) { const c = composeChannels(p.doc, p.cmykTables); if ('error' in c) return null; this.ink = { data: c.data, w: c.width, h: c.height }; }
    const x = Math.floor(pt.x), y = Math.floor(pt.y), k = this.ink;
    if (x < 0 || y < 0 || x >= k.w || y >= k.h) return '-';
    const i = (y * k.w + x) * 5, pc = (v: number): string => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
    return k.data[i + 4] === 0 ? 'transparent' : `C ${pc(k.data[i])}  M ${pc(k.data[i + 1])}  Y ${pc(k.data[i + 2])}  K ${pc(k.data[i + 3])}`;
  }

  private render(): void {
    if (!this.body.clientWidth) return;   // hidden: nothing to read
    const e = this.engine, p = e.current, m = e.measure;
    const rows: Array<[string, string]> = [];
    const rgb = (c: [number, number, number, number] | null): string => (c ? (c[3] === 0 ? 'transparent' : `R ${c[0]}  G ${c[1]}  B ${c[2]}`) : '-');
    const at = (pt: Pt): string => this.inkAt(pt) ?? rgb(this.colorAt(pt));
    if (p && this.pointer) {
      rows.push(['Color', at(this.pointer)]);
      rows.push(['X, Y', `${Math.floor(this.pointer.x)}, ${Math.floor(this.pointer.y)} px`]);
    } else rows.push(['Color', '-'], ['X, Y', '-']);
    const sel = p?.selection;
    rows.push(['W, H', sel ? `${sel.w} x ${sel.h} px` : '-']);
    const r = m?.ruler;
    if (r) {
      const dx = r.b.x - r.a.x, dy = r.b.y - r.a.y;
      const { k, units } = e.rulerUnit();
      rows.push(['Ruler', `A ${(-Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}\u00b0  L ${(Math.hypot(dx, dy) * k).toFixed(1)} ${units}`]);
      const arm = e.rulerArm;
      if (arm) { const a = armMeasures(r, arm); rows.push(['Protractor', `L2 ${(a.length * k).toFixed(1)} ${units}  between ${a.between.toFixed(1)}\u00b0`]); }
    }
    const size = e.measureOpts.sampleSize;
    if (m?.samplers.length && !this.tablesAsked) { this.tablesAsked = true; void printable().then((t) => { this.tables = t; this.soon(); }); }
    // A sampler reads RGB and ink together: the working CMYK profile gives the ink of an RGB document.
    const both = (pt: Pt): string => {
      const c = this.colorAt(pt, size), base = rgb(c), ink = size === 1 ? this.inkAt(pt) : null, t = this.tables;
      if (ink) return `${base}  ${ink}`;
      if (!c || c[3] === 0 || !t || p?.doc.mode === 'cmyk' || p?.doc.mode === 'lab') return base;
      const k = inkOf({ r: c[0], g: c[1], b: c[2] }, t.inn), pc = (v: number): string => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
      return `${base}  C ${pc(k[0])}  M ${pc(k[1])}  Y ${pc(k[2])}  K ${pc(k[3])}`;
    };
    for (const [i, s] of (m?.samplers ?? []).entries()) rows.push([`#${i + 1}`, both(s)]);
    const html = rows.map(([k, v]) => `<div class="cv-info-row"><span class="cv-info-key">${k}</span><span class="cv-info-val">${v}</span></div>`).join('');
    if (this.body.innerHTML !== html) this.body.innerHTML = html;
  }
}
