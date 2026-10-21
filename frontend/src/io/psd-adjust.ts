import type { AdjustmentLayer as PsdAdjustment } from 'ag-psd';
import { COLOR_RANGES, defaultAdjustmentData, defaultHsv, hsvFromData, hsvToData, type Adjustment, type AdjustmentKind } from '../engine';
import { DEFAULT_BANDS, type ColorRange } from '../engine/adjust';
import { isParamKind } from '../engine/adjust-params';
import { lutFileToCube } from '../engine/lut-read';
import { fromBase64, toBase64 } from './icc-read';

/** formvis's adjustment layers and PSD's, both ways, so a PSD keeps them live instead of dropping them. The
 *  parametric kinds map field for field; Levels and Curves by channel (the composite first, then red, green, blue);
 *  Hue/Saturation by range with each range's band as PSD's four band values; Gradient Map with every colour stop.
 *  Values are read from the project layout's nested blocks (params, levels, curves, exposureSettings,
 *  gradientMapSettings) and a read writes both the nested block and the flat fields.
 *  Colorize rides in the Master record's first four values (the flag in the high byte of the first, then hue,
 *  saturation and lightness). Grain and Develop have no PSD adjustment layer. */

type J = Record<string, unknown>;
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const rgb255 = (v: unknown, d: { r: number; g: number; b: number }): { r: number; g: number; b: number } => { const o = (v ?? {}) as J; return { r: num(o.r, d.r), g: num(o.g, d.g), b: num(o.b, d.b) }; };
const TONES = ['shadows', 'midtones', 'highlights'] as const;
const MIX = ['red', 'green', 'blue'] as const;
const SELECT = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'] as const;
const CHANNELS = ['rgb', 'red', 'green', 'blue'] as const;
const PS_RANGE: Record<ColorRange, string> = { Master: 'master', Reds: 'reds', Yellows: 'yellows', Greens: 'greens', Cyans: 'cyans', Blues: 'blues', Magentas: 'magentas' };

/** Where a kind keeps its values inside an adjustment's data, in the project file's layout. */
function nestedKey(kind: AdjustmentKind): string | null {
  if (kind === 'exposure') return 'exposureSettings';
  if (kind === 'gradientMap') return 'gradientMapSettings';
  if (kind === 'levels' || kind === 'curves') return kind;
  return isParamKind(kind) ? 'params' : null;
}

/** An adjustment's values as one flat record: the project layout's nested block read first, a flat field of the same
 *  name winning only where the nested one still holds its default. */
function flatten(kind: AdjustmentKind, raw: J): J {
  const def = defaultAdjustmentData(kind) as J, out: J = { ...def, ...raw }, key = nestedKey(kind);
  const inner = key ? (raw[key] as J | undefined) : undefined, innerDef = key ? ((def[key] ?? {}) as J) : {};
  if (inner && typeof inner === 'object') for (const [k, v] of Object.entries(inner)) if (!(k in raw) || JSON.stringify(v) !== JSON.stringify(innerDef[k])) out[k] = v;
  return out;
}

