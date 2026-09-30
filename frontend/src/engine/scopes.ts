/** Scopes for Develop (1.53.4): a histogram (R, G, B and Rec. 709 luma), a waveform (luma by column) and a vectorscope
 *  (Rec. 709 colour difference), from an image, sampled to at most MAX pixels so they stay live while sliders move. */
const MAX = 250_000;

function stepOf(img: ImageData): number { return Math.max(1, Math.ceil(Math.sqrt((img.width * img.height) / MAX))); }
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function histogram(img: ImageData): { r: Uint32Array; g: Uint32Array; b: Uint32Array; l: Uint32Array } {
  const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256), d = img.data, st = stepOf(img);
  for (let y = 0; y < img.height; y += st) for (let x = 0; x < img.width; x += st) {
    const i = (y * img.width + x) * 4;
    if (d[i + 3] === 0) continue;
    r[d[i]]++; g[d[i + 1]]++; b[d[i + 2]]++; l[Math.min(255, Math.round(luma(d[i], d[i + 1], d[i + 2])))]++;
  }
  return { r, g, b, l };
}

/** Luma (bottom 0, top 255) by column, `w` columns by `h` levels. */
export function waveform(img: ImageData, w = 256, h = 128): Uint32Array {
  const out = new Uint32Array(w * h), d = img.data, st = stepOf(img);
  for (let y = 0; y < img.height; y += st) for (let x = 0; x < img.width; x += st) {
    const i = (y * img.width + x) * 4;
    if (d[i + 3] === 0) continue;
    const col = Math.min(w - 1, Math.floor((x / img.width) * w)), row = h - 1 - Math.min(h - 1, Math.floor((luma(d[i], d[i + 1], d[i + 2]) / 256) * h));
    out[row * w + col]++;
  }
  return out;
}

/** Rec. 709 Cb (right) and Cr (up) on a `size` square, the centre neutral. */
export function vectorscope(img: ImageData, size = 128): Uint32Array {
  const out = new Uint32Array(size * size), d = img.data, st = stepOf(img), half = size / 2;
  for (let y = 0; y < img.height; y += st) for (let x = 0; x < img.width; x += st) {
    const i = (y * img.width + x) * 4;
    if (d[i + 3] === 0) continue;
    const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255, Y = luma(R, G, B);
    const cb = (B - Y) / 1.8556, cr = (R - Y) / 1.5748;   // each within -0.5 to 0.5
    const px = Math.min(size - 1, Math.max(0, Math.round(half + cb * size))), py = Math.min(size - 1, Math.max(0, Math.round(half - cr * size)));
    out[py * size + px]++;
  }
  return out;
}

/** The angle of the skin-tone line on the vectorscope, in degrees from Cb's axis (Rec. 709, about 123 degrees). */
export const SKIN_LINE_DEGREES = 123;
