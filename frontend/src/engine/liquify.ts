/** Liquify, after NodeMode's formvis studio (`studio/pixel/liquify.ts`, nodemode_dev v8.73.1, the owner's build, MIT):
 *  a coarse displacement field over the image, and the image always resampled from its original pixels through the
 *  accumulated field, shown(q) = original(q - D(q)), so strokes never compound resampling blur and cancelling is
 *  exact. The field lives on a cell grid (4 px by default) and is read bilinearly. NodeMode has the push; the other
 *  tools of a full Liquify workspace are written here on the same field: Reconstruct eases the field back to
 *  zero, Twirl rotates what lies under the brush, Pucker draws it in and Bloat swells it out, each weighted by a
 *  smoothstep falloff from the brush centre. */

import { gpuFilters } from './gpu-filters';

export interface LiquifyField { gw: number; gh: number; cell: number; d: Float32Array; freeze?: Float32Array }
export type LiquifyTool = 'warp' | 'pushLeft' | 'reconstruct' | 'twirlCW' | 'twirlCCW' | 'pucker' | 'bloat' | 'smooth' | 'freeze' | 'thaw' | 'lassoFreeze' | 'lassoThaw';

export function makeField(w: number, h: number, cell = 4): LiquifyField {
  const gw = Math.ceil(w / cell) + 1, gh = Math.ceil(h / cell) + 1;
  return { gw, gh, cell, d: new Float32Array(gw * gh * 2) };
}

const smooth = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** The brush's falloff from its centre (`t` is 1 at the centre, 0 at the edge) at Brush Density `density` (0 to 100,
 *  50 the plain smooth falloff): above 50 the middle holds full strength and the edge narrows; below 50 the brush
 *  peaks at the centre and fades sooner. */
export function falloff(t: number, density = 50): number {
  const d = Math.min(100, Math.max(0, density));
  if (d >= 50) return smooth(t / (1 - ((d - 50) / 50) * 0.9));
  return Math.pow(smooth(t), 1 + ((50 - d) / 50) * 2);
}

/** Brush Rate: how fast a stationary tool builds up, 0 to 100 (100 the full strength at every repeat). */
export const rateScale = (rate: number): number => Math.min(100, Math.max(1, rate)) / 100;

/** A field on a different cell size (Mesh Size), the displacements and freeze read bilinearly from `f`. */
export function resizeField(f: LiquifyField, w: number, h: number, cell: number): LiquifyField {
  const g = makeField(w, h, cell), o: [number, number] = [0, 0];
  for (let gy = 0; gy < g.gh; gy++) for (let gx = 0; gx < g.gw; gx++) {
    fieldAt(f, gx * cell, gy * cell, o);
    g.d[(gy * g.gw + gx) * 2] = o[0]; g.d[(gy * g.gw + gx) * 2 + 1] = o[1];
  }
  if (f.freeze) { g.freeze = new Float32Array(g.gw * g.gh); for (let gy = 0; gy < g.gh; gy++) for (let gx = 0; gx < g.gw; gx++) g.freeze[gy * g.gw + gx] = freezeAt(f, gx * cell, gy * cell); }
  return g;
}

/** Displacement at an image point, bilinear over the cell grid. */
export function fieldAt(f: LiquifyField, x: number, y: number, out: [number, number]): void {
  const gx = Math.min(f.gw - 1.001, Math.max(0, x / f.cell)), gy = Math.min(f.gh - 1.001, Math.max(0, y / f.cell));
  const x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
  const i00 = (y0 * f.gw + x0) * 2, i10 = i00 + 2, i01 = i00 + f.gw * 2, i11 = i01 + 2;
  out[0] = (f.d[i00] * (1 - tx) + f.d[i10] * tx) * (1 - ty) + (f.d[i01] * (1 - tx) + f.d[i11] * tx) * ty;
  out[1] = (f.d[i00 + 1] * (1 - tx) + f.d[i10 + 1] * tx) * (1 - ty) + (f.d[i01 + 1] * (1 - tx) + f.d[i11 + 1] * tx) * ty;
}

/** Visits every grid node within `radius` of (cx, cy) with its falloff weight, less its freeze (1.56.5, the parity
 *  plan's M3: Freeze Mask holds what it covers still under every tool, Reconstruct included). */
