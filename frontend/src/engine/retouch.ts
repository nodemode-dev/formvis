import type { Pt, Rect } from './types';

export type HealMode = 'contentAware' | 'createTexture' | 'proximityMatch';
const OUTSIDE = 0, RING = 1, HOLE = 2;

function hash(x: number): number {
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
const unit = (key: number): number => (hash(key >>> 0) >>> 8) / 16777216;
const lround = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));

export function premultiply(d: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    out[i] = Math.round((d[i] * a) / 255); out[i + 1] = Math.round((d[i + 1] * a) / 255); out[i + 2] = Math.round((d[i + 2] * a) / 255); out[i + 3] = a;
  }
  return out;
}

export function unpremultiply(p: Uint8ClampedArray, out: Uint8ClampedArray, from = 0, to = p.length): void {
  for (let i = from; i < to; i += 4) {
    const a = p[i + 3];
    if (!a) { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0; continue; }
    out[i] = Math.min(255, Math.round((p[i] * 255) / a)); out[i + 1] = Math.min(255, Math.round((p[i + 1] * 255) / a));
    out[i + 2] = Math.min(255, Math.round((p[i + 2] * 255) / a)); out[i + 3] = a;
  }
}

function healScore(rgba: Uint8ClampedArray, W: number, H: number, role: Uint8Array, wx0: number, wy0: number, ww: number, wh: number, dx: number, dy: number): number {
  if (Math.abs(dx) < ww && Math.abs(dy) < wh) return Infinity;
  if (wx0 + dx < 0 || wy0 + dy < 0 || wx0 + ww + dx > W || wy0 + wh + dy > H) return Infinity;
  let sum = 0, n = 0;
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
    if (role[y * ww + x] !== RING) continue;
    const t = ((wy0 + y) * W + wx0 + x) * 4, s = ((wy0 + y + dy) * W + wx0 + x + dx) * 4;
    for (let c = 0; c < 4; c++) { const d = rgba[t + c] - rgba[s + c]; sum += d * d; }
    n++;
  }
  return n ? sum / n : Infinity;
}

function healSolve(value: Float32Array, role: Uint8Array, w: number, h: number, depth: number): void {
  let iterations = 300;
  if (w > 32 && h > 32 && depth < 16) {
    const cw = (w + 1) >> 1, ch = (h + 1) >> 1;
    const coarse = new Float32Array(cw * ch * 4), coarseRole = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      let known = 0, hole = 0;
      const ks = [0, 0, 0, 0], hs = [0, 0, 0, 0];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const fx = x * 2 + i, fy = y * 2 + j;
        if (fx >= w || fy >= h) continue;
        const p = fy * w + fx;
        if (role[p] === RING) { known++; for (let c = 0; c < 4; c++) ks[c] += value[p * 4 + c]; }
        else if (role[p] === HOLE) { hole++; for (let c = 0; c < 4; c++) hs[c] += value[p * 4 + c]; }
      }
      const q = y * cw + x;
      if (known) { coarseRole[q] = RING; for (let c = 0; c < 4; c++) coarse[q * 4 + c] = ks[c] / known; }
      else if (hole) { coarseRole[q] = HOLE; for (let c = 0; c < 4; c++) coarse[q * 4 + c] = hs[c] / hole; }
    }
    healSolve(coarse, coarseRole, cw, ch, depth + 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, q = (y >> 1) * cw + (x >> 1);
      if (role[p] === HOLE && coarseRole[q] === HOLE) for (let c = 0; c < 4; c++) value[p * 4 + c] = coarse[q * 4 + c];
    }
    iterations = 40;
  }
  const omega = 1.8;
  for (let it = 0; it < iterations; it++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (role[p] !== HOLE) continue;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, n = 0;
    const add = (nx: number, ny: number): void => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const q = ny * w + nx;
      if (role[q] === OUTSIDE) return;
      s0 += value[q * 4]; s1 += value[q * 4 + 1]; s2 += value[q * 4 + 2]; s3 += value[q * 4 + 3]; n++;
    };
    add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1);
    if (!n) continue;
    value[p * 4] += omega * (s0 / n - value[p * 4]); value[p * 4 + 1] += omega * (s1 / n - value[p * 4 + 1]);
    value[p * 4 + 2] += omega * (s2 / n - value[p * 4 + 2]); value[p * 4 + 3] += omega * (s3 / n - value[p * 4 + 3]);
  }
}

