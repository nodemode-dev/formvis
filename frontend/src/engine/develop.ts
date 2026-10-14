import { gaussianBlur, lensDistort } from './filters';

/** Develop: Camera Raw-style tone, colour and detail adjustments, brought over from formnodal's develop core (the
 *  studio in nodemode-ai's formvis extension for NodeMode, the owner's own code). The per-pixel pass below is
 *  formnodal's as written; clarity, texture and sharpening at the end keep its formulas but blur with formvis's own
 *  Gaussian, so the whole filter runs in the preview worker. formnodal is also nodemode-ai's own build; the owner
 *  confirmed no further notice is needed for it. */

// ------------------------------------------------------------ state types

/** Tone + presence adjustments. All slider units are -100..100 unless noted. */
export interface ToneState {
  offset: number;      // linear lift
  exposure: number;    // stops * 100
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number; // luminance-preserving warm/cool
  tint: number;        // green <-> magenta
  vibrance: number;    // saturation-masked chroma
  saturation: number;  // chroma scale about luma
  dehaze: number;
  vignette: number;    // 0..100
  grain: number;       // 0..100
}

export const HSL_BANDS = ["reds", "yellows", "greens", "cyans", "blues", "magentas"] as const;
export type HslBand = typeof HSL_BANDS[number];

export interface HslBandState { h: number; s: number; l: number; }

/** Color mixer: a master shift plus six hue bands (fixed centers, 60-degree
 *  widths with cosine falloff), or a colorize override. */
export interface ColorMixState {
  master: HslBandState;
  bands: Record<HslBand, HslBandState>;
  colorize: boolean;
}

export type CurvePoint = { x: number; y: number };
export type CurveChannel = "rgb" | "r" | "g" | "b";

