/** OpenType features on type layers (DEV_PLAN 32.6 part b). The canvas cannot set font-feature-settings, but a FontFace made
 *  with the `featureSettings` descriptor applies them to that face, so a spec with features draws with a variant of its
 *  family registered from the font file's bytes. `TextSpec.features` lists the tags turned on ('smcp'), and '-liga' or
 *  '-calt' for a default-on feature turned off. */

export const OT_FEATURES: ReadonlyArray<{ tag: string; label: string }> = [
  { tag: 'liga', label: 'Standard Ligatures' }, { tag: 'dlig', label: 'Discretionary Ligatures' }, { tag: 'calt', label: 'Contextual Alternates' },
  { tag: 'salt', label: 'Stylistic Alternates' }, { tag: 'swsh', label: 'Swash' }, { tag: 'onum', label: 'Oldstyle Figures' },
  { tag: 'titl', label: 'Titling' }, { tag: 'ornm', label: 'Ornaments' }, { tag: 'ordn', label: 'Ordinals' },
  { tag: 'frac', label: 'Fractions' }, { tag: 'smcp', label: 'Small Caps' },
];

/** Features fonts apply unless told otherwise: their toggle shows on until '-tag' is listed. */
export const OT_DEFAULT_ON: ReadonlySet<string> = new Set(['liga', 'calt']);

const KNOWN = new Set(OT_FEATURES.map((f) => f.tag));

/** A feature list cleaned: known tags only, once each, in the catalogue's order. */
export function cleanFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(raw.filter((v): v is string => typeof v === 'string'));
  return OT_FEATURES.flatMap(({ tag }) => (seen.has(tag) && !OT_DEFAULT_ON.has(tag) ? [tag] : seen.has(`-${tag}`) && OT_DEFAULT_ON.has(tag) ? [`-${tag}`] : []));
}

/** Whether a feature is on in a list: listed for most, not listed as off for the defaults. */
export const featureOn = (features: readonly string[] | null | undefined, tag: string): boolean => {
  const list = features ?? [];
  return OT_DEFAULT_ON.has(tag) ? !list.includes(`-${tag}`) : list.includes(tag);
};

/** The list with one feature set on or off. */
export function withFeature(features: readonly string[] | null | undefined, tag: string, on: boolean): string[] {
  if (!KNOWN.has(tag)) return cleanFeatures(features ?? []);
  const rest = (features ?? []).filter((f) => f !== tag && f !== `-${tag}`);
  if (OT_DEFAULT_ON.has(tag)) return cleanFeatures(on ? rest : [...rest, `-${tag}`]);
  return cleanFeatures(on ? [...rest, tag] : rest);
}

/** The CSS font-feature-settings for a list. */
const settings = (features: readonly string[]): string => features.map((f) => (f.startsWith('-') ? `"${f.slice(1)}" 0` : `"${f}" 1`)).join(', ');

export type FontFileSource = (family: string, bold: boolean, italic: boolean) => Promise<ArrayBuffer>;

let source: FontFileSource = async (family, bold, italic) => {
  const res = await fetch(`/api/fonts/file?family=${encodeURIComponent(family)}&bold=${bold ? 1 : 0}&italic=${italic ? 1 : 0}`);
  if (!res.ok) throw new Error(`No font file for ${family}`);
  return res.arrayBuffer();
};

/** Where the font file's bytes come from (the app sets the engine's route; the default asks it directly). */
export function setFontFileSource(fn: FontFileSource): void { source = fn; }

const bytes = new Map<string, Promise<ArrayBuffer>>();
const ready = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

const faceKey = (family: string, bold: boolean, italic: boolean): string => `${family}|${bold ? 1 : 0}|${italic ? 1 : 0}`;

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const variantKey = (family: string, bold: boolean, italic: boolean, tags: readonly string[]): string => `${faceKey(family, bold, italic)}|${tags.join(',')}`;

/** The variant family already registered for these settings, or null (sync, for building a CSS font). */
export function variantFamily(family: string, bold: boolean, italic: boolean, tags: readonly string[] | null | undefined): string | null {
  const list = cleanFeatures(tags ?? []);
  return list.length ? ready.get(variantKey(family, bold, italic, list)) ?? null : null;
}

/** Registers a variant of a family with the features set, fetching the font file once per family and style; the variant's
 *  family name, or null where it cannot be made (no file, no FontFace), so the plain face is drawn. */
export async function ensureVariant(family: string, bold: boolean, italic: boolean, tags: readonly string[]): Promise<string | null> {
  const list = cleanFeatures(tags);
  if (!list.length || typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return null;
  const key = variantKey(family, bold, italic, list), done = ready.get(key);
  if (done) return done;
  const waiting = pending.get(key);
  if (waiting) return waiting;
  const job = (async (): Promise<string | null> => {
    try {
      const fk = faceKey(family, bold, italic);
      let data = bytes.get(fk);
      if (!data) { data = source(family, bold, italic); bytes.set(fk, data); }
      const name = `${family}__ot_${hash(key)}`;
      const face = new FontFace(name, await data, { featureSettings: settings(list), weight: bold ? '700' : '400', style: italic ? 'italic' : 'normal' });
      await face.load();
      document.fonts.add(face);
      ready.set(key, name);
      return name;
    } catch {
      bytes.delete(faceKey(family, bold, italic));
      return null;
    } finally { pending.delete(key); }
  })();
  pending.set(key, job);
  return job;
}
