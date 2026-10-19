/** Puppet Warp by rigid moving-least-squares deformation (Schaefer, McPhail and Warren, "Image Deformation Using
 *  Moving Least Squares", SIGGRAPH 2006), written for formvis. Each point v moves by the rotation and translation that
 *  best carry the pins p to their new places q, weighting each pin by 1 / |p - v|^2: pins are hit exactly, the space
 *  between them bends without shearing, and a single pin translates. In two dimensions the rigid solution is the
 *  similarity solution's rotation: with p*, q* the weighted centroids and mu = sum w conj(p - p*)(q - q*) as complex
 *  numbers, f(v) = (mu / |mu|)(v - p*) + q*. To resample, the map is run backwards (from the pins' new places to their
 *  old ones), evaluated on a coarse grid and interpolated between its nodes. */

export type P2 = [number, number];

/** Puppet Warp's Mode: Rigid keeps the picture's shape between the pins (the rigid solution), Normal lets it scale
 *  with the pins (the similarity solution) and Distort lets it shear and stretch (the affine solution). */
export type PuppetMode = 'rigid' | 'normal' | 'distort';

/** Where `v` goes when pins `p` move to `q` (same length, at least one). `k` scales each pin's pull (Pin Depth: a
 *  pin in front pulls harder where regions overlap). `mode` picks the deformation family. */
export function mlsRigid(p: readonly P2[], q: readonly P2[], v: P2, k?: readonly number[], mode: PuppetMode = 'rigid'): P2 {
  if (!p.length) return [v[0], v[1]];
  let sw = 0, px = 0, py = 0, qx = 0, qy = 0;
  const w = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const dx = p[i][0] - v[0], dy = p[i][1] - v[1], d2 = dx * dx + dy * dy;
    if (d2 < 1e-9) return [q[i][0], q[i][1]];
    w[i] = (k ? k[i] : 1) / d2; sw += w[i];
    px += w[i] * p[i][0]; py += w[i] * p[i][1]; qx += w[i] * q[i][0]; qy += w[i] * q[i][1];
  }
  px /= sw; py /= sw; qx /= sw; qy /= sw;
  let mr = 0, mi = 0, ms = 0, a00 = 0, a01 = 0, a11 = 0, b00 = 0, b01 = 0, b10 = 0, b11 = 0;
  for (let i = 0; i < p.length; i++) {
    const ax = p[i][0] - px, ay = p[i][1] - py, bx = q[i][0] - qx, by = q[i][1] - qy;
    // conj(a) * b
    mr += w[i] * (ax * bx + ay * by);
    mi += w[i] * (ax * by - ay * bx);
    if (mode === 'rigid') continue;
    ms += w[i] * (ax * ax + ay * ay);
    a00 += w[i] * ax * ax; a01 += w[i] * ax * ay; a11 += w[i] * ay * ay;
    b00 += w[i] * ax * bx; b01 += w[i] * ax * by; b10 += w[i] * ay * bx; b11 += w[i] * ay * by;
  }
  const vx = v[0] - px, vy = v[1] - py, m = Math.hypot(mr, mi);
  if (mode === 'distort') {
    const det = a00 * a11 - a01 * a01;
    if (det > 1e-9 * (ms * ms + 1e-30)) {
      const m00 = (a11 * b00 - a01 * b10) / det, m01 = (a11 * b01 - a01 * b11) / det, m10 = (a00 * b10 - a01 * b00) / det, m11 = (a00 * b11 - a01 * b01) / det;
      return [vx * m00 + vy * m10 + qx, vx * m01 + vy * m11 + qy];
    }
  }
  if (m < 1e-12 || (mode !== 'rigid' && ms < 1e-12)) return [vx + qx, vy + qy];
  const c = mode === 'rigid' ? mr / m : mr / ms, s = mode === 'rigid' ? mi / m : mi / ms;
  return [c * vx - s * vy + qx, s * vx + c * vy + qy];
}

/** The source image with its opaque outline grown (`px` above 0) or shrunk (below 0) by about that many pixels, for
 *  Puppet Warp's Expansion: the nearest opaque pixel's colour carries outward, and an eroded edge fades over a pixel.
 *  Distances come from a two-pass chamfer sweep, so the cost does not grow with the amount. */