function eachNode(f: LiquifyField, cx: number, cy: number, radius: number, visit: (i: number, px: number, py: number, w: number) => void, ignoreFreeze = false, density = 50): void {
  const r = Math.max(2, radius);
  const x0 = Math.max(0, Math.floor((cx - r) / f.cell)), y0 = Math.max(0, Math.floor((cy - r) / f.cell));
  const x1 = Math.min(f.gw - 1, Math.ceil((cx + r) / f.cell)), y1 = Math.min(f.gh - 1, Math.ceil((cy + r) / f.cell));
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const px = gx * f.cell, py = gy * f.cell, dist = Math.hypot(px - cx, py - cy) / r, n = gy * f.gw + gx;
    const free = ignoreFreeze || !f.freeze ? 1 : 1 - f.freeze[n];
    if (dist < 1 && free > 0) visit(n * 2, px, py, falloff(1 - dist, density) * free);
  }
}

/** Freeze Mask and Thaw Mask: paint the freeze up or down under the brush by strength. */
export function paintFreeze(f: LiquifyField, cx: number, cy: number, radius: number, strength: number, thaw: boolean, density = 50): void {
  if (!f.freeze) f.freeze = new Float32Array(f.gw * f.gh);
  const s = Math.min(1, Math.max(0.02, strength)), m = f.freeze;
  eachNode(f, cx, cy, radius, (i, _x, _y, w) => { const n = i / 2; m[n] = Math.min(1, Math.max(0, m[n] + (thaw ? -1 : 1) * w * s)); }, true, density);
}

/** Lasso Freeze and Lasso Thaw: every mesh node inside the closed outline `pts` (image pixels, even-odd) frozen fully, or thawed. */
export function freezePolygon(f: LiquifyField, pts: ReadonlyArray<{ x: number; y: number }>, thaw: boolean): void {
  if (pts.length < 3) return;
  if (!f.freeze) f.freeze = new Float32Array(f.gw * f.gh);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const gy0 = Math.max(0, Math.ceil(y0 / f.cell)), gy1 = Math.min(f.gh - 1, Math.floor(y1 / f.cell)), v = thaw ? 0 : 1;
  for (let gy = gy0; gy <= gy1; gy++) {
    const y = gy * f.cell, xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y <= y) !== (b.y <= y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const gx0 = Math.max(0, Math.ceil(xs[k] / f.cell)), gx1 = Math.min(f.gw - 1, Math.floor(xs[k + 1] / f.cell));
      for (let gx = gx0; gx <= gx1; gx++) f.freeze[gy * f.gw + gx] = v;
    }
  }
}

/** The freeze mask cleared, or inverted (Mask Options: None, Invert All). */
export function clearFreeze(f: LiquifyField): void { f.freeze = undefined; }
export function invertFreeze(f: LiquifyField): void { const m = f.freeze ?? new Float32Array(f.gw * f.gh); for (let i = 0; i < m.length; i++) m[i] = 1 - m[i]; f.freeze = m; }

/** The freeze at an image point, bilinear over the grid (for drawing the mask). */
export function freezeAt(f: LiquifyField, x: number, y: number): number {
  const m = f.freeze;
  if (!m) return 0;
  const gx = Math.min(f.gw - 1.001, Math.max(0, x / f.cell)), gy = Math.min(f.gh - 1.001, Math.max(0, y / f.cell)), x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0, i = y0 * f.gw + x0;
  return (m[i] * (1 - tx) + m[i + 1] * tx) * (1 - ty) + (m[i + f.gw] * (1 - tx) + m[i + f.gw + 1] * tx) * ty;
}

/** Forward Warp, as in the source: the drag from a to b is added under the brush, scaled by strength (0 to 1). */
export function pushField(f: LiquifyField, ax: number, ay: number, bx: number, by: number, radius: number, strength: number, density = 50): void {
  const dx = bx - ax, dy = by - ay, s = Math.min(1, Math.max(0.02, strength));
  if (!dx && !dy) return;
  eachNode(f, ax, ay, radius, (i, _x, _y, w) => { f.d[i] += dx * w * s; f.d[i + 1] += dy * w * s; }, false, density);
}

