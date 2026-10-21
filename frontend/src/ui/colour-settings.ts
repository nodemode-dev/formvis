import type { Intent } from './colour';

/** Edit > Color Settings (DEV_PLAN 28.2): the working spaces, the policies for pictures that arrive with another
 *  profile or none, and how conversions run. Kept in Preferences; named presets beside it. */
export type Policy = 'preserve' | 'convert' | 'off';
export type MismatchPref = 'convert' | 'keep' | 'ask' | 'discard';

export interface ColourSettings {
  /** 'srgb', 'display-p3', 'adobe-rgb' or 'id:' and a listed profile id. */
  rgb: string;
  /** 'default' (the shipped press profile) or 'id:' and a listed id. */
  cmyk: string;
  /** 'id:' and a listed gray profile id (LittleCMS makes three itself). */
  gray: string;
  rgbPolicy: Policy;
  cmykPolicy: Policy;
  grayPolicy: Policy;
  askMismatch: boolean;
  askMissing: boolean;
  intent: Intent;
  bpc: boolean;
  dither: boolean;
  /** Draw the canvas through the monitor's own profile (the desktop app reads it from the system). */
  useDisplay: boolean;
  /** Which profile the canvas is drawn for: 'system' (the one the desktop reads), a built-in space, or 'id:' and a listed RGB profile. */
  monitor: string;
  /** Ask which way to bring a pasted picture in when its profile differs from the document's. */
  askPaste: boolean;
  /** Ask for the destination profile, intent and black point whenever Image > Mode converts to RGB, Grayscale or Lab. */
  askMode: boolean;
  /** Gamma that type edges are blended with: 1 blends the coverage linearly in the document's numbers, higher values
   *  blend in linear light and thin dark type on light and fatten light type on dark (2.2 is true linear light). */
  textGamma: number;
  /** An OpenEXR opens read as ACEScg (AP1 primaries, linear) and is moved to the working linear space. */
  exrAcescg: boolean;
}
export interface ColourPreset { id: string; name: string; settings: ColourSettings; builtin: boolean }

export const POLICIES: ReadonlyArray<readonly [Policy, string]> = [['preserve', 'Preserve Embedded Profiles'], ['convert', 'Convert to Working Space'], ['off', 'Off']];
export const INTENT_CHOICES: ReadonlyArray<readonly [Intent, string]> = [['perceptual', 'Perceptual'], ['relative', 'Relative Colorimetric'], ['saturation', 'Saturation'], ['absolute', 'Absolute Colorimetric']];

export const DEFAULT_COLOUR: ColourSettings = {
  rgb: 'srgb', cmyk: 'default', gray: 'id:builtin:gray-g22', rgbPolicy: 'convert', cmykPolicy: 'preserve', grayPolicy: 'preserve',
  askMismatch: false, askMissing: false, intent: 'relative', bpc: true, dither: false, useDisplay: true, monitor: 'system', askPaste: false, askMode: false, textGamma: 1, exrAcescg: false,
};

export const BUILTIN_COLOUR_PRESETS: ReadonlyArray<ColourPreset> = [
  { id: 'builtin:default', name: 'formvis Default', settings: DEFAULT_COLOUR, builtin: true },
  { id: 'builtin:prepress', name: 'Prepress, coated press', settings: { ...DEFAULT_COLOUR, rgbPolicy: 'preserve', askMismatch: true, askMissing: true, intent: 'relative', dither: true }, builtin: true },
  { id: 'builtin:web', name: 'Web and screen', settings: { ...DEFAULT_COLOUR, cmykPolicy: 'convert', grayPolicy: 'convert', intent: 'perceptual' }, builtin: true },
  { id: 'builtin:off', name: 'Color management off', settings: { ...DEFAULT_COLOUR, rgbPolicy: 'off', cmykPolicy: 'off', grayPolicy: 'off', bpc: false, dither: false }, builtin: true },
];

const one = <T extends string>(v: unknown, allowed: ReadonlyArray<T>, d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const profileRef = (v: unknown, d: string): string => (typeof v === 'string' && /^(srgb|display-p3|adobe-rgb|default|id:[A-Za-z0-9:_-]{1,64})$/.test(v) ? v : d);

export function cleanColour(v: unknown): ColourSettings {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>, d = DEFAULT_COLOUR;
  return {
    rgb: profileRef(r.rgb, d.rgb), cmyk: profileRef(r.cmyk, d.cmyk), gray: profileRef(r.gray, d.gray),
    rgbPolicy: one(r.rgbPolicy, POLICIES.map(([p]) => p), d.rgbPolicy), cmykPolicy: one(r.cmykPolicy, POLICIES.map(([p]) => p), d.cmykPolicy), grayPolicy: one(r.grayPolicy, POLICIES.map(([p]) => p), d.grayPolicy),
    askMismatch: typeof r.askMismatch === 'boolean' ? r.askMismatch : d.askMismatch, askMissing: typeof r.askMissing === 'boolean' ? r.askMissing : d.askMissing,
    intent: one(r.intent, INTENT_CHOICES.map(([i]) => i), d.intent), bpc: typeof r.bpc === 'boolean' ? r.bpc : d.bpc, dither: typeof r.dither === 'boolean' ? r.dither : d.dither,
    useDisplay: typeof r.useDisplay === 'boolean' ? r.useDisplay : d.useDisplay, monitor: r.monitor === 'system' ? 'system' : profileRef(r.monitor, d.monitor),
    askPaste: typeof r.askPaste === 'boolean' ? r.askPaste : d.askPaste, askMode: typeof r.askMode === 'boolean' ? r.askMode : d.askMode,
    textGamma: typeof r.textGamma === 'number' && r.textGamma >= 1 && r.textGamma <= 2.4 ? Math.round(r.textGamma * 100) / 100 : d.textGamma, exrAcescg: typeof r.exrAcescg === 'boolean' ? r.exrAcescg : d.exrAcescg,
  };
}

export function cleanPresets(v: unknown): ColourPreset[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
    if (!o || typeof o.id !== 'string' || typeof o.name !== 'string' || !o.name.trim() || o.id.startsWith('builtin:')) return [];
    return [{ id: o.id.slice(0, 40), name: o.name.trim().slice(0, 60), settings: cleanColour(o.settings), builtin: false }];
  }).slice(0, 50);
}

/** What the opening path reads: Preferences' `profileMismatch` follows the policy for RGB pictures. */
export function mismatchPref(s: ColourSettings): MismatchPref {
  if (s.rgbPolicy === 'off') return 'discard';
  if (s.askMismatch) return 'ask';
  return s.rgbPolicy === 'preserve' ? 'keep' : 'convert';
}

/** The profile id to ask the engine for, from a settings value ('srgb' and the built-in spaces have none). */
export const listedId = (ref: string): string | null => (ref.startsWith('id:') ? ref.slice(3) : null);
