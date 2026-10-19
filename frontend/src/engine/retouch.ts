import { clamp, type Pt, type Rect } from './types';
import { gaussianBlur, gaussianMargin } from './filters';

/** Retouching for formvis, written from published methods. Spot Healing picks a source patch whose surrounding ring
 *  best matches the spot's own ring (least squared difference), then heals it as in Poisson image editing (Perez,
 *  Gangnet and Blake, 2003): the source's texture is kept, and a harmonic correction, solved coarse to fine, makes it
 *  meet the spot's edge without a seam. Create Texture instead fills the spot with the harmonic interpolation of its
 *  edge plus grain matched to the ring's fine detail. Content-Aware Fill is exemplar-based inpainting (Criminisi,
 *  Perez and Toyama, 2004): whole patches from the surroundings are copied into the hole from its edge inward,
 *  confident, structure-carrying spots first. Smudge and Liquify are brush warps: Liquify pushes pixels along the
 *  stroke, Smudge drags paint picked up where the stroke began. Everything works on premultiplied pixels. */

export type HealMode = 'contentAware' | 'createTexture' | 'proximityMatch';
/** The Healing Brush's and Spot Healing's Mode menu. */
export type HealBlend = 'normal' | 'replace' | 'multiply' | 'screen' | 'darken' | 'lighten' | 'color' | 'luminosity';
/** The Healing Brush's Sample menu: the active layer, it and the layers under it, or every layer shown. */
export type HealSample = 'current' | 'below' | 'all';
export const HEAL_SAMPLES: ReadonlyArray<{ id: HealSample; label: string }> = [
  { id: 'current', label: 'Current Layer' }, { id: 'below', label: 'Current & Below' }, { id: 'all', label: 'All Layers' },
];
export const HEAL_BLENDS: ReadonlyArray<{ id: HealBlend; label: string }> = [
  { id: 'normal', label: 'Normal' }, { id: 'replace', label: 'Replace' }, { id: 'multiply', label: 'Multiply' }, { id: 'screen', label: 'Screen' },
  { id: 'darken', label: 'Darken' }, { id: 'lighten', label: 'Lighten' }, { id: 'color', label: 'Color' }, { id: 'luminosity', label: 'Luminosity' },
];

/** The alpha of an RGBA coverage with its edge faded inward over `r` pixels (a box-blurred copy of the alpha, read as a ramp
 *  that is 0 at the edge and 1 `r` pixels inside; the image border does not fade). `r` of 0 is the alpha as it is. */
export function featherEdge(rgba: Uint8ClampedArray, w: number, h: number, r: number): Uint8Array {
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = rgba[i * 4 + 3];
  if (r < 1) return a;
  const f = new Float32Array(w * h), g = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += a[o + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      f[o + x] = s / n;
      s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += f[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      g[y * w + x] = s / n;
      s += f[Math.min(h - 1, y + r + 1) * w + x] - f[Math.max(0, y - r) * w + x];
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.min(a[i], Math.min(1, Math.max(0, (g[i] / 255 - 0.5) * 2)) * 255));
  return out;
}

/** Straight RGBA to premultiplied, 8 bits per channel. */
export function premultiply(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    out[i] = Math.round((rgba[i] * a) / 255);
    out[i + 1] = Math.round((rgba[i + 1] * a) / 255);
    out[i + 2] = Math.round((rgba[i + 2] * a) / 255);
    out[i + 3] = a;
  }
  return out;
}

/** Premultiplied back to straight RGBA over bytes `from` to `to`; zero alpha becomes transparent black. */
export function unpremultiply(p: Uint8ClampedArray, out: Uint8ClampedArray, from = 0, to = p.length): void {
  for (let i = from; i < to; i += 4) {
    const a = p[i + 3];
    if (a === 0) { out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0; continue; }
    const k = 255 / a;
    out[i] = Math.min(255, Math.round(p[i] * k));
    out[i + 1] = Math.min(255, Math.round(p[i + 1] * k));
    out[i + 2] = Math.min(255, Math.round(p[i + 2] * k));
    out[i + 3] = a;
  }
}

/** A seeded generator of uniform values in [0, 1), SplitMix32 style. */
function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let z = Math.imul(state ^ (state >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return ((z ^ (z >>> 16)) >>> 0) / 4294967296;
  };
}

const EXCLUDED = 0, FIXED = 1, FREE = 2;

/** Solves Laplace's equation over a grid of 4-channel values: every FREE cell ends as the mean of its non-excluded
 *  4-neighbours while FIXED cells hold, so the free region takes the smoothest values that meet its boundary. A half-
 *  size version is solved first and spread back up as the starting point, then successive over-relaxation settles
 *  this size; the coarsest grid starts from the mean of its fixed cells. */
function solveMembrane(v: Float32Array, state: Uint8Array, w: number, h: number): void {
  let free = 0, fixed = 0;
  for (let i = 0; i < state.length; i++) { if (state[i] === FREE) free++; else if (state[i] === FIXED) fixed++; }
  if (!free) return;
  let seeded = false;
  if (w > 4 && h > 4 && free > 64) {
    const cw = (w + 1) >> 1, ch = (h + 1) >> 1, cn = cw * ch;
    const cv = new Float32Array(cn * 4), cstate = new Uint8Array(cn), hits = new Uint16Array(cn);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x, s = state[p];
        if (s === EXCLUDED) continue;
        const q = (y >> 1) * cw + (x >> 1);
        if (s === FIXED) {
          hits[q]++;
          cstate[q] = FIXED;
          for (let c = 0; c < 4; c++) cv[q * 4 + c] += v[p * 4 + c];
        } else if (cstate[q] !== FIXED) cstate[q] = FREE;
      }
    }
    for (let q = 0; q < cn; q++) if (cstate[q] === FIXED) for (let c = 0; c < 4; c++) cv[q * 4 + c] /= hits[q];
    solveMembrane(cv, cstate, cw, ch);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (state[p] !== FREE) continue;
        const q = (y >> 1) * cw + (x >> 1);
        for (let c = 0; c < 4; c++) v[p * 4 + c] = cv[q * 4 + c];
      }
    }
    seeded = true;
  }
  const cells = new Int32Array(free);
  const mean = [0, 0, 0, 0];
  for (let i = 0, k = 0; i < state.length; i++) {
    if (state[i] === FREE) cells[k++] = i;
    else if (state[i] === FIXED) for (let c = 0; c < 4; c++) mean[c] += v[i * 4 + c];
  }
  if (!seeded) for (const p of cells) for (let c = 0; c < 4; c++) v[p * 4 + c] = fixed ? mean[c] / fixed : 0;
  const sweeps = seeded ? 40 : 300, omega = 1.8, last = w * h;
  for (let s = 0; s < sweeps; s++) {
    for (let j = 0; j < cells.length; j++) {
      const p = cells[j], x = p % w;
      let n = 0, r = 0, g = 0, b = 0, a = 0;
      if (x > 0 && state[p - 1] !== EXCLUDED) { const o = (p - 1) * 4; r += v[o]; g += v[o + 1]; b += v[o + 2]; a += v[o + 3]; n++; }
      if (x < w - 1 && state[p + 1] !== EXCLUDED) { const o = (p + 1) * 4; r += v[o]; g += v[o + 1]; b += v[o + 2]; a += v[o + 3]; n++; }
      if (p >= w && state[p - w] !== EXCLUDED) { const o = (p - w) * 4; r += v[o]; g += v[o + 1]; b += v[o + 2]; a += v[o + 3]; n++; }
      if (p + w < last && state[p + w] !== EXCLUDED) { const o = (p + w) * 4; r += v[o]; g += v[o + 1]; b += v[o + 2]; a += v[o + 3]; n++; }
      if (n === 0) continue;
      const o = p * 4;
      v[o] += omega * (r / n - v[o]);
      v[o + 1] += omega * (g / n - v[o + 1]);
      v[o + 2] += omega * (b / n - v[o + 2]);
      v[o + 3] += omega * (a / n - v[o + 3]);
    }
  }
}