/** Push Left (36.4): pixels move to the left of the drag (dragging up pushes them left), or to its
 *  right with `right` (Alt). The drag turned a quarter turn, then added as Forward Warp adds it. */
export function pushLeftField(f: LiquifyField, ax: number, ay: number, bx: number, by: number, radius: number, strength: number, right = false, density = 50): void {
  const dx = bx - ax, dy = by - ay, k = right ? -1 : 1;
  pushField(f, ax, ay, ax + dy * k, ay - dx * k, radius, strength, density);
}

/** A liquify mesh as JSON (36.4), for Save Mesh and Load Mesh: the grid, its displacements and the freeze. */
export function meshToJson(f: LiquifyField): string {
  return JSON.stringify({ formvis: 'liquify-mesh', version: 1, gw: f.gw, gh: f.gh, cell: f.cell, d: Array.from(f.d, (v) => Math.round(v * 1000) / 1000), freeze: f.freeze ? Array.from(f.freeze, (v) => Math.round(v * 1000) / 1000) : null });
}

/** Loads a saved mesh into `f` when its grid matches (same image size); false otherwise. */
export function meshFromJson(f: LiquifyField, text: string): boolean {
  let o: unknown;
  try { o = JSON.parse(text); } catch { return false; }
  if (!o || typeof o !== 'object') return false;
  const m = o as { formvis?: unknown; gw?: unknown; gh?: unknown; cell?: unknown; d?: unknown; freeze?: unknown };
  if (m.formvis !== 'liquify-mesh' || m.gw !== f.gw || m.gh !== f.gh || m.cell !== f.cell || !Array.isArray(m.d) || m.d.length !== f.d.length) return false;
  const d = m.d;
  if (!d.every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  f.d.set(d as number[]);
  const fr = m.freeze;
  f.freeze = Array.isArray(fr) && fr.length === f.gw * f.gh && fr.every((v) => typeof v === 'number') ? Float32Array.from(fr as number[]) : undefined;
  return true;
}

/** One dab of a stationary tool at (cx, cy): Reconstruct, Twirl either way, Pucker or Bloat. */
export function dabField(f: LiquifyField, tool: Exclude<LiquifyTool, 'warp' | 'pushLeft' | 'smooth' | 'freeze' | 'thaw' | 'lassoFreeze' | 'lassoThaw'>, cx: number, cy: number, radius: number, strength: number, density = 50): void {
  const s = Math.min(1, Math.max(0.02, strength));
  eachNode(f, cx, cy, radius, (i, px, py, w) => {
    const k = w * s;
    if (tool === 'reconstruct') { f.d[i] *= 1 - k * 0.5; f.d[i + 1] *= 1 - k * 0.5; return; }
    // Where the node now samples from, relative to the brush centre.
    const vx = px - f.d[i] - cx, vy = py - f.d[i + 1] - cy;
    let nx = vx, ny = vy;
    if (tool === 'twirlCW' || tool === 'twirlCCW') { const a = (tool === 'twirlCW' ? -1 : 1) * 0.12 * k, c = Math.cos(a), sn = Math.sin(a); nx = vx * c - vy * sn; ny = vx * sn + vy * c; }
    else { const g = tool === 'bloat' ? 1 - 0.08 * k : 1 + 0.08 * k; nx = vx * g; ny = vy * g; }
    // Sampling from cx + (nx, ny) instead of cx + (vx, vy): D = q - source.
    f.d[i] = px - (cx + nx);
    f.d[i + 1] = py - (cy + ny);
  }, false, density);
}

/** The Smooth tool: the displacement under the brush eased toward the mean of its four neighbours, so a pushed
 *  region relaxes into a gentler one without returning to the original. Frozen nodes stay. */
export function smoothField(f: LiquifyField, cx: number, cy: number, radius: number, strength: number, density = 50): void {
  const s = Math.min(1, Math.max(0.02, strength)), keep: Array<[number, number, number]> = [];
  const mean = (n: number, c: number): number => {
    const gx = n % f.gw, gy = Math.floor(n / f.gw);
    const l = gx > 0 ? n - 1 : n, r = gx < f.gw - 1 ? n + 1 : n, u = gy > 0 ? n - f.gw : n, d = gy < f.gh - 1 ? n + f.gw : n;
    return (f.d[l * 2 + c] + f.d[r * 2 + c] + f.d[u * 2 + c] + f.d[d * 2 + c]) / 4;
  };
  eachNode(f, cx, cy, radius, (i, _x, _y, w) => { const k = Math.min(1, w * s); keep.push([i, f.d[i] + (mean(i / 2, 0) - f.d[i]) * k, f.d[i + 1] + (mean(i / 2, 1) - f.d[i + 1]) * k]); }, false, density);
  for (const [i, x, y] of keep) { f.d[i] = x; f.d[i + 1] = y; }
}

/** A field as smart filter settings: the grid and its displacements in sixteenths of a pixel, 16-bit, in base64. */
export function fieldToSettings(f: LiquifyField): Record<string, unknown> {
  const q = new Int16Array(f.d.length);
  for (let i = 0; i < q.length; i++) q[i] = Math.max(-32767, Math.min(32767, Math.round(f.d[i] * 16)));
  const bytes = new Uint8Array(q.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { gw: f.gw, gh: f.gh, cell: f.cell, d: btoa(s) };
}

/** The field a smart filter's settings hold; null when they do not describe a grid. */
export function fieldFromSettings(o: Record<string, unknown>): LiquifyField | null {
  const { gw, gh, cell, d } = o;
  if (typeof gw !== 'number' || typeof gh !== 'number' || typeof cell !== 'number' || typeof d !== 'string' || gw < 2 || gh < 2 || cell < 1) return null;
  let raw: string;
  try { raw = atob(d); } catch { return null; }
  if (raw.length !== gw * gh * 4) return null;
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const q = new Int16Array(bytes.buffer), f: LiquifyField = { gw, gh, cell, d: new Float32Array(q.length) };
  for (let i = 0; i < q.length; i++) f.d[i] = q[i] / 16;
  return f;
}

/** A Liquify smart filter run on `src`: the saved field, resampled from the smart object's original pixels. */
export function runLiquifySmart(settings: Record<string, unknown>, src: ImageData): ImageData {
  const f = fieldFromSettings(settings);
  return f ? liquifyImage(src, f) : src;
}

export function resetField(f: LiquifyField): void { f.d.fill(0); }
export const fieldIsZero = (f: LiquifyField): boolean => f.d.every((v) => v === 0);

/** The image resampled through the field, into an image of `outW` x `outH` that shows the source at `scale`
 *  (1 for full size, below 1 for a preview). Bilinear, premultiplied, outside transparent. */
export function liquifyImage(src: ImageData, f: LiquifyField, scale = 1, outW = src.width, outH = src.height): ImageData {
  try { const gpu = gpuFilters()?.liquify(src, f, scale, outW, outH); if (gpu) return gpu; } catch { /* the CPU does it */ }
  return liquifyImageCpu(src, f, scale, outW, outH);
}

export function liquifyImageCpu(src: ImageData, f: LiquifyField, scale = 1, outW = src.width, outH = src.height): ImageData {
  const W = src.width, H = src.height, s = src.data, out = new ImageData(outW, outH), o = out.data, d: [number, number] = [0, 0];
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const qx = (x + 0.5) / scale, qy = (y + 0.5) / scale;
    fieldAt(f, qx, qy, d);
    const sx = qx - d[0] - 0.5, sy = qy - d[1] - 0.5, x0 = Math.floor(sx), y0 = Math.floor(sy), tx = sx - x0, ty = sy - y0;
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const X = x0 + i, Y = y0 + j;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const w = (i ? tx : 1 - tx) * (j ? ty : 1 - ty), k = (Y * W + X) * 4, al = (s[k + 3] / 255) * w;
      r += s[k] * al; g += s[k + 1] * al; b += s[k + 2] * al; a += al;
    }
    const k = (y * outW + x) * 4;
    if (a > 1e-4) { o[k] = Math.round(r / a); o[k + 1] = Math.round(g / a); o[k + 2] = Math.round(b / a); o[k + 3] = Math.round(a * 255); }
  }
  return out;
}