export function spotHeal(rgba: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, opacity: number, mode: HealMode, seed: number): boolean {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!coverage[y * W + x]) continue;
    if (x < x0) x0 = x;
    if (x + 1 > x1) x1 = x + 1;
    if (y < y0) y0 = y;
    if (y + 1 > y1) y1 = y + 1;
  }
  if (x1 <= x0 || y1 <= y0) return false;
  const size = Math.max(x1 - x0, y1 - y0);
  const ring = Math.min(16, Math.max(2, Math.floor(size / 8)));
  const wx0 = Math.max(0, x0 - ring), wy0 = Math.max(0, y0 - ring), wx1 = Math.min(W, x1 + ring), wy1 = Math.min(H, y1 + ring);
  const ww = wx1 - wx0, wh = wy1 - wy0, wn = ww * wh;
  const role = new Uint8Array(wn), near = new Uint8Array(wn), prefix = new Int32Array(Math.max(ww, wh) + 1), value = new Float32Array(wn * 4);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) role[y * ww + x] = coverage[(wy0 + y) * W + wx0 + x] ? HOLE : OUTSIDE;
  for (let y = 0; y < wh; y++) {
    prefix[0] = 0;
    for (let x = 0; x < ww; x++) prefix[x + 1] = prefix[x] + (role[y * ww + x] === HOLE ? 1 : 0);
    for (let x = 0; x < ww; x++) { const lo = Math.max(0, x - ring), hi = Math.min(ww, x + ring + 1); near[y * ww + x] = prefix[hi] - prefix[lo] > 0 ? 1 : 0; }
  }
  for (let x = 0; x < ww; x++) {
    prefix[0] = 0;
    for (let y = 0; y < wh; y++) prefix[y + 1] = prefix[y] + near[y * ww + x];
    for (let y = 0; y < wh; y++) {
      const lo = Math.max(0, y - ring), hi = Math.min(wh, y + ring + 1);
      if (role[y * ww + x] === OUTSIDE && prefix[hi] - prefix[lo] > 0) role[y * ww + x] = RING;
    }
  }
  let ringCount = 0;
  for (let p = 0; p < wn; p++) if (role[p] === RING) ringCount++;
  if (!ringCount) return false;
  let ox = 0, oy = 0, haveSource = false;
  if (mode !== 'createTexture') {
    const factors = [1.05, 1.35, 1.75, 2.25, 2.8], count = mode === 'proximityMatch' ? 2 : 5;
    let best = Infinity;
    for (let f = 0; f < count; f++) for (let a = 0; a < 24; a++) {
      const angle = (a * Math.PI) / 12;
      const dx = lround(Math.cos(angle) * factors[f] * ww), dy = lround(Math.sin(angle) * factors[f] * wh);
      let score = healScore(rgba, W, H, role, wx0, wy0, ww, wh, dx, dy);
      if (!Number.isFinite(score)) continue;
      score *= mode === 'proximityMatch' ? 1 + 0.6 * f : 1 + 0.1 * f;
      if (score < best) { best = score; ox = dx; oy = dy; }
    }
    if (Number.isFinite(best)) {
      const cx = ox, cy = oy;
      let refined = healScore(rgba, W, H, role, wx0, wy0, ww, wh, cx, cy);
      for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
        const score = healScore(rgba, W, H, role, wx0, wy0, ww, wh, cx + i, cy + j);
        if (score < refined) { refined = score; ox = cx + i; oy = cy + j; }
      }
      haveSource = true;
    }
  }
  const mean = [0, 0, 0, 0], detail = [0, 0, 0];
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
    const p = y * ww + x;
    if (role[p] !== RING) continue;
    const ix = wx0 + x, iy = wy0 + y, t = (iy * W + ix) * 4, s = ((iy + oy) * W + ix + ox) * 4;
    for (let c = 0; c < 4; c++) { value[p * 4 + c] = rgba[t + c] - (haveSource ? rgba[s + c] : 0); mean[c] += value[p * 4 + c]; }
    if (!haveSource) {
      for (let c = 0; c < 3; c++) {
        let around = 0, n = 0;
        for (const [nx, ny] of [[ix - 1, iy], [ix + 1, iy], [ix, iy - 1], [ix, iy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          around += rgba[(ny * W + nx) * 4 + c];
          n++;
        }
        if (n) { const d = rgba[t + c] - around / n; detail[c] += d * d; }
      }
    }
  }
  for (let c = 0; c < 4; c++) mean[c] /= ringCount;
  for (let p = 0; p < wn; p++) if (role[p] === HOLE) for (let c = 0; c < 4; c++) value[p * 4 + c] = mean[c];
  healSolve(value, role, ww, wh, 0);
  for (let c = 0; c < 3; c++) detail[c] = Math.sqrt(detail[c] / ringCount) * 0.9;
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
    const p = y * ww + x;
    if (role[p] !== HOLE) continue;
    const ix = wx0 + x, iy = wy0 + y, t = (iy * W + ix) * 4, s = ((iy + oy) * W + ix + ox) * 4;
    const amount = (coverage[iy * W + ix] / 255) * opacity;
    let grain = 0;
    if (!haveSource) {
      const key = hash((seed ^ hash((iy * W + ix) >>> 0)) >>> 0);
      grain = Math.sqrt(-2 * Math.log(1 - unit(key))) * Math.cos(2 * Math.PI * unit((key ^ 0x68e31da4) >>> 0));
    }
    const out = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const healed = (haveSource ? rgba[s + c] : 0) + value[p * 4 + c] + (c < 3 ? grain * detail[c] : 0);
      out[c] = rgba[t + c] + (healed - rgba[t + c]) * amount;
    }
    const alpha = lround(Math.min(255, Math.max(0, out[3])));
    rgba[t + 3] = alpha;
    for (let c = 0; c < 3; c++) rgba[t + c] = lround(Math.min(alpha, Math.max(0, out[c])));
  }
  return true;
}

