import type { LibValues } from '../filter-library';
import { clamp01, ease, flatten, grain, isOn, lit, lumaOf, menu, noiseField, num, opt, sharpen, slider, slopes, soften, steepness, streak, strokeReach, strokesOf, surfaceParams, swatch, texturize, type FxDef } from './gallery-fx';

const rgbOf = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

/** How far Kuwahara smoothing of radius `r` window pixels reaches. */
const flatReach = (r: number): number => 2 * Math.max(1, Math.ceil(r / 2));

const pencil = (width: number): { length: number; width: number } => ({ length: 4 + 2 * width, width: 0.4 + 0.3 * width });
const cutRadius = (v: LibValues, k: number): number => (1 + 0.6 * num(v, 'edgeSimplicity')) * k;
const cutEdge = (v: LibValues): number => 0.5 + (3 - num(v, 'edgeFidelity')) * 0.9 + 0.15 * num(v, 'edgeSimplicity');
const daubRadius = (v: LibValues, k: number): number => Math.max(1, num(v, 'brushSize') * 0.5 * (opt(v, 'brushType').startsWith('wide') ? 1.6 : 1) * k);
const knifeRadius = (v: LibValues, k: number): number => Math.max(1, num(v, 'strokeSize') * 0.4 * (1.6 - 0.3 * num(v, 'strokeDetail')) * k);
const washRadius = (v: LibValues, k: number): number => Math.max(1, (15 - num(v, 'brushDetail')) * 0.45 * k);

