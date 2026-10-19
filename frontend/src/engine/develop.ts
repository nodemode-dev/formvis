import { gaussianBlur, lensDistort } from './filters';
import { reduceNoiseImage } from './filters-lib/noise';

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

export const HSL_BANDS = ["reds", "oranges", "yellows", "greens", "cyans", "blues", "purples", "magentas"] as const;
export type HslBand = typeof HSL_BANDS[number];

export interface HslBandState { h: number; s: number; l: number; }

/** Color mixer: a master shift plus eight hue bands (fixed centers, 60-degree
 *  widths with cosine falloff, 30 for oranges and purples; cyans are the Aquas), or a colorize override. States saved
 *  with six bands have no oranges or purples: `bandOf` reads those as untouched. */
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
  sharpen: number;   // 0..100 unsharp (1.2px radius unless sharpenRadius is set)
  /** Sharpening's Radius (1 to 3 px, 1.2 when unset), Detail (0 to 100, 100 when unset: the plain unsharp pass; lower holds
   *  back the halos) and Masking (0 to 100: sharpen only where the edges are, none at 0). */
  sharpenRadius?: number;
  sharpenDetail?: number;
  sharpenMasking?: number;
}

/** Noise Reduction: Luminance (0 to 100) with its Detail (0 to 100, 50 when unset) and Contrast (0 to 100), and Color (0 to 100). */
export interface NoiseState { luminance: number; detail: number; contrast: number; color: number; colorDetail?: number; colorSmoothness?: number }
export const defaultNoise = (): NoiseState => ({ luminance: 0, detail: 50, contrast: 0, color: 0, colorDetail: 50, colorSmoothness: 50 });
export const noiseOf = (s: DevelopState): NoiseState => ({ ...defaultNoise(), ...s.noise });
export const noiseActive = (n: NoiseState): boolean => n.luminance > 0 || n.color > 0;

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
  parametric?: ParametricState;
  pointColor?: PointColorState;
  noise?: NoiseState;
  /** Dehaze by the dark channel prior (a patch minimum finds the haze, the airlight is taken from the haziest pixels and
   *  divided out) instead of the per-pixel heuristic; a positive Dehaze only, run on the CPU before the tone pass. */
  dehazeDark?: boolean;
  /** 0 to 100: with the dark channel Dehaze, how much a bright smooth region near the airlight (sky) is held back to the original. */
  dehazeSky?: number;
  /** With Dehaze: take the haze from a depth map (far is hazier) instead of the dark channel. Needs a depth passed to developImage. */
  dehazeDepth?: boolean;
  /** 0 to 100 (50 when absent): how thick the haze is taken to be, with the dark channel or depth Dehaze. */
  dehazeDensity?: number;
  /** Shape of the Effects vignette (tone.vignette); its defaults reproduce the plain vignette. */
  vignette?: VignetteShape;
  /** Tone process: 2 (the current one, and what a state without it means) or 1 (the earlier, which reaches less far into the tones; see TONE_PROCESS). */
  process?: 1 | 2;
}

/** Effects vignette shape: `midpoint` (0 to 100, percent of the corner distance where the fall starts), `feather` (1 to 100,
 *  50 as the plain vignette, higher is softer) and `roundness` (0 to 100, 100 a circle, 0 follows the frame). A negative
 *  tone.vignette brightens the corners toward white instead. */
export interface VignetteShape {
  midpoint: number; feather: number; roundness: number;
  /** Hex colour the corners fall to; empty is black for a darkening vignette, white for a lightening one. */
  color?: string;
  /** 0 to 100: how much of the fall is held back on bright pixels, so highlights keep their value. */
  protect?: number;
  /** Paint Overlay (the plain fall), Highlight Priority (bright pixels keep their value) or Color Priority (the corners darken without losing colour). */
  style?: 'paint' | 'highlight' | 'color';
  /** Apply the vignette to the finished frame, after Geometry has turned, scaled or shifted the picture, rather than to the picture. */
  postCrop?: boolean;
}
export const defaultVignetteShape = (): VignetteShape => ({ midpoint: 30, feather: 50, roundness: 100 });
export const vignetteShapeOf = (s: DevelopState): VignetteShape => ({ ...defaultVignetteShape(), ...s.vignette });

/** What a tone process sets for Shadows, Highlights, Whites and Blacks: where each mask starts or ends (luminance 0 to 1)
 *  and how hard it pushes. Process 2 is the pass as it has always been; process 1 has narrower masks and gentler gains. */
export interface ToneProcess { shadEdge: number; shadGain: number; highLo: number; highGain: number; whiteLo: number; whiteGain: number; blackEdge: number; blackGain: number }
export const TONE_PROCESS: Record<1 | 2, ToneProcess> = {
  2: { shadEdge: 0.65, shadGain: 0.75, highLo: 0.3, highGain: 0.8, whiteLo: 0.45, whiteGain: 1.2, blackEdge: 0.35, blackGain: 0.8 },
  1: { shadEdge: 0.5, shadGain: 0.6, highLo: 0.5, highGain: 0.65, whiteLo: 0.6, whiteGain: 0.9, blackEdge: 0.25, blackGain: 0.65 },
};
export const toneProcessOf = (s: DevelopState): ToneProcess => TONE_PROCESS[s.process === 1 ? 1 : 2];

