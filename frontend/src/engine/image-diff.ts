/** Image diff (DEV_PLAN 36.5), for Edit > Compare with...: where two pictures of the same size differ by more than a
 *  threshold, as a mask and the regions it forms. Pure pixel work; no DOM. */
export interface DiffRegion { x: number; y: number; w: number; h: number; area: number }
export interface DiffResult { mask: Uint8Array; regions: DiffRegion[] }

/** Compares two RGBA buffers `w` by `h`: a pixel differs when its largest channel difference (red, green, blue or alpha)
 *  is above `threshold` (0 to 255). Differing pixels join into regions by 8-way connection; a region smaller than
 *  `minSize` pixels is dropped. `mask` is 255 where a kept region lies, with each region's bounding box and pixel count. */
export function diffRegions(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, h: number, threshold: number, minSize: number): DiffResult {
  const n = w * h, raw = new Uint8Array(n), mask = new Uint8Array(n), regions: DiffRegion[] = [];
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const d = Math.max(Math.abs(a[j] - b[j]), Math.abs(a[j + 1] - b[j + 1]), Math.abs(a[j + 2] - b[j + 2]), Math.abs(a[j + 3] - b[j + 3]));
    if (d > threshold) raw[i] = 1;
  }
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (raw[s] !== 1) continue;
    let top = 0, count = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    const members: number[] = [];
    stack[top++] = s; raw[s] = 2;
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w;
      members.push(i); count++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (raw[k] === 1) { raw[k] = 2; stack[top++] = k; }
      }
    }
    if (count < minSize) continue;
    for (const i of members) mask[i] = 255;
    regions.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area: count });
  }
  return { mask, regions };
}
