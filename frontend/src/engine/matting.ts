/** Each cell's squared Euclidean distance to the nearest cell set in `seed` (Meijster's two passes: the distance
 *  down each column, then along each row the lower envelope of the parabolas those distances raise); with no seed
 *  at all, a distance past any in the grid. */
export function distanceSquared(seed: Uint8Array, w: number, h: number): Float64Array {
  const far = w + h, g = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    let d = far;
    for (let y = 0; y < h; y++) { d = seed[y * w + x] ? 0 : d + 1; g[y * w + x] = d; }
    for (let y = h - 2; y >= 0; y--) g[y * w + x] = Math.min(g[y * w + x], g[(y + 1) * w + x] + 1);
  }
  const from = new Int32Array(w), start = new Int32Array(w), row = new Float64Array(w);
  const rise = (x: number, i: number): number => (x - i) * (x - i) + row[i] * row[i];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x] = g[y * w + x];
    let top = 0;
    from[0] = 0; start[0] = 0;
    for (let u = 1; u < w; u++) {
      while (top >= 0 && rise(start[top], from[top]) > rise(start[top], u)) top--;
      if (top < 0) { top = 0; from[0] = u; start[0] = 0; continue; }
      const i = from[top], meet = 1 + Math.floor((u * u - i * i + row[u] * row[u] - row[i] * row[i]) / (2 * (u - i)));
      if (meet < w) { top++; from[top] = u; start[top] = meet; }
    }
    for (let x = w - 1; x >= 0; x--) {
      out[y * w + x] = rise(x, from[top]);
      if (x === start[top]) top--;
    }
  }
  return out;
}

/** Layer > Matting > Defringe: the visible pixels within `width` of transparency (alpha 2 or less), by true distance,
 *  are the fringe. They are recoloured from the inside out, a ring of whole-pixel distance at a time, each taking the
 *  mean colour of its eight neighbours already settled (the pixels further in, pure of the old background); one with
 *  none keeps its own. Alpha is kept. */
export function defringe(img: ImageData, width: number): ImageData {
  const { width: w, height: h } = img, s = img.data, out = new Uint8ClampedArray(s), n = w * h, clear = new Uint8Array(n), settled = new Uint8Array(n);
  for (let i = 0; i < n; i++) clear[i] = s[i * 4 + 3] <= 2 ? 1 : 0;
  const away = distanceSquared(clear, w, h), ringOf = (i: number): number => Math.ceil(Math.sqrt(away[i]) - 1e-9), fringe: number[] = [];
  for (let i = 0; i < n; i++) {
    if (clear[i]) continue;
    if (ringOf(i) <= width) fringe.push(i);
    else settled[i] = 1;
  }
  fringe.sort((a, b) => away[b] - away[a]);
  const sum = new Float64Array(3);
  for (let at = 0; at < fringe.length;) {
    const ring = ringOf(fringe[at]), start = at;
    while (at < fringe.length && ringOf(fringe[at]) === ring) at++;
    const done: number[] = [];
    for (let k = start; k < at; k++) {
      const i = fringe[k], x = i % w, y = (i - x) / w;
      let count = 0;
      sum.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !settled[j]) continue;
        sum[0] += out[j * 4]; sum[1] += out[j * 4 + 1]; sum[2] += out[j * 4 + 2]; count++;
      }
      if (count) done.push(i, sum[0] / count, sum[1] / count, sum[2] / count);
    }
    for (let k = 0; k < done.length; k += 4) { const o = done[k] * 4; out[o] = done[k + 1]; out[o + 1] = done[k + 2]; out[o + 2] = done[k + 3]; }
    for (let k = start; k < at; k++) settled[fringe[k]] = 1;
  }
  return new ImageData(out, w, h);
}

/** Layer > Matting > Remove Black Matte or Remove White Matte: the colour of each partly transparent pixel taken back
 *  out of the black or white it was blended with. */
export function removeMatte(img: ImageData, white: boolean): ImageData {
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), d = out.data, m = white ? 255 : 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a <= 0 || a >= 1) continue;
    for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] - m * (1 - a)) / a;
  }
  return out;
}

/** The layer's alpha as a mask (white, at that alpha), and its pixels made opaque. */
export function alphaToMask(img: ImageData): { mask: ImageData; opaque: ImageData } {
  const mask = new ImageData(img.width, img.height), opaque = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), m = mask.data, o = opaque.data;
  for (let i = 0; i < m.length; i += 4) {
    m[i] = m[i + 1] = m[i + 2] = 255;
    m[i + 3] = o[i + 3];
    o[i + 3] = 255;
  }
  return { mask, opaque };
}