export interface CurveState {
  rgb: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

/** Local-contrast / detail adjustments (applied as canvas passes). */
export interface DetailState {
  clarity: number;   // -100..100 midtone local contrast (20px base radius)
  texture: number;   // -100..100 fine local contrast (3px radius, midtone)
  sharpen: number;   // 0..100 unsharp (1.2px radius)
}

export interface DevelopState {
  tone: ToneState;
  color: ColorMixState;
  curves: CurveState;
  detail: DetailState;
  /** Camera Raw's further panels (the comparison's Develop row): optional, so states saved before them still read, and
   *  read through gradingOf and the like, whose defaults leave the image unchanged. */
  grading?: GradingState;
  optics?: OpticsState;
  geometry?: GeometryState;
  calibration?: CalibrationState;
}

export interface GradeWheel { h: number; s: number }
/** Colour grading: a hue (0 to 360) and saturation (0 to 100) for shadows, midtones and highlights and for the whole
 *  image; Blending (0 to 100) widens the overlap of the three ranges, Balance (-100 to 100) moves it toward the highlights. */
export interface GradingState { shadows: GradeWheel; midtones: GradeWheel; highlights: GradeWheel; global: GradeWheel; blending: number; balance: number }
/** Optics: Distortion (-100 to 100, as Lens Correction), Chromatic Aberration (-100 to 100, red and blue channels
 *  scaled apart), Vignetting (-100 to 100, positive brightens the corners) and its Midpoint (0 to 100). */
export interface OpticsState { distortion: number; chromatic: number; vignetting: number; midpoint: number }
/** Geometry: Vertical and Horizontal perspective (-100 to 100), Rotate (-10 to 10 degrees), Scale (50 to 150 percent),
 *  Offset X and Y (-100 to 100, percent of half the image). */
export interface GeometryState { vertical: number; horizontal: number; rotate: number; scale: number; offsetX: number; offsetY: number }
/** Calibration: each primary's hue and saturation (-100 to 100) and Shadows Tint (-100 green to 100 magenta). */
export interface CalibrationState { shadowTint: number; redHue: number; redSat: number; greenHue: number; greenSat: number; blueHue: number; blueSat: number }

export const defaultGrading = (): GradingState => ({ shadows: { h: 0, s: 0 }, midtones: { h: 0, s: 0 }, highlights: { h: 0, s: 0 }, global: { h: 0, s: 0 }, blending: 50, balance: 0 });
export const defaultOptics = (): OpticsState => ({ distortion: 0, chromatic: 0, vignetting: 0, midpoint: 50 });
export const defaultGeometry = (): GeometryState => ({ vertical: 0, horizontal: 0, rotate: 0, scale: 100, offsetX: 0, offsetY: 0 });
export const defaultCalibration = (): CalibrationState => ({ shadowTint: 0, redHue: 0, redSat: 0, greenHue: 0, greenSat: 0, blueHue: 0, blueSat: 0 });
export const gradingOf = (s: DevelopState): GradingState => ({ ...defaultGrading(), ...s.grading });
export const opticsOf = (s: DevelopState): OpticsState => ({ ...defaultOptics(), ...s.optics });
export const geometryOf = (s: DevelopState): GeometryState => ({ ...defaultGeometry(), ...s.geometry });
export const calibrationOf = (s: DevelopState): CalibrationState => ({ ...defaultCalibration(), ...s.calibration });

const BAND_CENTER: Record<HslBand, number> = {
  reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300,
};
const BAND_WIDTH = 60;

export function defaultDevelopState(): DevelopState {
  const band = (): HslBandState => ({ h: 0, s: 0, l: 0 });
  return {
    tone: {
      offset: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0,
      whites: 0, blacks: 0, temperature: 0, tint: 0, vibrance: 0,
      saturation: 0, dehaze: 0, vignette: 0, grain: 0,
    },
    color: {
      master: band(),
      bands: { reds: band(), yellows: band(), greens: band(),
               cyans: band(), blues: band(), magentas: band() },
      colorize: false,
    },
    curves: {
      rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      b: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    },
    detail: { clarity: 0, texture: 0, sharpen: 0 },
    grading: defaultGrading(), optics: defaultOptics(), geometry: defaultGeometry(), calibration: defaultCalibration(),
  };
}

export function cloneState(s: DevelopState): DevelopState {
  return JSON.parse(JSON.stringify(s)) as DevelopState;
}

// ------------------------------------------------------------ predicates

export function toneActive(t: ToneState): boolean {
  return Object.values(t).some((v) => v !== 0);
}

export function colorActive(c: ColorMixState): boolean {
  if (c.colorize) return true;
  const on = (b: HslBandState) => b.h !== 0 || b.s !== 0 || b.l !== 0;
  return on(c.master) || HSL_BANDS.some((k) => on(c.bands[k]));
}

function curveDefault(p: CurvePoint[]): boolean {
  return p.length === 2 && p[0].x === 0 && p[0].y === 0 && p[1].x === 255 && p[1].y === 255;
}

export function curvesActive(c: CurveState): boolean {
  return !(curveDefault(c.rgb) && curveDefault(c.r) && curveDefault(c.g) && curveDefault(c.b));
}

export function detailActive(d: DetailState): boolean {
  return d.clarity !== 0 || d.texture !== 0 || d.sharpen !== 0;
}

/** True when the state holds only what `developPass` does (tone, colour mixer, curves): the stages after it (grading,
 *  calibration, clarity, texture, sharpening, optics, geometry) are all at their defaults. The GPU runs only these. */
export function developPerPixelOnly(s: DevelopState): boolean {
  return !detailActive(s.detail) && !gradingActive(gradingOf(s)) && !calibrationActive(calibrationOf(s)) && !opticsActive(opticsOf(s)) && !geometryActive(geometryOf(s));
}

export function stateActive(s: DevelopState): boolean {
  return toneActive(s.tone) || colorActive(s.color) || curvesActive(s.curves) || detailActive(s.detail)
    || gradingActive(gradingOf(s)) || calibrationActive(calibrationOf(s)) || opticsActive(opticsOf(s)) || geometryActive(geometryOf(s));
}

// ------------------------------------------------------------ primitives

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** RGB [0..255] -> HSL (h degrees, s/l 0..1). */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r = clamp255(r) / 255; g = clamp255(g) / 255; b = clamp255(b) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, clamp01(l)];
  const d = max - min;
  let s = l > 0.5 ? d / Math.max(1e-5, 2 - max - min) : d / Math.max(1e-5, max + min);
  s = clamp01(s);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, clamp01(l)];
}

