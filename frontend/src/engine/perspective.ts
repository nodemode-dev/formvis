/** Perspective Warp (1.55.6, the parity plan's M4): planes laid out on the picture as quads, then their corners moved;
 *  each plane carries the picture by the homography from its layout quad to its warped quad. A pixel inside a warped
 *  quad takes that plane's map; a pixel outside every quad takes the map of the nearest one, so the whole picture
 *  follows. Quads are corner lists in order top-left, top-right, bottom-right, bottom-left. */

export type P2 = [number, number];
export type Quad = [P2, P2, P2, P2];
/** A 3 by 3 homography, row-major. */
export type H = [number, number, number, number, number, number, number, number, number];

/** The homography mapping `src` onto `dst` (the direct linear transform, 8 equations, h33 = 1); null if degenerate. */
export function homography(src: Quad, dst: Quad): H | null {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      if (f === 0) continue;
      for (let k = c; k < 9; k++) a[r][k] -= f * a[c][k];
    }
  }
  const h = a.map((row, i) => row[8] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function invertH(m: H): H | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

export function applyH(m: H, x: number, y: number): P2 {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** Whether a quad is convex and not folded (the cross products of its turns share one sign). */
export function convexQuadTLTRBRBL(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4], [cx, cy] = q[(i + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

function inside(q: Quad, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4];
    const s = Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    if (s === 0) continue;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

function distToQuad(q: Quad, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

export interface Plane { src: Quad; dst: Quad }

function cubicWeights(t: number, w: Float32Array): void {
  const t2 = t * t, t3 = t2 * t;
  w[0] = -0.5 * t3 + t2 - 0.5 * t; w[1] = 1.5 * t3 - 2.5 * t2 + 1; w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; w[3] = 0.5 * t3 - 0.5 * t2;
}

/** The picture through the planes into a document-space region (x0, y0, W, H) at scale `s`: each output pixel finds
 *  its plane (the warped quad holding it, or the nearest), goes back through that plane's inverse map to the layout
 *  position in the document, then through `toLocal` into the picture, sampled bilinearly in premultiplied alpha. */
export function perspectiveImage(src: ImageData, toLocal: (x: number, y: number) => P2, planes: readonly Plane[], x0: number, y0: number, W: number, H: number, s: number): ImageData {
  const ow = Math.max(1, Math.round(W * s)), oh = Math.max(1, Math.round(H * s)), out = new ImageData(ow, oh), o = out.data;
  const inv = planes.map((p) => { const f = homography(p.src, p.dst); return f ? invertH(f) : null; });
  const sw = src.width, sh = src.height, d = src.data, wx = new Float32Array(4), wy = new Float32Array(4);
  for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) {
    const x = x0 + (i + 0.5) / s, y = y0 + (j + 0.5) / s;
    let k = -1;
    for (let q = 0; q < planes.length; q++) if (inv[q] && inside(planes[q].dst, x, y)) { k = q; break; }
    if (k < 0) { let bd = Infinity; for (let q = 0; q < planes.length; q++) { if (!inv[q]) continue; const dd = distToQuad(planes[q].dst, x, y); if (dd < bd) { bd = dd; k = q; } } }
    if (k < 0) continue;
    const [lx, ly] = applyH(inv[k] as H, x, y), [u0, v0] = toLocal(lx, ly), u = u0 - 0.5, v = v0 - 0.5;
    if (!(u > -1 && v > -1 && u < sw && v < sh)) continue;
    const xa = Math.floor(u), ya = Math.floor(v);
    cubicWeights(u - xa, wx); cubicWeights(v - ya, wy);
    let r = 0, g = 0, b = 0, a = 0;
    for (let jj = 0; jj < 4; jj++) {
      const yy = ya - 1 + jj;
      if (yy < 0 || yy >= sh) continue;
      for (let ii = 0; ii < 4; ii++) {
        const xx = xa - 1 + ii;
        if (xx < 0 || xx >= sw) continue;
        const p = (yy * sw + xx) * 4, al = (d[p + 3] / 255) * wx[ii] * wy[jj];
        r += d[p] * al; g += d[p + 1] * al; b += d[p + 2] * al; a += al;
      }
    }
    a = Math.min(1, a);
    if (a <= 0.0005) continue;
    const t = (j * ow + i) * 4;
    o[t] = Math.min(255, Math.max(0, r / a)); o[t + 1] = Math.min(255, Math.max(0, g / a)); o[t + 2] = Math.min(255, Math.max(0, b / a)); o[t + 3] = a * 255;
  }
  return out;
}

/** Edges within 20 degrees of vertical (or horizontal) made exactly so, across every plane's warped quad, corners
 *  shared between planes moved together. */
export function straighten(planes: Plane[], vertical: boolean): void {
  const key = (p: P2): string => `${Math.round(p[0] * 4)}:${Math.round(p[1] * 4)}`;
  const pts = new Map<string, P2>();
  for (const pl of planes) for (const c of pl.dst) if (!pts.has(key(c))) pts.set(key(c), [c[0], c[1]]);
  const moved = new Map<string, P2>(pts);
  for (const pl of planes) {
    const edges = vertical ? [[0, 3], [1, 2]] : [[0, 1], [3, 2]];
    for (const [a, b] of edges) {
      const pa = moved.get(key(pl.dst[a]))!, pb = moved.get(key(pl.dst[b]))!;
      const ang = Math.abs(Math.atan2(pb[0] - pa[0], pb[1] - pa[1]) * 180 / Math.PI), angH = Math.abs(Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180 / Math.PI);
      const near = vertical ? Math.min(ang, 180 - ang) <= 20 : Math.min(angH, 180 - angH) <= 20;
      if (!near) continue;
      if (vertical) { const m = (pa[0] + pb[0]) / 2; pa[0] = m; pb[0] = m; } else { const m = (pa[1] + pb[1]) / 2; pa[1] = m; pb[1] = m; }
    }
  }
  for (const pl of planes) pl.dst = pl.dst.map((c) => { const m = moved.get(key(c)); return m ? [m[0], m[1]] as P2 : c; }) as Quad;
}
