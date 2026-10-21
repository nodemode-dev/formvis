import { hash01 } from './shared';
import { Cells, clamp01, ease, facing, grain, isOn, lattice, lit, lumaOf, menu, noiseField, num, opt, sampleInto, slider, soften, surfaceParams, texturize, type FxDef, type Rgb } from './gallery-fx';

const GRAINS = ['regular', 'soft', 'sprinkles', 'clumped', 'contrasty', 'enlarged', 'stippled', 'horizontal', 'vertical', 'speckle'];

export const TEXTURE_FX: readonly FxDef[] = [
  {
    key: 'craquelure', label: 'Craquelure', category: 'Texture',
    params: [slider('crackSpacing', 2, 100, 15), slider('crackDepth', 0, 10, 6), slider('crackBrightness', 0, 10, 9)],
    reach: () => 3,
    paint: (p, v) => {
      const { w, h, k } = p, depth = (num(v, 'crackDepth') / 10) * 1.2, dark = 0.25 + (1 - num(v, 'crackBrightness') / 10) * 0.6, rim = Math.max(1.3, 0.9 / k);
      const cells = new Cells(p, num(v, 'crackSpacing') * 1.1 + 2, 1901), at = new Float64Array(4), surface = new Float32Array(w * h);
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
        const X = p.left + (x + 0.5) / k, Y = p.top + (y + 0.5) / k, turn = lattice(X / 7, Y / 7, 1903) * 4 * Math.PI;
        cells.find(X + Math.cos(turn) * 1.1, Y + Math.sin(turn) * 1.1, at);
        surface[i] = ease(rim * 0.25, rim, at[3]);
      }
      const f = facing(surface, w, h, k, 'topLeft'), c = p.rgb;
      for (let i = 0, j = 0; i < surface.length; i++, j += 3) {
        const crack = 1 - surface[i], s = Math.max(-0.6, Math.min(0.6, f[i] * depth));
        for (let ch = 0; ch < 3; ch++) c[j + ch] = lit(c[j + ch] * (1 - crack * dark), s);
      }
    },
  },
  {
    key: 'grain', label: 'Grain', category: 'Texture',
    params: [slider('intensity', 0, 100, 40), slider('contrast', 0, 100, 50), menu('grainType', GRAINS)],
    note: 'Sprinkles scatters the background color and Speckle the foreground color; Stippled draws with both.',
    reach: (_v, k) => 6 * k + 3,
    paint: (p, v) => {
      const { k } = p, n = p.w * p.h, a = num(v, 'intensity') / 100, con = 0.5 + num(v, 'contrast') / 100, c = p.rgb;
      for (let i = 0; i < c.length; i++) c[i] = clamp01(0.5 + (c[i] - 0.5) * con);
      const add = (field: Float32Array, amount: number): void => {
        for (let i = 0, j = 0; i < n; i++, j += 3) { const d = (field[i] - 0.5) * amount; c[j] = clamp01(c[j] + d); c[j + 1] = clamp01(c[j + 1] + d); c[j + 2] = clamp01(c[j + 2] + d); }
      };
      const dots = (field: Float32Array, chance: number, colour: Rgb): void => {
        for (let i = 0, j = 0; i < n; i++, j += 3) if (field[i] < chance) { c[j] = colour[0]; c[j + 1] = colour[1]; c[j + 2] = colour[2]; }
      };
      switch (opt(v, 'grainType')) {
        case 'soft': add(noiseField(p, 2201, 0.7 * k), a * 0.6); break;
        case 'sprinkles': dots(grain(p, 2203), a * 0.25, p.bg); break;
        case 'clumped': {
          const N = noiseField(p, 2205, 1.1 * k);
          for (let i = 0, j = 0; i < n; i++, j += 3) { const s = (ease(0.45, 0.28, N[i]) - ease(0.55, 0.72, N[i])) * a * 0.7; c[j] = lit(c[j], s); c[j + 1] = lit(c[j + 1], s); c[j + 2] = lit(c[j + 2], s); }
          break;
        }
        case 'contrasty':
          add(grain(p, 2207), a * 1.1);
          for (let i = 0; i < c.length; i++) c[i] = clamp01(0.5 + (c[i] - 0.5) * 1.3);
          break;
        case 'enlarged': add(grain(p, 2209, 3), a * 0.8); break;
        case 'stippled': {
          const G = grain(p, 2211), L = lumaOf(p), f = p.fg, b = p.bg;
          for (let i = 0, j = 0; i < n; i++, j += 3) { const dot = G[i] > L[i] ? f : b; for (let ch = 0; ch < 3; ch++) c[j + ch] += (dot[ch] - c[j + ch]) * a; }
          break;
        }
        case 'horizontal': add(noiseField(p, 2213, 0, 'horizontal', 12 * k), a * 0.9); break;
        case 'vertical': add(noiseField(p, 2215, 0, 'vertical', 12 * k), a * 0.9); break;
        case 'speckle': dots(grain(p, 2217), a * 0.15, p.fg); break;
        default: add(grain(p, 2219), a * 0.8);
      }
    },
  },
  {
    key: 'mosaicTiles', label: 'Mosaic Tiles', category: 'Texture',
    params: [slider('tileSize', 2, 100, 12), slider('groutWidth', 1, 15, 3), slider('lightenGrout', 0, 10, 9)],
    reach: () => 1,
    paint: (p, v) => {
      const { w, h, k } = p, size = num(v, 'tileSize'), gw = num(v, 'groutWidth') * 0.5, pale = (num(v, 'lightenGrout') / 10) * 0.4, soft = 0.5 / k, c = p.rgb;
      const rowLine = (j: number): number => (j + (hash01(j, 0, 5, 2301) - 0.5) * 0.3) * size;
      const colLine = (i: number, j: number): number => (i + (hash01(i, j, 6, 2301) - 0.5) * 0.3) * size;
      for (let y = 0, at = 0; y < h; y++) {
        const Y = p.top + (y + 0.5) / k;
        let j = Math.floor(Y / size);
        if (Y < rowLine(j)) j--;
        else if (Y >= rowLine(j + 1)) j++;
        const top = rowLine(j), bottom = rowLine(j + 1);
        for (let x = 0; x < w; x++, at += 3) {
          const X = p.left + (x + 0.5) / k;
          let i = Math.floor(X / size);
          if (X < colLine(i, j)) i--;
          else if (X >= colLine(i + 1, j)) i++;
          const near = Math.min(X - colLine(i, j), Y - top), far = Math.min(colLine(i + 1, j) - X, bottom - Y), d = Math.min(near, far);
          const grout = 1 - ease(gw - soft, gw + soft, d), bevel = (1 - ease(gw, gw + 2.5, d)) * (near < far ? 0.25 : -0.25);
          for (let ch = 0; ch < 3; ch++) { const tile = lit(c[at + ch], bevel), joint = c[at + ch] * 0.45; c[at + ch] = tile + (joint + (1 - joint) * pale - tile) * grout; }
        }
      }
    },
  },
  {
    key: 'patchwork', label: 'Patchwork', category: 'Texture',
    params: [slider('squareSize', 0, 10, 4), slider('relief', 0, 25, 8)],
    reach: (v, k) => 1.25 * (3 + 1.3 * num(v, 'squareSize')) * k + 3,
    paint: (p, v) => {
      const { w, h, k } = p, size = 3 + 1.3 * num(v, 'squareSize'), relief = num(v, 'relief') / 25, soft = soften(p.rgb, w, h, 3, size * 0.25 * k), out = new Float32Array(p.rgb.length);
      for (let y = 0, i = 0; y < h; y++) {
        const Y = p.top + (y + 0.5) / k, sj = Math.floor(Y / size), dt = Y - sj * size, db = size - dt, sy = Math.min(h - 1, Math.max(0, Math.round(((sj + 0.5) * size - p.top) * k - 0.5)));
        for (let x = 0; x < w; x++, i++) {
          const X = p.left + (x + 0.5) / k, si = Math.floor(X / size), dl = X - si * size, dr = size - dl, height = hash01(si, sj, 8, 2401);
          const sx = Math.min(w - 1, Math.max(0, Math.round(((si + 0.5) * size - p.left) * k - 0.5))), j = (sy * w + sx) * 3;
          const s = (ease(1.2, 0, Math.min(dl, dt)) - ease(1.2, 0, Math.min(dr, db))) * relief * (0.3 + 0.5 * height) + (height - 0.5) * relief * 0.25;
          for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = lit(clamp01(soft[j + ch]), s);
        }
      }
      p.rgb = out;
    },
  },
  {
    key: 'stainedGlass', label: 'Stained Glass', category: 'Texture',
    params: [slider('cellSize', 2, 50, 10), slider('borderThickness', 1, 20, 4), slider('lightIntensity', 0, 10, 3)],
    note: 'The lead between the panes is the foreground color.',
    reach: (v, k) => 1.9 * (num(v, 'cellSize') * 1.2 + 2) * k + 3,
    paint: (p, v) => {
      const { w, h, k } = p, size = num(v, 'cellSize') * 1.2 + 2, half = Math.max(num(v, 'borderThickness') * 0.5, 0.6 / k), light = (num(v, 'lightIntensity') / 10) * 0.8;
      const cells = new Cells(p, size, 2501), at = new Float64Array(4), soft = soften(p.rgb, w, h, 3, size * 0.2 * k), glass = new Float32Array(3), out = new Float32Array(p.rgb.length), lead = p.fg;
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
        cells.find(p.left + (x + 0.5) / k, p.top + (y + 0.5) / k, at);
        sampleInto(soft, w, h, (at[0] - p.left) * k - 0.5, (at[1] - p.top) * k - 0.5, glass, 0);
        const r = Math.hypot(x + 0.5 - p.cx, y + 0.5 - p.cy) / p.half, glow = 1 + light * Math.max(0, 1 - r * r), l = 0.299 * glass[0] + 0.587 * glass[1] + 0.114 * glass[2], m = ease(half + 0.5 / k, half - 0.5 / k, at[3]);
        for (let ch = 0; ch < 3; ch++) { const pane = clamp01((l + (glass[ch] - l) * 1.25) * glow); out[i * 3 + ch] = pane + (lead[ch] - pane) * m; }
      }
      p.rgb = out;
    },
  },
  {
    key: 'texturizer', label: 'Texturizer', category: 'Texture',
    params: surfaceParams(4, 'top'),
    reach: () => 3,
    paint: (p, v) => texturize(p, opt(v, 'texture'), num(v, 'scaling'), num(v, 'relief') / 50, opt(v, 'light'), isOn(v, 'invert')),
  },
];