/** HSL (h degrees, s/l 0..1) -> RGB [0..255]. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s = clamp01(s); l = clamp01(l);
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hn = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clamp255(hue2rgb(p, q, hn + 1 / 3) * 255),
    clamp255(hue2rgb(p, q, hn) * 255),
    clamp255(hue2rgb(p, q, hn - 1 / 3) * 255),
  ];
}

/** Photoshop-style lightness shift: positive lifts toward white, negative
 *  scales toward black (never crushes hue). delta in -1..1. */
function shiftLightness(l: number, delta: number): number {
  const d = Math.max(-1, Math.min(1, delta));
  return d >= 0 ? clamp01(l + (1 - l) * d) : clamp01(l + l * d);
}

/** Cosine-falloff membership of hue `h` in a band. */
function hueWeight(h: number, center: number, width: number): number {
  let diff = Math.abs(h - center);
  if (diff > 180) diff = 360 - diff;
  const half = Math.max(5, width / 2);
  const falloff = Math.max(12, half * 0.65);
  if (diff <= half) return 1;
  if (diff <= half + falloff) {
    const t = (diff - half) / falloff;
    return 0.5 * (1 + Math.cos(Math.PI * t));
  }
  return 0;
}

// ------------------------------------------------------------ curves

/** Build a 256-entry LUT for a curve. Two points: linear. More: monotone
 *  cubic (Fritsch-Carlson) Hermite spline ,  no overshoot between points. */
export function buildCurveLut(points: CurvePoint[]): Uint8Array {
  const pts = normalizeCurve(points);
  const lut = new Uint8Array(256);
  const n = pts.length;
  if (n === 2) {
    for (let x = 0; x <= 255; x++) {
      const t = x / 255;
      lut[x] = clamp255(Math.round(pts[0].y + (pts[1].y - pts[0].y) * t));
    }
    return lut;
  }
  const xs = new Float32Array(n), ys = new Float32Array(n);
  for (let i = 0; i < n; i++) { xs[i] = pts[i].x; ys[i] = pts[i].y; }
  const dx = new Float32Array(n - 1), ms = new Float32Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    ms[i] = (ys[i + 1] - ys[i]) / (dx[i] || 1);
  }
  const c1s = new Float32Array(n);
  c1s[0] = ms[0];
  for (let i = 1; i < n - 1; i++) {
    const m = ms[i - 1], next = ms[i];
    if (m * next <= 0) c1s[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      c1s[i] = (w1 + w2) / (w1 / m + w2 / next);
    }
  }
  c1s[n - 1] = ms[n - 2];
  const c2s = new Float32Array(n - 1), c3s = new Float32Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const c1 = c1s[i], m = ms[i], invDx = 1 / (dx[i] || 1);
    const common = c1 + c1s[i + 1] - 2 * m;
    c2s[i] = (m - c1 - common) * invDx;
    c3s[i] = common * invDx * invDx;
  }
  for (let x = 0; x <= 255; x++) {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const d = x - xs[i];
    lut[x] = clamp255(Math.round(ys[i] + c1s[i] * d + c2s[i] * d * d + c3s[i] * d * d * d));
  }
  return lut;
}

/** Clamp, sort, and de-duplicate curve points; guarantee >= 2. */
export function normalizeCurve(points: CurvePoint[]): CurvePoint[] {
  const fallback: CurvePoint[] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  if (!Array.isArray(points)) return fallback;
  const parsed: CurvePoint[] = [];
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    parsed.push({ x: clamp255(p.x), y: clamp255(p.y) });
  }
  if (parsed.length < 2) return fallback;
  parsed.sort((a, b) => a.x - b.x);
  const out: CurvePoint[] = [];
  for (const p of parsed) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 1) out[out.length - 1] = p;
    else out.push(p);
  }
  return out.length >= 2 ? out : fallback;
}

