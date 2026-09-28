/** Remove Distractions: Wires and Cables, written for formvis. Photoshop finds these with a trained model; here the
 *  classic route: a morphological black-hat (the image's closing, a max then a min over a square, less the image)
 *  lifts thin dark lines up to twice `radius` wide while broad dark shapes cancel out; its threshold gives candidate
 *  pixels, and only connected pieces that are long and thin (a long bounding box with little area for its length) are
 *  kept, so wires and cables go while dark objects stay. The mask is grown a little to take the line's soft edge. */

/** Max (or min) over a (2r+1) square, separably. */
function squareFilter(src: Float32Array, w: number, h: number, r: number, max: boolean): Float32Array {
  const pick = max ? Math.max : Math.min, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = src[y * w + x];
    for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) v = pick(v, src[y * w + xx]); }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = tmp[y * w + x];
    for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) v = pick(v, tmp[yy * w + x]); }
    out[y * w + x] = v;
  }
  return out;
}

export interface WireOptions { radius: number; threshold: number; minLength: number; maxWidth: number; grow: number }
export const WIRE_DEFAULTS: WireOptions = { radius: 4, threshold: 24, minLength: 40, maxWidth: 7, grow: 2 };

/** A 0/1 mask of wires and cables in straight RGBA `img` (only opaque pixels count). */
export function findWires(img: ImageData, o: WireOptions = WIRE_DEFAULTS): Uint8Array {
  const { width: w, height: h, data: d } = img, n = w * h, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const closed = squareFilter(squareFilter(L, w, h, o.radius, true), w, h, o.radius, false), cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] > 200 && closed[i] - L[i] >= o.threshold) cand[i] = 1;
  const keep = new Uint8Array(n), seen = new Uint8Array(n), stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!cand[s] || seen[s]) continue;
    const comp: number[] = [];
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop() as number, x = p % w, y = (p - x) / w;
      comp.push(p);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (cand[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    const length = Math.hypot(x1 - x0 + 1, y1 - y0 + 1);
    if (length >= o.minLength && comp.length <= length * o.maxWidth) for (const p of comp) keep[p] = 1;
  }
  if (o.grow <= 0) return keep;
  const grown = squareFilter(Float32Array.from(keep), w, h, o.grow, true), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = grown[i] > 0 ? 1 : 0;
  return out;
}
