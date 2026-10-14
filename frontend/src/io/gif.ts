/** A GIF89a encoder with no dependencies, written from the format's specification: a looping animation of full-size
 *  frames, each with its own colour table, delay and transparency. Frames of up to 255 colours keep them exactly;
 *  richer frames are reduced by median cut over a 15-bit colour histogram weighted by pixel counts. Pixels under half
 *  opacity become transparent. */

export interface GifFrame { data: ImageData; delayMs: number }

type Box = { lo: number; hi: number };

/** Up to `max` colours for `px` (RGBA, opaque pixels only), and a map from each colour key to its palette index. */
export function palette(px: Uint8ClampedArray, max: number): { colors: number[][]; index: (r: number, g: number, b: number) => number } {
  const exact = new Map<number, number>();
  for (let i = 0; i < px.length && exact.size <= max; i += 4) if (px[i + 3] >= 128) exact.set((px[i] << 16) | (px[i + 1] << 8) | px[i + 2], 0);
  if (exact.size <= max) {
    const colors: number[][] = [];
    for (const key of exact.keys()) { exact.set(key, colors.length); colors.push([key >> 16, (key >> 8) & 255, key & 255]); }
    return { colors, index: (r, g, b) => exact.get((r << 16) | (g << 8) | b) ?? 0 };
  }
  // Median cut: 15-bit buckets with their counts and colour sums, split along the widest channel at the weighted median.
  const count = new Float64Array(32768), sum = new Float64Array(32768 * 3), keys: number[] = [];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const k = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
    if (count[k] === 0) keys.push(k);
    count[k] += 1; sum[k * 3] += px[i]; sum[k * 3 + 1] += px[i + 1]; sum[k * 3 + 2] += px[i + 2];
  }
  const channel = (k: number, c: number): number => (k >> (10 - 5 * c)) & 31;
  const boxes: Box[] = [{ lo: 0, hi: keys.length }];
  while (boxes.length < max) {
    let pick = -1, widest = 0, axis = 0;
    boxes.forEach((b, i) => {
      if (b.hi - b.lo < 2) return;
      for (let c = 0; c < 3; c++) {
        let mn = 31, mx = 0;
        for (let j = b.lo; j < b.hi; j++) { const v = channel(keys[j], c); if (v < mn) mn = v; if (v > mx) mx = v; }
        if (mx - mn > widest) { widest = mx - mn; pick = i; axis = c; }
      }
    });
    if (pick < 0) break;
    const b = boxes[pick], part = keys.slice(b.lo, b.hi).sort((x, y) => channel(x, axis) - channel(y, axis));
    let total = 0;
    for (const k of part) total += count[k];
    let acc = 0, cut = 1;
    for (let j = 0; j < part.length - 1; j++) { acc += count[part[j]]; if (acc >= total / 2) { cut = j + 1; break; } }
    for (let j = 0; j < part.length; j++) keys[b.lo + j] = part[j];
    boxes.splice(pick, 1, { lo: b.lo, hi: b.lo + cut }, { lo: b.lo + cut, hi: b.hi });
  }
  const colors = boxes.map((b) => {
    let n = 0, r = 0, g = 0, bl = 0;
    for (let j = b.lo; j < b.hi; j++) { const k = keys[j]; n += count[k]; r += sum[k * 3]; g += sum[k * 3 + 1]; bl += sum[k * 3 + 2]; }
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
  const memo = new Int16Array(32768).fill(-1);
  return {
    colors,
    index: (r, g, b) => {
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      if (memo[k] < 0) {
        let best = 0, bd = Infinity;
        colors.forEach((c, i) => { const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = i; } });
        memo[k] = best;
      }
      return memo[k];
    },
  };
}

/** GIF's variable-width LZW over `indices`, packed least significant bit first. */
function lzw(indices: Uint8Array, minCode: number): number[] {
  const out: number[] = [], clear = 1 << minCode, end = clear + 1;
  let size = minCode + 1, next = end + 1, bits = 0, nbits = 0;
  const put = (code: number): void => {
    bits |= code << nbits; nbits += size;
    while (nbits >= 8) { out.push(bits & 255); bits >>>= 8; nbits -= 8; }
  };
  let dict = new Map<number, number>();
  put(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i], key = (prefix << 8) | c, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    put(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      put(clear);
      dict = new Map();
      size = minCode + 1;
      next = end + 1;
    }
    prefix = c;
  }
  put(prefix);
  put(end);
  if (nbits > 0) out.push(bits & 255);
  return out;
}

/** The GIF file for `frames`, each `width` by `height`, played `plays` times in all, 0 meaning forever. The looping
 *  extension counts repeats after the first play, so one play leaves it out and three plays write two. */
export function encodeGif(frames: GifFrame[], width: number, height: number, plays = 0): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  const u16 = (v: number): void => { bytes.push(v & 255, (v >> 8) & 255); };
  const text = (s: string): void => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); };
  text('GIF89a');
  u16(width); u16(height);
  bytes.push(0, 0, 0);
  if (plays !== 1) { bytes.push(0x21, 0xff, 11); text('NETSCAPE2.0'); bytes.push(3, 1); u16(plays === 0 ? 0 : Math.min(65535, plays - 1)); bytes.push(0); }
  for (const f of frames) {
    const px = f.data.data, n = width * height;
    let clear = false;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 128) { clear = true; break; }
    const pal = palette(px, clear ? 255 : 256), trans = pal.colors.length;
    const count = pal.colors.length + (clear ? 1 : 0);
    let depth = 1;
    while (1 << depth < count) depth++;
    const indices = new Uint8Array(n);
    for (let i = 0, j = 0; j < n; i += 4, j++) indices[j] = px[i + 3] < 128 ? trans : pal.index(px[i], px[i + 1], px[i + 2]);
    // Graphic control: disposal 2 (clear to background) when the frame has transparency, so frames never smear.
    bytes.push(0x21, 0xf9, 4, ((clear ? 2 : 1) << 2) | (clear ? 1 : 0));
    u16(Math.max(0, Math.round(f.delayMs / 10)));
    bytes.push(clear ? trans : 0, 0);
    bytes.push(0x2c); u16(0); u16(0); u16(width); u16(height);
    bytes.push(0x80 | (depth - 1));
    for (let i = 0; i < 1 << depth; i++) { const c = pal.colors[i] ?? [0, 0, 0]; bytes.push(c[0], c[1], c[2]); }
    const minCode = Math.max(2, depth);
    bytes.push(minCode);
    const data = lzw(indices, minCode);
    for (let i = 0; i < data.length; i += 255) { const chunk = data.slice(i, i + 255); bytes.push(chunk.length, ...chunk); }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}