// ------------------------------------------------------------ tiny RNG

/** Deterministic grain (mulberry32) so re-renders don't shimmer. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ main pass

/** The per-pixel develop pass: tone -> color mixer -> curves, src -> dst.
 *  Alpha passes through untouched. Deterministic (seeded grain). */
export function developPass(src: Uint8ClampedArray, dst: Uint8ClampedArray,
                            w: number, h: number, state: DevelopState,
                            grainSeed = 7): void {
  const t = state.tone;
  const offset = t.offset, exp = t.exposure, cont = t.contrast;
  const high = t.highlights, shad = t.shadows, white = t.whites, black = t.blacks;
  const temp = t.temperature, tint = t.tint;
  const vibrance = t.vibrance, sat = t.saturation, dehz = t.dehaze;
  const vignette = t.vignette, grain = t.grain;

  const hasColor = colorActive(state.color);
  const hasCurve = curvesActive(state.curves);
  const lutRgb = hasCurve ? buildCurveLut(state.curves.rgb) : null;
  const lutR = hasCurve ? buildCurveLut(state.curves.r) : null;
  const lutG = hasCurve ? buildCurveLut(state.curves.g) : null;
  const lutB = hasCurve ? buildCurveLut(state.curves.b) : null;
  const rand = grain > 0 ? rng(grainSeed) : null;

  const cx = w / 2, cy = h / 2;
  const maxRadius = Math.sqrt(cx * cx + cy * cy);

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;

    // temperature/tint: luminance-preserving deviation shift (no channel
    // multiplies ,  those clip highlights and fake saturation)
    if (temp !== 0 || tint !== 0) {
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      let dr = r - lum, dg = g - lum, db = b - lum;
      if (temp !== 0) {
        const tv = temp / 100;
        dr += tv * 0.05; db -= tv * 0.05;
      }
      if (tint !== 0) {
        const tv = tint / 100;
        dg -= tv * 0.04; dr += tv * 0.02; db += tv * 0.02;
      }
      r = lum + dr; g = lum + dg; b = lum + db;
    }
    r = clamp01(r); g = clamp01(g); b = clamp01(b);

    let luma = r * 0.299 + g * 0.587 + b * 0.114;

    if (offset !== 0) { const o = offset / 100; r += o; g += o; b += o; }
    if (exp !== 0) {
      const m = Math.pow(2, exp / 100);
      r *= m; g *= m; b *= m; luma *= m;
    }
    if (shad !== 0) {
      const v = shad / 100;
      const mask = 1 - smoothstep(0, 0.65, luma);
      if (v > 0) { r += (1 - r) * mask * v * 0.75; g += (1 - g) * mask * v * 0.75; b += (1 - b) * mask * v * 0.75; }
      else { r += r * mask * v * 0.75; g += g * mask * v * 0.75; b += b * mask * v * 0.75; }
    }
    if (high !== 0) {
      const v = high / 100;
      const boost = smoothstep(0.3, 1, luma) * v * 0.8;
      const lumaNew = v > 0 ? luma + (1 - luma) * boost : luma + luma * boost;
      const ratio = lumaNew / Math.max(1e-5, luma);
      r *= ratio; g *= ratio; b *= ratio; luma = lumaNew;
    }
    if (white !== 0) {
      const v = white / 100;
      const boost = smoothstep(0.45, 1, luma) * v * 1.2;
      const lumaNew = v > 0 ? luma + (1 - luma) * boost : luma + luma * boost;
      const ratio = lumaNew / Math.max(1e-5, luma);
      r *= ratio; g *= ratio; b *= ratio; luma = lumaNew;
    }
    if (black !== 0) {
      const v = black / 100;
      const mask = 1 - smoothstep(0, 0.35, luma);
      if (v > 0) { r += (1 - r) * mask * v * 0.8; g += (1 - g) * mask * v * 0.8; b += (1 - b) * mask * v * 0.8; }
      else { r += r * mask * v * 0.8; g += g * mask * v * 0.8; b += b * mask * v * 0.8; }
    }
    if (cont !== 0) {
      const f = 1 + cont / 100;
      r = (r - 0.5) * f + 0.5; g = (g - 0.5) * f + 0.5; b = (b - 0.5) * f + 0.5;
    }
    r = clamp01(r); g = clamp01(g); b = clamp01(b);

    if (sat !== 0) {
      // chroma about luma: no HSL denominator blow-ups near white
      const l0 = r * 0.299 + g * 0.587 + b * 0.114;
      const v = sat / 100;
      const f = v > 0 ? 1 + v * 1.5 : 1 + v;
      r = clamp01(l0 + (r - l0) * f);
      g = clamp01(l0 + (g - l0) * f);
      b = clamp01(l0 + (b - l0) * f);
    }
    if (vibrance !== 0) {
      const l0 = r * 0.299 + g * 0.587 + b * 0.114;
      const satMask = clamp01(1 - (Math.max(r, g, b) - Math.min(r, g, b)));
      const adj = (vibrance / 100) * satMask;
      r = clamp01(r + (r - l0) * adj);
      g = clamp01(g + (g - l0) * adj);
      b = clamp01(b + (b - l0) * adj);
    }
    if (dehz !== 0) {
      const v = dehz / 150;
      const l0 = r * 0.299 + g * 0.587 + b * 0.114;
      const haze = clamp01(1 - (Math.max(r, g, b) - Math.min(r, g, b)) * 2);
      const mid = 1 - clamp01(Math.abs(l0 - 0.5) * 2);
      const weight = clamp01(0.35 + 0.65 * haze * mid);
      if (v > 0) {
        const c = 1 + v * 0.9 * weight;
        r = (r - 0.5) * c + 0.5; g = (g - 0.5) * c + 0.5; b = (b - 0.5) * c + 0.5;
        const neutral = (r + g + b) / 3;
        const sb = v * 0.18 * weight;
        r += (r - neutral) * sb; g += (g - neutral) * sb; b += (b - neutral) * sb;
      } else {
        const soften = -v * 0.45 * weight;
        r = (r - 0.5) * (1 - soften) + 0.5;
        g = (g - 0.5) * (1 - soften) + 0.5;
        b = (b - 0.5) * (1 - soften) + 0.5;
      }
      r = clamp01(r); g = clamp01(g); b = clamp01(b);
    }
    if (vignette > 0) {
      const px = (i / 4) % w, py = Math.floor(i / 4 / w);
      const radius = Math.hypot(px - cx, py - cy);
      const mask = clamp01(1 - (radius / maxRadius - 0.3) * (vignette / 50));
      r *= mask; g *= mask; b *= mask;
    }
    if (rand) {
      const noise = (rand() - 0.5) * 2 * (grain / 200);
      r += noise; g += noise; b += noise;
    }
    r = clamp01(r); g = clamp01(g); b = clamp01(b);

    if (hasColor) {
      const c = state.color;
      let [hh, ss, ll] = rgbToHsl(r * 255, g * 255, b * 255);
      if (c.colorize) {
        let nh = c.master.h;
        if (nh < 0) nh += 360;
        const ns = clamp01(0.5 + c.master.s / 100);
        const nl = shiftLightness(ll, c.master.l / 100);
        const [nr, ng, nb] = hslToRgb(nh, ns, nl);
        r = nr / 255; g = ng / 255; b = nb / 255;
      } else {
        let hShift = c.master.h;
        let lShift = c.master.l / 100;
        let chroma = 1 + (c.master.s / 100) * 1.2;
        for (const band of HSL_BANDS) {
          const conf = c.bands[band];
          if (conf.h === 0 && conf.s === 0 && conf.l === 0) continue;
          const weight = hueWeight(hh, BAND_CENTER[band], BAND_WIDTH);
          if (weight > 0) {
            hShift += conf.h * weight;
            chroma += (conf.s / 100) * 1.2 * weight;
            lShift += (conf.l / 100) * weight;
          }
        }
        let nh = (hh + hShift) % 360;
        if (nh < 0) nh += 360;
        const nl = shiftLightness(ll, lShift);
        const [nr0, ng0, nb0] = hslToRgb(nh, ss, nl);
        r = nr0 / 255; g = ng0 / 255; b = nb0 / 255;
        if (chroma !== 1) {
          const l0 = r * 0.299 + g * 0.587 + b * 0.114;
          const m = Math.max(0, chroma);
          r = l0 + (r - l0) * m; g = l0 + (g - l0) * m; b = l0 + (b - l0) * m;
        }
      }
      r = clamp01(r); g = clamp01(g); b = clamp01(b);
    }

    if (hasCurve) {
      let ri = clamp255(Math.round(r * 255));
      let gi = clamp255(Math.round(g * 255));
      let bi = clamp255(Math.round(b * 255));
      ri = lutRgb![ri]; gi = lutRgb![gi]; bi = lutRgb![bi];
      ri = lutR![ri]; gi = lutG![gi]; bi = lutB![bi];
      r = ri / 255; g = gi / 255; b = bi / 255;
    }

    dst[i] = r * 255;
    dst[i + 1] = g * 255;
    dst[i + 2] = b * 255;
    dst[i + 3] = src[i + 3];
  }
}

