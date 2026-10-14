/** Normal and bump map maths (DEV_PLAN 31.9). Pure functions over RGBA bytes: no DOM, no canvas. */

/** Luminance 0..1 weighted by alpha, optionally inverted and blurred by three box passes of the given radius. */
export function heightField(rgba: ArrayLike<number>, w: number, h: number, blur: number, invert: boolean): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    const lum = (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255 * (rgba[o + 3] / 255);
    out[i] = invert ? 1 - lum : lum;
  }
  const r = Math.round(blur);
  if (r > 0 && w > 0 && h > 0) {
    const tmp = new Float32Array(Math.max(w, h));
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) boxLine(out, y * w, 1, w, r, tmp);
      for (let x = 0; x < w; x++) boxLine(out, x, w, h, r, tmp);
    }
  }
  return out;
}

/** One clamped-edge box blur along a line of n samples starting at `start` with the given stride. */
function boxLine(a: Float32Array, start: number, stride: number, n: number, r: number, tmp: Float32Array): void {
  const span = 2 * r + 1;
  let sum = 0;
  for (let k = -r; k <= r; k++) sum += a[start + Math.min(n - 1, Math.max(0, k)) * stride];
  for (let i = 0; i < n; i++) {
    tmp[i] = sum / span;
    sum += a[start + Math.min(n - 1, i + r + 1) * stride] - a[start + Math.max(0, i - r) * stride];
  }
  for (let i = 0; i < n; i++) a[start + i * stride] = tmp[i];
}

/** Tangent space normal map from a height field. OpenGL convention (green up) unless flipY. */
export function normalMap(height: Float32Array, w: number, h: number, strength: number, flipY: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x: number, y: number): number => height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  // dy is the slope down the image. OpenGL's +Y is up the image, so a slope rising downward faces up: green above 128.
  const sy = flipY ? -1 : 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
      const nx = -dx * strength, ny = sy * dy * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y * w + x) * 4;
      out[o] = (nx * inv * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      out[o + 2] = (inv * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Greyscale height map, stretched around mid grey by contrast. */
export function bumpMap(height: Float32Array, w: number, h: number, contrast: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = ((height[i] - 0.5) * contrast + 0.5) * 255;
    const o = i * 4;
    out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255;
  }
  return out;
}

/** Integrates an OpenGL tangent space normal map back into a 0..1 height field. A cumulative sum of the
 *  gradients seeds a few hundred Jacobi iterations of the Poisson equation. */
export function heightFromNormal(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const n = w * h;
  const gx = new Float32Array(n), gy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const nx = rgba[o] / 255 * 2 - 1, ny = rgba[o + 1] / 255 * 2 - 1, nz = Math.max(0.05, rgba[o + 2] / 255 * 2 - 1);
    gx[i] = -nx / nz;
    gy[i] = ny / nz;   // OpenGL green up: ny is the slope down the image, as normalMap writes it
  }
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) { s += gx[y * w + x]; a[y * w + x] = s; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) { s += gy[y * w + x]; b[y * w + x] = s; }
  }
  let cur = new Float32Array(n), next = new Float32Array(n);
  for (let i = 0; i < n; i++) cur[i] = (a[i] + b[i]) / 2;
  const div = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      div[i] = gx[i] - (x > 0 ? gx[i - 1] : 0) + gy[i] - (y > 0 ? gy[i - w] : 0);
    }
  }
  for (let it = 0; it < 300; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const l = x > 0 ? cur[i - 1] : cur[i], r = x < w - 1 ? cur[i + 1] : cur[i];
        const u = y > 0 ? cur[i - w] : cur[i], d = y < h - 1 ? cur[i + w] : cur[i];
        next[i] = (l + r + u + d - div[i]) / 4;
      }
    }
    const t = cur; cur = next; next = t;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (cur[i] < lo) lo = cur[i]; if (cur[i] > hi) hi = cur[i]; }
  const span = hi - lo || 1;
  for (let i = 0; i < n; i++) cur[i] = (cur[i] - lo) / span;
  return cur;
}