/** Set by the app: the Depth Map layer's grey (near bright) at each pixel of a render whose top left is at (originX, originY)
 *  in document units, or null when the document has none of its size. */
export const depthSource: { read: ((c: { width: number; height: number; originX: number; originY: number; unitsPerPixel: number }) => Uint8Array | null) | null } = { read: null };

const darkDehazeOn = (s: DevelopState): boolean => (s.dehazeDark === true || s.dehazeDepth === true) && s.tone.dehaze !== 0;
const vignetteExtras = (s: DevelopState): boolean => s.tone.vignette !== 0 && ((s.vignette?.protect ?? 0) > 0 || (s.vignette?.color ?? '') !== '' || (s.vignette?.style ?? 'paint') !== 'paint' || vignetteAfterGeometry(s));
const vignetteAfterGeometry = (s: DevelopState): boolean => s.vignette?.postCrop === true && geometryActive(geometryOf(s));
const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};

/** Point Color: a colour picked from the picture (a hex string; empty for none) and how far around it the change reaches
 *  (`range`, 0 to 100 percent of the hue wheel's 90 degrees, and as much of the saturation and lightness range), then the
 *  hue (-100 to 100, up to 60 degrees), saturation and luminance (-100 to 100) shifts given to the colours that match. */
export interface PointColorState { color: string; range: number; h: number; s: number; l: number }
export const defaultPointColor = (): PointColorState => ({ color: '', range: 50, h: 0, s: 0, l: 0 });
export const pointColorOf = (s: DevelopState): PointColorState => ({ ...defaultPointColor(), ...s.pointColor });
export const pointColorActive = (p: PointColorState): boolean => /^#[0-9a-f]{6}$/i.test(p.color) && (p.h !== 0 || p.s !== 0 || p.l !== 0);

/** Point Color on `img` in place: each pixel's closeness to the picked colour (hue distance, then saturation and lightness
 *  distance, each against the range, with a cosine falloff) scales the shifts it receives. Greys have no hue and are left alone. */
export function pointColorPass(img: ImageData, pc: PointColorState): void {
  const n = parseInt(pc.color.slice(1), 16), [h0, s0, l0] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255), d = img.data;
  const reach = Math.max(0.05, pc.range / 100), hueW = 90 * reach, satW = 0.6 * reach + 0.1, lumW = 0.6 * reach + 0.1;
  const falloff = (dist: number, width: number): number => (dist >= width ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * dist / width));
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (s < 0.02) continue;
    let dh = Math.abs(h - h0);
    if (dh > 180) dh = 360 - dh;
    const w = falloff(dh, hueW) * falloff(Math.abs(s - s0), satW) * falloff(Math.abs(l - l0), lumW);
    if (w <= 0) continue;
    const [r, g, b] = hslToRgb(h + pc.h * 0.6 * w, clamp01(s * (1 + (pc.s / 100) * w)), shiftLightness(l, (pc.l / 100) * 0.5 * w));
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
}

/** Parametric curve: how far each of the four tone zones (shadows, darks, lights, highlights; -100 to 100) is raised or
 *  lowered, with the split points between them (percent of the range) that set where one zone hands over to the next. */
export interface ParametricState { shadows: number; darks: number; lights: number; highlights: number; split1: number; split2: number; split3: number }
export const defaultParametric = (): ParametricState => ({ shadows: 0, darks: 0, lights: 0, highlights: 0, split1: 25, split2: 50, split3: 75 });
export const parametricOf = (s: DevelopState): ParametricState => ({ ...defaultParametric(), ...s.parametric });
export const parametricActive = (p: ParametricState): boolean => p.shadows !== 0 || p.darks !== 0 || p.lights !== 0 || p.highlights !== 0;

/** The 256 entry table of a parametric curve: each zone is a raised-cosine bump centred between its split points, so the
 *  zones overlap smoothly and a zone at 100 moves its centre by a fifth of the range. */
export function buildParametricLut(p: ParametricState): Uint8Array {
  const a = clamp01(p.split1 / 100), b = clamp01(Math.max(p.split2, p.split1 + 1) / 100), c = clamp01(Math.max(p.split3, p.split2 + 1, p.split1 + 2) / 100);
  const centres = [a / 2, (a + b) / 2, (b + c) / 2, (c + 1) / 2], halfW = [Math.max(a, 0.05), Math.max(b - a, 0.05) + 0.1, Math.max(c - b, 0.05) + 0.1, Math.max(1 - c, 0.05)];
  const amounts = [p.shadows, p.darks, p.lights, p.highlights], lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let shift = 0;
    for (let k = 0; k < 4; k++) {
      const d = Math.abs(x - centres[k]) / (halfW[k] * 1.5);
      if (d < 1) shift += (amounts[k] / 100) * 0.2 * (0.5 + 0.5 * Math.cos(Math.PI * d));
    }
    lut[i] = Math.round(clamp01(x + shift) * 255);
  }
  return lut;
}

