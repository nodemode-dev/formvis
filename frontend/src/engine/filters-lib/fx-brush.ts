import { clamp01, ease, lit, lumaOf, menu, noiseField, num, opt, sharpen, slider, soften, steepness, streak, strokeReach, strokesOf, WAYS, type FxDef, type Plate, type Way } from './gallery-fx';

/** Each pixel takes the colour from a random point up to `radius` document pixels away, the two random offsets
 *  softened by `sigma` window pixels so that neighbours move together. Reaches radius k + 3 sigma + 1. */
function spray(p: Plate, radius: number, sigma: number, seed: number): void {
  const { w, h, k } = p, r = radius * k;
  if (r < 0.5) return;
  const X = noiseField(p, seed, sigma), Y = noiseField(p, seed + 1, sigma), c = p.rgb, out = new Float32Array(c.length);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const sx = Math.min(w - 1, Math.max(0, Math.round(x + (X[i] - 0.5) * 2 * r))), sy = Math.min(h - 1, Math.max(0, Math.round(y + (Y[i] - 0.5) * 2 * r))), j = (sy * w + sx) * 3;
    out[i * 3] = c[j]; out[i * 3 + 1] = c[j + 1]; out[i * 3 + 2] = c[j + 2];
  }
  p.rgb = out;
}

