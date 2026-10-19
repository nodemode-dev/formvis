/** OpenType features on type layers (DEV_PLAN 32.6 part b). The canvas cannot set font-feature-settings, but a FontFace made
 *  with the `featureSettings` descriptor applies them to that face, so a spec with features draws with a variant of its
 *  family registered from the font file's bytes. `TextSpec.features` lists the tags turned on ('smcp'), and '-liga' or
 *  '-calt' for a default-on feature turned off. */
import type { FeatureRun } from './types';

export const OT_FEATURES: ReadonlyArray<{ tag: string; label: string }> = [
  { tag: 'liga', label: 'Standard Ligatures' }, { tag: 'dlig', label: 'Discretionary Ligatures' }, { tag: 'calt', label: 'Contextual Alternates' },
  { tag: 'salt', label: 'Stylistic Alternates' }, { tag: 'swsh', label: 'Swash' }, { tag: 'onum', label: 'Oldstyle Figures' },
  { tag: 'titl', label: 'Titling' }, { tag: 'ornm', label: 'Ornaments' }, { tag: 'ordn', label: 'Ordinals' },
  { tag: 'frac', label: 'Fractions' }, { tag: 'smcp', label: 'Small Caps' },
];

/** Features fonts apply unless told otherwise: their toggle shows on until '-tag' is listed. */
export const OT_DEFAULT_ON: ReadonlySet<string> = new Set(['liga', 'calt', 'kern', 'clig', 'ccmp', 'locl', 'rlig', 'mark', 'mkmk']);

/** Stylistic sets ss01 to ss20 (DEV_PLAN 32.6c): known to the feature list, offered in the Glyphs dialog, not in the type menu. */
export const OT_STYLISTIC_SETS: ReadonlyArray<{ tag: string; label: string }> = Array.from({ length: 20 }, (_, i) => {
  const tag = `ss${String(i + 1).padStart(2, '0')}`;
  return { tag, label: `Set ${i + 1}` };
});

const ALL_FEATURES = [...OT_FEATURES, ...OT_STYLISTIC_SETS];
const KNOWN = new Set(ALL_FEATURES.map((f) => f.tag));

/** A feature list cleaned: once each, the catalogue's tags first in its order, then any other valid four-character tag
 *  (tnum, lnum, case, zero, ...) as written; a default-on feature is kept only as '-tag', a catalogue feature only as 'tag'. */
export function cleanFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(raw.filter((v): v is string => typeof v === 'string'));
  const known = ALL_FEATURES.flatMap(({ tag }) => (seen.has(tag) && !OT_DEFAULT_ON.has(tag) ? [tag] : seen.has(`-${tag}`) && OT_DEFAULT_ON.has(tag) ? [`-${tag}`] : []));
  const other = [...seen].filter((f) => /^-?[A-Za-z0-9]{4}$/.test(f) && !KNOWN.has(f.replace(/^-/, '')) && OT_DEFAULT_ON.has(f.replace(/^-/, '')) === f.startsWith('-')).slice(0, 40);
  return [...known, ...other];
}

/** Feature tags typed as text ("tnum, lnum, -kern") read into a list; a tag that is not four letters or digits is dropped. */
export function featuresFromText(text: string): string[] {
  return cleanFeatures(text.split(/[\s,;]+/).filter(Boolean));
}

/** The list written back as text, for a field. */
export const featuresToText = (features: readonly string[] | null | undefined): string => (features ?? []).join(', ');

/** Variable font axes typed as text ("wght 600, wdth 90"; a colon or equals sign also parses) read into values; a tag that
 *  is not four characters, or a value that is not finite, is dropped. */
export function variationsFromText(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(/([A-Za-z0-9]{4})\s*[:= ]\s*(-?\d+(?:\.\d+)?)/g)) out[m[1]] = Math.max(-1000, Math.min(10000, Number(m[2])));
  return out;
}

export const variationsToText = (v: Record<string, number> | null | undefined): string => Object.entries(v ?? {}).map(([k, n]) => `${k} ${n}`).join(', ');

/** The CSS font-variation-settings for a set of axes. */
export const variationCss = (v: Record<string, number> | null | undefined): string => Object.entries(v ?? {}).map(([k, n]) => `"${k}" ${n}`).join(', ');