export function expandImage(src: ImageData, px: number): ImageData {
  const W = src.width, H = src.height, out = new ImageData(new Uint8ClampedArray(src.data), W, H);
  if (!px) return out;
  const grow = px > 0, r = Math.abs(px), n = W * H, d = new Float32Array(n), from = new Int32Array(n), s = src.data, o = out.data;
  const solid = (i: number): boolean => (s[i * 4 + 3] >= 128) === grow;
  for (let i = 0; i < n; i++) { if (solid(i)) { d[i] = 0; from[i] = i; } else { d[i] = 1e9; from[i] = -1; } }
  const relax = (i: number, j: number, c: number): void => { if (d[j] + c < d[i]) { d[i] = d[j] + c; from[i] = from[j]; } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x > 0) relax(i, i - 1, 1);
    if (y > 0) { relax(i, i - W, 1); if (x > 0) relax(i, i - W - 1, 1.4142); if (x < W - 1) relax(i, i - W + 1, 1.4142); }
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (x < W - 1) relax(i, i + 1, 1);
    if (y < H - 1) { relax(i, i + W, 1); if (x < W - 1) relax(i, i + W + 1, 1.4142); if (x > 0) relax(i, i + W - 1, 1.4142); }
  }
  for (let i = 0; i < n; i++) {
    if (d[i] === 0) continue;
    const k = i * 4;
    if (grow) {
      if (from[i] < 0 || d[i] > r) continue;
      const f = from[i] * 4, a = Math.min(1, r - d[i] + 1);
      o[k] = s[f]; o[k + 1] = s[f + 1]; o[k + 2] = s[f + 2]; o[k + 3] = Math.round(s[f + 3] * a);
    } else if (d[i] < r + 1) o[k + 3] = Math.round(s[k + 3] * Math.max(0, d[i] - r));
  }
  return out;
}

/** Resamples `src` (its pixels mapped to the document by `toDoc`, back by `toLocal`) as pins move from `from` to `to`,
 *  into an image over the document box (x0, y0, w, h) at `scale`. The backward map is computed every `step` output
 *  pixels and interpolated. */
export function puppetImage(src: ImageData, toLocal: (x: number, y: number) => P2, from: readonly P2[], to: readonly P2[], x0: number, y0: number, w: number, h: number, scale = 1, step = 8, mode: PuppetMode = 'rigid', pull?: readonly number[]): ImageData {
  const ow = Math.max(1, Math.round(w * scale)), oh = Math.max(1, Math.round(h * scale)), out = new ImageData(ow, oh), o = out.data;
  const gw = Math.ceil(ow / step) + 1, gh = Math.ceil(oh / step) + 1, map = new Float64Array(gw * gh * 2);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const d = mlsRigid(to, from, [x0 + (i * step) / scale, y0 + (j * step) / scale], pull, mode), l = toLocal(d[0], d[1]);
    map[(j * gw + i) * 2] = l[0]; map[(j * gw + i) * 2 + 1] = l[1];
  }
  const W = src.width, H = src.height, s = src.data;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const gx = (x + 0.5) / step, gy = (y + 0.5) / step, i0 = Math.min(gw - 2, Math.floor(gx)), j0 = Math.min(gh - 2, Math.floor(gy)), tx = gx - i0, ty = gy - j0;
    const k00 = (j0 * gw + i0) * 2, k10 = k00 + 2, k01 = k00 + gw * 2, k11 = k01 + 2;
    const sx = (map[k00] * (1 - tx) + map[k10] * tx) * (1 - ty) + (map[k01] * (1 - tx) + map[k11] * tx) * ty - 0.5;
    const sy = (map[k00 + 1] * (1 - tx) + map[k10 + 1] * tx) * (1 - ty) + (map[k01 + 1] * (1 - tx) + map[k11 + 1] * tx) * ty - 0.5;
    const xa = Math.floor(sx), ya = Math.floor(sy), fx = sx - xa, fy = sy - ya;
    let r = 0, g = 0, b = 0, a = 0;
    for (let jj = 0; jj < 2; jj++) for (let ii = 0; ii < 2; ii++) {
      const X = xa + ii, Y = ya + jj;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const wt = (ii ? fx : 1 - fx) * (jj ? fy : 1 - fy), k = (Y * W + X) * 4, al = (s[k + 3] / 255) * wt;
      r += s[k] * al; g += s[k + 1] * al; b += s[k + 2] * al; a += al;
    }
    const k = (y * ow + x) * 4;
    if (a > 1e-4) { o[k] = Math.round(r / a); o[k + 1] = Math.round(g / a); o[k + 2] = Math.round(b / a); o[k + 3] = Math.round(a * 255); }
  }
  return out;
}
