/** Shake Reduction's estimate of the blur trace, written for sonny. Photoshop estimates a free-form trace; here a
 *  straight one, in two classic steps (after Yitzhaky and Kopeika, 1998). The angle is where the image changes least:
 *  motion blur smooths along its direction, so the mean absolute directional derivative is lowest there. The length is
 *  where, along that angle, the derivative's autocorrelation dips lowest: a box blur's derivative is a pair of
 *  opposite spikes that far apart. Angles follow the filters' convention (degrees counter-clockwise from the right, y
 *  down, so the unit step is (cos, -sin)), in -90 to 90; the length is the trace's full span in pixels, as Motion
 *  Blur's distance and Smart Sharpen's motion removal (twice its radius) use it. */

export interface ShakeTrace { angle: number; length: number; confidence: number }

function luminance(img: ImageData, maxSide: number): { L: Float32Array; w: number; h: number; f: number } {
  const f = Math.min(1, maxSide / Math.max(img.width, img.height)), w = Math.max(8, Math.round(img.width * f)), h = Math.max(8, Math.round(img.height * f)), L = new Float32Array(w * h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(img.width - 1, Math.floor((x + 0.5) / f)), sy = Math.min(img.height - 1, Math.floor((y + 0.5) / f)), k = (sy * img.width + sx) * 4;
    L[y * w + x] = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
  }
  return { L, w, h, f };
}

const sample = (L: Float32Array, w: number, h: number, x: number, y: number): number => {
  const cx = Math.min(w - 1, Math.max(0, x)), cy = Math.min(h - 1, Math.max(0, y)), x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = cx - x0, fy = cy - y0;
  return (L[y0 * w + x0] * (1 - fx) + L[y0 * w + x1] * fx) * (1 - fy) + (L[y1 * w + x0] * (1 - fx) + L[y1 * w + x1] * fx) * fy;
};

/** Mean absolute derivative along `deg` over the interior, a margin of `m` pixels kept clear. */
function energy(L: Float32Array, w: number, h: number, deg: number, m: number): number {
  const t = (deg * Math.PI) / 180, ux = Math.cos(t), uy = -Math.sin(t);
  let s = 0, n = 0;
  for (let y = m; y < h - m; y += 2) for (let x = m; x < w - m; x += 2) { s += Math.abs(sample(L, w, h, x + ux, y + uy) - L[y * w + x]); n++; }
  return n ? s / n : 0;
}

export function estimateShake(img: ImageData, maxSide = 384): ShakeTrace {
  const { L, w, h, f } = luminance(img, maxSide), m = 4;
  // Blur lowers the derivative along its direction relative to across it; the ratio cancels a scene's own bias (a
  // building's horizontals and verticals, say), which the plain minimum would mistake for motion.
  const ratio = (a: number): number => { const along = energy(L, w, h, a, m), across = energy(L, w, h, a + 90, m); return across > 0 ? along / across : 1; };
  let best = 0, low = Infinity, high = 0;
  for (let a = -90; a < 90; a += 3) { const r = ratio(a); if (r < low) { low = r; best = a; } if (r > high) high = r; }
  for (let a = best - 3; a <= best + 3; a += 0.5) { const r = ratio(a); if (r < low) { low = r; best = a; } }
  const angle = ((((best + 90) % 180) + 180) % 180) - 90;
  // The derivative along the angle, then its autocorrelation over lags 1 to kmax along the same direction.
  const t = (angle * Math.PI) / 180, ux = Math.cos(t), uy = -Math.sin(t), kmax = Math.min(60, Math.floor(Math.min(w, h) / 3)), M = kmax + 2;
  const D = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) D[y * w + x] = sample(L, w, h, x + ux, y + uy) - L[y * w + x];
  let norm = 0;
  for (let y = M; y < h - M; y += 2) for (let x = M; x < w - M; x += 2) norm += D[y * w + x] ** 2;
  let bestK = 1, lowest = 0;
  for (let k = 2; k <= kmax; k++) {
    let r = 0;
    for (let y = M; y < h - M; y += 2) for (let x = M; x < w - M; x += 2) r += D[y * w + x] * sample(D, w, h, x + ux * k, y + uy * k);
    const rn = norm > 0 ? r / norm : 0;
    if (rn < lowest) { lowest = rn; bestK = k; }
  }
  return { angle: Math.round(angle), length: Math.max(1, Math.round(bestK / f)), confidence: Math.max(0, Math.min(1, high > 0 ? 1 - low / high : 0)) };
}