export const BRUSH_FX: readonly FxDef[] = [
  {
    key: 'accentedEdges', label: 'Accented Edges', category: 'Brush Strokes',
    params: [slider('edgeWidth', 1, 14, 2), slider('edgeBrightness', 0, 50, 38), slider('smoothness', 1, 15, 5)],
    reach: (v, k) => (3 * (0.3 + 0.12 * num(v, 'smoothness')) + 3 * (0.5 + 0.3 * num(v, 'edgeWidth'))) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, width = num(v, 'edgeWidth'), bright = num(v, 'edgeBrightness') / 50, gain = 6 + 0.5 * width;
      const sm = soften(p.rgb, w, h, 3, (0.3 + 0.12 * num(v, 'smoothness')) * k), E = steepness(soften(lumaOf(p), w, h, 1, (0.5 + 0.3 * width) * k), w, h, k), c = p.rgb;
      for (let i = 0, j = 0; i < E.length; i++, j += 3) {
        const e = Math.min(1, E[i] * gain), s = (bright >= 0.5 ? e * (bright - 0.5) : -e * (0.5 - bright)) * 3.5;
        for (let ch = 0; ch < 3; ch++) c[j + ch] = lit(clamp01(sm[j + ch]), s);
      }
    },
  },
  {
    key: 'angledStrokes', label: 'Angled Strokes', category: 'Brush Strokes',
    params: [slider('directionBalance', 0, 100, 50), slider('strokeLength', 3, 50, 15), slider('sharpness', 0, 10, 3)],
    reach: (v, k) => (num(v, 'strokeLength') / 2 + strokeReach(num(v, 'strokeLength'), 1) + 3) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, len = num(v, 'strokeLength'), t = 1 - num(v, 'directionBalance') / 100, base = p.rgb;
      const A = streak(base, w, h, 3, 'rightDiagonal', len * k), B = streak(base, w, h, 3, 'leftDiagonal', len * k), SA = strokesOf(p, 'rightDiagonal', len, 1, 901), SB = strokesOf(p, 'leftDiagonal', len, 1, 907), L = lumaOf(p), out = new Float32Array(base.length);
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const wa = ease(t - 0.12, t + 0.12, L[i]), sa = (SA[i] - 0.5) * 0.3, sb = (SB[i] - 0.5) * 0.3;
        for (let ch = 0; ch < 3; ch++) out[j + ch] = lit(clamp01(B[j + ch]), sb) * (1 - wa) + lit(clamp01(A[j + ch]), sa) * wa;
      }
      p.rgb = out;
      sharpen(p, k, (num(v, 'sharpness') / 10) * 1.2);
    },
  },
  {
    key: 'crosshatch', label: 'Crosshatch', category: 'Brush Strokes',
    params: [slider('strokeLength', 3, 50, 9), slider('sharpness', 0, 20, 6), slider('strength', 1, 3, 1)],
    reach: (v, k) => (num(v, 'strength') * (num(v, 'strokeLength') / 4 + 1) + strokeReach(num(v, 'strokeLength'), 0.8) + 3) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, len = num(v, 'strokeLength');
      for (let pass = 0; pass < num(v, 'strength'); pass++) {
        const base = p.rgb, A = streak(base, w, h, 3, 'rightDiagonal', len * 0.5 * k), B = streak(base, w, h, 3, 'leftDiagonal', len * 0.5 * k);
        const SA = strokesOf(p, 'rightDiagonal', len, 0.8, 1001 + pass * 17), SB = strokesOf(p, 'leftDiagonal', len, 0.8, 1003 + pass * 17), L = lumaOf(p);
        for (let i = 0, j = 0; i < L.length; i++, j += 3) {
          const hatch = ((SA[i] + SB[i]) / 2 - 0.5) * (0.5 + 0.35 * (1 - L[i]));
          for (let ch = 0; ch < 3; ch++) base[j + ch] = lit(clamp01(base[j + ch] * 0.5 + (A[j + ch] + B[j + ch]) * 0.25), hatch);
        }
      }
      sharpen(p, k, (num(v, 'sharpness') / 20) * 1.5);
    },
  },
  {
    key: 'darkStrokes', label: 'Dark Strokes', category: 'Brush Strokes',
    params: [slider('balance', 0, 10, 5), slider('blackIntensity', 0, 10, 6), slider('whiteIntensity', 0, 10, 2)],
    reach: (_v, k) => (7 + strokeReach(16, 0.9)) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, t = 0.25 + num(v, 'balance') * 0.05, black = num(v, 'blackIntensity') / 10, white = num(v, 'whiteIntensity') / 10, base = p.rgb;
      const short = streak(base, w, h, 3, 'leftDiagonal', 4 * k), long = streak(base, w, h, 3, 'rightDiagonal', 14 * k), SD = strokesOf(p, 'leftDiagonal', 5, 0.7, 1101), SL = strokesOf(p, 'rightDiagonal', 16, 0.9, 1103), L = lumaOf(p);
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const l = L[i], wl = ease(t - 0.08, t + 0.08, l), dark = -black * 0.85 * (1 - l) + (SD[i] - 0.5) * 0.2, light = white * 0.6 * l + (SL[i] - 0.5) * 0.2;
        for (let ch = 0; ch < 3; ch++) base[j + ch] = lit(clamp01(short[j + ch]), dark) * (1 - wl) + lit(clamp01(long[j + ch]), light) * wl;
      }
    },
  },
  {
    key: 'inkOutlines', label: 'Ink Outlines', category: 'Brush Strokes',
    params: [slider('strokeLength', 1, 50, 4), slider('darkIntensity', 0, 50, 20), slider('lightIntensity', 0, 50, 10)],
    reach: (v, k) => (0.4 * (1 + num(v, 'strokeLength')) + 3.1 + strokeReach(num(v, 'strokeLength') + 3, 0.5)) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, len = num(v, 'strokeLength'), dark = num(v, 'darkIntensity') / 50, light = num(v, 'lightIntensity') / 50, base = p.rgb;
      const smear = streak(base, w, h, 3, 'rightDiagonal', (1 + len) * 0.8 * k), L = lumaOf(p), E = steepness(soften(L, w, h, 1, 0.7 * k), w, h, k), S = strokesOf(p, 'rightDiagonal', len + 3, 0.5, 1201);
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const l = L[i], ink = Math.max(ease(0.12, 0.4, E[i]) * 0.85, ease(0.6, 0.72, S[i]) * (1 - l) * 0.7), tone = l < 0.5 ? -dark * (0.5 - l) * 1.8 : light * (l - 0.5) * 1.8;
        for (let ch = 0; ch < 3; ch++) base[j + ch] = lit(clamp01(smear[j + ch]) * (1 - ink), tone);
      }
    },
  },
  {
    key: 'spatter', label: 'Spatter', category: 'Brush Strokes',
    params: [slider('sprayRadius', 0, 25, 10), slider('smoothness', 1, 15, 5)],
    reach: (v, k) => (0.8 * num(v, 'sprayRadius') + 0.9 * (num(v, 'smoothness') - 1) + 0.24 * num(v, 'smoothness')) * k + 2,
    paint: (p, v) => {
      const smooth = num(v, 'smoothness');
      spray(p, num(v, 'sprayRadius') * 0.8, (smooth - 1) * 0.3 * p.k, 1301);
      p.rgb = soften(p.rgb, p.w, p.h, 3, smooth * 0.08 * p.k);
    },
  },
  {
    key: 'sprayedStrokes', label: 'Sprayed Strokes', category: 'Brush Strokes',
    params: [slider('strokeLength', 0, 20, 12), slider('sprayRadius', 0, 25, 7), menu('strokeDirection', WAYS)],
    reach: (v, k) => (0.7 * num(v, 'sprayRadius') + 1.5 + (1 + 1.2 * num(v, 'strokeLength')) / 2 + strokeReach(4 + 1.5 * num(v, 'strokeLength'), 1)) * k + 2,
    paint: (p, v) => {
      const len = num(v, 'strokeLength'), way = opt(v, 'strokeDirection') as Way;
      spray(p, num(v, 'sprayRadius') * 0.7, 0.5 * p.k, 1401);
      p.rgb = streak(p.rgb, p.w, p.h, 3, way, (1 + 1.2 * len) * p.k);
      const S = strokesOf(p, way, 4 + 1.5 * len, 1, 1403), c = p.rgb;
      for (let i = 0, j = 0; i < S.length; i++, j += 3) { const s = (S[i] - 0.5) * 0.25; c[j] = lit(c[j], s); c[j + 1] = lit(c[j + 1], s); c[j + 2] = lit(c[j + 2], s); }
    },
  },
  {
    key: 'sumiE', label: 'Sumi-e', category: 'Brush Strokes',
    params: [slider('strokeWidth', 3, 15, 10), slider('strokePressure', 0, 15, 2), slider('contrast', 0, 40, 16)],
    reach: (v, k) => 0.76 * num(v, 'strokeWidth') * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, width = num(v, 'strokeWidth'), press = num(v, 'strokePressure') / 15, gain = 1 + (num(v, 'contrast') / 40) * 0.8;
      const brush = streak(soften(p.rgb, w, h, 3, width * 0.12 * k), w, h, 3, 'leftDiagonal', width * 0.8 * k), out = new Float32Array(brush.length);
      for (let j = 0; j < out.length; j += 3) {
        const l = 0.299 * brush[j] + 0.587 * brush[j + 1] + 0.114 * brush[j + 2], ink = ease(0.55 + press * 0.25, 0.1 + press * 0.2, l) * 0.9;
        for (let ch = 0; ch < 3; ch++) out[j + ch] = clamp01(0.5 + (brush[j + ch] * (1 - ink) - 0.5) * gain);
      }
      p.rgb = out;
    },
  },
];
