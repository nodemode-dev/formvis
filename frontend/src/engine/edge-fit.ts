/* Match edges to the layer below: a small similarity fit (scale, turn, shift) of a layer's edge ring onto the picture
   beneath it. The ring is the band just inside the layer's own edge; a coarse to fine Gauss-Newton fit (the
   Lucas-Kanade method) lowers the grey-level difference between the ring and what lies under it. The fit is refused
   when it does not lower that difference enough or asks for more than a small correction. */

export interface EdgeFit { s: number; theta: number; tx: number; ty: number; before: number; after: number; ring: number }
export type EdgeFitResult = { fit: EdgeFit } | { refused: string };

interface Level { w: number; h: number; a: Float32Array; b: Float32Array; gx: Float32Array; gy: Float32Array; ba: Uint8Array; ring: Uint8Array }

const luma = (d: Uint8ClampedArray, n: number): Float32Array => {
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  return g;
};

function ringMask(alpha: Uint8Array, w: number, h: number, depth: number): Uint8Array {
  const dist = new Float32Array(w * h), big = 1e6;
  for (let i = 0; i < dist.length; i++) dist[i] = alpha[i] ? big : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!dist[i]) continue;
    let d = x === 0 || y === 0 ? 1 : big;
    if (x > 0) d = Math.min(d, dist[i - 1] + 1);
    if (y > 0) d = Math.min(d, dist[i - w] + 1);
    dist[i] = Math.min(dist[i], d);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!dist[i]) continue;
    let d = x === w - 1 || y === h - 1 ? 1 : big;
    if (x < w - 1) d = Math.min(d, dist[i + 1] + 1);
    if (y < h - 1) d = Math.min(d, dist[i + w] + 1);
    dist[i] = Math.min(dist[i], d);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = dist[i] > 0 && dist[i] <= depth ? 1 : 0;
  return out;
}

function halve(g: Float32Array, w: number, h: number): { g: Float32Array; w: number; h: number } {
  const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), o = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const x0 = Math.min(w - 1, 2 * x), y0 = Math.min(h - 1, 2 * y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    o[y * nw + x] = (g[y0 * w + x0] + g[y0 * w + x1] + g[y1 * w + x0] + g[y1 * w + x1]) / 4;
  }
  return { g: o, w: nw, h: nh };
}

function halveBits(m: Uint8Array, w: number, h: number): Uint8Array {
  const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), o = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const x0 = Math.min(w - 1, 2 * x), y0 = Math.min(h - 1, 2 * y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    o[y * nw + x] = m[y0 * w + x0] | m[y0 * w + x1] | m[y1 * w + x0] | m[y1 * w + x1];
  }
  return o;
}

function gradients(g: Float32Array, w: number, h: number): { gx: Float32Array; gy: Float32Array } {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = Math.max(0, x - 1), xr = Math.min(w - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    gx[y * w + x] = (g[y * w + xr] - g[y * w + xl]) / Math.max(1, xr - xl);
    gy[y * w + x] = (g[yd * w + x] - g[yu * w + x]) / Math.max(1, yd - yu);
  }
  return { gx, gy };
}

function bilinear(g: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number): number => g[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

function solve4(m: number[][], v: number[]): number[] | null {
  const n = 4, a = m.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = [0, 0, 0, 0];
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n];
    for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k];
    x[r] = s / a[r][r];
  }
  return x;
}

/** The warp at `f` (full-resolution pixels per level pixel) of level point (x, y): a similarity about the level's centre. */
const warpAt = (p: number[], f: number, cx: number, cy: number, x: number, y: number): [number, number] => {
  const dx = x - cx, dy = y - cy;
  return [(1 + p[0]) * dx - p[1] * dy + cx + p[2] / f, p[1] * dx + (1 + p[0]) * dy + cy + p[3] / f];
};

function residual(L: Level, p: number[], f: number): { rms: number; n: number } {
  const cx = L.w / 2, cy = L.h / 2;
  let s = 0, n = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const i = y * L.w + x;
    if (!L.ring[i]) continue;
    const [u, v] = warpAt(p, f, cx, cy, x, y);
    if (u < 0 || v < 0 || u > L.w - 1 || v > L.h - 1 || !L.ba[Math.round(v) * L.w + Math.round(u)]) continue;
    const e = bilinear(L.b, L.w, L.h, u, v) - L.a[i];
    s += e * e;
    n++;
  }
  return { rms: n ? Math.sqrt(s / n) : 0, n };
}