/** Fills the see-through pixels of straight-alpha `img` (alpha under half) with the smoothest colours that meet the
 *  visible pixels around them, the same harmonic membrane Spot Healing uses, and makes the whole image opaque: what a
 *  generative model should see in place of a void. Returns how many pixels were filled; with nothing to fill, or
 *  nothing visible to fill from, the image is left as it was. */
export function fillTransparent(img: ImageData): number {
  const { width: w, height: h, data: d } = img, n = w * h;
  const v = new Float32Array(n * 4), state = new Uint8Array(n);
  let holes = 0;
  for (let p = 0; p < n; p++) {
    const o = p * 4;
    if (d[o + 3] < 128) { state[p] = FREE; holes++; continue; }
    state[p] = FIXED;
    v[o] = d[o]; v[o + 1] = d[o + 1]; v[o + 2] = d[o + 2]; v[o + 3] = 255;
  }
  if (!holes || holes === n) return 0;
  solveMembrane(v, state, w, h);
  for (let p = 0; p < n; p++) {
    const o = p * 4;
    if (state[p] === FREE) for (let c = 0; c < 3; c++) d[o + c] = Math.round(clamp(v[o + c], 0, 255));
    d[o + 3] = 255;
  }
  return holes;
}

/** 1 wherever a set cell lies within `r` cells horizontally and vertically (a square dilation, done as two passes). */
function dilate(set: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const across = new Uint8Array(set.length), out = new Uint8Array(set.length);
  for (let y = 0; y < h; y++) {
    let lastSet = -Infinity;
    for (let x = 0; x < w; x++) { if (set[y * w + x]) lastSet = x; if (x - lastSet <= r) across[y * w + x] = 1; }
    lastSet = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (set[y * w + x]) lastSet = x; if (lastSet - x <= r) across[y * w + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let lastSet = -Infinity;
    for (let y = 0; y < h; y++) { if (across[y * w + x]) lastSet = y; if (y - lastSet <= r) out[y * w + x] = 1; }
    lastSet = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (across[y * w + x]) lastSet = y; if (lastSet - y <= r) out[y * w + x] = 1; }
  }
  return out;
}

interface HealWindow { x0: number; y0: number; w: number; h: number; spot: number[]; ring: number[] }

/** The offset of the best source for a spot: candidates on circles far enough out that the source never overlaps the
 *  spot, scored by the mean squared difference between the two rings, the winner then refined a few pixels either
 *  way. Proximity Match searches only the nearest circles and leans toward nearer candidates. */
function findSource(px: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, win: HealWindow, extent: number, ringWidth: number, mode: HealMode): { dx: number; dy: number } | null {
  const image = (p: number): number => (Math.floor(p / win.w) + win.y0) * W + (p % win.w) + win.x0;
  const ringAt = win.ring.map(image), allAt = win.spot.map(image).concat(ringAt);
  const nearest = extent + ringWidth + 1;
  const circles = mode === 'proximityMatch' ? [1, 1.25] : [1, 1.4, 1.9, 2.6, 3.5];
  let best: { dx: number; dy: number; lean: number } | null = null, bestScore = Infinity;
  const consider = (dx: number, dy: number, lean: number): void => {
    if (win.x0 + dx < 0 || win.y0 + dy < 0 || win.x0 + win.w - 1 + dx >= W || win.y0 + win.h - 1 + dy >= H) return;
    const shift = dy * W + dx;
    for (const p of allAt) if (coverage[p + shift]) return;
    const limit = (bestScore / lean) * ringAt.length;
    let sum = 0;
    for (const p of ringAt) {
      const t = p * 4, s = (p + shift) * 4;
      const d0 = px[t] - px[s], d1 = px[t + 1] - px[s + 1], d2 = px[t + 2] - px[s + 2], d3 = px[t + 3] - px[s + 3];
      sum += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
      if (sum >= limit) return;
    }
    const score = (sum / ringAt.length) * lean;
    if (score < bestScore) { bestScore = score; best = { dx, dy, lean }; }
  };
  circles.forEach((scale, ci) => {
    const lean = mode === 'proximityMatch' ? 1 + 0.35 * (scale - 1) * 4 : 1;
    for (let k = 0; k < 24; k++) {
      const angle = ((k + (ci % 2) * 0.5) * Math.PI) / 12;
      consider(Math.round(Math.cos(angle) * nearest * scale), Math.round(Math.sin(angle) * nearest * scale), lean);
    }
  });
  const coarse = best as { dx: number; dy: number; lean: number } | null;
  if (!coarse) return null;
  for (let ry = -3; ry <= 3; ry++) for (let rx = -3; rx <= 3; rx++) if (rx || ry) consider(coarse.dx + rx, coarse.dy + ry, coarse.lean);
  const found = best as { dx: number; dy: number; lean: number } | null;
  return found ? { dx: found.dx, dy: found.dy } : null;
}

/** The healing window around the pixels under `coverage`: the spot, a ring around it (a square dilation a tenth of the
 *  spot's size, 2 to 8 px) and the window's place; null when there is no spot or no ring. */