/** A PSD adjustment for a formvis one, or null when PSD has no such layer (Grain, Develop). */
export function toPsdAdjustment(a: Adjustment): PsdAdjustment | null {
  const d = flatten(a.kind, a.data as J);
  switch (a.kind) {
    case 'brightnessContrast': return { type: 'brightness/contrast', brightness: num(d.brightness, 0), contrast: num(d.contrast, 0), useLegacy: d.legacy === true };
    case 'vibrance': return { type: 'vibrance', vibrance: num(d.vibrance, 0), saturation: num(d.saturation, 0) };
    case 'invert': return { type: 'invert' };
    case 'posterize': return { type: 'posterize', levels: num(d.levels, 4) };
    case 'threshold': return { type: 'threshold', level: num(d.level, 128) };
    case 'photoFilter': return { type: 'photo filter', color: rgb255(d.color, { r: 236, g: 138, b: 0 }), density: num(d.density, 25), preserveLuminosity: d.preserve !== false };
    case 'colorBalance': {
      const tone = (t: string) => ({ cyanRed: num(d[`${t}CR`], 0), magentaGreen: num(d[`${t}MG`], 0), yellowBlue: num(d[`${t}YB`], 0) });
      return { type: 'color balance', shadows: tone('shadows'), midtones: tone('midtones'), highlights: tone('highlights'), preserveLuminosity: d.preserve !== false };
    }
    case 'blackWhite': return { type: 'black & white', reds: num(d.reds, 40), yellows: num(d.yellows, 60), greens: num(d.greens, 40), cyans: num(d.cyans, 60), blues: num(d.blues, 20), magentas: num(d.magentas, 80), useTint: d.tint === true, tintColor: rgb255(d.tintColor, { r: 225, g: 211, b: 179 }) };
    case 'channelMixer': {
      const row = (o: string) => ({ red: num(d[`${o}R`], 0), green: num(d[`${o}G`], 0), blue: num(d[`${o}B`], 0), constant: num(d[`${o}K`], 0) });
      const mono = d.monochrome === true;
      return { type: 'channel mixer', monochrome: mono, red: row('red'), green: row('green'), blue: row('blue'), ...(mono ? { gray: row('red') } : {}) };
    }
    case 'selectiveColor': {
      const out: J = { type: 'selective color', mode: d.method === 'absolute' ? 'absolute' : 'relative' };
      for (const c of SELECT) out[c] = { c: num(d[`${c}C`], 0), m: num(d[`${c}M`], 0), y: num(d[`${c}Y`], 0), k: num(d[`${c}K`], 0) };
      return out as unknown as PsdAdjustment;
    }
    case 'exposure': return { type: 'exposure', exposure: num(d.exposure, 0), offset: num(d.offset, 0), gamma: num(d.gamma, 1) };
    case 'levels': {
      const ranges = Array.isArray(d.ranges) ? (d.ranges as J[]) : [], out: J = { type: 'levels' };
      CHANNELS.forEach((ch, i) => { const r = ranges[i] ?? {}; out[ch] = { shadowInput: num(r.black, 0), highlightInput: num(r.white, 255), midtoneInput: num(r.gamma, 1), shadowOutput: num(r.outputBlack, 0), highlightOutput: num(r.outputWhite, 255) }; });
      return out as unknown as PsdAdjustment;
    }
    case 'curves': {
      const chans = Array.isArray(d.channels) ? (d.channels as J[][]) : [], out: J = { type: 'curves' };
      CHANNELS.forEach((ch, i) => { const k = chans[i]; if (Array.isArray(k) && k.length >= 2) out[ch] = k.map((p) => ({ input: Math.round(num(p.x, 0)), output: Math.round(num(p.y, 0)) })); });
      return out as unknown as PsdAdjustment;
    }
    case 'hsv': {
      const h = hsvFromData(d), out: J = { type: 'hue/saturation' };
      for (const r of COLOR_RANGES) {
        const adj = h.adjustments[r] ?? { hue: 0, saturation: 0, lightness: 0 }, b = h.bands[r] ?? DEFAULT_BANDS[r];
        out[PS_RANGE[r]] = { a: Math.round(b.falloffStart), b: Math.round(b.rangeStart), c: Math.round(b.rangeEnd), d: Math.round(b.falloffEnd), hue: Math.round(adj.hue), saturation: Math.round(adj.saturation), lightness: Math.round(adj.lightness) };
      }
      if (h.colorize) {
        const c = h.adjustments[h.range] ?? { hue: 0, saturation: 0, lightness: 0 }, m = out.master as J;
        out.master = { ...m, a: 256, b: Math.min(360, Math.max(0, Math.round(c.hue))), c: Math.min(100, Math.max(0, Math.round(c.saturation))), d: Math.min(100, Math.max(-100, Math.round(c.lightness))) };
      }
      return out as unknown as PsdAdjustment;
    }
    case 'gradientMap': {
      const c = (v: unknown, f: number) => { const o = (v ?? {}) as J; return { r: num(o.red, f) * 255, g: num(o.green, f) * 255, b: num(o.blue, f) * 255 }; };
      const list = (Array.isArray(d.stops) ? (d.stops as J[]) : []).map((s) => ({ at: Math.min(1, Math.max(0, num(s.at, 0))), c: c(s, 0) })).sort((x, y) => x.at - y.at);
      const stops = list.length >= 2 ? list : [{ at: 0, c: c(d.shadows, 0) }, { at: 1, c: c(d.highlights, 1) }];
      return { type: 'gradient map', name: 'formvis', gradientType: 'solid', reverse: d.reversed === true, dither: d.dither === true, colorStops: stops.map((s) => ({ color: s.c, location: s.at, midpoint: 0.5 })), opacityStops: [{ opacity: 1, location: 0, midpoint: 0.5 }, { opacity: 1, location: 1, midpoint: 0.5 }] };
    }
    case 'colorLookup': {
      // Only a loaded .cube or .3dl table has a PSD form; the built-in looks do not.
      const cube = typeof d.cube === 'string' ? d.cube : '';
      if (!cube) return null;
      const title = String(d.cubeName || 'formvis').replace(/\.(cube|3dl|look)$/i, '');
      return { type: 'color lookup', lookupType: '3dlut', name: title, dither: d.dither === true, lutFormat: 'cube', dataOrder: 'rgb', tableOrder: 'rgb', lut3DFileData: new TextEncoder().encode(cube), lut3DFileName: `${title}.cube` };
    }
    default: return null;
  }
}

