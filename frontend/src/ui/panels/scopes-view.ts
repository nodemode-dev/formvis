import { SKIN_LINE_DEGREES, histogram, vectorscope, waveform } from '../../engine/scopes';
import { el } from '../dom';

/** Develop's scopes (1.53.4): a histogram, a waveform or a vectorscope of the developed preview, beside the sliders. */
export class ScopesView {
  readonly el = el('<div class="cv-scopes"></div>');
  private readonly which = el<HTMLSelectElement>('<select class="cv-input" aria-label="Scope"><option value="histogram">Histogram</option><option value="waveform">Waveform</option><option value="vectorscope">Vectorscope</option></select>');
  readonly canvas = el<HTMLCanvasElement>('<canvas class="cv-scopes-canvas" width="256" height="128" aria-label="Scope"></canvas>');
  private last: ImageData | null = null;

  constructor() {
    this.el.append(this.which, this.canvas);
    this.which.addEventListener('change', () => { if (this.last) this.draw(this.last); });
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
  }
}
