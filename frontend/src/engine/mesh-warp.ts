/** Mesh warp, ported from NodeMode's formvis studio (`studio/pixel/transform.ts`: meshWarpLifted, meshSurfacePoint,
 *  invSmooth, meshWarpSmooth, invBilinear, convexQuad; nodemode_dev v8.73.1, the owner's build, MIT). There it
 *  deposits a lifted float buffer into a tile store; here it resamples an ImageData into a new one, so the engine can
 *  use it as it uses its other warps. A grid of gw x gh control points, row-major, gives where each point of a uniform
 *  grid over the source lands in the output. The plain warp inverts each cell exactly by inverse-bilinear mapping;
 *  the smooth warp passes through a bicubic Catmull-Rom surface through the points (so interiors curve), inverted by
 *  Newton's method seeded from the cell solve. A folded (non-convex) cell refuses the warp, as in the source. */

export type P2 = [number, number];

/** True when the cell (p00, p10, p01, p11) is a convex quad with one winding. */
export function convexQuad(q: P2[]): boolean {
  const o = [q[0], q[1], q[3], q[2]];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = o[i], b = o[(i + 1) % 4], c = o[(i + 2) % 4];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-6) continue;
    const s = Math.sign(cr);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** (u, v) in [0, 1] with bilinear(p00, p10, p01, p11)(u, v) = q, or false outside the cell. */
export function invBilinear(p00: P2, p10: P2, p01: P2, p11: P2, qx: number, qy: number, out: P2): boolean {
  const ex = p10[0] - p00[0], ey = p10[1] - p00[1], fx = p01[0] - p00[0], fy = p01[1] - p00[1];
  const gx = p00[0] - p10[0] - p01[0] + p11[0], gy = p00[1] - p10[1] - p01[1] + p11[1];
  const hx = qx - p00[0], hy = qy - p00[1];
  const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;
  const k2 = cross(gx, gy, fx, fy), k1 = cross(ex, ey, fx, fy) + cross(hx, hy, gx, gy), k0 = cross(hx, hy, ex, ey);
  let v: number;
  if (Math.abs(k2) < 1e-9) {
    if (Math.abs(k1) < 1e-12) return false;
    v = -k0 / k1;
  } else {
    const disc = k1 * k1 - 4 * k2 * k0;
    if (disc < 0) return false;
    const sq = Math.sqrt(disc), v1 = (-k1 + sq) / (2 * k2), v2 = (-k1 - sq) / (2 * k2);
    const in1 = v1 >= -0.001 && v1 <= 1.001, in2 = v2 >= -0.001 && v2 <= 1.001;
    if (in1 && in2) v = Math.abs(v1 - 0.5) < Math.abs(v2 - 0.5) ? v1 : v2;
    else if (in1) v = v1;
    else if (in2) v = v2;
    else return false;
  }
  const dx = ex + gx * v, dy = ey + gy * v;
  const u = Math.abs(dx) >= Math.abs(dy) ? (Math.abs(dx) < 1e-12 ? -1 : (hx - fx * v) / dx) : (Math.abs(dy) < 1e-12 ? -1 : (hy - fy * v) / dy);
  if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) return false;
  out[0] = Math.min(1, Math.max(0, u));
  out[1] = Math.min(1, Math.max(0, v));
  return true;
}

const cr1 = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

/** The smooth surface at grid coordinates (u, v): bicubic Catmull-Rom through the points, with phantom border points
 *  by linear extrapolation so a uniform grid stays exactly linear. */
