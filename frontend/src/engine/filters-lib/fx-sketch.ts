import { clamp01, ease, facing, grain, inkOnPaper, isOn, LIGHTS, lit, lumaOf, menu, noiseField, num, opt, slider, soften, steepness, streak, strokeReach, strokesOf, surfaceParams, texturize, WAYS, type FxDef, type Way } from './gallery-fx';

const INK = 'Drawn in the foreground colour on paper of the background colour.';

export const SKETCH_FX: readonly FxDef[] = [
  {
    key: 'basRelief', label: 'Bas Relief', category: 'Sketch',
    params: [slider('detail', 1, 15, 13), slider('smoothness', 1, 15, 3), menu('light', LIGHTS, 'bottom')],
    note: INK,
    reach: (v, k) => 3 * (0.4 + 0.3 * num(v, 'smoothness')) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, H = soften(lumaOf(p), w, h, 1, (0.4 + 0.3 * num(v, 'smoothness')) * k), f = facing(H, w, h, k, opt(v, 'light')), gain = num(v, 'detail') * 2.2, tone = new Float32Array(H.length);
      for (let i = 0; i < H.length; i++) tone[i] = 0.5 + f[i] * gain + (H[i] - 0.5) * 0.35;
      inkOnPaper(p, tone);
    },
  },
  {
    key: 'chalkCharcoal', label: 'Chalk & Charcoal', category: 'Sketch',
    params: [slider('charcoalArea', 0, 20, 6), slider('chalkArea', 0, 20, 6), slider('strokePressure', 0, 5, 1)],
    note: 'Charcoal in the foreground color and chalk in the background color, over gray.',
    reach: (_v, k) => (1.8 + strokeReach(10, 1.4)) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, tc = 0.25 + (num(v, 'charcoalArea') / 20) * 0.4, tw = 0.75 - (num(v, 'chalkArea') / 20) * 0.4, press = 0.55 + num(v, 'strokePressure') * 0.09;
      const L = soften(lumaOf(p), w, h, 1, 0.6 * k), SC = strokesOf(p, 'rightDiagonal', 10, 0.9, 2001), SW = strokesOf(p, 'leftDiagonal', 8, 1.4, 2003), c = p.rgb, f = p.fg, b = p.bg;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const coal = clamp01(ease(tc + 0.1, tc - 0.15, L[i]) * (press + (SC[i] - 0.5) * 1.2)), chalk = clamp01(ease(tw - 0.1, tw + 0.15, L[i]) * (press + (SW[i] - 0.5) * 1.2));
        for (let ch = 0; ch < 3; ch++) { const grey = (f[ch] + b[ch]) / 2, m = grey + (f[ch] - grey) * coal; c[j + ch] = m + (b[ch] - m) * chalk; }
      }
    },
  },
  {
    key: 'charcoal', label: 'Charcoal', category: 'Sketch',
    params: [slider('charcoalThickness', 1, 7, 1), slider('detail', 0, 5, 5), slider('lightDarkBalance', 0, 100, 50)],
    note: 'Charcoal in the foreground color on paper of the background color.',
    reach: (v, k) => (3.4 + strokeReach(8 + 2 * num(v, 'charcoalThickness'), 0.6 + 0.5 * num(v, 'charcoalThickness'))) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, thick = num(v, 'charcoalThickness'), shift = ((num(v, 'lightDarkBalance') - 50) / 100) * 0.6, edgeGain = 1 + num(v, 'detail') * 0.6;
      const L = soften(lumaOf(p), w, h, 1, 0.8 * k), E = steepness(L, w, h, k), S = strokesOf(p, 'rightDiagonal', 8 + 2 * thick, 0.6 + 0.5 * thick, 2101), tone = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) { const t = L[i] - shift; tone[i] = 1 - Math.max(ease(0.15, 0.45, E[i] * edgeGain), ease(t - 0.08, t + 0.08, S[i])); }
      inkOnPaper(p, tone);
    },
  },
  {
    key: 'chrome', label: 'Chrome', category: 'Sketch',
    params: [slider('detail', 0, 10, 4), slider('smoothness', 0, 10, 7)],
    reach: (v, k) => 3 * (1 + 0.6 * num(v, 'smoothness')) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, H = soften(lumaOf(p), w, h, 1, (1 + 0.6 * num(v, 'smoothness')) * k), f = facing(H, w, h, k, 'topLeft'), bands = 0.8 + 0.25 * num(v, 'detail'), c = p.rgb;
      for (let i = 0, j = 0; i < H.length; i++, j += 3) c[j] = c[j + 1] = c[j + 2] = clamp01(0.5 + 0.4 * Math.cos(2 * Math.PI * H[i] * bands) + f[i] * 6);
    },
  },
  {
    key: 'conteCrayon', label: 'Conté Crayon', category: 'Sketch',
    params: [slider('foregroundLevel', 1, 15, 11), slider('backgroundLevel', 1, 15, 7), ...surfaceParams(4, 'top')],
    note: 'Dark crayon in the foreground color, light crayon in the background color.',
    reach: (_v, k) => (1.5 + strokeReach(6, 1)) * k + 4,
    paint: (p, v) => {
      const { w, h, k } = p, fore = num(v, 'foregroundLevel') / 11, back = num(v, 'backgroundLevel') / 7;
      const L = soften(lumaOf(p), w, h, 1, 0.5 * k), S = strokesOf(p, 'rightDiagonal', 6, 1, 2201), c = p.rgb, f = p.fg, b = p.bg;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const grit = (S[i] - 0.5) * 0.25, dark = clamp01(ease(0.55, 0.05, L[i]) * fore + grit), light = clamp01(ease(0.45, 0.95, L[i]) * back * 0.9 - grit);
        for (let ch = 0; ch < 3; ch++) { const mid = (f[ch] + b[ch]) / 2, m = mid + (f[ch] - mid) * dark; c[j + ch] = m + (b[ch] - m) * light; }
      }
      texturize(p, opt(v, 'texture'), num(v, 'scaling'), num(v, 'relief') / 50, opt(v, 'light'), isOn(v, 'invert'));
    },
  },
  {
    key: 'graphicPen', label: 'Graphic Pen', category: 'Sketch',
    params: [slider('strokeLength', 1, 15, 15), slider('lightDarkBalance', 0, 100, 50), menu('strokeDirection', WAYS)],
    note: INK,
    reach: (v, k) => (1.5 + strokeReach(2 + 1.6 * num(v, 'strokeLength'), 0.45)) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, shift = ((num(v, 'lightDarkBalance') - 50) / 100) * 0.8, L = soften(lumaOf(p), w, h, 1, 0.5 * k);
      const S = strokesOf(p, opt(v, 'strokeDirection') as Way, 2 + 1.6 * num(v, 'strokeLength'), 0.45, 2301), tone = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) { const t = L[i] - shift; tone[i] = 1 - ease(t - 0.06, t + 0.06, S[i]); }
      inkOnPaper(p, tone);
    },
  },
  {
    key: 'halftonePattern', label: 'Halftone Pattern', category: 'Sketch',
    params: [slider('size', 1, 12, 1), slider('contrast', 0, 50, 5), menu('patternType', ['dot', 'circle', 'line'])],
    note: INK,
    reach: (_v, k) => 1.2 * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, turn = (2 * Math.PI) / ((num(v, 'size') + 2) * 1.6), gain = 1.2 + num(v, 'contrast') * 0.5, type = opt(v, 'patternType');
      const L = soften(lumaOf(p), w, h, 1, 0.4 * k), ox = p.left + p.cx / k, oy = p.top + p.cy / k, tone = new Float32Array(L.length);
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
        const X = p.left + (x + 0.5) / k, Y = p.top + (y + 0.5) / k;
        const f = type === 'line' ? 0.5 + 0.5 * Math.cos(Y * turn) : type === 'circle' ? 0.5 + 0.5 * Math.cos(Math.hypot(X - ox, Y - oy) * turn) : 0.5 + 0.25 * (Math.cos(X * turn) + Math.cos(Y * turn));
        tone[i] = 0.5 + (L[i] - f) * gain;
      }
      inkOnPaper(p, tone);
    },
  },
  {
    key: 'notePaper', label: 'Note Paper', category: 'Sketch',
    params: [slider('imageBalance', 0, 50, 25), slider('graininess', 0, 20, 10), slider('relief', 0, 25, 11)],
    note: 'Paper in the background color, cut through to the foreground color where the picture is dark.',
    reach: (_v, k) => 8.4 * k + 3,
    paint: (p, v) => {
      const { w, h, k } = p, t = num(v, 'imageBalance') / 50, depth = (num(v, 'relief') / 25) * 3, grainy = (num(v, 'graininess') / 20) * 0.3;
      const L = soften(lumaOf(p), w, h, 1, k), sheet = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) sheet[i] = ease(t - 0.05, t + 0.05, L[i]);
      const f = facing(soften(sheet, w, h, 1, 1.2 * k), w, h, k, 'topLeft'), G = noiseField(p, 2401, 0.6 * k), c = p.rgb, fg = p.fg, bg = p.bg;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const s = Math.max(-0.8, Math.min(0.8, f[i] * depth)) + (G[i] - 0.5) * grainy;
        for (let ch = 0; ch < 3; ch++) c[j + ch] = lit(fg[ch] + (bg[ch] - fg[ch]) * sheet[i], s);
      }
    },
  },
  {
    key: 'photocopy', label: 'Photocopy', category: 'Sketch',
    params: [slider('detail', 1, 24, 7), slider('darkness', 1, 50, 8)],
    note: INK,
    reach: (v, k) => 3 * (0.5 + 0.45 * num(v, 'detail')) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, top = 0.02 + 0.25 / (1 + num(v, 'darkness') * 0.15), L = lumaOf(p), B = soften(L, w, h, 1, (0.5 + 0.45 * num(v, 'detail')) * k), tone = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) tone[i] = 1 - ease(0.02, top, B[i] - L[i]);
      inkOnPaper(p, tone);
    },
  },
  {
    key: 'plaster', label: 'Plaster', category: 'Sketch',
    params: [slider('imageBalance', 0, 50, 20), slider('smoothness', 1, 15, 2), menu('light', LIGHTS, 'top')],
    note: 'Dark areas rise in the foreground color from the background color.',
    reach: (v, k) => (3 * (0.5 + 0.4 * num(v, 'smoothness')) + 3.6) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, t = num(v, 'imageBalance') / 50, L = soften(lumaOf(p), w, h, 1, (0.5 + 0.4 * num(v, 'smoothness')) * k), up = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) up[i] = ease(t + 0.06, t - 0.06, L[i]);
      const f = facing(soften(up, w, h, 1, 1.2 * k), w, h, k, opt(v, 'light')), c = p.rgb, fg = p.fg, bg = p.bg;
      for (let i = 0, j = 0; i < L.length; i++, j += 3) {
        const s = Math.max(-0.9, Math.min(0.9, f[i] * 4));
        for (let ch = 0; ch < 3; ch++) c[j + ch] = lit(bg[ch] + (fg[ch] - bg[ch]) * up[i], s);
      }
    },
  },
  {
    key: 'reticulation', label: 'Reticulation', category: 'Sketch',
    params: [slider('density', 0, 50, 12), slider('foregroundLevel', 0, 50, 40), slider('backgroundLevel', 0, 50, 5)],
    note: INK,
    reach: (v, k) => 3 * (0.4 + 0.02 * num(v, 'density')) * k + 2,
    paint: (p, v) => {
      const dens = num(v, 'density') / 50, shift = ((num(v, 'backgroundLevel') - num(v, 'foregroundLevel')) / 50) * 0.4;
      const L = lumaOf(p), N = noiseField(p, 2501, (0.4 + 0.02 * num(v, 'density')) * p.k), G = grain(p, 2503), tone = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) tone[i] = ease(0.42, 0.58, L[i] + (0.7 * (N[i] - 0.5) + 0.3 * (G[i] - 0.5)) * (0.3 + dens * 0.7) + shift);
      inkOnPaper(p, tone);
    },
  },
  {
    key: 'stamp', label: 'Stamp', category: 'Sketch',
    params: [slider('lightDarkBalance', 0, 50, 25), slider('smoothness', 1, 50, 5)],
    note: INK,
    reach: (v, k) => 3 * (0.4 + 0.3 * num(v, 'smoothness')) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, t = num(v, 'lightDarkBalance') / 50, L = soften(lumaOf(p), w, h, 1, (0.4 + 0.3 * num(v, 'smoothness')) * k), tone = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) tone[i] = ease(t - 0.03, t + 0.03, L[i]);
      inkOnPaper(p, tone);
    },
  },
  {
    key: 'tornEdges', label: 'Torn Edges', category: 'Sketch',
    params: [slider('imageBalance', 0, 50, 25), slider('smoothness', 1, 15, 11), slider('contrast', 1, 25, 17)],
    note: INK,
    reach: (v, k) => (4.5 + 0.45 * num(v, 'smoothness')) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, smooth = num(v, 'smoothness'), t = num(v, 'imageBalance') / 50, half = 0.5 / (1 + num(v, 'contrast') * 0.6);
      const L = soften(lumaOf(p), w, h, 1, 0.8 * k), N = noiseField(p, 2601, 0.7 * k), rough = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) rough[i] = L[i] + (N[i] - 0.5) * 0.4 * ((16 - smooth) / 15);
      const S = soften(rough, w, h, 1, smooth * 0.15 * k), tone = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) tone[i] = ease(t - half, t + half, S[i]);
      inkOnPaper(p, tone);
    },
  },
  {
    key: 'waterPaper', label: 'Water Paper', category: 'Sketch',
    params: [slider('fiberLength', 3, 50, 15), slider('brightness', 0, 100, 60), slider('contrast', 0, 100, 80)],
    reach: (v, k) => (0.175 * num(v, 'fiberLength') + 4.5 + strokeReach(num(v, 'fiberLength'), 0.5)) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, len = num(v, 'fiberLength'), gain = 0.2 + num(v, 'contrast') / 100, lift = ((num(v, 'brightness') - 50) / 100) * 0.6, base = p.rgb;
      const across = streak(base, w, h, 3, 'horizontal', len * 0.35 * k), down = streak(base, w, h, 3, 'vertical', len * 0.35 * k), FH = strokesOf(p, 'horizontal', len, 0.5, 2701), FV = strokesOf(p, 'vertical', len, 0.5, 2703);
      const mixed = new Float32Array(base.length);
      for (let i = 0; i < mixed.length; i++) mixed[i] = (across[i] + down[i]) / 2;
      const damp = soften(mixed, w, h, 3, 1.5 * k);
      for (let i = 0, j = 0; i < FH.length; i++, j += 3) {
        const fibre = ((FH[i] + FV[i]) / 2 - 0.5) * 0.24;
        for (let ch = 0; ch < 3; ch++) base[j + ch] = clamp01((0.5 + ((mixed[j + ch] + damp[j + ch]) / 2 - 0.5) * gain + lift) * (1 + fibre));
      }
    },
  },
];
