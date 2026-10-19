/** Crop and stitch for generative fill and inpaint runs: the maths. The run is made on a crop around the mask with
 *  padding, scaled to a target size in multiples of a number; the result is scaled back and laid in with a feathered
 *  edge. No canvas here: the callers read and write the pixels. */

export interface CropStitch { enabled: boolean; padding: number; target: number; multiple: number; feather: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const CROP_DEFAULT: CropStitch = { enabled: false, padding: 64, target: 1024, multiple: 8, feather: 16 };

/** Settings presets that ship with formvis; the person's own are kept beside them. */
export const CROP_PRESETS: ReadonlyArray<{ name: string; settings: Omit<CropStitch, 'enabled'> }> = [
  { name: 'Small fix', settings: { padding: 32, target: 512, multiple: 8, feather: 8 } },
  { name: 'Balanced', settings: { padding: 64, target: 1024, multiple: 8, feather: 16 } },
  { name: 'Wide context', settings: { padding: 256, target: 1024, multiple: 16, feather: 32 } },
  { name: 'Highres fix', settings: { padding: 96, target: 1536, multiple: 16, feather: 24 } },
];

const int = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(lo, Math.min(hi, n));
};

/** Settings from anything stored, each value kept inside its range. */
export function cleanCropStitch(raw: unknown): CropStitch {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    padding: int(r.padding, 0, 2048, CROP_DEFAULT.padding),
    target: int(r.target, 64, 4096, CROP_DEFAULT.target),
    multiple: int(r.multiple, 1, 256, CROP_DEFAULT.multiple),
    feather: int(r.feather, 0, 256, CROP_DEFAULT.feather),
  };
}

/** The box around the pixels of a one-channel mask at or above `min`; null when none. `stride` is the step between samples. */
export function maskBounds(data: ArrayLike<number>, w: number, h: number, stride = 1, offset = 0, min = 128): Rect | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * stride + offset] < min) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** `b` grown by `padding` on every side, kept inside a W by H picture. */
export function cropRect(b: Rect, W: number, H: number, padding: number): Rect {
  const x0 = Math.max(0, b.x - padding), y0 = Math.max(0, b.y - padding);
  const x1 = Math.min(W, b.x + b.w + padding), y1 = Math.min(H, b.y + b.h + padding);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The size to run a w by h crop at: the longer side scaled to `target`, each side rounded to a multiple (never below one). */
export function targetDims(w: number, h: number, target: number, multiple: number): { width: number; height: number } {
  const k = target / Math.max(w, h), m = Math.max(1, multiple);
  const side = (v: number): number => Math.max(m, Math.round((v * k) / m) * m);
  return { width: side(w), height: side(h) };
}

/** A one-channel 0..1 weight from a 0..255 mask: blurred by `feather` pixels (three box passes) and doubled, so it reaches
 *  full strength at the mask's edge and fades out beyond it. */
export function featherWeights(mask: Uint8Array | Uint8ClampedArray, w: number, h: number, feather: number): Float32Array {
  let a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = mask[i] / 255;
  const r = Math.round(feather / 2);
  if (r < 1) return a;
  let b = new Float32Array(w * h);
  const pass = (src: Float32Array, dst: Float32Array, horizontal: boolean): void => {
    const n = horizontal ? w : h, lines = horizontal ? h : w, step = horizontal ? 1 : w, lineStep = horizontal ? w : 1, span = 2 * r + 1;
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += k >= 0 && k < n ? src[base + k * step] : 0;
      for (let i = 0; i < n; i++) {
        dst[base + i * step] = sum / span;
        const add = i + r + 1, drop = i - r;
        if (add < n) sum += src[base + add * step];
        if (drop >= 0) sum -= src[base + drop * step];
      }
    }
  };
  for (let i = 0; i < 3; i++) { pass(a, b, true); pass(b, a, false); }
  b = a;
  for (let i = 0; i < b.length; i++) b[i] = Math.min(1, b[i] * 2);
  return b;
}