export function contentFill(px: Uint8ClampedArray, mask: Uint8Array, w: number, h: number): boolean {
  const n = w * h;
  const known = new Uint8Array(n), target = new Uint8Array(n), valid = new Uint8Array(n), queued = new Uint8Array(n);
  const donors = new Int32Array(n), queue = new Int32Array(n), chosen = new Int32Array(n);
  const radius = w >= 5 && h >= 5 ? 2 : 0;
  let missing = 0, donorCount = 0, head = 0, tail = 0, scan = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    target[p] = mask[p] ? 1 : 0;
    known[p] = !target[p] && px[p * 4 + 3] === 255 ? 1 : 0;
    chosen[p] = -1;
    if (target[p]) missing++;
  }
  if (!missing) return true;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!known[p]) continue;
    let ok = true;
    for (let dy = -radius; dy <= radius && ok; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const sx = x + dx, sy = y + dy;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h || !known[sy * w + sx]) { ok = false; break; }
    }
    if (ok) { valid[p] = 1; donors[donorCount++] = p; }
  }
  if (!donorCount) return false;
  const match = (p: number, q: number): number => {
    const pxx = p % w, py = (p / w) | 0, qx = q % w, qy = (q / w) | 0;
    let sum = 0, count = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const x = pxx + dx, y = py + dy, sx = qx + dx, sy = qy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h || sx < 0 || sy < 0 || sx >= w || sy >= h || !known[y * w + x]) continue;
      const a = (y * w + x) * 4, b = (sy * w + sx) * 4;
      for (let c = 0; c < 4; c++) { const d = px[a + c] - px[b + c]; sum += d * d; }
      count++;
    }
    return count ? sum / count : Number.MAX_VALUE;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (target[p] && ((x && known[p - 1]) || (x + 1 < w && known[p + 1]) || (y && known[p - w]) || (y + 1 < h && known[p + w]))) { queue[tail++] = p; queued[p] = 1; }
  }
  let seed = 0x6d2b79f5;
  const next = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (;;) {
    while (head < tail) {
      const p = queue[head++], x = p % w, y = (p / w) | 0;
      let best = -1, score = Number.MAX_VALUE;
      const neighbors = [x ? p - 1 : -1, x + 1 < w ? p + 1 : -1, y ? p - w : -1, y + 1 < h ? p + w : -1];
      for (let k = 0; k < 28; k++) {
        let q = -1;
        if (k < 4) { const t = neighbors[k]; if (t >= 0) q = (chosen[t] >= 0 ? chosen[t] : t) + (p - t); }
        else q = donors[next() % donorCount];
        if (q < 0 || q >= n || !valid[q]) continue;
        const s = match(p, q);
        if (best < 0 || s < score) { score = s; best = q; }
      }
      if (best < 0) best = donors[0];
      for (let r = 64; r >= 1; r = (r / 2) | 0) {
        const qx = (best % w) + (next() % (2 * r + 1)) - r, qy = ((best / w) | 0) + (next() % (2 * r + 1)) - r;
        if (qx < 0 || qy < 0 || qx >= w || qy >= h || !valid[qy * w + qx]) continue;
        const q = qy * w + qx, s = match(p, q);
        if (s < score) { score = s; best = q; }
      }
      px[p * 4] = px[best * 4]; px[p * 4 + 1] = px[best * 4 + 1]; px[p * 4 + 2] = px[best * 4 + 2]; px[p * 4 + 3] = px[best * 4 + 3];
      known[p] = 1;
      chosen[p] = best;
      for (let k = 0; k < 4; k++) { const q = neighbors[k]; if (q >= 0 && target[q] && !known[q] && !queued[q]) { queued[q] = 1; queue[tail++] = q; } }
    }
    while (scan < n && (!target[scan] || known[scan])) scan++;
    if (scan >= n) break;
    queue[tail++] = scan;
    queued[scan] = 1;
  }
  return true;
}

