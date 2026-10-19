import { Raster } from './surface';

/** How Image Size resamples: the three browser filters, and separable kernels computed here. */
export type ResampleMethod = 'nearest' | 'smooth' | 'high' | 'bilinear' | 'bicubic' | 'smoother' | 'sharper' | 'lanczos';

type Kernel = { support: number; at: (x: number) => number };

/** The Mitchell and Netravali family: B and C pick the cubic (Catmull-Rom is 0, 0.5). */
const cubic = (b: number, c: number): Kernel => ({
  support: 2,
  at: (x) => {
    const a = Math.abs(x);
    if (a < 1) return ((12 - 9 * b - 6 * c) * a * a * a + (-18 + 12 * b + 6 * c) * a * a + (6 - 2 * b)) / 6;
    if (a < 2) return ((-b - 6 * c) * a * a * a + (6 * b + 30 * c) * a * a + (-12 * b - 48 * c) * a + (8 * b + 24 * c)) / 6;
    return 0;
  },
});

const sinc = (x: number): number => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

const KERNELS: Partial<Record<ResampleMethod, Kernel>> = {
  bilinear: { support: 1, at: (x) => Math.max(0, 1 - Math.abs(x)) },
  bicubic: cubic(0, 0.5),
  sharper: cubic(0, 0.75),
  smoother: cubic(1 / 3, 1 / 3),
  lanczos: { support: 3, at: (x) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0) },
};

/** True when the method is one of the kernels computed here, not a canvas filter. */
export const isKernelMethod = (m: ResampleMethod): boolean => m in KERNELS;

/** For each output position, the first input index and the normalised weights; a shrink widens the kernel. */
function weights(from: number, to: number, k: Kernel): { start: Int32Array; w: Float32Array[] } {
  const scale = to / from, stretch = scale < 1 ? 1 / scale : 1, reach = k.support * stretch;
  const start = new Int32Array(to), w: Float32Array[] = [];
  for (let o = 0; o < to; o++) {
    const centre = (o + 0.5) / scale - 0.5, lo = Math.max(0, Math.ceil(centre - reach)), hi = Math.min(from - 1, Math.floor(centre + reach));
    const row = new Float32Array(Math.max(1, hi - lo + 1));
    let sum = 0;
    for (let i = lo; i <= hi; i++) { const v = k.at((i - centre) / stretch); row[i - lo] = v; sum += v; }
    if (sum === 0) { row[0] = 1; sum = 1; }
    for (let i = 0; i < row.length; i++) row[i] /= sum;
    start[o] = lo;
    w.push(row);
  }
  return { start, w };
}

/** The image at `w` by `h` through a separable kernel, on premultiplied colour so clear pixels do not bleed. */
export function kernelResample(src: ImageData, w: number, h: number, method: ResampleMethod): ImageData {
  const k = KERNELS[method];
  if (!k) throw new Error(`Not a kernel method: ${method}`);
  const sw = src.width, sh = src.height, s = src.data;
  const hx = weights(sw, w, k), vy = weights(sh, h, k);
  const mid = new Float32Array(w * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < w; x++) {
      const row = hx.w[x], x0 = hx.start[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < row.length; i++) {
        const o = (y * sw + x0 + i) * 4, al = s[o + 3] / 255, wt = row[i];
        r += s[o] * al * wt; g += s[o + 1] * al * wt; b += s[o + 2] * al * wt; a += al * wt;
      }
      const m = (y * w + x) * 4;
      mid[m] = r; mid[m + 1] = g; mid[m + 2] = b; mid[m + 3] = a;
    }
  }
  const out = new ImageData(w, h), d = out.data;
  for (let y = 0; y < h; y++) {
    const row = vy.w[y], y0 = vy.start[y];
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < row.length; i++) {
        const m = ((y0 + i) * w + x) * 4, wt = row[i];
        r += mid[m] * wt; g += mid[m + 1] * wt; b += mid[m + 2] * wt; a += mid[m + 3] * wt;
      }
      const o = (y * w + x) * 4, al = Math.min(1, Math.max(0, a));
      if (al > 0.0005) { d[o] = r / al; d[o + 1] = g / al; d[o + 2] = b / al; }
      d[o + 3] = al * 255;
    }
  }
  return out;
}

/** A raster resampled with a kernel method; null when the method is a canvas filter or the work is too large. */
export function resampleRaster(src: Raster, w: number, h: number, method: ResampleMethod): Raster | null {
  if (!isKernelMethod(method) || w * src.height > 48_000_000) return null;
  const out = new Raster(w, h);
  out.write(kernelResample(src.read(), w, h, method));
  return out;
}