function healWindow(coverage: Uint8Array, W: number, H: number): { win: HealWindow; extent: number; ringWidth: number; inSpot: Uint8Array } | null {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0, row = y * W; x < W; x++) {
      if (!coverage[row + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return null;
  const extent = Math.max(x1 - x0 + 1, y1 - y0 + 1), ringWidth = clamp(Math.round(extent / 10), 2, 8);
  const wx0 = Math.max(0, x0 - ringWidth), wy0 = Math.max(0, y0 - ringWidth);
  const ww = Math.min(W - 1, x1 + ringWidth) - wx0 + 1, wh = Math.min(H - 1, y1 + ringWidth) - wy0 + 1, n = ww * wh;
  const inSpot = new Uint8Array(n);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) inSpot[y * ww + x] = coverage[(y + wy0) * W + x + wx0] ? 1 : 0;
  const near = dilate(inSpot, ww, wh, ringWidth);
  const win: HealWindow = { x0: wx0, y0: wy0, w: ww, h: wh, spot: [], ring: [] };
  for (let p = 0; p < n; p++) { if (inSpot[p]) win.spot.push(p); else if (near[p]) win.ring.push(p); }
  return win.ring.length ? { win, extent, ringWidth, inSpot } : null;
}

/** For each pixel with coverage at or above 128, its distance in pixels to the nearest pixel below it (the area's edge),
 *  by the standard two-pass chamfer transform (steps 3 and 4, divided by 3); 0 outside. The Patch tool's Diffusion
 *  fades its colour correction with this distance. */
export function insideDistance(coverage: Uint8Array, W: number, H: number): Float32Array {
  const INF = 1e9, d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = coverage[i] >= 128 ? INF : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3); else v = Math.min(v, 3);
    if (y > 0) { v = Math.min(v, d[i - W] + 3); if (x > 0) v = Math.min(v, d[i - W - 1] + 4); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4); } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 3); else v = Math.min(v, 3);
    if (y < H - 1) { v = Math.min(v, d[i + W] + 3); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4); if (x > 0) v = Math.min(v, d[i + W - 1] + 4); } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** Diffusion and Color for the healing tools: scales the heal's colour correction, the difference between the healed
 *  pixels and a plain copy of the source (dx, dy) away, for pixels with coverage at or above 128. Diffusion (1 to 7)
 *  fades it with the distance inside the edge over 2^Diffusion px, 7 keeping it everywhere; `colour` (0 to 1) scales
 *  it, 0 leaving a plain copy. `opacity` is what the heal was applied at: the full-strength heal is recovered, scaled,
 *  and mixed back at that opacity. `out` is changed in place; `before` is the pixels as they were. */
export function scaleHealCorrection(out: Uint8ClampedArray, before: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, dx: number, dy: number, diffusion: number, colour: number, opacity = 1, source?: Uint8ClampedArray): void {
  const diff = Math.round(Math.min(7, Math.max(1, diffusion))), col = Math.min(1, Math.max(0, colour)), op = Math.min(1, Math.max(0, opacity));
  if ((diff >= 7 && col >= 1) || op <= 0) return;
  const dist = diff < 7 ? insideDistance(coverage, W, H) : null, L = 2 ** diff, from = source ?? before;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (coverage[i] < 128) continue;
    const w = col * (dist ? Math.exp(-dist[i] / L) : 1);
    const s = (Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))) * 4;
    for (let ch = 0; ch < 3; ch++) {
      const b = before[i * 4 + ch], full = b + (out[i * 4 + ch] - b) / op, raw = from[s + ch];
      out[i * 4 + ch] = Math.round(b + op * (raw + w * (full - raw) - b));
    }
  }
}

/** Healing Brush and Patch: fills the pixels under `coverage` from the pixels (dx, dy) away, then corrects them with the
 *  harmonic membrane so they meet the area's edge without a seam, as in Poisson image editing. The source is read from
 *  the pixels as they were, since it may overlap the area, and is clamped to the image's edge. Returns false when
 *  there is nothing to heal. */
export function healFromSource(rgba: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, opacity: number, dx: number, dy: number, source?: Uint8ClampedArray): boolean {
  const hw = healWindow(coverage, W, H);
  if (!hw) return false;
  // `source` (same size, premultiplied): heal from another image, such as a tiled pattern, instead of these pixels.
  const { win } = hw, ww = win.w, n = ww * win.h, original = rgba.slice(), src = source ?? original;
  const at = (p: number): number => (Math.floor(p / ww) + win.y0) * W + (p % ww) + win.x0;
  const from = (g: number): number => { const x = g % W, y = (g - x) / W; return (clamp(y + dy, 0, H - 1) * W + clamp(x + dx, 0, W - 1)) * 4; };
  const v = new Float32Array(n * 4), state = new Uint8Array(n);
  for (const p of win.ring) {
    state[p] = FIXED;
    const t = at(p) * 4, s = from(at(p));
    for (let c = 0; c < 4; c++) v[p * 4 + c] = original[t + c] - src[s + c];
  }
  for (const p of win.spot) state[p] = FREE;
  solveMembrane(v, state, ww, win.h);
  const f = [0, 0, 0, 0], strength = clamp(opacity, 0, 1);
  for (const p of win.spot) {
    const g = at(p), t = g * 4, s = from(g);
    for (let c = 0; c < 4; c++) f[c] = v[p * 4 + c] + src[s + c];
    f[3] = clamp(f[3], 0, 255);
    for (let c = 0; c < 3; c++) f[c] = clamp(f[c], 0, f[3]);
    const k = (coverage[g] / 255) * strength;
    for (let c = 0; c < 4; c++) rgba[t + c] = Math.round(original[t + c] + (f[c] - original[t + c]) * k);
  }
  return true;
}

/** Spot Healing: heals the pixels under `coverage` (0 to 255 per pixel) in premultiplied `rgba`, blended by coverage
 *  times `opacity`. Returns false when there is no spot or nothing around it to heal from. */
