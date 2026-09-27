/** The Magnetic Lasso's edge-following (1.49.4, the owner's tool list): an edge map from the image's luminance
 *  gradient, the cheapest path along edges between two points (Dijkstra, eight neighbours, searched in a window around
 *  them), and snapping a point to the strongest edge near it. Pure: no DOM, unit-tested on synthetic images. */
export interface Pt { x: number; y: number }

export class EdgeMap {
  /** cost per pixel: low on strong edges (never zero), high elsewhere. */
  constructor(readonly width: number, readonly height: number, readonly cost: Float32Array, readonly strength: Float32Array) {}

  /** From RGBA pixels. Contrast (0..1, Photoshop's percentage) is the weakest edge that counts: a gradient below it is
   *  no edge at all; above it strength rises to full at four times the threshold. */
  static fromRGBA(data: Uint8ClampedArray, width: number, height: number, contrast = 0.1): EdgeMap {
    const n = width * height, lum = new Float32Array(n), strength = new Float32Array(n), cost = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = data[i * 4 + 3] / 255; lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) * a; }
    const c = Math.max(0.005, contrast);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const at = (xx: number, yy: number): number => lum[Math.min(height - 1, Math.max(0, yy)) * width + Math.min(width - 1, Math.max(0, xx))];
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const g = Math.hypot(gx, gy) / 1020;   // 0..~1.4
      const s = g < c ? 0 : Math.min(1, g / (4 * c));
      strength[y * width + x] = s;
      cost[y * width + x] = 1 - 0.97 * s;
    }
    return new EdgeMap(width, height, cost, strength);
  }
}

/** The strongest edge within `radius` of a point (the point itself if none is stronger). */
export function snapToEdge(map: EdgeMap, at: Pt, radius: number): Pt {
  const cx = Math.round(at.x), cy = Math.round(at.y), r = Math.max(0, Math.round(radius));
  let best = { x: Math.min(map.width - 1, Math.max(0, cx)), y: Math.min(map.height - 1, Math.max(0, cy)) }, bestS = -1, bestD = Infinity;
  for (let y = Math.max(0, cy - r); y <= Math.min(map.height - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(map.width - 1, cx + r); x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r) continue;
    const s = map.strength[y * map.width + x];
    if (s > bestS + 1e-6 || (Math.abs(s - bestS) <= 1e-6 && d < bestD)) { bestS = s; bestD = d; best = { x, y }; }
  }
  return bestS > 0 ? best : { x: Math.min(map.width - 1, Math.max(0, cx)), y: Math.min(map.height - 1, Math.max(0, cy)) };
}

/** The cheapest eight-connected path from `from` to `to` over the edge map, within their bounding box grown by
 *  `margin` (and never more than `maxSide` pixels on a side), as a list of pixel points, `from` first. */
export function liveWire(map: EdgeMap, from: Pt, to: Pt, margin = 24, maxSide = 700): Pt[] {
  const fx = Math.round(from.x), fy = Math.round(from.y), tx = Math.round(to.x), ty = Math.round(to.y);
  let x0 = Math.max(0, Math.min(fx, tx) - margin), y0 = Math.max(0, Math.min(fy, ty) - margin);
  let x1 = Math.min(map.width - 1, Math.max(fx, tx) + margin), y1 = Math.min(map.height - 1, Math.max(fy, ty) + margin);
  if (x1 - x0 + 1 > maxSide || y1 - y0 + 1 > maxSide) return straight(from, to);   // too far apart: a straight segment
  const w = x1 - x0 + 1, h = y1 - y0 + 1, n = w * h, dist = new Float32Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const idx = (x: number, y: number): number => (y - y0) * w + (x - x0);
  const start = idx(Math.min(x1, Math.max(x0, fx)), Math.min(y1, Math.max(y0, fy))), goal = idx(Math.min(x1, Math.max(x0, tx)), Math.min(y1, Math.max(y0, ty)));
  const heap = new MinHeap(n);
  dist[start] = 0; heap.push(start, 0);
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === goal) break;
    const ux = (u % w) + x0, uy = Math.floor(u / w) + y0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const vx = ux + dx, vy = uy + dy;
      if (vx < x0 || vx > x1 || vy < y0 || vy > y1) continue;
      const v = idx(vx, vy);
      if (done[v]) continue;
      const step = (dx && dy ? Math.SQRT2 : 1) * map.cost[vy * map.width + vx];
      const nd = dist[u] + step;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push(v, nd); }
    }
  }
  if (prev[goal] < 0 && goal !== start) return straight(from, to);
  const out: Pt[] = [];
  for (let v = goal; v >= 0; v = prev[v]) { out.push({ x: (v % w) + x0, y: Math.floor(v / w) + y0 }); if (v === start) break; }
  return out.reverse();
}

function straight(a: Pt, b: Pt): Pt[] { return [{ x: Math.round(a.x), y: Math.round(a.y) }, { x: Math.round(b.x), y: Math.round(b.y) }]; }

/** A binary min-heap of node ids by priority (entries may repeat; the caller skips finished nodes). */
class MinHeap {
  private ids: Int32Array; private keys: Float32Array; size = 0;
  constructor(cap: number) { this.ids = new Int32Array(Math.max(16, cap)); this.keys = new Float32Array(Math.max(16, cap)); }
  push(id: number, key: number): void {
    if (this.size === this.ids.length) { const i = new Int32Array(this.size * 2), k = new Float32Array(this.size * 2); i.set(this.ids); k.set(this.keys); this.ids = i; this.keys = k; }
    let j = this.size++;
    while (j > 0) { const p = (j - 1) >> 1; if (this.keys[p] <= key) break; this.ids[j] = this.ids[p]; this.keys[j] = this.keys[p]; j = p; }
    this.ids[j] = id; this.keys[j] = key;
  }
  pop(): number {
    const top = this.ids[0], lastId = this.ids[--this.size], lastKey = this.keys[this.size];
    let j = 0;
    for (;;) {
      let c = 2 * j + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c += 1;
      if (this.keys[c] >= lastKey) break;
      this.ids[j] = this.ids[c]; this.keys[j] = this.keys[c]; j = c;
    }
    this.ids[j] = lastId; this.keys[j] = lastKey;
    return top;
  }
}