// ------------------------------------------------------------ detail passes
// These operate on a canvas (they need a blurred sibling); the engine calls

// ------------------------------------------------------------ detail passes (formvis's worker-safe versions)

/** Blur-difference detail on `img`: `amount` above zero adds detail, below zero softens (at most 80%); `midtoneOnly`
 *  keeps the effect away from deep shadows and highlights. `radius` is the blur's standard deviation in pixels. */
export function detailPass(img: ImageData, radius: number, amount: number, midtoneOnly: boolean): ImageData {
  if (!amount) return img;
  const blur = gaussianBlur(img, Math.max(0.1, radius)).data, s = img.data, out = new ImageData(new Uint8ClampedArray(s), img.width, img.height), d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const r0 = s[i] / 255, g0 = s[i + 1] / 255, b0 = s[i + 2] / 255;
    let mask = 1;
    if (midtoneOnly) {
      const l = r0 * 0.2126 + g0 * 0.7152 + b0 * 0.0722;
      mask = Math.pow(1 - clamp01(Math.abs(l - 0.5) * 2), 1.25);
    }
    const br = blur[i] / 255, bg = blur[i + 1] / 255, bb = blur[i + 2] / 255;
    const f = amount < 0 ? Math.min(0.8, -amount) * mask : amount * mask, sign = amount < 0 ? 1 : -1;
    d[i] = clamp255(Math.round((r0 + (br - r0) * f * sign) * 255));
    d[i + 1] = clamp255(Math.round((g0 + (bg - g0) * f * sign) * 255));
    d[i + 2] = clamp255(Math.round((b0 + (bb - b0) * f * sign) * 255));
  }
  return out;
}