export function meshSurfacePoint(gw: number, gh: number, points: P2[], u: number, v: number, out: P2): void {
  const gp = (gx: number, gy: number, o: P2): void => {
    const ax: P2[] = gx < 0 ? [[0, 2], [1, -1]] : gx >= gw ? [[gw - 1, 2], [gw - 2, -1]] : [[gx, 1]];
    const ay: P2[] = gy < 0 ? [[0, 2], [1, -1]] : gy >= gh ? [[gh - 1, 2], [gh - 2, -1]] : [[gy, 1]];
    o[0] = 0; o[1] = 0;
    for (const [ix, wx] of ax) for (const [iy, wy] of ay) { const p = points[iy * gw + ix], w = wx * wy; o[0] += p[0] * w; o[1] += p[1] * w; }
  };
  const iu = Math.floor(Math.min(gw - 1.0001, Math.max(0, u))), iv = Math.floor(Math.min(gh - 1.0001, Math.max(0, v))), fu = u - iu, fv = v - iv;
  const t0: P2 = [0, 0], t1: P2 = [0, 0], t2: P2 = [0, 0], t3: P2 = [0, 0], rows: P2[] = [[0, 0], [0, 0], [0, 0], [0, 0]];
  for (let j = -1; j <= 2; j++) {
    gp(iu - 1, iv + j, t0); gp(iu, iv + j, t1); gp(iu + 1, iv + j, t2); gp(iu + 2, iv + j, t3);
    rows[j + 1] = [cr1(t0[0], t1[0], t2[0], t3[0], fu), cr1(t0[1], t1[1], t2[1], t3[1], fu)];
  }
  out[0] = cr1(rows[0][0], rows[1][0], rows[2][0], rows[3][0], fv);
  out[1] = cr1(rows[0][1], rows[1][1], rows[2][1], rows[3][1], fv);
}

function invSmooth(gw: number, gh: number, points: P2[], qx: number, qy: number, seedU: number, seedV: number, uTol: number, vTol: number, out: P2): boolean {
  let u = seedU, v = seedV;
  const F: P2 = [0, 0], Fu: P2 = [0, 0], Fv: P2 = [0, 0], H = 0.002;
  for (let it = 0; it < 14; it++) {
    meshSurfacePoint(gw, gh, points, u, v, F);
    const rx = F[0] - qx, ry = F[1] - qy;
    if (rx * rx + ry * ry < 1e-4) { out[0] = u; out[1] = v; return u > -uTol && u < gw - 1 + uTol && v > -vTol && v < gh - 1 + vTol; }
    meshSurfacePoint(gw, gh, points, u + H, v, Fu);
    meshSurfacePoint(gw, gh, points, u, v + H, Fv);
    const a = (Fu[0] - F[0]) / H, b = (Fv[0] - F[0]) / H, c = (Fu[1] - F[1]) / H, d = (Fv[1] - F[1]) / H, det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return false;
    u -= (d * rx - b * ry) / det;
    v -= (-c * rx + a * ry) / det;
    if (u < -1 || u > gw || v < -1 || v > gh) return false;
  }
  return false;
}

/** Bilinear sample of premultiplied RGBA at (x, y), pixel centres at half-integers; outside is transparent. */
function sample(p: Float32Array, w: number, h: number, x: number, y: number, o: Float32Array): void {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  o.fill(0);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const X = x0 + i, Y = y0 + j;
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    const wgt = (i ? fx : 1 - fx) * (j ? fy : 1 - fy), k = (Y * w + X) * 4;
    o[0] += p[k] * wgt; o[1] += p[k + 1] * wgt; o[2] += p[k + 2] * wgt; o[3] += p[k + 3] * wgt;
  }
}

/** Warps `src` through a gw x gh control grid into a new outW x outH image. `points` are where the uniform source
 *  grid's points land, in output pixels. `smooth` passes through the Catmull-Rom surface. Null when a cell folds. */