export interface GradeWheel { h: number; s: number; l?: number }
/** Colour grading: a hue (0 to 360), saturation (0 to 100) and luminance (-100 to 100, `l`) for shadows, midtones and
 *  highlights and for the whole image; Blending (0 to 100) widens the overlap of the three ranges, Balance (-100 to 100) moves it toward the highlights. */
export interface GradingState { shadows: GradeWheel; midtones: GradeWheel; highlights: GradeWheel; global: GradeWheel; blending: number; balance: number }
/** Optics: Distortion (-100 to 100, as Lens Correction), Chromatic Aberration (-100 to 100, red and blue channels
 *  scaled apart), Vignetting (-100 to 100, positive brightens the corners) and its Midpoint (0 to 100). */
/** `feather` (0 to 100, 50 reaches full strength at the corners) is the vignette's softness; `roundness` (0 to 100, 100 a
 *  circle as before) follows the frame's shape as it falls. */
export interface OpticsState { distortion: number; chromatic: number; vignetting: number; midpoint: number; defringe?: number; feather?: number; roundness?: number; removeCA?: boolean }
/** Geometry: Vertical and Horizontal perspective (-100 to 100), Rotate (-10 to 10 degrees), Scale (50 to 150 percent),
 *  Offset X and Y (-100 to 100, percent of half the image). */
export interface GeometryState { vertical: number; horizontal: number; rotate: number; scale: number; offsetX: number; offsetY: number }
/** Calibration: each primary's hue and saturation (-100 to 100) and Shadows Tint (-100 green to 100 magenta). */
export interface CalibrationState { shadowTint: number; redHue: number; redSat: number; greenHue: number; greenSat: number; blueHue: number; blueSat: number }

export const defaultGrading = (): GradingState => ({ shadows: { h: 0, s: 0 }, midtones: { h: 0, s: 0 }, highlights: { h: 0, s: 0 }, global: { h: 0, s: 0 }, blending: 50, balance: 0 });
export const defaultOptics = (): OpticsState => ({ distortion: 0, chromatic: 0, vignetting: 0, midpoint: 50, defringe: 0, feather: 50, roundness: 100 });
export const defaultGeometry = (): GeometryState => ({ vertical: 0, horizontal: 0, rotate: 0, scale: 100, offsetX: 0, offsetY: 0 });
export const defaultCalibration = (): CalibrationState => ({ shadowTint: 0, redHue: 0, redSat: 0, greenHue: 0, greenSat: 0, blueHue: 0, blueSat: 0 });
export const gradingOf = (s: DevelopState): GradingState => ({ ...defaultGrading(), ...s.grading });
export const opticsOf = (s: DevelopState): OpticsState => ({ ...defaultOptics(), ...s.optics });
export const geometryOf = (s: DevelopState): GeometryState => ({ ...defaultGeometry(), ...s.geometry });
export const calibrationOf = (s: DevelopState): CalibrationState => ({ ...defaultCalibration(), ...s.calibration });

export const BAND_CENTER: Record<HslBand, number> = {
  reds: 0, oranges: 30, yellows: 60, greens: 120, cyans: 180, blues: 240, purples: 270, magentas: 300,
};
export const BAND_WIDTH: Record<HslBand, number> = {
  reds: 60, oranges: 30, yellows: 60, greens: 60, cyans: 60, blues: 60, purples: 30, magentas: 60,
};
export const bandOf = (c: ColorMixState, k: HslBand): HslBandState => c.bands[k] ?? { h: 0, s: 0, l: 0 };

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
      bands: { reds: band(), oranges: band(), yellows: band(), greens: band(),
               cyans: band(), blues: band(), purples: band(), magentas: band() },
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
  return on(c.master) || HSL_BANDS.some((k) => on(bandOf(c, k)));
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

/** True when the state holds only per-pixel stages: `developPass`, the parametric curve's table, Point Color, Calibration and
 *  Colour Grading. The stages that need neighbours or a resample (noise, dark channel dehaze, clarity, texture, sharpening,
 *  optics, geometry) and the vignette's extras are all at their defaults. The GPU runs only these. */
export function developPerPixelOnly(s: DevelopState): boolean {
  const o = opticsOf(s);
  return !darkDehazeOn(s) && !vignetteExtras(s) && !noiseActive(noiseOf(s)) && !detailActive(s.detail) && (!opticsActive(o) || opticsVignetteOnly(o)) && !geometryActive(geometryOf(s));
}

/** Optics with only the lens vignette set: a per-pixel stage the GPU pass runs after Colour Grading. */
export const opticsVignetteOnly = (o: OpticsState): boolean => o.vignetting !== 0 && o.distortion === 0 && o.chromatic === 0 && (o.defringe ?? 0) === 0 && o.removeCA !== true;