/** Clarity on `img`: wide-radius (20 px times `scale`) local contrast, weighted toward the midtones. */
export function clarityPass(img: ImageData, amount: number, scale = 1): ImageData {
  if (!amount) return img;
  const blur = gaussianBlur(img, Math.max(0.1, 20 * scale)).data, s = img.data, out = new ImageData(new Uint8ClampedArray(s), img.width, img.height), d = out.data;
  const factor = amount / 200;
  for (let i = 0; i < s.length; i += 4) {
    const r = s[i] / 255, g = s[i + 1] / 255, b = s[i + 2] / 255;
    const br = blur[i] / 255, bg = blur[i + 1] / 255, bb = blur[i + 2] / 255;
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    const term = Math.abs(factor) * (1 - Math.pow(Math.abs(luma - 0.5) * 2, 2)) * 0.8, sign = factor > 0 ? -1 : 1;
    d[i] = clamp255(Math.round((r + (br - r) * term * sign) * 255));
    d[i + 1] = clamp255(Math.round((g + (bg - g) * term * sign) * 255));
    d[i + 2] = clamp255(Math.round((b + (bb - b) * term * sign) * 255));
  }
  return out;
}

const gradingActive = (g: GradingState): boolean => [g.shadows, g.midtones, g.highlights, g.global].some((w) => w.s !== 0);
const calibrationActive = (c: CalibrationState): boolean => Object.values(c).some((v) => v !== 0);
const opticsActive = (o: OpticsState): boolean => o.distortion !== 0 || o.chromatic !== 0 || o.vignetting !== 0;
const geometryActive = (g: GeometryState): boolean => g.vertical !== 0 || g.horizontal !== 0 || g.rotate !== 0 || g.scale !== 100 || g.offsetX !== 0 || g.offsetY !== 0;

