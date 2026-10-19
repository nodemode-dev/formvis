import type { Filter as PsdFilter } from 'ag-psd';
import { uid, type BlendMode, type SmartFilter } from '../engine';

/** Smart filters of a PSD smart object as formvis's live smart filter stack: each filter the file lists whose kind and
 *  settings formvis has, in the order the file keeps. The Filter dialog's ids and setting names are used, so an opened
 *  filter edits like one made here. */

type Settings = Record<string, unknown>;
const lib = (kind: string, values: Settings = {}): { kind: string; settings: Settings } => ({ kind, settings: { lib: { [kind]: values } } });
const units = (u: { value?: number } | number | undefined, d: number): number => (typeof u === 'number' ? u : typeof u?.value === 'number' ? u.value : d);
const dash = (s: string): string => s.replace(/ (\w)/g, (_m, c: string) => c.toUpperCase());

/** One PSD filter as a formvis filter kind with its settings; null where formvis has no such filter. */
export function mapPsdFilter(f: PsdFilter): { kind: string; settings: Settings } | null {
  switch (f.type) {
    case 'gaussian blur': return { kind: 'gaussianBlur', settings: { radius: units(f.filter.radius, 1) } };
    case 'motion blur': return { kind: 'motionBlur', settings: { angle: f.filter.angle ?? 0, distance: units(f.filter.distance, 10) } };
    case 'add noise': return { kind: 'addNoise', settings: { amount: f.filter.amount ?? 10, gaussian: f.filter.distribution === 'gaussian', monochromatic: !!f.filter.monochromatic, seed: f.filter.randomSeed ?? 0 } };
    case 'unsharp mask': return { kind: 'unsharpMask', settings: { usmAmount: f.filter.amount ?? 100, usmRadius: units(f.filter.radius, 1), threshold: f.filter.threshold ?? 0 } };
    case 'box blur': return lib('boxBlur', { radius: units(f.filter.radius, 1) });
    case 'blur': return lib('blur');
    case 'blur more': return lib('blurMore');
    case 'smart blur': return lib('smartBlur', { radius: f.filter.radius, threshold: f.filter.threshold, quality: f.filter.quality, mode: f.filter.mode === 'edge only' ? 'edgeOnly' : f.filter.mode === 'overlay edge' ? 'overlayEdge' : 'normal' });
    case 'sharpen': return lib('sharpen');
    case 'sharpen more': return lib('sharpenMore');
    case 'sharpen edges': return lib('sharpenEdges');
    case 'despeckle': return lib('despeckle');
    case 'median': return lib('median', { radius: units(f.filter.radius, 1) });
    case 'dust and scratches': return lib('dustAndScratches', { radius: f.filter.radius, threshold: f.filter.threshold });
    case 'high pass': case 'maximum': case 'minimum': return lib(dash(f.type), { radius: units(f.filter.radius, 1) });
    case 'find edges': case 'solarize': return lib(dash(f.type));
    case 'emboss': return lib('emboss', { angle: f.filter.angle, height: f.filter.height, amount: f.filter.amount });
    case 'pinch': return lib('pinch', { amount: f.filter.amount });
    case 'spherize': return lib('spherize', { amount: f.filter.amount, mode: f.filter.mode === 'horizontal only' ? 'horizontalOnly' : f.filter.mode === 'vertical only' ? 'verticalOnly' : 'normal' });
    case 'twirl': return lib('twirl', { angle: f.filter.angle });
    case 'ripple': return lib('ripple', { amount: f.filter.amount, size: f.filter.size });
    case 'polar coordinates': return lib('polarCoordinates', { mode: f.filter.conversion === 'polar to rectangular' ? 'polarToRectangular' : 'rectangularToPolar' });
    case 'mosaic': return lib('mosaic', { cellSize: units(f.filter.cellSize, 10) });
    default: return null;
  }
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const px = (value: number): { units: 'Pixels'; value: number } => ({ units: 'Pixels', value });
const PLAIN = new Set(['blur', 'blurMore', 'sharpen', 'sharpenMore', 'sharpenEdges', 'despeckle', 'findEdges', 'solarize']);
const RADIUS = new Set(['boxBlur', 'median', 'highPass', 'maximum', 'minimum']);
const undash = (s: string): string => s.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);

/** One formvis smart filter as a PSD filter, the inverse of `mapPsdFilter`; null where the file's filter list has no
 *  such filter here (the settings are those the Filter dialog keeps). */
export function toPsdFilter(f: SmartFilter, blend: (m: BlendMode) => string): PsdFilter | null {
  const lib = ((f.settings.lib as Record<string, Settings> | undefined)?.[f.kind] ?? {}) as Settings, s = f.settings;
  let body: Record<string, unknown> | null = null;
  switch (f.kind) {
    case 'gaussianBlur': body = { type: 'gaussian blur', filter: { radius: px(num(s.radius, 1)) } }; break;
    case 'motionBlur': body = { type: 'motion blur', filter: { angle: num(s.angle, 0), distance: px(num(s.distance, 10)) } }; break;
    case 'addNoise': body = { type: 'add noise', filter: { amount: num(s.amount, 10), distribution: s.gaussian === true ? 'gaussian' : 'uniform', monochromatic: s.monochromatic === true, randomSeed: num(s.seed, 0) } }; break;
    case 'unsharpMask': body = { type: 'unsharp mask', filter: { amount: num(s.usmAmount, 100), radius: px(num(s.usmRadius, 1)), threshold: num(s.threshold, 0) } }; break;
    default:
      if (PLAIN.has(f.kind)) body = { type: undash(f.kind) };
      else if (RADIUS.has(f.kind)) body = { type: undash(f.kind), filter: { radius: px(num(lib.radius, 1)) } };
  }
  if (!body) return null;
  const name = String(body.type).replace(/(^| )\w/g, (c) => c.toUpperCase());
  return { ...body, name, opacity: Math.min(1, Math.max(0, num(f.opacity, 100) / 100)), blendMode: blend(f.blend ?? 'normal'), enabled: f.enabled, hasOptions: true, foregroundColor: { r: 0, g: 0, b: 0 }, backgroundColor: { r: 255, g: 255, b: 255 } } as unknown as PsdFilter;
}

/** The whole smart filter stack of a smart object, or null with the names of the filters formvis lacks: a stack with
 *  one filter missing would draw differently when next rendered, so it is taken all or not at all. */
export function fromPsdSmartFilters(list: PsdFilter[], stackOn: boolean, blend: (m: string | undefined) => BlendMode | undefined): { filters: SmartFilter[] } | { missing: string[] } {
  const missing: string[] = [], out: SmartFilter[] = [];
  for (const f of list) {
    const m = mapPsdFilter(f);
    if (!m) { missing.push(f.name || f.type); continue; }
    const mode = blend(f.blendMode), pct = typeof f.opacity === 'number' ? Math.round(Math.min(1, Math.max(0, f.opacity)) * 100) : 100;
    out.push({ id: uid(), kind: m.kind, settings: m.settings, enabled: stackOn && f.enabled !== false, ...(mode && mode !== 'normal' ? { blend: mode } : {}), ...(pct < 100 ? { opacity: pct } : {}) });
  }
  return missing.length ? { missing } : { filters: out };
}