export function stateActive(s: DevelopState): boolean {
  return toneActive(s.tone) || colorActive(s.color) || curvesActive(s.curves) || detailActive(s.detail) || noiseActive(noiseOf(s))
    || parametricActive(parametricOf(s)) || pointColorActive(pointColorOf(s)) || gradingActive(gradingOf(s)) || calibrationActive(calibrationOf(s)) || opticsActive(opticsOf(s)) || geometryActive(geometryOf(s));
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

/** Lightness shift: positive lifts toward white, negative
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

const vigOut: [number, number, number] = [0, 0, 0];
/** One pixel through the vignette into `vigOut`: `fall` (0 to 1) is how far into the corner it sits. Highlight Priority holds
 *  back the fall on bright pixels; Color Priority darkens the luminance by the full mask but the colour difference only by the
 *  mask to the power 0.9, so the corners keep a little more saturation than a plain darkening. */
function vignetteMix(r: number, g: number, b: number, fall: number, dark: boolean, color: [number, number, number] | null, protect: number, style: 'paint' | 'highlight' | 'color'): void {
  const prot = style === 'highlight' ? Math.max(protect, 0.7) : protect;
  if (prot > 0) { const lum = 0.299 * r + 0.587 * g + 0.114 * b, hi = clamp01((lum - 0.45) / 0.45); fall *= 1 - prot * hi * hi * (3 - 2 * hi); }
  if (color) { r += (color[0] - r) * fall; g += (color[1] - g) * fall; b += (color[2] - b) * fall; }
  else if (dark) {
    const mask = 1 - fall;
    if (style === 'color') { const l = 0.299 * r + 0.587 * g + 0.114 * b, k = Math.pow(mask, 0.9); r = l * mask + (r - l) * k; g = l * mask + (g - l) * k; b = l * mask + (b - l) * k; }
    else { r *= mask; g *= mask; b *= mask; }
  } else { r += (1 - r) * fall; g += (1 - g) * fall; b += (1 - b) * fall; }
  vigOut[0] = r; vigOut[1] = g; vigOut[2] = b;
}

/** The vignette on the finished frame (after Geometry), centred on the frame itself, so a rotated or scaled picture keeps its
 *  vignette at the frame's corners. */
function vignettePostPass(img: ImageData, state: DevelopState): void {
  const w = img.width, h = img.height, d = img.data, vs = vignetteShapeOf(state), cx = w / 2, cy = h / 2, maxRadius = Math.hypot(cx, cy), vro = vs.roundness / 100;
  const vsx = Math.max(1, cx * (1 - vro) + maxRadius * vro), vsy = Math.max(1, cy * (1 - vro) + maxRadius * vro), vcorner = Math.hypot(cx / vsx, cy / vsy) || 1;
  const vslope = (Math.abs(state.tone.vignette) / 50) * (50 / Math.max(1, vs.feather)), vmid = vs.midpoint / 100, color = vs.color ? hexRgb(vs.color) : null, prot = clamp01((vs.protect ?? 0) / 100);
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % w, py = Math.floor(i / 4 / w);
    vignetteMix(d[i]! / 255, d[i + 1]! / 255, d[i + 2]! / 255, clamp01((Math.hypot((px - cx) / vsx, (py - cy) / vsy) / vcorner - vmid) * vslope), state.tone.vignette > 0, color, prot, vs.style ?? 'paint');
    d[i] = clamp01(vigOut[0]) * 255; d[i + 1] = clamp01(vigOut[1]) * 255; d[i + 2] = clamp01(vigOut[2]) * 255;
  }
}

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
  const vignette = t.vignette, grain = t.grain, tp = toneProcessOf(state);

  const hasColor = colorActive(state.color);
  const hasCurve = curvesActive(state.curves);
  const lutRgb = hasCurve ? buildCurveLut(state.curves.rgb) : null;
  const lutR = hasCurve ? buildCurveLut(state.curves.r) : null;
  const lutG = hasCurve ? buildCurveLut(state.curves.g) : null;
  const lutB = hasCurve ? buildCurveLut(state.curves.b) : null;
  const rand = grain > 0 ? rng(grainSeed) : null;

  const cx = w / 2, cy = h / 2;
  const maxRadius = Math.sqrt(cx * cx + cy * cy);
  const vs = vignetteShapeOf(state), vro = vs.roundness / 100, vsx = Math.max(1, cx * (1 - vro) + maxRadius * vro), vsy = Math.max(1, cy * (1 - vro) + maxRadius * vro);
  const vcorner = Math.hypot(cx / vsx, cy / vsy) || 1, vmid = vs.midpoint / 100, vslope = (Math.abs(vignette) / 50) * (50 / Math.max(1, vs.feather));
  const vcolor = vs.color ? hexRgb(vs.color) : null, vprot = clamp01((vs.protect ?? 0) / 100), vstyle = vs.style ?? 'paint', vlater = vignetteAfterGeometry(state);

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
      const mask = 1 - smoothstep(0, tp.shadEdge, luma);
      if (v > 0) { r += (1 - r) * mask * v * tp.shadGain; g += (1 - g) * mask * v * tp.shadGain; b += (1 - b) * mask * v * tp.shadGain; }
      else { r += r * mask * v * tp.shadGain; g += g * mask * v * tp.shadGain; b += b * mask * v * tp.shadGain; }
    }
    if (high !== 0) {
      const v = high / 100;
      const boost = smoothstep(tp.highLo, 1, luma) * v * tp.highGain;
      const lumaNew = v > 0 ? luma + (1 - luma) * boost : luma + luma * boost;
      const ratio = lumaNew / Math.max(1e-5, luma);
      r *= ratio; g *= ratio; b *= ratio; luma = lumaNew;
    }
    if (white !== 0) {
      const v = white / 100;
      const boost = smoothstep(tp.whiteLo, 1, luma) * v * tp.whiteGain;
      const lumaNew = v > 0 ? luma + (1 - luma) * boost : luma + luma * boost;
      const ratio = lumaNew / Math.max(1e-5, luma);
      r *= ratio; g *= ratio; b *= ratio; luma = lumaNew;
    }
    if (black !== 0) {
      const v = black / 100;
      const mask = 1 - smoothstep(0, tp.blackEdge, luma);
      if (v > 0) { r += (1 - r) * mask * v * tp.blackGain; g += (1 - g) * mask * v * tp.blackGain; b += (1 - b) * mask * v * tp.blackGain; }
      else { r += r * mask * v * tp.blackGain; g += g * mask * v * tp.blackGain; b += b * mask * v * tp.blackGain; }
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
    if (vignette !== 0 && !vlater) {
      const px = (i / 4) % w, py = Math.floor(i / 4 / w);
      vignetteMix(r, g, b, clamp01((Math.hypot((px - cx) / vsx, (py - cy) / vsy) / vcorner - vmid) * vslope), vignette > 0, vcolor, vprot, vstyle);
      r = vigOut[0]; g = vigOut[1]; b = vigOut[2];
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
          const conf = bandOf(c, band);
          if (conf.h === 0 && conf.s === 0 && conf.l === 0) continue;
          const weight = hueWeight(hh, BAND_CENTER[band], BAND_WIDTH[band]);
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

export const gradingActive = (g: GradingState): boolean => [g.shadows, g.midtones, g.highlights, g.global].some((w) => w.s !== 0 || (w.l ?? 0) !== 0);
export const calibrationActive = (c: CalibrationState): boolean => Object.values(c).some((v) => v !== 0);
const opticsActive = (o: OpticsState): boolean => o.distortion !== 0 || o.chromatic !== 0 || o.vignetting !== 0 || (o.defringe ?? 0) !== 0 || o.removeCA === true;

/** Defringe: on pixels within two pixels of a strong luminance edge whose colour is purple or green and fairly
 *  saturated, pulls the colour toward the pixel's own luminance by `amount` percent. */
export function defringePass(src: ImageData, amount: number): ImageData {
  const { width: w, height: h } = src, s = src.data, out = new ImageData(new Uint8ClampedArray(s), w, h), d = out.data, k = clamp01(amount / 100);
  if (!k) return out;
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) luma[i] = (0.299 * s[i * 4] + 0.587 * s[i * 4 + 1] + 0.114 * s[i * 4 + 2]) / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    let edge = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) edge = Math.max(edge, Math.abs(luma[yy * w + xx] - luma[p]));
    }
    if (edge < 0.15) continue;
    const [hue, sat] = rgbToHsl(s[i], s[i + 1], s[i + 2]);
    const fringe = Math.max(hueWeight(hue, 290, 80), hueWeight(hue, 120, 80)) * smoothstep(0.15, 0.4, sat) * smoothstep(0.15, 0.4, edge);
    if (fringe <= 0) continue;
    const y0 = luma[p] * 255, f = fringe * k;
    for (let c = 0; c < 3; c++) d[i + c] = clamp255(Math.round(s[i + c] + (y0 - s[i + c]) * f));
  }
  return out;
}
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
      const wS = smoothstep(pivot + width, pivot - width, L), wH = smoothstep(pivot - width, pivot + width, L), wM = 1 - smoothstep(0, width, Math.abs(L - pivot));
      const add = [0, 1, 2].map((k) => (ts[k] * wS + tm[k] * wM + th[k] * wH + tg[k]) * 255);
      const nr = r + add[0], ng = gr + add[1], nb = b + add[2], L2 = (0.299 * nr + 0.587 * ng + 0.114 * nb) / 255;
      const lift = (((g.shadows.l ?? 0) * wS + (g.midtones.l ?? 0) * wM + (g.highlights.l ?? 0) * wH + (g.global.l ?? 0)) / 100) * 0.4, fix = (L - L2 + lift) * 255;
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