export function spotHeal(rgba: Uint8ClampedArray, coverage: Uint8Array, W: number, H: number, opacity: number, mode: HealMode, seed: number): boolean {
  const hw = healWindow(coverage, W, H);
  if (!hw) return false;
  const { win, extent, ringWidth, inSpot } = hw, ww = win.w, wh = win.h, wx0 = win.x0, wy0 = win.y0, n = ww * wh;
  const image = (p: number): number => (Math.floor(p / ww) + wy0) * W + (p % ww) + wx0;
  const source = mode === 'createTexture' ? null : findSource(rgba, coverage, W, H, win, extent, ringWidth, mode);
  const shift = source ? source.dy * W + source.dx : 0;
  // The membrane: what the source (or nothing, for Create Texture) must gain to meet the ring exactly.
  const v = new Float32Array(n * 4), state = new Uint8Array(n);
  for (const p of win.ring) {
    state[p] = FIXED;
    const t = image(p) * 4, s = (image(p) + shift) * 4;
    for (let c = 0; c < 4; c++) v[p * 4 + c] = rgba[t + c] - (source ? rgba[s + c] : 0);
  }
  for (const p of win.spot) state[p] = FREE;
  solveMembrane(v, state, ww, wh);
  // Create Texture's grain: as strong as the ring's fine detail, its deviation from each pixel's 3 by 3 neighbourhood.
  let grain = 0;
  if (!source && mode === 'createTexture') {
    let sum = 0, count = 0;
    for (const p of win.ring) {
      const x = p % ww, y = (p - x) / ww;
      let local = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= ww || yy >= wh || inSpot[yy * ww + xx]) continue;
        const o = image(yy * ww + xx) * 4;
        local += (rgba[o] + rgba[o + 1] + rgba[o + 2]) / 3;
        k++;
      }
      const o = image(p) * 4, dev = (rgba[o] + rgba[o + 1] + rgba[o + 2]) / 3 - local / k;
      sum += dev * dev;
      count++;
    }
    grain = count ? Math.sqrt(sum / count) : 0;
  }
  const random = seededRandom(seed);
  const f = [0, 0, 0, 0];
  for (const p of win.spot) {
    const g = image(p), t = g * 4, s = (g + shift) * 4;
    for (let c = 0; c < 4; c++) f[c] = v[p * 4 + c] + (source ? rgba[s + c] : 0);
    f[3] = clamp(f[3], 0, 255);
    if (grain > 0) {
      const u1 = Math.max(1e-12, random()), u2 = random();
      const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * grain * (f[3] / 255);
      for (let c = 0; c < 3; c++) f[c] += noise;
    }
    for (let c = 0; c < 3; c++) f[c] = clamp(f[c], 0, f[3]);
    const k = (coverage[g] / 255) * clamp(opacity, 0, 1);
    for (let c = 0; c < 4; c++) rgba[t + c] = Math.round(rgba[t + c] + (f[c] - rgba[t + c]) * k);
  }
  return true;
}

/** Content-Aware Fill's adaptation settings: how far a candidate patch may be recoloured toward
 *  the known pixels around the target (colour: 0 None, 1 Default, 2 High, 3 Very High), turned (rotation: 0 None to 4
 *  Full), scaled (0.8 to 1.25) or flipped left to right before it is compared and copied. */
export interface FillOptions { color: number; rotation: number; scale: boolean; mirror: boolean }
/** What the workspace and its OK start from: no adaptation, so the fill is as fast as before and gives the same result.
 *  Colour level 1 ("Default", a brightness offset of at most 12 levels, no gain) is a choice, not the start: measured at
 *  1.71.5 on a 30 px hole in 160 by 120 px, any colour adaptation took about 480 ms against 62 ms without, because its
 *  statistics pass cannot stop early the way the cost comparison does. */
export const FILL_DEFAULTS: FillOptions = { color: 0, rotation: 0, scale: false, mirror: false };
const FILL_NONE: FillOptions = { color: 0, rotation: 0, scale: false, mirror: false };
/** Per colour level: smallest gain, largest gain, largest offset (in 0..255 levels). Level 0 is off. */
const FILL_COLOR: ReadonlyArray<readonly [number, number, number]> = [[1, 1, 0], [1, 1, 12], [0.8, 1.25, 40], [0.6, 1.6, 80]];
const FILL_ANGLES: ReadonlyArray<readonly number[]> = [[], [-15, 15], [-45, -15, 15, 45], [-90, -45, -15, 15, 45, 90], [-135, -90, -45, -15, 15, 45, 90, 135, 180]];

/** The ring variance (see ringVariance) below which Remove counts a hole as sitting in a smooth area: a standard
 *  deviation of about 12 levels. A plain gradient measured about 43; noise of 20 levels measures about 400. */
export const SMOOTH_RING_VARIANCE = 150;

/** How much the pixels just outside a hole vary: the largest per-channel variance (0 to 65025) of the known pixels in a
 *  ring about `ring` pixels wide around the set pixels of `hole`, in premultiplied `px`. Remove's quick path runs
 *  only when this is small (a smooth area). Returns Infinity when the hole has no known pixel around it. */
export function ringVariance(px: Uint8ClampedArray, hole: Uint8Array, w: number, h: number, ring = 6): number {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hole[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return 0;
  const rx0 = Math.max(0, x0 - ring), ry0 = Math.max(0, y0 - ring), rx1 = Math.min(w - 1, x1 + ring), ry1 = Math.min(h - 1, y1 + ring);
  const sum = [0, 0, 0, 0], sq = [0, 0, 0, 0];
  let n = 0;
  for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
    const i = y * w + x;
    if (hole[i]) continue;
    let near = false;
    for (let dy = -ring; dy <= ring && !near; dy += 2) for (let dx = -ring; dx <= ring; dx += 2) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && hole[yy * w + xx]) { near = true; break; }
    }
    if (!near) continue;
    for (let c = 0; c < 4; c++) { const v = px[i * 4 + c]; sum[c] += v; sq[c] += v * v; }
    n++;
  }
  if (n < 8) return Infinity;
  let worst = 0;
  for (let c = 0; c < 4; c++) { const m = sum[c] / n; worst = Math.max(worst, sq[c] / n - m * m); }
  return worst;
}

/** Diffusion fill (a quick path for Remove): fills the pixels where `hole` is set in premultiplied `px` by a pyramid.
 *  The picture is halved again and again with the hole left out of every average, the coarsest level's remaining gaps
 *  are filled by averaging their known neighbours, and each level back up takes the enlarged coarser level only where
 *  its own pixels are unknown (known pixels are kept), softened by two neighbour averages. Smooth and fast, with no
 *  texture; it works on a window around the hole. Returns false when nothing is known to fill from. */
