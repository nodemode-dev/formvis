/** Trap (DEV_PLAN 31.5) over interleaved CMYK floats, 0..1. Lighter colours spread under darker ones: each pixel's C, M
 *  and Y rise to the largest value found among neighbours within `radius` that carry more total ink. K never spreads.
 *  Two separable passes, each carrying the best value per ink among strictly darker neighbours. Returns a new array. */
export function trapInk(data: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius));
  const out = new Float32Array(data);
  if (r === 0 || w < 1 || h < 1) return out;
  // The ink is C, M, Y, K and alpha per pixel (ChannelPixels keeps n + 1 values), so the stride is read from the data.
  const S = Math.max(4, Math.round(data.length / (w * h)));
  const dark = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) dark[i] = data[i * S] + data[i * S + 1] + data[i * S + 2] + data[i * S + 3];
  // Pass 1 (horizontal): per pixel, the darkest neighbour's inks in the row window, and its darkness.
  const hv = new Float32Array(w * h * 3), hd = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let bd = -1, c = 0, m = 0, yy = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) {
        const j = y * w + k;
        if (dark[j] > bd) { bd = dark[j]; c = data[j * S]; m = data[j * S + 1]; yy = data[j * S + 2]; }
      }
      hd[i] = bd; hv[i * 3] = c; hv[i * 3 + 1] = m; hv[i * 3 + 2] = yy;
    }
  }
  // Pass 2 (vertical): the darkest of the row winners; spread only when it is darker than the centre pixel.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      let bd = -1, b = -1;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) {
        const j = k * w + x;
        if (hd[j] > bd) { bd = hd[j]; b = j; }
      }
      if (b < 0 || bd <= dark[i]) continue;
      for (let c = 0; c < 3; c++) {
        const v = hv[b * 3 + c];
        if (v > out[i * S + c]) out[i * S + c] = v;
      }
    }
  }
  return out;
}