/** Calibration, then colour grading, on every pixel. Calibration turns and saturates colours by how much each belongs to
 *  a primary's hue range and tints the shadows green or magenta; grading adds each range's hue at its saturation where
 *  the pixel's luminance places it (shadows, midtones, highlights, weighted by Blending and Balance) and to all of it
 *  (global), keeping the pixel's luminance. */
function gradePass(img: ImageData, g: GradingState, c: CalibrationState): void {
  const d = img.data, gOn = gradingActive(g), cOn = calibrationActive(c);
  const tint = (w: GradeWheel): [number, number, number] => {
    if (!w.s) return [0, 0, 0];
    const [r, gg, b] = hslToRgb(w.h, 1, 0.5), k = (w.s / 100) * 0.3;
    return [(r / 255 - 0.5) * k, (gg / 255 - 0.5) * k, (b / 255 - 0.5) * k];
  };
  const ts = tint(g.shadows), tm = tint(g.midtones), th = tint(g.highlights), tg = tint(g.global);
  const width = 0.15 + (g.blending / 100) * 0.35, pivot = 0.5 - (g.balance / 100) * 0.25;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], gr = d[i + 1], b = d[i + 2];
    if (cOn) {
      const [h, s, l] = rgbToHsl(r, gr, b);
      const wR = hueWeight(h, 0, 120), wG = hueWeight(h, 120, 120), wB = hueWeight(h, 240, 120);
      const nh = h + (wR * c.redHue + wG * c.greenHue + wB * c.blueHue) * 0.3;
      const ns = clamp01(s * (1 + (wR * c.redSat + wG * c.greenSat + wB * c.blueSat) / 100));
      [r, gr, b] = hslToRgb(nh, ns, l);
      if (c.shadowTint) { const k = (c.shadowTint / 100) * (1 - l) ** 2 * 20; r += k; b += k; gr -= k; }
    }
    if (gOn) {
      const L = (0.299 * r + 0.587 * gr + 0.114 * b) / 255;
      const wS = smoothstep(pivot + width, pivot - width, L), wH = smoothstep(pivot - width, pivot + width, L), wM = Math.max(0, 1 - wS - wH);
      const add = [0, 1, 2].map((k) => (ts[k] * wS + tm[k] * wM + th[k] * wH + tg[k]) * 255);
      const nr = r + add[0], ng = gr + add[1], nb = b + add[2], L2 = (0.299 * nr + 0.587 * ng + 0.114 * nb) / 255, fix = (L - L2) * 255;
      r = nr + fix; gr = ng + fix; b = nb + fix;
    }
    d[i] = clamp255(r); d[i + 1] = clamp255(gr); d[i + 2] = clamp255(b);
  }
}

/** Bilinear sample of one channel at (x, y), or -1 outside the image. */
function sampleChannel(d: Uint8ClampedArray, w: number, h: number, x: number, y: number, c: number): number {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return -1;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number): number => d[(yy * w + xx) * 4 + c];
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