export function diffusionFill(px: Uint8ClampedArray, hole: Uint8Array, w: number, h: number): boolean {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hole[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return true;
  const m = Math.max(8, Math.max(x1 - x0, y1 - y0) + 1);
  const ox = Math.max(0, x0 - m), oy = Math.max(0, y0 - m), cw = Math.min(w, x1 + m + 1) - ox, ch = Math.min(h, y1 + m + 1) - oy;
  type Level = { w: number; h: number; v: Float32Array; k: Uint8Array };
  const base: Level = { w: cw, h: ch, v: new Float32Array(cw * ch * 4), k: new Uint8Array(cw * ch) };
  let known = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const s = (y + oy) * w + x + ox, d = y * cw + x;
    if (hole[s]) continue;
    base.k[d] = 1; known++;
    for (let c = 0; c < 4; c++) base.v[d * 4 + c] = px[s * 4 + c];
  }
  if (!known) return false;
  const levels: Level[] = [base];
  for (;;) {
    const a = levels[levels.length - 1];
    if (a.k.every((f) => f === 1) || (a.w <= 2 && a.h <= 2)) break;
    const nw = Math.max(1, (a.w + 1) >> 1), nh = Math.max(1, (a.h + 1) >> 1), b: Level = { w: nw, h: nh, v: new Float32Array(nw * nh * 4), k: new Uint8Array(nw * nh) };
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let n = 0;
      const acc = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = x * 2 + dx, sy = y * 2 + dy;
        if (sx >= a.w || sy >= a.h || !a.k[sy * a.w + sx]) continue;
        n++;
        for (let c = 0; c < 4; c++) acc[c] += a.v[(sy * a.w + sx) * 4 + c];
      }
      if (!n) continue;
      b.k[y * nw + x] = 1;
      for (let c = 0; c < 4; c++) b.v[(y * nw + x) * 4 + c] = acc[c] / n;
    }
    levels.push(b);
  }
  // The coarsest level: unknown cells take the average of their known neighbours, round after round, until none is left.
  const top = levels[levels.length - 1];
  for (let guard = 0; guard < top.w + top.h + 4 && !top.k.every((f) => f === 1); guard++) {
    const set: number[] = [];
    const nv = new Map<number, number[]>();
    for (let y = 0; y < top.h; y++) for (let x = 0; x < top.w; x++) {
      const i = y * top.w + x;
      if (top.k[i]) continue;
      let n = 0;
      const acc = [0, 0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((dx || dy) && xx >= 0 && yy >= 0 && xx < top.w && yy < top.h && top.k[yy * top.w + xx]) { n++; for (let c = 0; c < 4; c++) acc[c] += top.v[(yy * top.w + xx) * 4 + c]; }
      }
      if (n) { set.push(i); nv.set(i, acc.map((v) => v / n)); }
    }
    if (!set.length) break;
    for (const i of set) { top.k[i] = 1; const v = nv.get(i) as number[]; for (let c = 0; c < 4; c++) top.v[i * 4 + c] = v[c]; }
  }
  // Back up: the finer level takes the enlarged coarser one where it is unknown, then two neighbour averages soften those cells.
  for (let li = levels.length - 2; li >= 0; li--) {
    const f = levels[li], c = levels[li + 1], was = f.k.slice();
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x;
      if (was[i]) continue;
      const fx = Math.min(c.w - 1, Math.max(0, (x - 0.5) / 2)), fy = Math.min(c.h - 1, Math.max(0, (y - 0.5) / 2)), ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const jx = Math.min(c.w - 1, ix + 1), jy = Math.min(c.h - 1, iy + 1);
      for (let ch2 = 0; ch2 < 4; ch2++) {
        const g = (xx: number, yy: number): number => c.v[(yy * c.w + xx) * 4 + ch2];
        f.v[i * 4 + ch2] = (g(ix, iy) * (1 - tx) + g(jx, iy) * tx) * (1 - ty) + (g(ix, jy) * (1 - tx) + g(jx, jy) * tx) * ty;
      }
      f.k[i] = 1;
    }
    for (let pass = 0; pass < 2; pass++) {
      const prev = f.v.slice();
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        if (was[i]) continue;
        for (let c2 = 0; c2 < 4; c2++) {
          let s = 0, n = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < f.w && yy < f.h) { s += prev[(yy * f.w + xx) * 4 + c2]; n++; } }
          f.v[i * 4 + c2] = (prev[i * 4 + c2] + s) / (n + 1);
        }
      }
    }
  }
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const s = (y + oy) * w + x + ox;
    if (!hole[s]) continue;
    for (let c = 0; c < 4; c++) px[s * 4 + c] = Math.max(0, Math.min(255, Math.round(base.v[(y * cw + x) * 4 + c])));
  }
  return true;
}

/** Content-Aware Fill: fills the pixels where `mask` is set in premultiplied `px` from the surrounding image. Returns
 *  false when there is nothing opaque around the hole, or no whole patch of the surroundings to copy from. `options`
 *  adds the workspace's adaptation: extra rotated, scaled and mirrored candidates (searched on a bounded subsample, at
 *  most about 6000 more than the 8000 plain ones) and a per-candidate gain and offset per colour channel. The default,
 *  no options, is the plain search with no colour adaptation. */