/** Lateral chromatic aberration read off the picture: at sample points on strong green edges, the scale (within 0.6
 *  percent) about the centre that brings the red, and separately the blue, channel closest to the green. A scale is kept
 *  only if it cuts the mismatch by a tenth against none, so a picture without the fault is left as it is. */
export function estimateAberration(img: ImageData): { red: number; blue: number } {
  const { width: w, height: h, data: d } = img, cx = (w - 1) / 2, cy = (h - 1) / 2, step = Math.max(1, Math.round(Math.sqrt((w * h) / 40000))), pts: number[] = [];
  for (let y = 1; y < h - 1; y += step) for (let x = 1; x < w - 1; x += step) {
    const i = (y * w + x) * 4;
    if (Math.abs(d[i + 5] - d[i - 3]) + Math.abs(d[i + 1 + w * 4] - d[i + 1 - w * 4]) > 40) pts.push(x, y);
  }
  const best = (c: number): number => {
    let bk = 0, bc = Infinity, c0 = 0;
    for (let n = -6; n <= 6; n++) {
      const k = n * 0.001;
      let cost = 0;
      for (let p = 0; p < pts.length; p += 2) {
        const x = pts[p], y = pts[p + 1], v = sampleChannel(d, w, h, cx + (x - cx) / (1 + k), cy + (y - cy) / (1 + k), c);
        if (v >= 0) cost += (v - d[(y * w + x) * 4 + 1]) ** 2;
      }
      if (n === 0) c0 = cost;
      if (cost < bc) { bc = cost; bk = k; }
    }
    return bc < c0 * 0.9 ? bk : 0;
  };
  return pts.length < 20 ? { red: 0, blue: 0 } : { red: best(0), blue: best(2) };
}