function refine(L: Level, p: number[], f: number): number[] {
  const cx = L.w / 2, cy = L.h / 2;
  let cur = p.slice(), best = residual(L, cur, f).rms;
  for (let it = 0; it < 24; it++) {
    const H = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], g = [0, 0, 0, 0];
    let used = 0;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x;
      if (!L.ring[i]) continue;
      const [u, v] = warpAt(cur, f, cx, cy, x, y);
      if (u < 1 || v < 1 || u > L.w - 2 || v > L.h - 2 || !L.ba[Math.round(v) * L.w + Math.round(u)]) continue;
      const e = L.a[i] - bilinear(L.b, L.w, L.h, u, v), ix = bilinear(L.gx, L.w, L.h, u, v), iy = bilinear(L.gy, L.w, L.h, u, v);
      const dx = x - cx, dy = y - cy, j = [ix * dx + iy * dy, -ix * dy + iy * dx, ix / f, iy / f];
      for (let r = 0; r < 4; r++) { g[r] += j[r] * e; for (let c = 0; c < 4; c++) H[r][c] += j[r] * j[c]; }
      used++;
    }
    if (used < 30) break;
    for (let r = 0; r < 4; r++) H[r][r] += 1e-6 * (1 + H[r][r]);
    const d = solve4(H, g);
    if (!d) break;
    const next = cur.map((q, k) => q + d[k]), r = residual(L, next, f).rms;
    if (!(r < best - 1e-7)) break;
    cur = next;
    best = r;
    if (Math.hypot(d[2], d[3]) < 0.01 * f && Math.abs(d[0]) < 1e-5 && Math.abs(d[1]) < 1e-5) break;
  }
  return cur;
}

/** Fits the layer image `layer` (document-sized, alone) to `below` (document-sized, what lies under it). */
export function fitEdges(layer: ImageData, below: ImageData): EdgeFitResult {
  const W = layer.width, H = layer.height, n = W * H;
  if (below.width !== W || below.height !== H) return { refused: 'The layer and the picture below differ in size.' };
  const alpha = new Uint8Array(n), ba = new Uint8Array(n);
  for (let i = 0; i < n; i++) { alpha[i] = layer.data[i * 4 + 3] > 127 ? 1 : 0; ba[i] = below.data[i * 4 + 3] > 127 ? 1 : 0; }
  const depth = Math.max(6, Math.round(0.03 * Math.max(W, H)));
  let ring = ringMask(alpha, W, H, depth), count = 0;
  for (let i = 0; i < n; i++) count += ring[i];
  if (count < 200) return { refused: 'This layer has no edge band to match: it covers the whole picture or is almost empty.' };
  const levels: Level[] = [];
  let a = luma(layer.data, n), b = luma(below.data, n), w = W, h = H, bits: Uint8Array = ba;
  for (let k = 0; k < 3 && Math.min(w, h) >= 24; k++) {
    const gr = gradients(b, w, h);
    levels.unshift({ w, h, a, b, gx: gr.gx, gy: gr.gy, ba: bits, ring });
    const ha = halve(a, w, h), hb = halve(b, w, h);
    ring = halveBits(ring, w, h);
    bits = halveBits(bits, w, h);
    a = ha.g; b = hb.g; w = ha.w; h = hb.h;
  }
  const full = levels[levels.length - 1];
  let p = [0, 0, 0, 0];
  const before = residual(full, p, 1);
  if (before.n < 100) return { refused: 'Too little of the edge band lies over the picture below.' };
  levels.forEach((L, i) => { p = refine(L, p, 1 << (levels.length - 1 - i)); });
  const after = residual(full, p, 1), s = Math.hypot(1 + p[0], p[1]), theta = Math.atan2(p[1], 1 + p[0]);
  const reach = Math.hypot(p[2], p[3]), limit = 0.08 * Math.max(W, H);
  if (!(after.rms < 0.6 * before.rms)) return { refused: 'The edges already fit, or no nearby fit makes them match better.' };
  if (Math.abs(s - 1) > 0.08 || Math.abs(theta) > (4 * Math.PI) / 180 || reach > limit) return { refused: 'The best fit needs more than a small correction (about 8 percent of scale or size, 4 degrees), so the layer was left as it is.' };
  return { fit: { s, theta, tx: p[2], ty: p[3], before: before.rms, after: after.rms, ring: before.n } };
}
