import type { Kernel } from './kernels';

const lum = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/** Halation and Glow: what is brighter than `threshold` blurred by `radius` document pixels (three box passes, close to
 *  a Gaussian), tinted (Halation) or in its own colour (Glow), and screened back over the picture by `amount`. */
export function bloom(amount: number, radius: number, threshold: number, tint: [number, number, number] | null, warmth = 0, diffusion = 0): Kernel {
  return (px, ctx) => {
    if (!ctx || amount <= 0) return;
    const W = ctx.width, H = ctx.height, r = Math.max(1, Math.round(radius / Math.max(1e-6, ctx.unitsPerPixel) / 2));
    const ch = [new Float32Array(W * H), new Float32Array(W * H), new Float32Array(W * H)], warm = warmth / 100;
    for (let i = 0, j = 0; j < W * H; i += 4, j++) {
      const R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255, over = Math.max(0, lum(R, G, B) - threshold) / Math.max(1e-3, 1 - threshold);
      if (tint) { ch[0][j] = over * tint[0]; ch[1][j] = over * tint[1]; ch[2][j] = over * tint[2]; } else { ch[0][j] = R * over * (1 + 0.5 * warm); ch[1][j] = G * over; ch[2][j] = B * over * (1 - 0.5 * warm); }
    }
    const wide = diffusion > 0 ? ch.map((c) => Float32Array.from(c)) : null;
    if (wide) for (const c of wide) for (let pass = 0; pass < 3; pass++) boxBlur(c, W, H, r * 3);
    for (const c of ch) for (let pass = 0; pass < 3; pass++) boxBlur(c, W, H, r);
    if (wide) { const d = Math.min(1, diffusion / 100) * 0.7; for (let k = 0; k < 3; k++) for (let j = 0; j < W * H; j++) ch[k][j] = ch[k][j] * (1 - d) + wide[k][j] * d * 1.6; }
    for (let i = 0, j = 0; j < W * H; i += 4, j++) for (let k = 0; k < 3; k++) {
      const base = px[i + k] / 255, add = Math.min(1, ch[k][j] * amount * 1.6);
      px[i + k] = Math.round((1 - (1 - base) * (1 - add)) * 255);
    }
  };
}

/** One box blur pass of radius `r`, horizontally then vertically, in place. */
export function boxBlur(a: Float32Array, W: number, H: number, r: number): void {
  const tmp = new Float32Array(Math.max(W, H)), span = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += a[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) { tmp[x] = sum / span; sum += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; }
    a.set(tmp.subarray(0, W), y * W);
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += a[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) { tmp[y] = sum / span; sum += a[Math.min(H - 1, y + r + 1) * W + x] - a[Math.max(0, y - r) * W + x]; }
    for (let y = 0; y < H; y++) a[y * W + x] = tmp[y];
  }
}