/** Optics after the colour work: Distortion as Lens Correction draws it, then chromatic aberration (the red channel
 *  scaled about the centre one way and the blue the other) and lens vignetting (corners brightened or darkened, the
 *  falloff starting at Midpoint). */
function opticsPass(src: ImageData, o: OpticsState): ImageData {
  let img = o.distortion ? lensDistort(src, o.distortion) : src;
  if (o.defringe) img = defringePass(img, o.defringe);
  const { width: w, height: h } = img, cx = (w - 1) / 2, cy = (h - 1) / 2, rmax = Math.hypot(cx, cy) || 1;
  if (o.chromatic || o.vignetting || o.removeCA) {
    const out = new ImageData(new Uint8ClampedArray(img.data), w, h), d = img.data, od = out.data, k = (o.chromatic / 100) * 0.006;
    const auto = o.removeCA ? estimateAberration(img) : { red: 0, blue: 0 }, fr = 1 + k + auto.red, fb = 1 - k + auto.blue;
    const start = (o.midpoint / 100) * 0.9, end = start + Math.max(0.002, (1 - start) * ((o.feather ?? 50) / 50)), ro = (o.roundness ?? 100) / 100;
    const sx = Math.max(1, cx * (1 - ro) + rmax * ro), sy = Math.max(1, cy * (1 - ro) + rmax * ro), corner = Math.hypot(cx / sx, cy / sy) || 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (fr !== 1 || fb !== 1) for (const [c, f] of [[0, fr], [2, fb]] as const) { const v = sampleChannel(d, w, h, cx + (x - cx) / f, cy + (y - cy) / f, c); if (v >= 0) od[i + c] = v; }
      if (o.vignetting) {
        const r = Math.hypot((x - cx) / sx, (y - cy) / sy) / corner, fall = smoothstep(start, end, r) * (o.vignetting / 100) * 0.8;
        for (let c = 0; c < 3; c++) od[i + c] = clamp255(fall > 0 ? od[i + c] + (255 - od[i + c]) * fall : od[i + c] * (1 + fall));
      }
    }
    img = out;
  }
  return img;
}

/** A separable window of radius `r` over `a`: the minimum, or the mean. */
function windowed(a: Float32Array, w: number, h: number, r: number, min: boolean): Float32Array {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
    let acc = min ? 1e9 : 0;
    for (let k = x0; k <= x1; k++) { const v = a[y * w + k]; acc = min ? Math.min(acc, v) : acc + v; }
    tmp[y * w + x] = min ? acc : acc / (x1 - x0 + 1);
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let acc = min ? 1e9 : 0;
      for (let k = y0; k <= y1; k++) { const v = tmp[k * w + x]; acc = min ? Math.min(acc, v) : acc + v; }
      out[y * w + x] = min ? acc : acc / (y1 - y0 + 1);
    }
  }
  return out;
}

/** Dark channel prior dehazing: the airlight A is the mean colour of the brightest 0.1 percent of the dark channel (the
 *  patch minimum of the least channel); the transmission is 1 - 0.95 x amount x the dark channel of the picture over A,
 *  smoothed; the scene is (I - A) / max(t, 0.15) + A. `amount` is 0 to 1; the patch radius follows the preview scale.
 *  A negative `amount` adds haze instead: the picture mixed toward the same airlight by up to 70 percent. */
