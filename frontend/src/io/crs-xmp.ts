import { defaultDevelopState, defaultNoise, defaultParametric, HSL_BANDS, type CurvePoint, type DevelopState, type HslBand } from '../engine/develop';

/** Camera Raw settings as an .xmp sidecar: the Develop state's light, colour, mixer, curves, detail, noise and effects
 *  written as raw-settings attributes, and read back from any such file (settings this editor has no control for are
 *  ignored). No DOM beyond DOMParser. */
const NS = 'http://ns.adobe.com/camera-raw-settings/1.0/';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

/** Mixer bands in the file's order and names (cyans are the Aquas). */
const BAND_NAMES: Record<HslBand, string> = { reds: 'Red', oranges: 'Orange', yellows: 'Yellow', greens: 'Green', cyans: 'Aqua', blues: 'Blue', purples: 'Purple', magentas: 'Magenta' };

/** One scalar setting: where it lives in the state, the file's attribute and how the file's number maps to the state's. */
interface Field { attr: string; get: (s: DevelopState) => number; set: (s: DevelopState, v: number) => void; scale?: number }
const tone = (key: keyof DevelopState['tone'], attr: string, scale = 1): Field => ({ attr, scale, get: (s) => s.tone[key], set: (s, v) => { s.tone[key] = v; } });
const FIELDS: Field[] = [
  tone('exposure', 'Exposure2012', 100), tone('contrast', 'Contrast2012'), tone('highlights', 'Highlights2012'), tone('shadows', 'Shadows2012'),
  tone('whites', 'Whites2012'), tone('blacks', 'Blacks2012'), tone('temperature', 'IncrementalTemperature'), tone('tint', 'IncrementalTint'),
  tone('vibrance', 'Vibrance'), tone('saturation', 'Saturation'), tone('dehaze', 'Dehaze'), tone('vignette', 'PostCropVignetteAmount'), tone('grain', 'GrainAmount'),
  { attr: 'Clarity2012', get: (s) => s.detail.clarity, set: (s, v) => { s.detail.clarity = v; } },
  { attr: 'Texture', get: (s) => s.detail.texture, set: (s, v) => { s.detail.texture = v; } },
  { attr: 'Sharpness', scale: 1 / 1.5, get: (s) => s.detail.sharpen, set: (s, v) => { s.detail.sharpen = v; } },
  { attr: 'LuminanceSmoothing', get: (s) => (s.noise ?? defaultNoise()).luminance, set: (s, v) => { s.noise = { ...defaultNoise(), ...s.noise, luminance: v }; } },
  { attr: 'LuminanceNoiseReductionDetail', get: (s) => (s.noise ?? defaultNoise()).detail, set: (s, v) => { s.noise = { ...defaultNoise(), ...s.noise, detail: v }; } },
  { attr: 'LuminanceNoiseReductionContrast', get: (s) => (s.noise ?? defaultNoise()).contrast, set: (s, v) => { s.noise = { ...defaultNoise(), ...s.noise, contrast: v }; } },
  { attr: 'ColorNoiseReduction', get: (s) => (s.noise ?? defaultNoise()).color, set: (s, v) => { s.noise = { ...defaultNoise(), ...s.noise, color: v }; } },
  ...(['shadows', 'darks', 'lights', 'highlights'] as const).map((k): Field => ({ attr: `Parametric${k[0]!.toUpperCase()}${k.slice(1)}`, get: (s) => (s.parametric ?? defaultParametric())[k], set: (s, v) => { s.parametric = { ...defaultParametric(), ...s.parametric, [k]: v }; } })),
  ...(['split1:ParametricShadowSplit', 'split2:ParametricMidtoneSplit', 'split3:ParametricHighlightSplit'] as const).map((pair): Field => {
    const [k, attr] = pair.split(':') as ['split1' | 'split2' | 'split3', string];
    return { attr, get: (s) => (s.parametric ?? defaultParametric())[k], set: (s, v) => { s.parametric = { ...defaultParametric(), ...s.parametric, [k]: v }; } };
  }),
  ...HSL_BANDS.flatMap((b): Field[] => (['h', 's', 'l'] as const).map((c) => ({
    attr: `${{ h: 'Hue', s: 'Saturation', l: 'Luminance' }[c]}Adjustment${BAND_NAMES[b]}`,
    get: (s: DevelopState) => s.color.bands[b][c], set: (s: DevelopState, v: number) => { s.color.bands[b][c] = v; },
  }))),
];

const CURVES: ReadonlyArray<readonly [keyof DevelopState['curves'], string]> = [['rgb', 'ToneCurvePV2012'], ['r', 'ToneCurvePV2012Red'], ['g', 'ToneCurvePV2012Green'], ['b', 'ToneCurvePV2012Blue']];
const num = (v: number): string => String(Math.round(v * 1000) / 1000);
const isLine = (pts: CurvePoint[]): boolean => pts.length === 2 && pts[0]!.x === 0 && pts[0]!.y === 0 && pts[1]!.x === 255 && pts[1]!.y === 255;

/** The .xmp text for a Develop state: only the settings that are not at their default are written. */
export function crsXmp(state: DevelopState): string {
  const base = defaultDevelopState(), attrs: string[] = ['crs:Version="15.0"', 'crs:ProcessVersion="11.0"', 'crs:HasSettings="True"'];
  for (const f of FIELDS) {
    const v = f.get(state);
    if (v !== f.get(base) && Number.isFinite(v)) attrs.push(`crs:${f.attr}="${num(v / (f.scale ?? 1))}"`);
  }
  const curves = CURVES.flatMap(([key, tag]) => {
    const pts = state.curves[key];
    return pts && !isLine(pts) ? [`<crs:${tag}><rdf:Seq>${pts.map((p) => `<rdf:li>${Math.round(p.x)}, ${Math.round(p.y)}</rdf:li>`).join('')}</rdf:Seq></crs:${tag}>`] : [];
  });
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="${RDF}">\n<rdf:Description rdf:about="" xmlns:crs="${NS}"\n ${attrs.join('\n ')}>\n${curves.join('\n')}\n</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>\n`;
}

/** A Develop state from .xmp text, starting from `base` (the default when omitted); throws when it holds no raw settings. */
export function developFromXmp(text: string, base: DevelopState = defaultDevelopState()): DevelopState {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This is not an .xmp settings file.');
  const holders = Array.from(doc.getElementsByTagNameNS(RDF, 'Description'));
  const out = JSON.parse(JSON.stringify(base)) as DevelopState;
  let found = false;
  for (const d of holders) {
    for (const f of FIELDS) {
      const raw = d.getAttributeNS(NS, f.attr);
      if (raw === null) continue;
      const v = Number(raw);
      if (Number.isFinite(v)) { f.set(out, v * (f.scale ?? 1)); found = true; }
    }
    for (const [key, tag] of CURVES) {
      const seq = d.getElementsByTagNameNS(NS, tag)[0];
      if (!seq) continue;
      const pts = Array.from(seq.getElementsByTagNameNS(RDF, 'li')).map((li) => (li.textContent ?? '').split(',').map((n) => Number(n.trim()))).filter((p) => p.length === 2 && p.every(Number.isFinite)).map(([x, y]) => ({ x: Math.min(255, Math.max(0, x!)), y: Math.min(255, Math.max(0, y!)) }));
      if (pts.length >= 2) { out.curves[key] = pts.sort((a, b) => a.x - b.x); found = true; }
    }
  }
  if (!found) throw new Error('This file holds no camera raw settings.');
  return out;
}
