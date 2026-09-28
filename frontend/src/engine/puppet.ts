/** Puppet Warp by rigid moving-least-squares deformation (Schaefer, McPhail and Warren, "Image Deformation Using
 *  Moving Least Squares", SIGGRAPH 2006), written for formvis. Each point v moves by the rotation and translation that
 *  best carry the pins p to their new places q, weighting each pin by 1 / |p - v|^2: pins are hit exactly, the space
 *  between them bends without shearing, and a single pin translates. In two dimensions the rigid solution is the
 *  similarity solution's rotation: with p*, q* the weighted centroids and mu = sum w conj(p - p*)(q - q*) as complex
 *  numbers, f(v) = (mu / |mu|)(v - p*) + q*. To resample, the map is run backwards (from the pins' new places to their
 *  old ones), evaluated on a coarse grid and interpolated between its nodes. */

export type P2 = [number, number];

/** Where `v` goes when pins `p` move to `q` (same length, at least one). */
export function mlsRigid(p: readonly P2[], q: readonly P2[], v: P2): P2 {
  let sw = 0, px = 0, py = 0, qx = 0, qy = 0;
  const w = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const dx = p[i][0] - v[0], dy = p[i][1] - v[1], d2 = dx * dx + dy * dy;
    if (d2 < 1e-9) return [q[i][0], q[i][1]];
    w[i] = 1 / d2; sw += w[i];
    px += w[i] * p[i][0]; py += w[i] * p[i][1]; qx += w[i] * q[i][0]; qy += w[i] * q[i][1];
  }
  px /= sw; py /= sw; qx /= sw; qy /= sw;
  let mr = 0, mi = 0;
  for (let i = 0; i < p.length; i++) {
    const ax = p[i][0] - px, ay = p[i][1] - py, bx = q[i][0] - qx, by = q[i][1] - qy;
    // conj(a) * b
    mr += w[i] * (ax * bx + ay * by);
    mi += w[i] * (ax * by - ay * bx);
  }
  const vx = v[0] - px, vy = v[1] - py, m = Math.hypot(mr, mi);
  if (m < 1e-12) return [vx + qx, vy + qy];
  const c = mr / m, s = mi / m;
  return [c * vx - s * vy + qx, s * vx + c * vy + qy];
}

/** Resamples `src` (its pixels mapped to the document by `toDoc`, back by `toLocal`) as pins move from `from` to `to`,
 *  into an image over the document box (x0, y0, w, h) at `scale`. The backward map is computed every `step` output
 *  pixels and interpolated. */
export function puppetImage(src: ImageData, toLocal: (x: number, y: number) => P2, from: readonly P2[], to: readonly P2[], x0: number, y0: number, w: number, h: number, scale = 1, step = 8): ImageData {
  const ow = Math.max(1, Math.round(w * scale)), oh = Math.max(1, Math.round(h * scale)), out = new ImageData(ow, oh), o = out.data;
  const gw = Math.ceil(ow / step) + 1, gh = Math.ceil(oh / step) + 1, map = new Float64Array(gw * gh * 2);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const d = mlsRigid(to, from, [x0 + (i * step) / scale, y0 + (j * step) / scale]), l = toLocal(d[0], d[1]);
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