export function meshWarpImage(src: ImageData, gw: number, gh: number, points: P2[], outW: number, outH: number, smooth = true, us?: number[], vs?: number[]): ImageData | null {
  if (gw < 2 || gh < 2 || points.length !== gw * gh) return null;
  const mapU = (t: number): number => gridToSource(us, gw, t), mapV = (t: number): number => gridToSource(vs, gh, t);
  for (let cy = 0; cy < gh - 1; cy++) for (let cx = 0; cx < gw - 1; cx++) {
    if (!convexQuad([points[cy * gw + cx], points[cy * gw + cx + 1], points[(cy + 1) * gw + cx], points[(cy + 1) * gw + cx + 1]])) return null;
  }
  const W = src.width, H = src.height, pm = new Float32Array(W * H * 4), s = src.data;
  for (let i = 0; i < W * H; i++) { const a = s[i * 4 + 3] / 255; pm[i * 4] = s[i * 4] * a; pm[i * 4 + 1] = s[i * 4 + 1] * a; pm[i * 4 + 2] = s[i * 4 + 2] * a; pm[i * 4 + 3] = a; }
  let dx0 = Infinity, dy0 = Infinity, dx1 = -Infinity, dy1 = -Infinity;
  for (const [px, py] of points) { dx0 = Math.min(dx0, px); dy0 = Math.min(dy0, py); dx1 = Math.max(dx1, px); dy1 = Math.max(dy1, py); }
  const mgn = smooth ? 0.12 * Math.max(dx1 - dx0, dy1 - dy0) : 0;
  const X0 = Math.max(0, Math.floor(dx0 - mgn) - 1), Y0 = Math.max(0, Math.floor(dy0 - mgn) - 1), X1 = Math.min(outW, Math.ceil(dx1 + mgn) + 1), Y1 = Math.min(outH, Math.ceil(dy1 + mgn) + 1);
  const pad = smooth ? mgn * 0.6 + 1 : 0.5;
  const cells: Array<{ cx: number; cy: number; p00: P2; p10: P2; p01: P2; p11: P2; bx0: number; by0: number; bx1: number; by1: number }> = [];
  for (let cy = 0; cy < gh - 1; cy++) for (let cx = 0; cx < gw - 1; cx++) {
    const p00 = points[cy * gw + cx], p10 = points[cy * gw + cx + 1], p01 = points[(cy + 1) * gw + cx], p11 = points[(cy + 1) * gw + cx + 1];
    cells.push({ cx, cy, p00, p10, p01, p11, bx0: Math.min(p00[0], p10[0], p01[0], p11[0]) - pad, by0: Math.min(p00[1], p10[1], p01[1], p11[1]) - pad, bx1: Math.max(p00[0], p10[0], p01[0], p11[0]) + pad, by1: Math.max(p00[1], p10[1], p01[1], p11[1]) + pad });
  }
  const out = new ImageData(outW, outH), d = out.data, uv: P2 = [0, 0], sm: P2 = [0, 0], px = new Float32Array(4);
  const uTol = (0.5 * (gw - 1)) / Math.max(1, W), vTol = (0.5 * (gh - 1)) / Math.max(1, H);
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const qx = x + 0.5, qy = y + 0.5;
    let hit = false, su = 0, sv = 0;
    for (const c of cells) {
      if (qx < c.bx0 || qx > c.bx1 || qy < c.by0 || qy > c.by1) continue;
      const inCell = invBilinear(c.p00, c.p10, c.p01, c.p11, qx, qy, uv);
      if (!smooth) { if (!inCell) continue; su = mapU(c.cx + uv[0]); sv = mapV(c.cy + uv[1]); hit = true; break; }
      const seedU = inCell ? c.cx + uv[0] : c.cx + 0.5, seedV = inCell ? c.cy + uv[1] : c.cy + 0.5;
      if (!invSmooth(gw, gh, points, qx, qy, seedU, seedV, uTol, vTol, sm)) continue;
      su = mapU(sm[0]); sv = mapV(sm[1]); hit = true; break;
    }
    if (!hit) continue;
    sample(pm, W, H, su * W - 0.5, sv * H - 0.5, px);
    const a = px[3];
    if (a <= 0.0005) continue;
    const k = (y * outW + x) * 4;
    d[k] = Math.round(px[0] / a); d[k + 1] = Math.round(px[1] / a); d[k + 2] = Math.round(px[2] / a); d[k + 3] = Math.round(a * 255);
  }
  return out;
}

/** Even source positions (fractions 0..1) for n grid lines. */
export function evenSpacing(n: number): number[] {
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(n > 1 ? i / (n - 1) : 0);
  return a;
}