function darkDehaze(src: ImageData, amount: number, scale: number, sky = 0, depth: Uint8Array | null = null, density = 0.5): ImageData {
  const { width: w, height: h, data: d } = src, n = w * h, r = Math.max(1, Math.round(7 * scale)), thick = Math.max(0, density) * 2;
  const least = new Float32Array(n);
  for (let i = 0; i < n; i++) least[i] = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) / 255;
  const dark = windowed(least, w, h, r, true), bins = new Uint32Array(256);
  for (let i = 0; i < n; i++) bins[Math.min(255, Math.round(dark[i] * 255))]++;
  let cut = 255, seen = 0;
  for (; cut > 0; cut--) { seen += bins[cut]; if (seen >= Math.max(1, n * 0.001)) break; }
  let ar = 0, ag = 0, ab = 0, cnt = 0;
  for (let i = 0; i < n; i++) if (Math.round(dark[i] * 255) >= cut) { ar += d[i * 4]; ag += d[i * 4 + 1]; ab += d[i * 4 + 2]; cnt++; }
  const A = [Math.max(1, ar / cnt), Math.max(1, ag / cnt), Math.max(1, ab / cnt)];
  if (amount < 0) {
    const out = new ImageData(w, h), o = out.data;
    for (let i = 0; i < n; i++) {
      const t = depth ? 1 - 0.7 * clamp01(-amount * thick * (1 - depth[i] / 255)) : 1 - 0.7 * clamp01(-amount * thick);
      for (let c = 0; c < 3; c++) o[i * 4 + c] = clamp255(d[i * 4 + c] * t + A[c] * (1 - t));
      o[i * 4 + 3] = d[i * 4 + 3];
    }
    return out;
  }
  const norm = new Float32Array(n);
  for (let i = 0; i < n; i++) norm[i] = Math.min(d[i * 4] / A[0], d[i * 4 + 1] / A[1], d[i * 4 + 2] / A[2]);
  const t = depth
    ? Float32Array.from({ length: n }, (_, i) => Math.exp(-2.5 * thick * clamp01(amount) * (1 - depth[i] / 255)))
    : windowed(windowed(norm, w, h, r, true).map((v) => 1 - 0.95 * clamp01(amount * thick) * Math.min(1, v)), w, h, r, false);
  const out = new ImageData(w, h), o = out.data;
  const keep = sky > 0 ? windowed(norm, w, h, r, true) : null, skyK = clamp01(sky);
  for (let i = 0; i < n; i++) {
    const k = 1 / Math.max(0.15, t[i]);
    const hold = keep ? skyK * clamp01((keep[i]! - 0.7) / 0.2) : 0;
    for (let c = 0; c < 3; c++) { const v = clamp255((d[i * 4 + c] - A[c]) * k + A[c]); o[i * 4 + c] = v + (d[i * 4 + c] - v) * hold; }
    o[i * 4 + 3] = d[i * 4 + 3];
  }
  return out;
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

/** The Temperature and Tint (slider units, -100 to 100) that make the colour (r, g, b; 0 to 255) neutral through the
 *  develop pass's own shifts: tint from the green deviation, temperature from the red and blue deviations left over. The
 *  shifts add, so a colour read off an already warmed picture gives the change to make on top of the current ones. */
export function whiteBalanceFor(r: number, g: number, b: number): { temperature: number; tint: number } {
  const lum = 0.299 * r / 255 + 0.587 * g / 255 + 0.114 * b / 255, dr = r / 255 - lum, dg = g / 255 - lum, db = b / 255 - lum;
  const tint = dg / 0.04, temp = ((-dr - 0.02 * tint) / 0.05 + (db + 0.02 * tint) / 0.05) / 2;
  const fit = (v: number): number => Math.max(-100, Math.min(100, Math.round(v * 100)));
  return { temperature: fit(temp), tint: fit(tint) };
}

/** Auto white balance: the picture's mean colour (pixels that are not clipped at either end) taken as the neutral. */
export function autoWhiteBalance(img: ImageData): { temperature: number; tint: number } {
  const d = img.data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const lo = Math.min(d[i], d[i + 1], d[i + 2]), hi = Math.max(d[i], d[i + 1], d[i + 2]);
    if (lo < 8 || hi > 247) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  return n ? whiteBalanceFor(r / n, g / n, b / n) : { temperature: 0, tint: 0 };
}

/** The Colour Mixer band a colour (r, g, b; 0 to 255) belongs to: the one whose centre is nearest its hue; null for a grey. */
export function bandFor(r: number, g: number, b: number): HslBand | null {
  const [h, s] = rgbToHsl(r, g, b);
  if (s < 0.05) return null;
  let best: HslBand = 'reds', gap = 1e9;
  for (const k of HSL_BANDS) {
    let d = Math.abs(h - BAND_CENTER[k]);
    if (d > 180) d = 360 - d;
    if (d < gap) { gap = d; best = k; }
  }
  return best;
}