export function contentFill(px: Uint8ClampedArray, mask: Uint8Array, w: number, h: number, allow: Uint8Array | null = null, options: FillOptions = FILL_NONE): boolean {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0, row = y * w; x < w; x++) {
      if (!mask[row + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return true;
  const extent = Math.max(x1 - x0 + 1, y1 - y0 + 1), half = extent > 48 ? 4 : 3, side = 2 * half + 1;
  const margin = Math.max(side * 3, Math.min(160, extent));
  let rx0 = Math.max(0, x0 - margin), ry0 = Math.max(0, y0 - margin), rx1 = Math.min(w - 1, x1 + margin), ry1 = Math.min(h - 1, y1 + margin);
  // A sampling area (Content-Aware Fill's workspace) may lie beyond the margin: the region grows to take it in.
  if (allow) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (allow[y * w + x]) { rx0 = Math.min(rx0, x); ry0 = Math.min(ry0, y); rx1 = Math.max(rx1, x); ry1 = Math.max(ry1, y); }
  const rw = rx1 - rx0 + 1, rh = ry1 - ry0 + 1, rn = rw * rh;
  const global = (l: number): number => ((Math.floor(l / rw) + ry0) * w + (l % rw) + rx0) * 4;
  const unknown = new Uint8Array(rn);
  let remaining = 0, opaque = false;
  for (let l = 0; l < rn; l++) {
    const g = global(l);
    if (mask[g / 4]) { unknown[l] = 1; remaining++; } else if (px[g + 3] > 0) opaque = true;
  }
  if (!opaque) return false;
  // Source patches lie wholly in the region and wholly outside the hole, found with a summed-area table of the hole.
  const table = new Int32Array((rw + 1) * (rh + 1));
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) table[(y + 1) * (rw + 1) + x + 1] = unknown[y * rw + x] + table[y * (rw + 1) + x + 1] + table[(y + 1) * (rw + 1) + x] - table[y * (rw + 1) + x];
  const holeIn = (ax: number, ay: number, bx: number, by: number): number => table[(by + 1) * (rw + 1) + bx + 1] - table[ay * (rw + 1) + bx + 1] - table[(by + 1) * (rw + 1) + ax] + table[ay * (rw + 1) + ax];
  let sources: number[] = [];
  let outside: ((ax: number, ay: number, bx: number, by: number) => number) | null = null;
  if (allow) {
    const t2 = new Int32Array((rw + 1) * (rh + 1));
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) t2[(y + 1) * (rw + 1) + x + 1] = (allow[(y + ry0) * w + x + rx0] ? 0 : 1) + t2[y * (rw + 1) + x + 1] + t2[(y + 1) * (rw + 1) + x] - t2[y * (rw + 1) + x];
    outside = (ax, ay, bx, by) => t2[(by + 1) * (rw + 1) + bx + 1] - t2[ay * (rw + 1) + bx + 1] - t2[(by + 1) * (rw + 1) + ax] + t2[ay * (rw + 1) + ax];
  }
  for (let cy = half; cy < rh - half; cy++) for (let cx = half; cx < rw - half; cx++) if (!holeIn(cx - half, cy - half, cx + half, cy + half) && (!outside || !outside(cx - half, cy - half, cx + half, cy + half))) sources.push(cy * rw + cx);
  if (!sources.length) return false;
  if (sources.length > 8000) { const step = sources.length / 8000, all = sources; sources = Array.from({ length: 8000 }, (_, i) => all[Math.floor(i * step)]); }
  // Candidates: each a patch centre and a transform (index into `tf`, a 2 by 2 matrix applied to the offset from the
  // target). Transform 0 is the identity with the plain sources above; the others share one bounded budget.
  const tf: number[][] = [[1, 0, 0, 1]];
  const angles = [0, ...(FILL_ANGLES[Math.max(0, Math.min(4, Math.round(options.rotation)))] ?? [])], scales = options.scale ? [1, 0.8, 0.9, 1.1, 1.25] : [1];
  for (const flip of options.mirror ? [1, -1] : [1]) for (const sc of scales) for (const deg of angles) {
    if (flip === 1 && sc === 1 && deg === 0) continue;
    const r = (deg * Math.PI) / 180, co = Math.cos(r) * sc, si = Math.sin(r) * sc;
    tf.push([co * flip, -si, si * flip, co]);
  }
  const cs: number[] = sources.slice(), ct: number[] = new Array<number>(sources.length).fill(0);
  if (tf.length > 1) {
    const per = Math.max(40, Math.floor(6000 / (tf.length - 1)));
    for (let t = 1; t < tf.length; t++) {
      const m = tf[t], reach = Math.ceil(half * Math.max(Math.abs(m[0]) + Math.abs(m[1]), Math.abs(m[2]) + Math.abs(m[3])));
      const span = (rw - 2 * reach) * (rh - 2 * reach);
      if (span <= 0) continue;
      const stride = Math.max(1, Math.floor(Math.sqrt(span / per))), off = t % stride;
      for (let cy = reach + off; cy < rh - reach; cy += stride) for (let cx = reach + off; cx < rw - reach; cx += stride) {
        if (holeIn(cx - reach, cy - reach, cx + reach, cy + reach) || (outside && outside(cx - reach, cy - reach, cx + reach, cy + reach))) continue;
        cs.push(cy * rw + cx); ct.push(t);
      }
    }
  }
  const lv = FILL_COLOR[Math.max(0, Math.min(3, Math.round(options.color)))], adapt = lv[2] > 0;
  const ad = new Float64Array(6), bestAd = new Float64Array(6), tq = new Float64Array(6), kx = new Int32Array(side * side), ky = new Int32Array(side * side);
  const confidence = new Float32Array(rn);
  for (let l = 0; l < rn; l++) confidence[l] = unknown[l] ? 0 : 1;
  const luma = (l: number): number => { const g = global(l); return 0.299 * px[g] + 0.587 * px[g + 1] + 0.114 * px[g + 2]; };
  const hx0 = x0 - rx0, hy0 = y0 - ry0, hx1 = x1 - rx0, hy1 = y1 - ry0;
  while (remaining > 0) {
    // The fill front: unknown pixels touching a known one. Priority is confidence times how strongly an isophote
    // (the direction of an edge) runs into the hole, so structure is carried in before flat areas close over it.
    let target = -1, bestPriority = -1, targetConfidence = 0;
    for (let y = hy0; y <= hy1; y++) {
      for (let x = hx0; x <= hx1; x++) {
        const l = y * rw + x;
        if (!unknown[l]) continue;
        const knownNeighbour = (x > 0 && !unknown[l - 1]) || (x < rw - 1 && !unknown[l + 1]) || (y > 0 && !unknown[l - rw]) || (y < rh - 1 && !unknown[l + rw]);
        if (!knownNeighbour) continue;
        let c = 0;
        for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < rw && yy < rh) c += confidence[yy * rw + xx];
        }
        c /= side * side;
        const nx = (x < rw - 1 ? unknown[l + 1] : 1) - (x > 0 ? unknown[l - 1] : 1), ny = (y < rh - 1 ? unknown[l + rw] : 1) - (y > 0 ? unknown[l - rw] : 1);
        const nl = Math.hypot(nx, ny);
        let data = 0;
        if (nl > 0) {
          let gx = 0, gy = 0, strongest = -1;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 1 || yy < 1 || xx >= rw - 1 || yy >= rh - 1) continue;
            const q = yy * rw + xx;
            if (unknown[q] || unknown[q - 1] || unknown[q + 1] || unknown[q - rw] || unknown[q + rw]) continue;
            const ex = (luma(q + 1) - luma(q - 1)) / 2, ey = (luma(q + rw) - luma(q - rw)) / 2, m = ex * ex + ey * ey;
            if (m > strongest) { strongest = m; gx = ex; gy = ey; }
          }
          data = Math.abs(-gy * (nx / nl) + gx * (ny / nl)) / 255;
        }
        const priority = c * (data + 0.001);
        if (priority > bestPriority) { bestPriority = priority; target = l; targetConfidence = c; }
      }
    }
    if (target < 0) break;
    const tx = target % rw, ty = (target - tx) / rw;
    let from = -1, bestCost = Infinity, bestT = 0;
    // The target's known pixels, once per target: their offsets and their mean and spread per channel (1.71.5: these
    // were summed again for every candidate, which made the default fill about twelve times slower).
    let kn = 0;
    if (adapt) {
      for (let c = 0; c < 6; c++) tq[c] = 0;
      for (let dy = -half; dy <= half; dy++) {
        const yy = ty + dy;
        if (yy < 0 || yy >= rh) continue;
        for (let dx = -half; dx <= half; dx++) {
          const xx = tx + dx;
          if (xx < 0 || xx >= rw || unknown[yy * rw + xx]) continue;
          const a = global(yy * rw + xx);
          kx[kn] = dx; ky[kn] = dy; kn++;
          for (let c = 0; c < 3; c++) { tq[c] += px[a + c]; tq[3 + c] += px[a + c] * px[a + c]; }
        }
      }
    }
    for (let i = 0; i < cs.length; i++) {
      const s = cs[i], m = tf[ct[i]], sx = s % rw, sy = (s - sx) / rw;
      ad[0] = ad[1] = ad[2] = 1; ad[3] = ad[4] = ad[5] = 0;
      if (adapt && kn >= 6) {
        // Gain and offset per channel that carry the candidate's mean and spread onto the known pixels around the target.
        let sb0 = 0, sb1 = 0, sb2 = 0, qb0 = 0, qb1 = 0, qb2 = 0;
        for (let k = 0; k < kn; k++) {
          const dx = kx[k], dy = ky[k], b = global((sy + Math.round(m[2] * dx + m[3] * dy)) * rw + sx + Math.round(m[0] * dx + m[1] * dy));
          const b0 = px[b], b1 = px[b + 1], b2 = px[b + 2];
          sb0 += b0; sb1 += b1; sb2 += b2; qb0 += b0 * b0; qb1 += b1 * b1; qb2 += b2 * b2;
        }
        for (let c = 0; c < 3; c++) {
          const ma = tq[c] / kn, mb = (c === 0 ? sb0 : c === 1 ? sb1 : sb2) / kn, va = tq[3 + c] / kn - ma * ma, vb = (c === 0 ? qb0 : c === 1 ? qb1 : qb2) / kn - mb * mb;
          const gain = vb > 1 && va > 0 ? Math.max(lv[0], Math.min(lv[1], Math.sqrt(va / vb))) : 1;
          ad[c] = gain;
          ad[3 + c] = Math.max(-lv[2], Math.min(lv[2], ma - gain * mb));
        }
      }
      let cost = 0;
      for (let dy = -half; dy <= half && cost < bestCost; dy++) {
        const yy = ty + dy;
        if (yy < 0 || yy >= rh) continue;
        for (let dx = -half; dx <= half; dx++) {
          const xx = tx + dx;
          if (xx < 0 || xx >= rw || unknown[yy * rw + xx]) continue;
          const a = global(yy * rw + xx), b = global((sy + Math.round(m[2] * dx + m[3] * dy)) * rw + sx + Math.round(m[0] * dx + m[1] * dy));
          const d0 = px[a] - (px[b] * ad[0] + ad[3]), d1 = px[a + 1] - (px[b + 1] * ad[1] + ad[4]), d2 = px[a + 2] - (px[b + 2] * ad[2] + ad[5]), d3 = px[a + 3] - px[b + 3];
          cost += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
        }
      }
      if (cost < bestCost) { bestCost = cost; from = s; bestT = ct[i]; bestAd.set(ad); }
    }
    if (from < 0) break;
    const fx = from % rw, fy = (from - fx) / rw, fm = tf[bestT];
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const xx = tx + dx, yy = ty + dy;
        if (xx < 0 || yy < 0 || xx >= rw || yy >= rh) continue;
        const l = yy * rw + xx;
        if (!unknown[l]) continue;
        const a = global(l), b = global((fy + Math.round(fm[2] * dx + fm[3] * dy)) * rw + fx + Math.round(fm[0] * dx + fm[1] * dy));
        px[a + 3] = px[b + 3];
        px[a] = Math.max(0, Math.min(px[b + 3], px[b] * bestAd[0] + bestAd[3]));
        px[a + 1] = Math.max(0, Math.min(px[b + 3], px[b + 1] * bestAd[1] + bestAd[4]));
        px[a + 2] = Math.max(0, Math.min(px[b + 3], px[b + 2] * bestAd[2] + bestAd[5]));
        unknown[l] = 0;
        confidence[l] = targetConfidence;
        remaining--;
      }
    }
  }
  return true;
}