/** Grid parameter t (0..n-1) to a source fraction, piecewise linear over `pos` (even spacing when absent). Outside
 *  the range it extends the end segments linearly. */
export function gridToSource(pos: number[] | undefined, n: number, t: number): number {
  if (!pos || pos.length !== n) return t / (n - 1);
  const i = Math.min(n - 2, Math.max(0, Math.floor(t))), f = t - i;
  return pos[i] + (pos[i + 1] - pos[i]) * f;
}

export interface MeshGrid { gw: number; gh: number; points: P2[]; us: number[]; vs: number[] }

/** Inserts a column at fractional grid position `at.u` (0..gw-1) and/or a row at `at.v`. Each new point is the current
 *  surface evaluated at that parameter and each new source position is interpolated from its neighbours, so every
 *  point of the picture keeps its source and its place: the split is exact at all control points, and exact
 *  everywhere for a grid that is still linear (the spline through the same surface points only differs in between). */
export function splitGrid(gw: number, gh: number, points: P2[], us: number[], vs: number[], at: { u?: number; v?: number }): MeshGrid {
  let g: MeshGrid = { gw, gh, points: points.slice(), us: us.slice(), vs: vs.slice() };
  const tmp: P2 = [0, 0];
  if (at.u !== undefined) {
    const u = Math.min(g.gw - 1.0001, Math.max(0.0001, at.u)), i = Math.floor(u), f = u - i, np: P2[] = [];
    for (let j = 0; j < g.gh; j++) {
      for (let k = 0; k < g.gw; k++) {
        np.push(g.points[j * g.gw + k]);
        if (k === i) { meshSurfacePoint(g.gw, g.gh, g.points, u, j, tmp); np.push([tmp[0], tmp[1]]); }
      }
    }
    const nu = g.us.slice();
    nu.splice(i + 1, 0, g.us[i] + (g.us[i + 1] - g.us[i]) * f);
    g = { gw: g.gw + 1, gh: g.gh, points: np, us: nu, vs: g.vs };
  }
  if (at.v !== undefined) {
    const v = Math.min(g.gh - 1.0001, Math.max(0.0001, at.v)), j = Math.floor(v), f = v - j, np: P2[] = [];
    for (let r = 0; r < g.gh; r++) {
      for (let k = 0; k < g.gw; k++) np.push(g.points[r * g.gw + k]);
      if (r === j) for (let k = 0; k < g.gw; k++) { meshSurfacePoint(g.gw, g.gh, g.points, k, v, tmp); np.push([tmp[0], tmp[1]]); }
    }
    const nv = g.vs.slice();
    nv.splice(j + 1, 0, g.vs[j] + (g.vs[j + 1] - g.vs[j]) * f);
    g = { gw: g.gw, gh: g.gh + 1, points: np, us: g.us, vs: nv };
  }
  return g;
}

/** Removes the interior column `col` and/or row `row` (never the border lines; an out-of-range index is ignored). */
export function removeSplit(gw: number, gh: number, points: P2[], us: number[], vs: number[], col?: number, row?: number): MeshGrid {
  const dropC = col !== undefined && col > 0 && col < gw - 1 ? col : -1, dropR = row !== undefined && row > 0 && row < gh - 1 ? row : -1;
  const np: P2[] = [];
  for (let j = 0; j < gh; j++) {
    if (j === dropR) continue;
    for (let i = 0; i < gw; i++) if (i !== dropC) np.push(points[j * gw + i]);
  }
  return { gw: dropC >= 0 ? gw - 1 : gw, gh: dropR >= 0 ? gh - 1 : gh, points: np, us: us.filter((_, i) => i !== dropC), vs: vs.filter((_, j) => j !== dropR) };
}

/** The control points of an undeformed gw x gh grid over a w x h box at (x, y). */
export function uniformGrid(gw: number, gh: number, x: number, y: number, w: number, h: number): P2[] {
  const pts: P2[] = [];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) pts.push([x + (w * i) / (gw - 1), y + (h * j) / (gh - 1)]);
  return pts;
}
