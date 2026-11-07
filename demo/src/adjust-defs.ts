import { PARAM_ADJUSTMENTS, paramValues, type ParamKind, type ParamSpec } from '../../frontend/src/engine/adjust-params';
import { defaultHsv, hsvKernel } from '../../frontend/src/engine/adjust';
import { exposureKernel, gradientMapKernel, levelsKernel, type Kernel } from '../../frontend/src/engine/kernels';
import type { Values } from './model';

export interface AdjustDef { id: string; label: string; specs: ParamSpec[]; kernel: (v: Values) => Kernel }

const range = (key: string, label: string, min: number, max: number, def: number, step = 1): ParamSpec => ({ key, label, kind: 'range', min, max, step, def });
const num = (v: Values, k: string, d: number): number => (typeof v[k] === 'number' ? (v[k] as number) : d);
const channel = (v: Values, k: string, d: { r: number; g: number; b: number }): { r: number; g: number; b: number } => (v[k] && typeof v[k] === 'object' ? (v[k] as { r: number; g: number; b: number }) : d);

const identity = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };

const custom: AdjustDef[] = [
  {
    id: 'levels', label: 'Levels',
    specs: [range('black', 'Input black', 0, 254, 0), range('gamma', 'Gamma', 0.1, 9.99, 1, 0.01), range('white', 'Input white', 1, 255, 255), range('outputBlack', 'Output black', 0, 255, 0), range('outputWhite', 'Output white', 0, 255, 255)],
    kernel: (v) => {
      const per = Array.isArray(v.channelRanges) ? (v.channelRanges as unknown[]) : [identity, identity, identity];
      const composite = { black: num(v, 'black', 0), gamma: num(v, 'gamma', 1), white: num(v, 'white', 255), outputBlack: num(v, 'outputBlack', 0), outputWhite: num(v, 'outputWhite', 255) };
      return levelsKernel({ ranges: [composite, per[0] ?? identity, per[1] ?? identity, per[2] ?? identity, identity] });
    },
  },
  {
    id: 'exposure', label: 'Exposure',
    specs: [range('exposure', 'Exposure', -5, 5, 0, 0.01), range('offset', 'Offset', -0.5, 0.5, 0, 0.005), range('gamma', 'Gamma', 0.1, 4, 1, 0.01)],
    kernel: (v) => exposureKernel({ exposure: num(v, 'exposure', 0), offset: num(v, 'offset', 0), gamma: num(v, 'gamma', 1) }),
  },
  {
    id: 'hsv', label: 'Hue/Saturation',
    specs: [range('hue', 'Hue', -180, 180, 0), range('saturation', 'Saturation', -100, 100, 0), range('lightness', 'Lightness', -100, 100, 0)],
    kernel: (v) => {
      const s = defaultHsv();
      s.adjustments.Master = { hue: num(v, 'hue', 0), saturation: num(v, 'saturation', 0), lightness: num(v, 'lightness', 0) };
      return hsvKernel(s);
    },
  },
  {
    id: 'gradientMap', label: 'Gradient Map',
    specs: [
      { key: 'shadows', label: 'Shadows', kind: 'color', def: { r: 18, g: 10, b: 60 } },
      { key: 'highlights', label: 'Highlights', kind: 'color', def: { r: 255, g: 196, b: 120 } },
      { key: 'reversed', label: 'Reverse', kind: 'check', def: false },
    ],
    kernel: (v) => {
      const a = channel(v, 'shadows', { r: 18, g: 10, b: 60 }), b = channel(v, 'highlights', { r: 255, g: 196, b: 120 });
      return gradientMapKernel({ shadows: { red: a.r / 255, green: a.g / 255, blue: a.b / 255 }, highlights: { red: b.r / 255, green: b.g / 255, blue: b.b / 255 }, reversed: v.reversed === true });
    },
  },
];

const PARAM_IDS: ParamKind[] = ['brightnessContrast', 'vibrance', 'colorBalance', 'blackWhite', 'photoFilter', 'channelMixer', 'shadowsHighlights', 'splitToning', 'clarity', 'dehaze', 'glow', 'posterize', 'threshold', 'invert'];

const fromParams: AdjustDef[] = PARAM_IDS.map((id) => ({
  id, label: PARAM_ADJUSTMENTS[id].label, specs: PARAM_ADJUSTMENTS[id].params,
  kernel: (v) => PARAM_ADJUSTMENTS[id].kernel(paramValues(id, v)),
}));

export const ADJUST_DEFS: AdjustDef[] = [...custom, ...fromParams];
export const adjustDef = (id: string): AdjustDef | undefined => ADJUST_DEFS.find((d) => d.id === id);

export function defaults(def: AdjustDef): Values {
  const out: Values = {};
  for (const s of def.specs) out[s.key] = s.def;
  return out;
}