/** Sharpening: the unsharp pass at `radius` (px times `scale`, at least 0.9 where the blur has any reach); `detail` (0 to 1,
 *  1 the plain unsharp pass) holds back the big overshoots, the halos, by a soft limit that tightens as it falls; `masking`
 *  (0 to 1) confines it to edges, by a smoothstep on the luminance gradient that needs a steeper edge the higher it is. */
export function sharpenPass(img: ImageData, amount: number, radius: number, detail: number, masking: number, scale = 1): ImageData {
  if (amount <= 0) return img;
  const r = Math.max(0.9, radius * scale), broad = detailPass(img, r, amount, false), lim = detail < 1 ? 10 + 400 * detail * detail : 0;
  const { width: w, height: h } = img, s = img.data, b = broad.data, out = new ImageData(new Uint8ClampedArray(s), w, h), d = out.data;
  const luma = new Float32Array(w * h);
  if (masking > 0) for (let i = 0; i < w * h; i++) luma[i] = (0.299 * s[i * 4] + 0.587 * s[i * 4 + 1] + 0.114 * s[i * 4 + 2]) / 255;
  const top = Math.max(0.002, masking * 0.3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    let m = 1;
    if (masking > 0) {
      const gx = luma[y * w + Math.min(w - 1, x + 1)] - luma[y * w + Math.max(0, x - 1)], gy = luma[Math.min(h - 1, y + 1) * w + x] - luma[Math.max(0, y - 1) * w + x];
      m = smoothstep(0, top, Math.hypot(gx, gy) / 2);
    }
    for (let c = 0; c < 3; c++) {
      const delta = b[i + c] - s[i + c], kept = lim ? lim * Math.tanh(delta / lim) : delta;
      d[i + c] = clamp255(Math.round(s[i + c] + kept * m));
    }
  }
  return out;
}

/** The whole Develop filter on `src`, in the develop studio's order: the per-pixel pass, then calibration and colour
 *  grading, then clarity, texture and sharpening, then optics and geometry. `scale` shrinks the detail radii for a
 *  scaled preview. Panels at their defaults are skipped, so a state without them renders as before. */
export function developImage(src: ImageData, state: DevelopState, scale = 1, seed = 7, depth: Uint8Array | null = null): ImageData {
  let img = new ImageData(src.width, src.height);
  const nr = noiseOf(state);
  if (noiseActive(nr)) src = reduceNoiseImage(src, { strength: nr.luminance / 10, preserve: nr.detail, color: nr.color, sharpen: nr.contrast, jpeg: false, colorDetail: nr.colorDetail, colorSmooth: nr.colorSmoothness }, scale);
  if (darkDehazeOn(state)) developPass(darkDehaze(src, state.tone.dehaze / 100, scale, (state.dehazeSky ?? 0) / 100, state.dehazeDepth === true && depth?.length === src.width * src.height ? depth : null, (state.dehazeDensity ?? 50) / 100).data, img.data, src.width, src.height, { ...state, tone: { ...state.tone, dehaze: 0 } }, seed);
  else developPass(src.data, img.data, src.width, src.height, state, seed);
  const grading = gradingOf(state), calibration = calibrationOf(state), optics = opticsOf(state), geometry = geometryOf(state), parametric = parametricOf(state);
  if (parametricActive(parametric)) {
    const lut = buildParametricLut(parametric), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  }
  const point = pointColorOf(state);
  if (pointColorActive(point)) pointColorPass(img, point);
  if (gradingActive(grading) || calibrationActive(calibration)) gradePass(img, grading, calibration);
  const d = state.detail;
  if (d.clarity) img = clarityPass(img, d.clarity, scale);
  if (d.texture) img = detailPass(img, Math.max(0.5, 3 * scale), d.texture / 100, true);
  if (d.sharpen > 0) img = sharpenPass(img, d.sharpen / 100, d.sharpenRadius ?? 1.2, (d.sharpenDetail ?? 100) / 100, (d.sharpenMasking ?? 0) / 100, scale);
  if (opticsActive(optics)) img = opticsPass(img, optics);
  if (geometryActive(geometry)) img = geometryPass(img, geometry);
  if (state.tone.vignette !== 0 && vignetteAfterGeometry(state)) vignettePostPass(img, state);
  return img;
}

/** The clipping view the Light sliders show on an Alt-drag: pixels with a channel at white (254 or more) are red, pixels
 *  with every channel near black (2 or less) are blue, and the rest fall back to half-strength grey so the clipped
 *  areas stand out. Alpha is kept. */
export function clippingView(src: ImageData): ImageData {
  const out = new ImageData(src.width, src.height), s = src.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const hi = Math.max(s[i], s[i + 1], s[i + 2]);
    if (hi >= 254) { d[i] = 255; d[i + 1] = 0; d[i + 2] = 0; }
    else if (hi <= 2) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 255; }
    else { const g = Math.round((0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2]) * 0.5); d[i] = d[i + 1] = d[i + 2] = g; }
    d[i + 3] = s[i + 3];
  }
  return out;
}
