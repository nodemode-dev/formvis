/** The document's depth map: 16 bits a pixel, near high and far low, computed once from what the document shows and
 *  kept with the document. `key` names the pixels it was read from, so a change to them makes it stale. */

export interface DocDepth { w: number; h: number; key: string; data: Uint16Array }

/** A hash of the picture the depth was read from (FNV-1a over its words, with its size). */
export function depthKey(img: ImageData): string {
  const words = new Uint32Array(img.data.buffer, img.data.byteOffset, img.data.byteLength >> 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i], 0x01000193);
  return `${img.width}x${img.height}:${(h >>> 0).toString(16)}`;
}

export function depthFromValues(values: Float32Array, w: number, h: number, key: string): DocDepth {
  const data = new Uint16Array(values.length);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, values[i])) * 65535);
  return { w, h, key, data };
}

/** The depth as 0 to 1 floats at `w` by `h` (nearest sample when the sizes differ). */
export function depthFloats(d: DocDepth, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(d.h - 1, Math.floor(((y + 0.5) * d.h) / h));
    for (let x = 0; x < w; x++) out[y * w + x] = d.data[sy * d.w + Math.min(d.w - 1, Math.floor(((x + 0.5) * d.w) / w))] / 65535;
  }
  return out;
}

/** The depth as grey bytes at `w` by `h`. */
export function depthBytes(d: DocDepth, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(d.h - 1, Math.floor(((y + 0.5) * d.h) / h));
    for (let x = 0; x < w; x++) out[y * w + x] = d.data[sy * d.w + Math.min(d.w - 1, Math.floor(((x + 0.5) * d.w) / w))] >> 8;
  }
  return out;
}

/** One 0 to 255 weight per pixel: fully selected between `far` and `near` (percent of the range, near high), falling
 *  to none over `feather` percent beyond each end. */
export function depthRangeMask(d: DocDepth, near: number, far: number, feather: number): Uint8Array {
  const lo = Math.min(near, far) / 100, hi = Math.max(near, far) / 100, soft = Math.max(0, feather) / 100, out = new Uint8Array(d.data.length);
  for (let i = 0; i < out.length; i++) {
    const v = d.data[i] / 65535;
    if (v >= lo && v <= hi) { out[i] = 255; continue; }
    if (soft <= 0) continue;
    const t = 1 - (v < lo ? lo - v : v - hi) / soft;
    out[i] = t <= 0 ? 0 : Math.round(t * t * (3 - 2 * t) * 255);
  }
  return out;
}

export function depthToBytes(d: DocDepth): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(d.data.length * 2));
  for (let i = 0; i < d.data.length; i++) { out[i * 2] = d.data[i] & 255; out[i * 2 + 1] = d.data[i] >> 8; }
  return out;
}

export function depthFromBytes(bytes: Uint8Array, w: number, h: number, key: string): DocDepth | null {
  if (bytes.length !== w * h * 2) return null;
  const data = new Uint16Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  return { w, h, key, data };
}
