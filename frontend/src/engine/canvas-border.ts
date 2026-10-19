/** What Canvas Size puts in the new border: the nearest edge pixel stretched out, the picture's average colour, a
 *  mid grey or noise. The picture arrives as pixels; the result is the whole new canvas with the old area left clear. */
export type BorderMode = 'edge' | 'average' | 'grey' | 'noise';

export const BORDER_MODES: readonly BorderMode[] = ['edge', 'average', 'grey', 'noise'];

/** A small seeded generator, so the same border comes out of the same call. */
const noise = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};

/** The mean colour of `src`, each pixel weighted by its alpha; mid grey for a picture with no coverage. */
export function averageColour(src: ImageData): [number, number, number] {
  const d = src.data;
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; r += d[i] * a; g += d[i + 1] * a; b += d[i + 2] * a; w += a; }
  return w ? [Math.round(r / w), Math.round(g / w), Math.round(b / w)] : [128, 128, 128];
}

/** The new canvas of `width` by `height`, holding `src` at (dx, dy) as clear pixels and the chosen fill everywhere
 *  else. A negative offset or a smaller canvas simply clips `src`. */
export function borderFill(src: ImageData, width: number, height: number, dx: number, dy: number, mode: BorderMode, seed = 1): ImageData {
  const out = new ImageData(width, height), o = out.data, s = src.data, sw = src.width, sh = src.height;
  const rand = noise(seed);
  const avg = mode === 'average' ? averageColour(src) : null;
  for (let y = 0; y < height; y++) {
    const inY = y >= dy && y < dy + sh;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (inY && x >= dx && x < dx + sw) continue;
      if (mode === 'edge') {
        const j = (Math.min(sh - 1, Math.max(0, y - dy)) * sw + Math.min(sw - 1, Math.max(0, x - dx))) * 4;
        o[i] = s[j]; o[i + 1] = s[j + 1]; o[i + 2] = s[j + 2]; o[i + 3] = s[j + 3];
      } else if (mode === 'noise') {
        o[i] = Math.floor(rand() * 256); o[i + 1] = Math.floor(rand() * 256); o[i + 2] = Math.floor(rand() * 256); o[i + 3] = 255;
      } else {
        const c = avg ?? [128, 128, 128];
        o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = 255;
      }
    }
  }
  return out;
}

/** The border as a selection's coverage: 255 outside the old picture's rectangle, 0 inside it. */
export function borderCoverage(width: number, height: number, dx: number, dy: number, oldW: number, oldH: number): Uint8Array {
  const data = new Uint8Array(width * height).fill(255);
  for (let y = Math.max(0, dy); y < Math.min(height, dy + oldH); y++) data.fill(0, y * width + Math.max(0, dx), y * width + Math.min(width, dx + oldW));
  return data;
}
