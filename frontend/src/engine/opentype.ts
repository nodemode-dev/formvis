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

/** Stylistic sets ss01 to ss20 (DEV_PLAN 32.6c): known to the feature list, offered in the Glyphs dialog, not in the type menu. */
export const OT_STYLISTIC_SETS: ReadonlyArray<{ tag: string; label: string }> = Array.from({ length: 20 }, (_, i) => {
  const tag = `ss${String(i + 1).padStart(2, '0')}`;
  return { tag, label: `Set ${i + 1}` };
});

const ALL_FEATURES = [...OT_FEATURES, ...OT_STYLISTIC_SETS];
const KNOWN = new Set(ALL_FEATURES.map((f) => f.tag));

/** A feature list cleaned: known tags only, once each, in the catalogue's order. */
export function cleanFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(raw.filter((v): v is string => typeof v === 'string'));
  return ALL_FEATURES.flatMap(({ tag }) => (seen.has(tag) && !OT_DEFAULT_ON.has(tag) ? [tag] : seen.has(`-${tag}`) && OT_DEFAULT_ON.has(tag) ? [`-${tag}`] : []));
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
  if (!(await (await import('../io/api')).serviceReady())) throw new Error(`No font file for ${family}`);   // the engine service is not running
  const res = await fetch(`/api/fonts/file?family=${encodeURIComponent(family)}&bold=${bold ? 1 : 0}&italic=${italic ? 1 : 0}`);
  if (!res.ok) throw new Error(`No font file for ${family}`);
  return res.arrayBuffer();
};

/** Where the font file's bytes come from (the app sets the engine's route; the default asks it directly). */
export function setFontFileSource(fn: FontFileSource): void { source = fn; }

/** The feature tags a font file's GSUB and GPOS tables list (DEV_PLAN 32.6d). Every read is bounds-checked; on a bad
 *  offset the tags collected so far are returned. A TrueType Collection is read at its first font. */
export function fontFeatureTags(buf: ArrayBuffer): Set<string> {
  const tags = new Set<string>();
  const view = new DataView(buf), len = buf.byteLength;
  const ok = (at: number, n: number): boolean => Number.isInteger(at) && at >= 0 && n >= 0 && at + n <= len;
  const u16 = (at: number): number => (ok(at, 2) ? view.getUint16(at) : -1);
  const u32 = (at: number): number => (ok(at, 4) ? view.getUint32(at) : -1);
  const tag4 = (at: number): string => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  try {
    let base = 0;
    if (ok(0, 4) && tag4(0) === 'ttcf') {
      base = u32(12);
      if (base < 0) return tags;
    }
    if (!ok(base, 12)) return tags;
    const count = u16(base + 4);
    for (let i = 0; i < count; i += 1) {
      const rec = base + 12 + i * 16;
      if (!ok(rec, 16)) break;
      const name = tag4(rec);
      if (name !== 'GSUB' && name !== 'GPOS') continue;
      const table = u32(rec + 8);
      if (table < 0 || !ok(table, 10)) continue;
      const list = table + u16(table + 6);
      const n = u16(list);
      for (let k = 0; k < n; k += 1) {
        const at = list + 2 + k * 6;
        if (!ok(at, 6)) break;
        tags.add(tag4(at));
      }
    }
  } catch { /* return what was collected */ }
  return tags;
}

const detected = new Map<string, Promise<Set<string> | null>>();
const detectedDone = new Map<string, Set<string> | null>();

/** The OpenType feature tags the font file has, cached per face; null where there is no source or the fetch fails. */
export function featuresOf(family: string, bold: boolean, italic: boolean): Promise<Set<string> | null> {
  const key = faceKey(family, bold, italic);
  const have = detected.get(key);
  if (have) return have;
  const job = (async (): Promise<Set<string> | null> => {
    try {
      let data = bytes.get(key);
      if (!data) { data = source(family, bold, italic); bytes.set(key, data); }
      const found = fontFeatureTags(await data);
      detectedDone.set(key, found);
      return found;
    } catch {
      bytes.delete(key);
      detectedDone.set(key, null);
      return null;
    }
  })();
  detected.set(key, job);
  return job;
}

/** The detection already finished for a face: the tags, null when it failed, undefined while it has not run (sync, for menus). */
export function featuresKnown(family: string, bold: boolean, italic: boolean): Set<string> | null | undefined {
  return detectedDone.get(faceKey(family, bold, italic));
}

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