export const ARTISTIC_FX: readonly FxDef[] = [
  {
    key: 'coloredPencil', label: 'Colored Pencil', category: 'Artistic',
    params: [slider('pencilWidth', 1, 24, 4), slider('strokePressure', 0, 15, 8), slider('paperBrightness', 0, 50, 25)],
    note: 'The paper is a shade of the background color.',
    reach: (v, k) => { const s = pencil(num(v, 'pencilWidth')); return (strokeReach(s.length, s.width) + 2.4) * k + 2; },
    paint: (p, v) => {
      const { w, h, k } = p, press = num(v, 'strokePressure') / 15, shade = 0.3 + 0.7 * (num(v, 'paperBrightness') / 50), s = pencil(num(v, 'pencilWidth'));
      const S = strokesOf(p, 'leftDiagonal', s.length, s.width, 101), L = soften(lumaOf(p), w, h, 1, 0.8 * k), E = steepness(L, w, h, k), tint = soften(p.rgb, w, h, 3, 0.6 * k), c = p.rgb, bg = p.bg;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const t = L[i] * (1.2 - 0.7 * press) - Math.min(1, E[i] * 2) * 0.8, cover = ease(t - 0.12, t + 0.12, S[i]), dark = 0.65 + 0.35 * L[i];
        for (let ch = 0; ch < 3; ch++) { const paper = bg[ch] * shade; c[j + ch] = paper + (tint[j + ch] * dark - paper) * cover; }
      }
    },
  },
  {
    key: 'cutout', label: 'Cutout', category: 'Artistic',
    params: [slider('numberOfLevels', 2, 8, 4), slider('edgeSimplicity', 0, 10, 4), slider('edgeFidelity', 1, 3, 2)],
    reach: (v, k) => 2 * flatReach(cutRadius(v, k)) + 3 * cutEdge(v) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, levels = num(v, 'numberOfLevels'), r = cutRadius(v, k);
      flatten(p, r);
      flatten(p, r);
      const L = lumaOf(p), band = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) band[i] = Math.min(levels - 1, Math.floor(clamp01(L[i]) * levels));
      const round = soften(band, w, h, 1, cutEdge(v) * k), c = p.rgb;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const shift = (Math.round(round[i]) + 0.5) / levels - L[i];
        c[j] = clamp01(c[j] + shift); c[j + 1] = clamp01(c[j + 1] + shift); c[j + 2] = clamp01(c[j + 2] + shift);
      }
    },
  },
  {
    key: 'dryBrush', label: 'Dry Brush', category: 'Artistic',
    params: [slider('brushSize', 0, 10, 2), slider('brushDetail', 0, 10, 8), slider('texture', 1, 3, 1)],
    reach: (v, k) => flatReach((1 + num(v, 'brushSize')) * 1.2 * k) + (4.5 + strokeReach(6 + 2 * num(v, 'brushSize'), 1)) * k + 2,
    paint: (p, v) => {
      const size = num(v, 'brushSize');
      flatten(p, (1 + size) * 1.2 * p.k);
      sharpen(p, 1.5 * p.k, (num(v, 'brushDetail') / 10) * 0.9);
      const S = strokesOf(p, 'horizontal', 6 + 2 * size, 1, 211), c = p.rgb, amount = 0.12 * num(v, 'texture');
      for (let i = 0, j = 0; i < S.length; i++, j += 3) { const s = (S[i] - 0.5) * amount; c[j] = lit(c[j], s); c[j + 1] = lit(c[j + 1], s); c[j + 2] = lit(c[j + 2], s); }
    },
  },
  {
    key: 'filmGrain', label: 'Film Grain', category: 'Artistic',
    params: [slider('grain', 0, 20, 4), slider('highlightArea', 0, 20, 0), slider('intensity', 0, 10, 10)],
    reach: (_v, k) => 2.7 * k + 2,
    paint: (p, v) => {
      const amount = num(v, 'grain') / 20, area = num(v, 'highlightArea') / 20, strength = num(v, 'intensity') / 10;
      const L = lumaOf(p), G = grain(p, 307), S = noiseField(p, 311, 0.9 * p.k), c = p.rgb;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const l = L[i], deep = 1 - ease(0.5, 0.95, l), n = ((G[i] - 0.5) * deep + (S[i] - 0.5) * (1 - deep) * 1.2) * amount;
        const lift = area > 0 ? ease(1 - area, 1 - area * 0.4, l) * strength * 0.7 : 0;
        for (let ch = 0; ch < 3; ch++) c[j + ch] = clamp01(lit(clamp01(c[j + ch] + n), lift));
      }
    },
  },
  {
    key: 'fresco', label: 'Fresco', category: 'Artistic',
    params: [slider('brushSize', 0, 10, 2), slider('brushDetail', 0, 10, 8), slider('texture', 1, 3, 1)],
    reach: (v, k) => flatReach((1 + num(v, 'brushSize')) * k) + (2.1 + 3 * (1.2 + 0.4 * num(v, 'brushSize'))) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, size = num(v, 'brushSize'), detail = num(v, 'brushDetail') / 10, amount = 0.16 * num(v, 'texture');
      flatten(p, (1 + size) * k);
      const L = lumaOf(p), E = steepness(soften(L, w, h, 1, 0.7 * k), w, h, k), B = noiseField(p, 401, (1.2 + 0.4 * size) * k), c = p.rgb;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const edge = Math.min(1, E[i] * 2.5) * detail * 0.8, dab = (B[i] - 0.5) * amount;
        for (let ch = 0; ch < 3; ch++) { const x = c[j + ch]; c[j + ch] = clamp01((x * x * (3 - 2 * x) * 0.85 + dab) * (1 - edge)); }
      }
    },
  },
  {
    key: 'neonGlow', label: 'Neon Glow', category: 'Artistic',
    params: [slider('glowSize', -24, 24, 5), slider('glowBrightness', 0, 50, 15), swatch('glowColor', '#009eff')],
    note: 'Tones run from the foreground color to the background color under the glow; a negative size turns the glow inside out.',
    reach: (v, k) => (2.4 + 3 * (0.5 + 0.5 * Math.abs(num(v, 'glowSize')))) * k + 3,
    paint: (p, v) => {
      const { w, h, k } = p, size = num(v, 'glowSize'), bright = num(v, 'glowBrightness') / 50, glow = rgbOf(opt(v, 'glowColor'));
      const L = lumaOf(p), E = steepness(soften(L, w, h, 1, 0.8 * k), w, h, k), lines = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) lines[i] = Math.min(1, E[i] * 3);
      const G = soften(lines, w, h, 1, (0.5 + 0.5 * Math.abs(size)) * k), boost = 1 + 0.12 * Math.abs(size), c = p.rgb, f = p.fg, b = p.bg;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const g = Math.min(1, G[i] * boost), amount = (size < 0 ? 1 - g : g) * bright * 2, keep = 1 - Math.min(1, amount) * 0.4;
        for (let ch = 0; ch < 3; ch++) c[j + ch] = clamp01((f[ch] + (b[ch] - f[ch]) * L[i]) * keep + glow[ch] * amount);
      }
    },
  },
  {
    key: 'paintDaubs', label: 'Paint Daubs', category: 'Artistic',
    params: [slider('brushSize', 1, 50, 8), slider('sharpness', 0, 40, 7), menu('brushType', ['simple', 'lightRough', 'darkRough', 'wideSharp', 'wideBlurry', 'sparkle'])],
    reach: (v, k) => { const r = daubRadius(v, k); return flatReach(r) + (opt(v, 'brushType') === 'wideBlurry' ? 0.9 * r : 0) + 5.1 * k + 2; },
    paint: (p, v) => {
      const { w, h, k } = p, type = opt(v, 'brushType'), r = daubRadius(v, k);
      flatten(p, r);
      if (type === 'wideBlurry') p.rgb = soften(p.rgb, w, h, 3, r * 0.3);
      sharpen(p, 1.2 * k, (num(v, 'sharpness') / 40) * 1.5 + (type === 'wideSharp' ? 0.8 : 0));
      if (type !== 'lightRough' && type !== 'darkRough' && type !== 'sparkle') return;
      const N = noiseField(p, 503, 0.5 * k), L = lumaOf(p), c = p.rgb;
      for (let i = 0, j = 0; i < N.length; i++, j += 3) {
        const fleck = ease(0.6, 0.85, N[i]) * 0.35, s = type === 'lightRough' ? fleck : type === 'darkRough' ? -fleck : ease(0.82, 0.9, N[i]) * ease(0.55, 0.8, L[i]) * 0.9;
        for (let ch = 0; ch < 3; ch++) c[j + ch] = lit(c[j + ch], s);
      }
    },
  },
  {
    key: 'paletteKnife', label: 'Palette Knife', category: 'Artistic',
    params: [slider('strokeSize', 1, 50, 25), slider('strokeDetail', 1, 3, 3), slider('softness', 0, 10, 0)],
    reach: (v, k) => flatReach(knifeRadius(v, k)) + 1.05 * num(v, 'softness') * k + 3,
    paint: (p, v) => {
      const soft = num(v, 'softness');
      flatten(p, knifeRadius(v, p.k));
      if (soft > 0) p.rgb = soften(p.rgb, p.w, p.h, 3, soft * 0.35 * p.k);
      texturize(p, 'canvas', 100, 0.05, 'topLeft', false);
    },
  },
  {
    key: 'plasticWrap', label: 'Plastic Wrap', category: 'Artistic',
    params: [slider('highlightStrength', 0, 20, 15), slider('detail', 1, 15, 9), slider('smoothness', 1, 15, 7)],
    reach: (v, k) => 3 * (0.5 + 0.35 * num(v, 'smoothness')) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, strength = (num(v, 'highlightStrength') / 20) * 1.3, rise = num(v, 'detail') * 4 * k;
      const H = soften(lumaOf(p), w, h, 1, (0.5 + 0.35 * num(v, 'smoothness')) * k), [gx, gy] = slopes(H, w, h), c = p.rgb;
      for (let i = 0, j = 0; i < H.length; i++, j += 3) {
        const nx = -gx[i] * rise, ny = -gy[i] * rise, len = Math.hypot(nx, ny, 1), toward = (-0.26 * nx - 0.33 * ny + 0.907) / len, diffuse = (-0.45 * nx - 0.55 * ny + 0.7) / len;
        const shine = Math.pow(Math.max(0, toward), 30) * strength, shade = 0.85 + 0.15 * diffuse;
        for (let ch = 0; ch < 3; ch++) c[j + ch] = clamp01(c[j + ch] * shade + shine);
      }
    },
  },
  {
    key: 'posterEdges', label: 'Poster Edges', category: 'Artistic',
    params: [slider('edgeThickness', 0, 10, 2), slider('edgeIntensity', 0, 10, 1), slider('posterization', 0, 6, 2)],
    reach: (v, k) => (2.1 + 3 * (0.6 + 0.25 * num(v, 'edgeThickness'))) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, intensity = num(v, 'edgeIntensity'), q = 2 + 1.5 * num(v, 'posterization');
      const sm = soften(p.rgb, w, h, 3, 0.7 * k), E = steepness(soften(lumaOf(p), w, h, 1, (0.6 + 0.25 * num(v, 'edgeThickness')) * k), w, h, k), c = p.rgb, gain = 6 + 1.5 * intensity, dark = 0.5 + 0.05 * intensity;
      for (let i = 0, j = 0; i < E.length; i++, j += 3) {
        const ink = ease(0.3, 0.7, E[i] * gain) * dark;
        for (let ch = 0; ch < 3; ch++) c[j + ch] = (Math.round(clamp01(sm[j + ch]) * q) / q) * (1 - ink);
      }
    },
  },
  {
    key: 'roughPastels', label: 'Rough Pastels', category: 'Artistic',
    params: [slider('strokeLength', 0, 40, 6), slider('strokeDetail', 1, 20, 4), ...surfaceParams(20, 'bottom')],
    reach: (v, k) => ((2 + num(v, 'strokeLength')) / 2 + 3 + strokeReach(6 + 1.5 * num(v, 'strokeLength'), 1.2)) * k + 4,
    paint: (p, v) => {
      const { w, h, k } = p, len = num(v, 'strokeLength'), detail = (num(v, 'strokeDetail') / 20) * 1.5, base = p.rgb;
      const smear = streak(base, w, h, 3, 'rightDiagonal', (2 + len) * k), blur = soften(base, w, h, 3, k), S = strokesOf(p, 'rightDiagonal', 6 + 1.5 * len, 1.2, 601), L = lumaOf(p);
      const out = new Float32Array(base.length), depth = new Float32Array(L.length);
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const s = (S[i] - 0.5) * 0.3;
        for (let ch = 0; ch < 3; ch++) out[j + ch] = lit(clamp01(smear[j + ch] + (base[j + ch] - blur[j + ch]) * detail), s);
        depth[i] = 1.3 - L[i];
      }
      p.rgb = out;
      texturize(p, opt(v, 'texture'), num(v, 'scaling'), num(v, 'relief') / 50, opt(v, 'light'), isOn(v, 'invert'), depth);
    },
  },
  {
    key: 'smudgeStick', label: 'Smudge Stick', category: 'Artistic',
    params: [slider('strokeLength', 0, 10, 2), slider('highlightArea', 0, 20, 0), slider('intensity', 0, 10, 10)],
    reach: (v, k) => (1 + 1.25 * num(v, 'strokeLength')) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, area = num(v, 'highlightArea') / 20, strength = num(v, 'intensity') / 10, base = p.rgb;
      const smear = streak(base, w, h, 3, 'leftDiagonal', (2 + 2.5 * num(v, 'strokeLength')) * k), L = lumaOf(p);
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const l = L[i], amount = 0.45 + 0.55 * (1 - l), lift = ease(0.55, 1, l) * 0.3 + (area > 0 ? ease(1 - area, 1 - area * 0.3, l) * strength * 0.7 : 0);
        for (let ch = 0; ch < 3; ch++) { const b = base[j + ch], m = smear[j + ch], toward = Math.min(b, m) * 0.5 + m * 0.5; base[j + ch] = clamp01(lit(clamp01(b + (toward - b) * amount), lift)); }
      }
    },
  },
  {
    key: 'sponge', label: 'Sponge', category: 'Artistic',
    params: [slider('brushSize', 0, 10, 2), slider('definition', 0, 25, 12), slider('smoothness', 1, 15, 5)],
    reach: (v, k) => (0.75 * num(v, 'smoothness') + 3 * (0.7 + 0.35 * num(v, 'brushSize'))) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, def = num(v, 'definition') / 25, gain = 1 + def * 0.6;
      const sm = soften(p.rgb, w, h, 3, num(v, 'smoothness') * 0.25 * k), T = noiseField(p, 701, (0.7 + 0.35 * num(v, 'brushSize')) * k), c = p.rgb;
      for (let i = 0, j = 0; i < T.length; i++, j += 3) {
        const pore = ease(0.45, 0.72, T[i]) * def * 0.6;
        for (let ch = 0; ch < 3; ch++) c[j + ch] = clamp01((0.5 + (sm[j + ch] - 0.5) * gain) * (1 - pore));
      }
    },
  },
  {
    key: 'underpainting', label: 'Underpainting', category: 'Artistic',
    params: [slider('brushSize', 0, 40, 6), slider('textureCoverage', 0, 40, 16), ...surfaceParams(4, 'top')],
    reach: (v, k) => (3 * (0.5 + 0.4 * num(v, 'brushSize')) + 4.5) * k + 4,
    paint: (p, v) => {
      const { w, h, k } = p, base = p.rgb, under = soften(base, w, h, 3, (0.5 + 0.4 * num(v, 'brushSize')) * k), fine = soften(base, w, h, 3, 1.5 * k), out = new Float32Array(base.length);
      for (let i = 0; i < out.length; i++) out[i] = clamp01(under[i] + (base[i] - fine[i]) * 0.35);
      p.rgb = out;
      texturize(p, opt(v, 'texture'), num(v, 'scaling'), (num(v, 'relief') / 50) * (0.4 + (num(v, 'textureCoverage') / 40) * 1.6), opt(v, 'light'), isOn(v, 'invert'));
    },
  },
  {
    key: 'watercolor', label: 'Watercolor', category: 'Artistic',
    params: [slider('brushDetail', 1, 14, 9), slider('shadowIntensity', 0, 10, 1), slider('texture', 1, 3, 1)],
    reach: (v, k) => flatReach(washRadius(v, k)) + 6.3 * k + 3,
    paint: (p, v) => {
      const { w, h, k } = p, shadow = num(v, 'shadowIntensity') / 10, amount = 0.06 * num(v, 'texture');
      flatten(p, washRadius(v, k));
      p.rgb = soften(p.rgb, w, h, 3, 0.8 * k);
      const L = lumaOf(p), E = steepness(soften(L, w, h, 1, 0.6 * k), w, h, k), P = noiseField(p, 809, 0.7 * k), c = p.rgb;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const l = L[i], pool = 1 - Math.min(0.55, E[i] * 1.6), dark = 1 - shadow * 0.55 * (1 - l) * (1 - l), paper = (P[i] - 0.5) * amount;
        for (let ch = 0; ch < 3; ch++) c[j + ch] = clamp01((l + (c[j + ch] - l) * 1.3) * pool * dark + paper);
      }
    },
  },
];