/** Whether a feature is on in a list: listed for most, not listed as off for the defaults. */
export const featureOn = (features: readonly string[] | null | undefined, tag: string): boolean => {
  const list = features ?? [];
  return OT_DEFAULT_ON.has(tag) ? !list.includes(`-${tag}`) : list.includes(tag);
};

/** The list with one feature set on or off. */
export function withFeature(features: readonly string[] | null | undefined, tag: string, on: boolean): string[] {
  if (!/^[A-Za-z0-9]{4}$/.test(tag)) return cleanFeatures(features ?? []);
  const rest = (features ?? []).filter((f) => f !== tag && f !== `-${tag}`);
  if (OT_DEFAULT_ON.has(tag)) return cleanFeatures(on ? rest : [...rest, `-${tag}`]);
  return cleanFeatures(on ? [...rest, tag] : rest);
}

const TAG = /^[A-Za-z0-9]{4}$/;
const runKey = (r: { on: readonly string[]; off: readonly string[] }): string => `${r.on.join(',')}|${r.off.join(',')}`;

/** Feature runs read back from saved data: valid tags only, ranges clamped to `length`, sorted, none overlapping, empty
 *  ones dropped, neighbours with the same settings joined. */
export function cleanRuns(raw: unknown, length: number): FeatureRun[] {
  if (!Array.isArray(raw)) return [];
  const tags = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((t): t is string => typeof t === 'string' && TAG.test(t)))].slice(0, 40) : []);
  const list: FeatureRun[] = [];
  for (const r of raw.slice(0, 2000)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>, s = Number(o.start), e = Number(o.end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    const start = Math.max(0, Math.floor(s)), end = Math.min(length, Math.floor(e)), off = tags(o.off), on = tags(o.on).filter((t) => !off.includes(t));
    if (end > start && (on.length || off.length)) list.push({ start, end, on, off });
  }
  list.sort((a, b) => a.start - b.start);
  const out: FeatureRun[] = [];
  for (const r of list) {
    const last = out[out.length - 1], start = last ? Math.max(r.start, last.end) : r.start;
    if (r.end <= start) continue;
    if (last && last.end === start && runKey(last) === runKey(r)) last.end = r.end;
    else out.push({ ...r, start });
  }
  return out;
}

/** The runs with `tag` set on or off over [start, end): runs are split at the range's edges, the range's pieces updated,
 *  empty pieces dropped and equal neighbours joined. */
