export type ReplaceMode = 'color' | 'hue' | 'saturation' | 'luminosity';
type Rgb = [number, number, number];

const lum = (c: Rgb): number => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

function clipColor(c: Rgb): Rgb {
  const l = lum(c), n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]);
  let out: Rgb = c;
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as Rgb;
  if (x > 255) out = out.map((v) => l + ((v - l) * (255 - l)) / (x - l)) as Rgb;
  return out;
}

function setLum(c: Rgb, l: number): Rgb {
  const d = l - lum(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

const sat = (c: Rgb): number => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

function setSat(c: Rgb, s: number): Rgb {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b]), out: Rgb = [0, 0, 0];
  const lo = idx[0], mid = idx[1], hi = idx[2];
  if (c[hi] > c[lo]) {
    out[mid] = ((c[mid] - c[lo]) * s) / (c[hi] - c[lo]);
    out[hi] = s;
  }
  return out;
}

/** The pixel `px` recoloured toward `fg` in the given mode (the usual hue, saturation, color and luminosity blends). */
export function recolour(px: Rgb, fg: Rgb, mode: ReplaceMode): Rgb {
  if (mode === 'hue') return setLum(setSat(fg, sat(px)), lum(px));
  if (mode === 'saturation') return setLum(setSat(px, sat(fg)), lum(px));
  if (mode === 'luminosity') return setLum(px, lum(fg));
  return setLum(fg, lum(px));
}

/** Color Replacement's source image: every pixel within `tolerance` percent of `seed` takes on `fg` in `mode`, softly at
 *  the edge of the range; the rest stays as it is, so painting this image over the layer changes only the matching
 *  colours. Returns how many pixels matched fully. */
export function replaceColours(img: ImageData, seed: Rgb, fg: Rgb, tolerance: number, mode: ReplaceMode): number {
  const d = img.data, reach = Math.max(0.5, (tolerance / 100) * 255), soft = reach * 0.7;
  let hit = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const diff = Math.max(Math.abs(d[i] - seed[0]), Math.abs(d[i + 1] - seed[1]), Math.abs(d[i + 2] - seed[2]));
    if (diff > reach) continue;
    const w = diff <= soft ? 1 : 1 - (diff - soft) / (reach - soft);
    const out = recolour([d[i], d[i + 1], d[i + 2]], fg, mode);
    for (let k = 0; k < 3; k++) d[i + k] = Math.round(Math.min(255, Math.max(0, d[i + k] + (out[k] - d[i + k]) * w)));
    if (w === 1) hit++;
  }
  return hit;
}