/** A PSD adjustment's own settings as plain data for the project file: binary parts (a Color Lookup's profile or
 *  3D table) become base64 under a marker. */
export function keepPsdAdjustment(p: PsdAdjustment): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (v instanceof Uint8Array) return { $b64: toBase64(v) };
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as J).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(p) as Record<string, unknown>;
}

/** The PSD adjustment a project file kept, binary parts restored; null when it is not one. */
export function restorePsdAdjustment(kept: Record<string, unknown> | null | undefined): PsdAdjustment | null {
  if (!kept || typeof kept.type !== 'string') return null;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = v as J;
      if (typeof o.$b64 === 'string') return fromBase64(o.$b64);
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(kept) as PsdAdjustment;
}

/** A formvis adjustment for a PSD one, or null when formvis has no such adjustment (a Color Lookup that is not a .cube or .3dl table, and others). */
export function fromPsdAdjustment(p: PsdAdjustment): Adjustment | null {
  const o = p as unknown as J, mk = (kind: AdjustmentKind, data: J): Adjustment => {
    const def = defaultAdjustmentData(kind) as J, out: J = { ...def, ...data }, key = nestedKey(kind);
    if (key) {
      const inner = (def[key] ?? {}) as J, merged: J = { ...inner };
      for (const k of [...Object.keys(inner), ...(kind === 'gradientMap' ? ['stops', 'dither'] : [])]) if (k in data) merged[k] = data[k];
      out[key] = merged;
    }
    return { kind, data: out };
  };
  switch (p.type) {
    case 'brightness/contrast': return mk('brightnessContrast', { brightness: num(o.brightness, 0), contrast: num(o.contrast, 0), legacy: o.useLegacy === true });
    case 'vibrance': return mk('vibrance', { vibrance: num(o.vibrance, 0), saturation: num(o.saturation, 0) });
    case 'invert': return mk('invert', {});
    case 'posterize': return mk('posterize', { levels: num(o.levels, 4) });
    case 'threshold': return mk('threshold', { level: num(o.level, 128) });
    case 'photo filter': return mk('photoFilter', { color: rgb255(o.color, { r: 236, g: 138, b: 0 }), density: num(o.density, 25), preserve: o.preserveLuminosity !== false });
    case 'color balance': {
      const data: J = { preserve: o.preserveLuminosity !== false };
      for (const t of TONES) { const v = (o[t] ?? {}) as J; data[`${t}CR`] = num(v.cyanRed, 0); data[`${t}MG`] = num(v.magentaGreen, 0); data[`${t}YB`] = num(v.yellowBlue, 0); }
      return mk('colorBalance', data);
    }
    case 'black & white': return mk('blackWhite', { reds: num(o.reds, 40), yellows: num(o.yellows, 60), greens: num(o.greens, 40), cyans: num(o.cyans, 60), blues: num(o.blues, 20), magentas: num(o.magentas, 80), tint: o.useTint === true, ...(o.tintColor ? { tintColor: rgb255(o.tintColor, { r: 225, g: 211, b: 179 }) } : {}) });
    case 'channel mixer': {
      const data: J = { monochrome: o.monochrome === true };
      for (const m of MIX) { const src = (o.monochrome === true && m === 'red' && o.gray ? o.gray : o[m] ?? {}) as J; data[`${m}R`] = num(src.red, m === 'red' ? 100 : 0); data[`${m}G`] = num(src.green, m === 'green' ? 100 : 0); data[`${m}B`] = num(src.blue, m === 'blue' ? 100 : 0); data[`${m}K`] = num(src.constant, 0); }
      return mk('channelMixer', data);
    }
    case 'selective color': {
      const data: J = { method: o.mode === 'absolute' ? 'absolute' : 'relative' };
      for (const c of SELECT) { const v = (o[c] ?? {}) as J; data[`${c}C`] = num(v.c, 0); data[`${c}M`] = num(v.m, 0); data[`${c}Y`] = num(v.y, 0); data[`${c}K`] = num(v.k, 0); }
      return mk('selectiveColor', data);
    }
    case 'exposure': return mk('exposure', { exposure: num(o.exposure, 0), offset: num(o.offset, 0), gamma: num(o.gamma, 1) });
    case 'levels': return mk('levels', { ranges: CHANNELS.map((ch) => { const v = (o[ch] ?? {}) as J; return { black: num(v.shadowInput, 0), white: num(v.highlightInput, 255), gamma: num(v.midtoneInput, 1), outputBlack: num(v.shadowOutput, 0), outputWhite: num(v.highlightOutput, 255) }; }) });
    case 'curves': return mk('curves', { channels: CHANNELS.map((ch) => { const k = o[ch]; return Array.isArray(k) && k.length >= 2 ? (k as J[]).map((q) => ({ x: num(q.input, 0), y: num(q.output, 0) })) : [{ x: 0, y: 0 }, { x: 255, y: 255 }]; }) });
    case 'hue/saturation': {
      const s = defaultHsv();
      for (const r of COLOR_RANGES) {
        const v = o[PS_RANGE[r]] as J | undefined;
        if (!v) continue;
        const adj = { hue: num(v.hue, 0), saturation: num(v.saturation, 0), lightness: num(v.lightness, 0) };
        if (adj.hue || adj.saturation || adj.lightness) s.adjustments[r] = adj;
        if (r !== 'Master') s.bands[r] = { falloffStart: num(v.a, DEFAULT_BANDS[r].falloffStart), rangeStart: num(v.b, DEFAULT_BANDS[r].rangeStart), rangeEnd: num(v.c, DEFAULT_BANDS[r].rangeEnd), falloffEnd: num(v.d, DEFAULT_BANDS[r].falloffEnd) };
      }
      const mc = o.master as J | undefined;
      if (mc && (num(mc.a, 0) & 0xff00) !== 0) {
        s.colorize = true;
        s.range = 'Master';
        s.adjustments.Master = { hue: Math.min(360, Math.max(0, num(mc.b, 0))), saturation: Math.min(100, Math.max(0, num(mc.c, 25))), lightness: Math.min(100, Math.max(-100, num(mc.d, 0))) };
      }
      return mk('hsv', { hsvSettings: hsvToData(s) });
    }
    case 'gradient map': {
      const stops = Array.isArray(o.colorStops) ? (o.colorStops as J[]) : [], first = (stops[0]?.color ?? { r: 0, g: 0, b: 0 }) as J, last = (stops[stops.length - 1]?.color ?? { r: 255, g: 255, b: 255 }) as J;
      const c = (v: J) => ({ red: num(v.r, 0) / 255, green: num(v.g, 0) / 255, blue: num(v.b, 0) / 255 });
      const all = stops.map((s) => ({ at: Math.min(1, Math.max(0, num(s.location, 0))), ...c((s.color ?? { r: 0, g: 0, b: 0 }) as J) }));
      return mk('gradientMap', { shadows: c(first), highlights: c(last), reversed: o.reverse === true, ...(all.length > 2 ? { stops: all } : {}), ...(o.dither === true ? { dither: true } : {}) });
    }
    case 'color lookup': {
      // A 3D table held as .cube or .3dl text opens live; a profile lookup or a .look file stays with the layer as the file had it.
      const raw = o.lut3DFileData, file = typeof o.lut3DFileName === 'string' ? o.lut3DFileName : '', title = typeof o.name === 'string' ? o.name : '';
      if (!(raw instanceof Uint8Array) || !raw.length || raw.length > 64_000_000 || (o.lookupType !== undefined && o.lookupType !== '3dlut')) return null;
      const cube = lutFileToCube(/\.(cube|3dl|look)$/i.test(file) ? file : `${file || title || 'lut'}.${o.lutFormat === '3dl' ? '3dl' : 'cube'}`, new TextDecoder().decode(raw));
      return cube ? mk('colorLookup', { cube, cubeName: file || title, dither: o.dither === true }) : null;
    }
    default: return null;
  }
}