/** A Smudge or Liquify stroke over premultiplied `pixels`, which it changes in place. Dabs fall every few percent of
 *  the brush diameter along the pointer's path, carrying the spacing over from one call to the next. */
export class WarpStroke {
  readonly points: Pt[] = [];
  readonly radius: number;
  private readonly diameter: number;
  private readonly hardness: number;
  private readonly strength: number;
  /** The pen's pressure (already through its curve) scaling the strength of the dabs laid by the current move. */
  private pressure = 1;
  private readonly gap: number;
  private pointer: Pt | null = null;
  private lastDab: Pt | null = null;
  private sinceDab = 0;
  /** Smudge's paint on the brush: a square of 2 radius + 1 pixels a side around the dab centre, premultiplied. */
  private paint: Float32Array | null = null;

  /** Smudge Length: 1 keeps the paint as far as Strength allows, 0 lets it take on the canvas fully at every dab. */
  private readonly length: number;

  constructor(readonly pixels: Uint8ClampedArray, readonly width: number, readonly height: number, readonly mode: 'smudge' | 'liquify', diameter: number, hardness: number, strength: number, length = 1) {
    this.length = clamp(length, 0, 1);
    this.diameter = Math.max(2, diameter);
    this.hardness = clamp(hardness, 0, 0.98);
    this.strength = clamp(strength, 0.01, 1);
    this.radius = Math.ceil(this.diameter / 2);
    this.gap = Math.max(1, this.diameter * (mode === 'smudge' ? 0.1 : 0.03));
  }

  /** Brush weight at `u`, the distance from the dab centre over the radius: full across the hard core, then a raised-
   *  cosine shoulder down to nothing at the rim. */
  private weight(u: number): number {
    if (u >= 1) return 0;
    if (u <= this.hardness) return 1;
    return 0.5 + 0.5 * Math.cos((Math.PI * (u - this.hardness)) / (1 - this.hardness));
  }

