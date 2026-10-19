import { SKIN_LINE_DEGREES, histogram, vectorscope, waveform } from '../../engine/scopes';
import { el } from '../dom';

/** Develop's scopes (1.53.4): a histogram, a waveform or a vectorscope of the developed preview, beside the sliders. */
export class ScopesView {
  readonly el = el('<div class="cv-scopes"></div>');
  private readonly which = el<HTMLSelectElement>('<select class="cv-input" aria-label="Scope"><option value="histogram">Histogram</option><option value="waveform">Waveform</option><option value="vectorscope">Vectorscope</option></select>');
  readonly canvas = el<HTMLCanvasElement>('<canvas class="cv-scopes-canvas" width="256" height="128" aria-label="Scope"></canvas>');
  private last: ImageData | null = null;
  private readonly shadowClip = el<HTMLLabelElement>('<label class="cv-field cv-check"><span>Shadow clipping</span><input type="checkbox" aria-label="Show shadow clipping"></label>');
  private readonly highlightClip = el<HTMLLabelElement>('<label class="cv-field cv-check"><span>Highlight clipping</span><input type="checkbox" aria-label="Show highlight clipping"></label>');
  /** What share of the pixels is pure black or pure white in some channel, shown beside the toggles. */
  readonly clipNote = el('<p class="cv-note" aria-live="polite"></p>');
  /** The red, green and blue pixel counts at the histogram level under the pointer. */
  readonly readout = el('<p class="cv-note" aria-live="off">Move over the histogram for its levels</p>');

  constructor() {
    this.el.append(this.which, this.canvas, this.readout, this.shadowClip, this.highlightClip, this.clipNote);
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.last || this.which.value !== 'histogram') return;
      const box = this.canvas.getBoundingClientRect(), level = Math.max(0, Math.min(255, Math.floor(((e.clientX - box.left) / Math.max(1, box.width)) * 256))), h = histogram(this.last);
      this.readout.textContent = `Level ${level}: R ${h.r[level]}, G ${h.g[level]}, B ${h.b[level]}`;
    });
    this.which.addEventListener('change', () => { if (this.last) this.draw(this.last); });
    for (const t of [this.shadowClip, this.highlightClip]) t.querySelector('input')?.addEventListener('change', () => { if (this.last) this.draw(this.last); });
  }

  /** Share of opaque pixels with a channel at 0 (shadows) and at 255 (highlights). */
  static clipped(img: ImageData): { shadows: number; highlights: number } {
    const d = img.data;
    let n = 0, lo = 0, hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      n++;
      const mn = Math.min(d[i], d[i + 1], d[i + 2]), mx = Math.max(d[i], d[i + 1], d[i + 2]);
      if (mn === 0) lo++;
      if (mx === 255) hi++;
    }
    return { shadows: n ? lo / n : 0, highlights: n ? hi / n : 0 };
  }

  draw(img: ImageData): void {
    this.last = img;
    const c = this.canvas.getContext('2d') as CanvasRenderingContext2D, W = this.canvas.width, H = this.canvas.height;
    const out = c.createImageData(W, H), px = out.data;
    const put = (x: number, y: number, r: number, g: number, b: number, a: number): void => { const i = (y * W + x) * 4; px[i] = Math.min(255, px[i] + r); px[i + 1] = Math.min(255, px[i + 1] + g); px[i + 2] = Math.min(255, px[i + 2] + b); px[i + 3] = Math.max(px[i + 3], a); };
    if (this.which.value === 'histogram') {
      const h = histogram(img), peak = Math.max(1, ...[h.r, h.g, h.b].map((a) => Math.max(...a)));
      for (let x = 0; x < 256; x++) for (const [arr, col] of [[h.r, [200, 60, 60]], [h.g, [60, 180, 80]], [h.b, [70, 110, 220]]] as const) {
        const top = H - Math.round((arr[x] / peak) * (H - 1));
        for (let y = top; y < H; y++) put(x, y, col[0] / 2, col[1] / 2, col[2] / 2, 220);
      }
    } else if (this.which.value === 'waveform') {
      const w = waveform(img, W, H), peak = Math.max(1, ...w);
      for (let i = 0; i < w.length; i++) if (w[i]) { const v = 60 + Math.round(195 * Math.sqrt(w[i] / peak)); put(i % W, Math.floor(i / W), v * 0.6, v, v * 0.6, 255); }
    } else {
      const S = H, v = vectorscope(img, S), peak = Math.max(1, ...v), ox = Math.floor((W - S) / 2);
      for (let i = 0; i < v.length; i++) if (v[i]) { const t = 60 + Math.round(195 * Math.sqrt(v[i] / peak)); put(ox + (i % S), Math.floor(i / S), t, t, t, 255); }
      const rad = (SKIN_LINE_DEGREES * Math.PI) / 180;   // the skin-tone line
      for (let r = 0; r < S / 2; r++) { const x = Math.round(ox + S / 2 + Math.cos(rad) * r), y = Math.round(S / 2 - Math.sin(rad) * r); if (x >= 0 && x < W && y >= 0 && y < H) put(x, y, 180, 140, 90, 255); }
    }
    c.putImageData(out, 0, 0);
    const clip = ScopesView.clipped(img), wantLo = !!this.shadowClip.querySelector('input')?.checked, wantHi = !!this.highlightClip.querySelector('input')?.checked;
    if (wantLo && clip.shadows > 0) { c.fillStyle = 'rgb(70,110,220)'; c.fillRect(0, 0, 6, 12); }
    if (wantHi && clip.highlights > 0) { c.fillStyle = 'rgb(220,70,70)'; c.fillRect(W - 6, 0, 6, 12); }
    this.clipNote.textContent = `Shadows clipped ${(clip.shadows * 100).toFixed(1)}%, highlights clipped ${(clip.highlights * 100).toFixed(1)}%`;
  }
}