/** Optics after the colour work: Distortion as Lens Correction draws it, then chromatic aberration (the red channel
 *  scaled about the centre one way and the blue the other) and lens vignetting (corners brightened or darkened, the
 *  falloff starting at Midpoint). */
function opticsPass(src: ImageData, o: OpticsState): ImageData {
  let img = o.distortion ? lensDistort(src, o.distortion) : src;
  const { width: w, height: h } = img, cx = (w - 1) / 2, cy = (h - 1) / 2, rmax = Math.hypot(cx, cy) || 1;
  if (o.chromatic || o.vignetting) {
    const out = new ImageData(new Uint8ClampedArray(img.data), w, h), d = img.data, od = out.data, k = (o.chromatic / 100) * 0.006;
    const start = (o.midpoint / 100) * 0.9;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (k) for (const [c, f] of [[0, 1 + k], [2, 1 - k]] as const) { const v = sampleChannel(d, w, h, cx + (x - cx) / f, cy + (y - cy) / f, c); if (v >= 0) od[i + c] = v; }
      if (o.vignetting) {
        const r = Math.hypot(x - cx, y - cy) / rmax, fall = smoothstep(start, 1, r) * (o.vignetting / 100) * 0.8;
        for (let c = 0; c < 3; c++) od[i + c] = clamp255(fall > 0 ? od[i + c] + (255 - od[i + c]) * fall : od[i + c] * (1 + fall));
      }
    }
    img = out;
  }
  return img;
}

/** Geometry, last: each output pixel sampled from where the transform (rotate, scale, offset, then vertical and
 *  horizontal perspective, as keystone) takes it from; outside the image becomes transparent. */
function geometryPass(src: ImageData, g: GeometryState): ImageData {
  const { width: w, height: h, data: d } = src, out = new ImageData(w, h), o = out.data, cx = (w - 1) / 2, cy = (h - 1) / 2;
  const a = (-g.rotate * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), s = 100 / Math.max(1, g.scale);
  const ox = (g.offsetX / 100) * cx, oy = (g.offsetY / 100) * cy, kv = (g.vertical / 100) * 0.5, kh = (g.horizontal / 100) * 0.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let u = (x - cx - ox) * s, v = (y - cy - oy) * s;
    [u, v] = [u * ca - v * sa, u * sa + v * ca];
    const pu = u / Math.max(0.1, 1 + kv * (v / cy)), pv = v / Math.max(0.1, 1 + kh * (u / cx));
    const i = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) { const val = sampleChannel(d, w, h, cx + pu, cy + pv, c); o[i + c] = val < 0 ? 0 : val; }
  }
  return out;
}

/** The whole Develop filter on `src`, in the develop studio's order: the per-pixel pass, then calibration and colour
 *  grading, then clarity, texture and sharpening, then optics and geometry. `scale` shrinks the detail radii for a
 *  scaled preview. Panels at their defaults are skipped, so a state without them renders as before. */
export function developImage(src: ImageData, state: DevelopState, scale = 1, seed = 7): ImageData {
  let img = new ImageData(src.width, src.height);
  developPass(src.data, img.data, src.width, src.height, state, seed);
  const grading = gradingOf(state), calibration = calibrationOf(state), optics = opticsOf(state), geometry = geometryOf(state);
  if (gradingActive(grading) || calibrationActive(calibration)) gradePass(img, grading, calibration);
  const d = state.detail;
  if (d.clarity) img = clarityPass(img, d.clarity, scale);
  if (d.texture) img = detailPass(img, Math.max(0.5, 3 * scale), d.texture / 100, true);
  if (d.sharpen > 0) img = detailPass(img, Math.max(0.5, 1.2 * scale), d.sharpen / 100, false);
  if (opticsActive(optics)) img = opticsPass(img, optics);
  if (geometryActive(geometry)) img = geometryPass(img, geometry);
  return img;
}