export function withRunFeature(runs: readonly FeatureRun[] | null | undefined, start: number, end: number, tag: string, on: boolean): FeatureRun[] {
  const list = runs ?? [];
  if (!TAG.test(tag) || end <= start) return list.map((r) => ({ ...r, on: [...r.on], off: [...r.off] }));
  const cuts = [...new Set([start, end, ...list.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b);
  const out: FeatureRun[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const a = cuts[k], b = cuts[k + 1], have = list.find((r) => r.start <= a && r.end >= b);
    let onTags = have ? [...have.on] : [], offTags = have ? [...have.off] : [];
    if (a >= start && b <= end) {
      onTags = onTags.filter((t) => t !== tag); offTags = offTags.filter((t) => t !== tag);
      (on ? onTags : offTags).push(tag);
    }
    if (!onTags.length && !offTags.length) continue;
    const last = out[out.length - 1], piece = { start: a, end: b, on: onTags, off: offTags };
    if (last && last.end === a && runKey(last) === runKey(piece)) last.end = b;
    else out.push(piece);
  }
  return out;
}

/** The features in force at character `i`: the layer's list with the run that covers it applied. */
export function featuresAt(base: readonly string[] | null | undefined, runs: readonly FeatureRun[] | null | undefined, i: number): string[] {
  const run = runs?.find((r) => r.start <= i && i < r.end);
  if (!run) return cleanFeatures(base ?? []);
  let list = cleanFeatures(base ?? []);
  for (const t of run.on) list = withFeature(list, t, true);
  for (const t of run.off) list = withFeature(list, t, false);
  return list;
}

/** Whether `tag` is on for every character of [start, end) (for the first character when the range is empty). */
export function runFeatureOn(base: readonly string[] | null | undefined, runs: readonly FeatureRun[] | null | undefined, start: number, end: number, tag: string): boolean {
  if (end <= start) return featureOn(featuresAt(base, runs, start), tag);
  const cuts = [...new Set([start, ...(runs ?? []).flatMap((r) => [r.start, r.end]).filter((p) => p > start && p < end)])];
  return cuts.every((c) => featureOn(featuresAt(base, runs, c), tag));
}

/** [from, to) of a line cut where the features change: each piece with the list in force over it. */
export function featureSegments(base: readonly string[] | null | undefined, runs: readonly FeatureRun[] | null | undefined, from: number, to: number): Array<{ from: number; to: number; features: string[] }> {
  const cuts = [...new Set([from, ...(runs ?? []).flatMap((r) => [r.start, r.end]).filter((p) => p > from && p < to)])].sort((a, b) => a - b);
  const out: Array<{ from: number; to: number; features: string[] }> = [];
  cuts.forEach((c, k) => {
    const end = k + 1 < cuts.length ? cuts[k + 1] : to, features = featuresAt(base, runs, c), last = out[out.length - 1];
    if (last && last.features.join(',') === features.join(',')) last.to = end;
    else out.push({ from: c, to: end, features });
  });
  return out;
}

/** The runs after the text changed from `before` to `after`: the common start and end stay put, the changed middle is
 *  replaced, so positions after it move by the change in length and positions inside it fall to its start. */
export function shiftRuns(runs: readonly FeatureRun[] | null | undefined, before: string, after: string): FeatureRun[] {
  if (!runs?.length || before === after) return runs ? runs.map((r) => ({ ...r, on: [...r.on], off: [...r.off] })) : [];
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const delta = after.length - before.length, map = (x: number): number => (x <= p ? x : x >= before.length - s ? x + delta : p);
  return cleanRuns(runs.map((r) => ({ ...r, start: map(r.start), end: map(r.end) })), after.length);
}

/** The CSS font-feature-settings for a list. */
const settings = (features: readonly string[]): string => features.map((f) => (f.startsWith('-') ? `"${f.slice(1)}" 0` : `"${f}" 1`)).join(', ');

export type FontFileSource = (family: string, bold: boolean, italic: boolean) => Promise<ArrayBuffer>;

let source: FontFileSource = async (family, bold, italic) => {
  if (!(await (await import('../io/api')).serviceReady())) throw new Error(`No font file for ${family}`);   // the engine service is not running
  const res = await fetch(`/api/fonts/file?family=${encodeURIComponent(family)}&bold=${bold ? 1 : 0}&italic=${italic ? 1 : 0}`);
  if (!res.ok || res.status === 204) throw new Error(`No font file for ${family}`);   // 204: not installed here (1.72.5)
  return res.arrayBuffer();
};

/** Where the font file's bytes come from (the app sets the engine's route; the default asks it directly). */
export function setFontFileSource(fn: FontFileSource): void { source = fn; }

/** CSS's generic families name no file, so asking the engine for one only logs a 404 (1.72.5). */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong']);

/** The font file through the current source, refused at once for a generic family. */
function fileOf(family: string, bold: boolean, italic: boolean): Promise<ArrayBuffer> {
  return GENERIC.has(family.trim().toLowerCase()) ? Promise.reject(new Error(`${family} is a generic family`)) : source(family, bold, italic);
}

/** The same font file for the glyph outline reader. */
export const fontFileBytes = fileOf;

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
      if (!data) { data = fileOf(family, bold, italic); bytes.set(key, data); }
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

export interface FontAxis { tag: string; min: number; def: number; max: number }

/** The variable axes a font file's fvar table lists (none for a static font). Every read is bounds-checked. */
export function fontAxes(buf: ArrayBuffer): FontAxis[] {
  const view = new DataView(buf), len = buf.byteLength, out: FontAxis[] = [];
  const ok = (at: number, n: number): boolean => Number.isInteger(at) && at >= 0 && at + n <= len;
  try {
    let base = 0;
    if (ok(0, 4) && view.getUint32(0) === 0x74746366) base = view.getUint32(12);   // 'ttcf': the first font
    if (!ok(base, 12)) return out;
    const count = view.getUint16(base + 4);
    for (let i = 0; i < count; i += 1) {
      const rec = base + 12 + i * 16;
      if (!ok(rec, 16)) break;
      if (view.getUint32(rec) !== 0x66766172) continue;   // 'fvar'
      const t = view.getUint32(rec + 8);
      if (!ok(t, 16)) break;
      const first = t + view.getUint16(t + 4), n = view.getUint16(t + 8), size = view.getUint16(t + 10);
      for (let k = 0; k < n; k += 1) {
        const a = first + k * size;
        if (!ok(a, 16)) break;
        const tag = String.fromCharCode(view.getUint8(a), view.getUint8(a + 1), view.getUint8(a + 2), view.getUint8(a + 3));
        out.push({ tag, min: view.getInt32(a + 4) / 65536, def: view.getInt32(a + 8) / 65536, max: view.getInt32(a + 12) / 65536 });
      }
      break;
    }
  } catch { /* return what was read */ }
  return out;
}

const axesDone = new Map<string, FontAxis[] | null>();
const axesJobs = new Map<string, Promise<FontAxis[] | null>>();

/** The variable axes of a face, cached; null where the font file cannot be had. */
export function axesOf(family: string, bold: boolean, italic: boolean): Promise<FontAxis[] | null> {
  const key = faceKey(family, bold, italic), have = axesJobs.get(key);
  if (have) return have;
  const job = (async (): Promise<FontAxis[] | null> => {
    try {
      let data = bytes.get(key);
      if (!data) { data = fileOf(family, bold, italic); bytes.set(key, data); }
      const found = fontAxes(await data);
      axesDone.set(key, found);
      return found;
    } catch { bytes.delete(key); axesDone.set(key, null); return null; }
  })();
  axesJobs.set(key, job);
  return job;
}

/** The axes already read for a face (sync, for the panel): undefined while not read, null where unavailable. */
export const axesKnown = (family: string, bold: boolean, italic: boolean): FontAxis[] | null | undefined => axesDone.get(faceKey(family, bold, italic));

const bytes = new Map<string, Promise<ArrayBuffer>>();
const ready = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

const faceKey = (family: string, bold: boolean, italic: boolean): string => `${family}|${bold ? 1 : 0}|${italic ? 1 : 0}`;

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const variantKey = (family: string, bold: boolean, italic: boolean, tags: readonly string[], axes = ''): string => `${faceKey(family, bold, italic)}|${tags.join(',')}|${axes}`;

/** The variant family already registered for these settings, or null (sync, for building a CSS font). */
export function variantFamily(family: string, bold: boolean, italic: boolean, tags: readonly string[] | null | undefined, variations?: Record<string, number> | null): string | null {
  const list = cleanFeatures(tags ?? []), axes = variationCss(variations);
  return list.length || axes ? ready.get(variantKey(family, bold, italic, list, axes)) ?? null : null;
}

/** Registers a variant of a family with the features set, fetching the font file once per family and style; the variant's
 *  family name, or null where it cannot be made (no file, no FontFace), so the plain face is drawn. */
export async function ensureVariant(family: string, bold: boolean, italic: boolean, tags: readonly string[], variations?: Record<string, number> | null): Promise<string | null> {
  const list = cleanFeatures(tags), axes = variationCss(variations);
  if ((!list.length && !axes) || typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return null;
  const key = variantKey(family, bold, italic, list, axes), done = ready.get(key);
  if (done) return done;
  const waiting = pending.get(key);
  if (waiting) return waiting;
  const job = (async (): Promise<string | null> => {
    try {
      const fk = faceKey(family, bold, italic);
      let data = bytes.get(fk);
      if (!data) { data = fileOf(family, bold, italic); bytes.set(fk, data); }
      const name = `${family}__ot_${hash(key)}`;
      const face = new FontFace(name, await data, { featureSettings: settings(list) || 'normal', ...(axes ? { variationSettings: axes } : {}), weight: bold ? '700' : '400', style: italic ? 'italic' : 'normal' });
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