export class WarpStroke {
  readonly points: Pt[] = [];
  readonly radius: number;
  private readonly diameter: number;
  private readonly hardness: number;
  private readonly strength: number;
  private last: Pt | null = null;
  private carried = new Float32Array(0);
  private scratch = new Float32Array(0);

  constructor(readonly pixels: Uint8ClampedArray, readonly width: number, readonly height: number, readonly mode: 'smudge' | 'liquify', diameter: number, hardness: number, strength: number) {
    this.diameter = Math.max(2, diameter);
    this.hardness = Math.min(0.98, Math.max(0, hardness));
    this.strength = Math.min(1, Math.max(0.01, strength));
    this.radius = Math.ceil(this.diameter / 2);
  }

  private weight(u: number): number {
    if (u >= 1) return 0;
    const h = this.hardness;
    if (u <= h) return 1;
    const t = (1 - u) / (1 - h);
    return t * t * (3 - 2 * t);
  }

  append(point: Pt): Rect | null {
    const from = this.last;
    if (!from) { this.last = point; if (this.mode === 'smudge') this.pickUp(point); return null; }
    const distance = Math.hypot(point.x - from.x, point.y - from.y);
    const spacing = Math.max(1, this.diameter * (this.mode === 'smudge' ? 0.08 : 0.025));
    if (distance < spacing) return null;
    const steps = Math.ceil(distance / spacing);
    let previous = from;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const nextPt = { x: from.x + (point.x - from.x) * t, y: from.y + (point.y - from.y) * t };
      if (this.mode === 'smudge') this.smudge(nextPt);
      else this.push(previous, nextPt);
      this.points.push(nextPt);
      const r = this.radius + 2;
      x0 = Math.min(x0, nextPt.x - r); y0 = Math.min(y0, nextPt.y - r); x1 = Math.max(x1, nextPt.x + r); y1 = Math.max(y1, nextPt.y + r);
      previous = nextPt;
    }
    this.last = point;
    const rx = Math.max(0, Math.floor(x0)), ry = Math.max(0, Math.floor(y0));
    const rw = Math.min(this.width, Math.ceil(x1)) - rx, rh = Math.min(this.height, Math.ceil(y1)) - ry;
    return rw > 0 && rh > 0 ? { x: rx, y: ry, w: rw, h: rh } : null;
  }

  private pickUp(center: Pt): void {
    const r = this.radius, side = 2 * r + 1, W = this.width, H = this.height;
    this.carried = new Float32Array(side * side * 4);
    const cx = Math.round(center.x), cy = Math.round(center.y);
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= W) continue;
        const p = (y * W + x) * 4, c = ((dy + r) * side + dx + r) * 4;
        for (let k = 0; k < 4; k++) this.carried[c + k] = this.pixels[p + k];
      }
    }
  }

  private smudge(center: Pt): void {
    const r = this.radius, side = 2 * r + 1, W = this.width, H = this.height, px = this.pixels, carried = this.carried;
    const cx = Math.round(center.x), cy = Math.round(center.y), keep = this.strength, invR = 1 / (this.diameter / 2);
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= W) continue;
        const w = this.weight(Math.sqrt(dx * dx + dy * dy) * invR);
        if (!(w > 0)) continue;
        const p = (y * W + x) * 4, c = ((dy + r) * side + dx + r) * 4;
        for (let k = 0; k < 4; k++) {
          const under = px[p + k];
          const painted = under + (carried[c + k] - under) * w;
          px[p + k] = Math.max(0, Math.min(255, Math.round(painted)));
          carried[c + k] = painted + (carried[c + k] - painted) * keep;
        }
      }
    }
  }

  private push(a: Pt, b: Pt): void {
    const r = this.radius, W = this.width, H = this.height, px = this.pixels;
    const mx = (b.x - a.x) * this.strength, my = (b.y - a.y) * this.strength;
    const margin = Math.ceil(Math.max(Math.abs(mx), Math.abs(my))) + 2;
    const cx = Math.round(b.x), cy = Math.round(b.y);
    const x0 = Math.max(0, cx - r - margin), x1 = Math.min(W - 1, cx + r + margin);
    const y0 = Math.max(0, cy - r - margin), y1 = Math.min(H - 1, cy + r + margin);
    if (x0 > x1 || y0 > y1) return;
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    if (this.scratch.length < cw * ch * 4) this.scratch = new Float32Array(cw * ch * 4);
    const sc = this.scratch;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const p = ((y + y0) * W + x + x0) * 4, s = (y * cw + x) * 4;
      sc[s] = px[p]; sc[s + 1] = px[p + 1]; sc[s + 2] = px[p + 2]; sc[s + 3] = px[p + 3];
    }
    const invR = 1 / (this.diameter / 2);
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < y0 || y > y1) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        if (x < x0 || x > x1) continue;
        const w = this.weight(Math.sqrt(dx * dx + dy * dy) * invR);
        if (!(w > 0)) continue;
        const sx = Math.min(cw - 1, Math.max(0, x - x0 - mx * w)), sy = Math.min(ch - 1, Math.max(0, y - y0 - my * w));
        const ix = Math.min(cw - 2, Math.floor(sx)), iy = Math.min(ch - 2, Math.floor(sy));
        if (ix < 0 || iy < 0) continue;
        const fx = sx - ix, fy = sy - iy, p = (y * W + x) * 4;
        const s00 = (iy * cw + ix) * 4, s10 = s00 + 4, s01 = s00 + cw * 4, s11 = s01 + 4;
        for (let k = 0; k < 4; k++) {
          const top = sc[s00 + k] + (sc[s10 + k] - sc[s00 + k]) * fx, bottom = sc[s01 + k] + (sc[s11 + k] - sc[s01 + k]) * fx;
          px[p + k] = Math.max(0, Math.min(255, Math.round(top + (bottom - top) * fy)));
        }
      }
    }
  }
}