  /** Moves the stroke to `point`; returns the pixel rectangle that changed, or null. */
  append(point: Pt, pressure = 1): Rect | null {
    this.pressure = clamp(pressure, 0, 1);
    if (!this.pointer) {
      this.pointer = { x: point.x, y: point.y };
      this.lastDab = { x: point.x, y: point.y };
      if (this.mode === 'smudge') this.pickUp(point);
      return null;
    }
    const from = this.pointer, dx = point.x - from.x, dy = point.y - from.y, length = Math.hypot(dx, dy);
    this.pointer = { x: point.x, y: point.y };
    if (!(length > 0)) return null;
    let along = this.gap - this.sinceDab, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    while (along <= length) {
      const at = { x: from.x + (dx * along) / length, y: from.y + (dy * along) / length };
      if (this.mode === 'smudge') this.deposit(at); else this.displace(this.lastDab as Pt, at);
      this.lastDab = at;
      this.points.push(at);
      const reach = this.radius + 2;
      minX = Math.min(minX, at.x - reach); minY = Math.min(minY, at.y - reach);
      maxX = Math.max(maxX, at.x + reach); maxY = Math.max(maxY, at.y + reach);
      along += this.gap;
    }
    this.sinceDab = length - (along - this.gap);
    if (minX === Infinity) return null;
    const x = Math.max(0, Math.floor(minX)), y = Math.max(0, Math.floor(minY));
    const w = Math.min(this.width, Math.ceil(maxX)) - x, h = Math.min(this.height, Math.ceil(maxY)) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  }

  /** Smudge: loads the brush with the pixels around `at`; outside the image the brush holds nothing. */
  private pickUp(at: Pt): void {
    const r = this.radius, side = 2 * r + 1, cx = Math.round(at.x), cy = Math.round(at.y);
    const paint = new Float32Array(side * side * 4);
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const x = cx + ox, y = cy + oy;
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        const i = (y * this.width + x) * 4, k = ((oy + r) * side + ox + r) * 4;
        for (let c = 0; c < 4; c++) paint[k + c] = this.pixels[i + c];
      }
    }
    this.paint = paint;
  }

  /** Smudge: lays the brush's paint down by the brush weight times strength, and the paint takes on the canvas beneath
   *  by the weight times the rest; the stronger the stroke, the more it lays down and the longer its paint lasts. */
  private deposit(at: Pt): void {
    const paint = this.paint;
    if (!paint) return;
    const r = this.radius, side = 2 * r + 1, cx = Math.round(at.x), cy = Math.round(at.y), half = this.diameter / 2, lay = this.strength * this.pressure, take = 1 - lay * this.length;
    for (let oy = -r; oy <= r; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= this.height) continue;
      for (let ox = -r; ox <= r; ox++) {
        const x = cx + ox;
        if (x < 0 || x >= this.width) continue;
        const wgt = this.weight(Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y) / half);
        if (wgt <= 0) continue;
        const i = (y * this.width + x) * 4, k = ((oy + r) * side + ox + r) * 4;
        for (let c = 0; c < 4; c++) {
          const under = this.pixels[i + c];
          this.pixels[i + c] = Math.round(under + (paint[k + c] - under) * wgt * lay);
          paint[k + c] += (under - paint[k + c]) * wgt * take;
        }
      }
    }
  }

  /** Liquify: a forward warp. Pixels around `to` are pushed by the dab's movement from `from`, fully at the core and
   *  fading to nothing at the rim, scaled by strength; each reads the pixel it came from, bilinearly, from a copy of
   *  the neighbourhood taken before the dab. */
  private displace(from: Pt, to: Pt): void {
    const mx = to.x - from.x, my = to.y - from.y;
    if (!mx && !my) return;
    const r = this.radius, reach = r + Math.ceil(Math.hypot(mx, my)) + 2, cx = Math.round(to.x), cy = Math.round(to.y);
    const sx0 = Math.max(0, cx - reach), sy0 = Math.max(0, cy - reach), sx1 = Math.min(this.width - 1, cx + reach), sy1 = Math.min(this.height - 1, cy + reach);
    if (sx1 < sx0 || sy1 < sy0) return;
    const sw = sx1 - sx0 + 1, sh = sy1 - sy0 + 1, copy = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) copy.set(this.pixels.subarray(((y + sy0) * this.width + sx0) * 4, ((y + sy0) * this.width + sx1 + 1) * 4), y * sw * 4);
    const read = (x: number, y: number, c: number): number => copy[((clamp(y, sy0, sy1) - sy0) * sw + clamp(x, sx0, sx1) - sx0) * 4 + c];
    const half = this.diameter / 2;
    for (let y = Math.max(0, cy - r); y <= Math.min(this.height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(this.width - 1, cx + r); x++) {
        const push = this.weight(Math.hypot(x + 0.5 - to.x, y + 0.5 - to.y) / half) * this.strength * this.pressure;
        if (push <= 0) continue;
        const fx = x - mx * push, fy = y - my * push, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const i = (y * this.width + x) * 4;
        for (let c = 0; c < 4; c++) {
          const top = read(ix, iy, c) + (read(ix + 1, iy, c) - read(ix, iy, c)) * tx;
          const bottom = read(ix, iy + 1, c) + (read(ix + 1, iy + 1, c) - read(ix, iy + 1, c)) * tx;
          this.pixels[i + c] = Math.round(top + (bottom - top) * ty);
        }
      }
    }
  }
}

/** Frequency separation of `img`: `low` is the picture blurred by `radius` (colour and tone), `high` holds the detail
 *  as (picture - low) / 2 + 128, so that `high` over `low` in Linear Light reproduces the picture (to within a level). */
export function frequencySplit(img: ImageData, radius: number): { low: ImageData; high: ImageData } {
  const { width: w, height: ht } = img, m = gaussianMargin(Math.max(0.1, radius)), pw = w + 2 * m, padded = new ImageData(pw, ht + 2 * m);
  for (let y = 0; y < padded.height; y++) {
    const sy = clamp(y - m, 0, ht - 1);
    for (let x = 0; x < pw; x++) { const si = (sy * w + clamp(x - m, 0, w - 1)) * 4, di = (y * pw + x) * 4; for (let c = 0; c < 4; c++) padded.data[di + c] = img.data[si + c]; }
  }
  const blurred = gaussianBlur(padded, Math.max(0.1, radius)), low = new ImageData(w, ht), high = new ImageData(w, ht), s = img.data, l = low.data, h = high.data;
  for (let y = 0; y < ht; y++) l.set(blurred.data.subarray(((y + m) * pw + m) * 4, ((y + m) * pw + m + w) * 4), y * w * 4);
  for (let i = 0; i < s.length; i += 4) {
    for (let c = 0; c < 3; c++) h[i + c] = clamp(Math.round((s[i + c] - l[i + c]) / 2 + 128), 0, 255);
    h[i + 3] = s[i + 3];
  }
  return { low, high };
}
