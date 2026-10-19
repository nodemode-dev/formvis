import { loadPrefs } from './prefs';
import { LANG_NAMES, LANG_PARENT, RTL_LANGS, isLang as isLangCode, type Lang } from './i18n/langs';

/** The interface languages (DEV_PLAN 35.5 and 36.32): 30, English the source text and the default. Each other
 *  language's table is its own module, loaded when chosen (and at start for the saved choice) so the app carries only
 *  the one it shows; a regional variant falls back to its parent's table, then to English. */
export type { Lang } from './i18n/langs';

type Table = Record<string, string>;
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<Table>> = {
  es: () => import('./i18n/es').then((m) => m.es), 'es-MX': () => import('./i18n/es-MX').then((m) => m.esMX),
  'pt-BR': () => import('./i18n/pt-BR').then((m) => m.ptBR), fr: () => import('./i18n/fr').then((m) => m.fr),
  'fr-CA': () => import('./i18n/fr-CA').then((m) => m.frCA), de: () => import('./i18n/de').then((m) => m.de),
  it: () => import('./i18n/it').then((m) => m.it), nl: () => import('./i18n/nl').then((m) => m.nl),
  da: () => import('./i18n/da').then((m) => m.da), fi: () => import('./i18n/fi').then((m) => m.fi),
  nb: () => import('./i18n/nb').then((m) => m.nb), sv: () => import('./i18n/sv').then((m) => m.sv),
  ru: () => import('./i18n/ru').then((m) => m.ru), pl: () => import('./i18n/pl').then((m) => m.pl),
  cs: () => import('./i18n/cs').then((m) => m.cs), hu: () => import('./i18n/hu').then((m) => m.hu),
  uk: () => import('./i18n/uk').then((m) => m.uk), tr: () => import('./i18n/tr').then((m) => m.tr),
  'zh-CN': () => import('./i18n/zh-CN').then((m) => m.zhCN), 'zh-TW': () => import('./i18n/zh-TW').then((m) => m.zhTW),
  ja: () => import('./i18n/ja').then((m) => m.ja), ko: () => import('./i18n/ko').then((m) => m.ko),
  id: () => import('./i18n/id').then((m) => m.id), th: () => import('./i18n/th').then((m) => m.th),
  vi: () => import('./i18n/vi').then((m) => m.vi), ar: () => import('./i18n/ar').then((m) => m.ar), hi: () => import('./i18n/hi').then((m) => m.hi),
  el: () => import('./i18n/el').then((m) => m.el),
  'sr-Latn': () => import('./i18n/sr-Latn').then((m) => m.srLatn),
};
/** Part b of each table (36.32b): filters, adjustments, dialog fields, tooltips, notes and messages, kept apart so the
 *  first part stays readable; merged over it when the language loads. Regional variants have none of their own. */
const MORE: Partial<Record<Exclude<Lang, 'en'>, () => Promise<Table>>> = {
  es: () => import('./i18n/more/es').then((m) => m.es), 'pt-BR': () => import('./i18n/more/pt-BR').then((m) => m.ptBR),
  fr: () => import('./i18n/more/fr').then((m) => m.fr), de: () => import('./i18n/more/de').then((m) => m.de),
  it: () => import('./i18n/more/it').then((m) => m.it), nl: () => import('./i18n/more/nl').then((m) => m.nl),
  da: () => import('./i18n/more/da').then((m) => m.da), fi: () => import('./i18n/more/fi').then((m) => m.fi),
  nb: () => import('./i18n/more/nb').then((m) => m.nb), sv: () => import('./i18n/more/sv').then((m) => m.sv),
  ru: () => import('./i18n/more/ru').then((m) => m.ru), pl: () => import('./i18n/more/pl').then((m) => m.pl),
  cs: () => import('./i18n/more/cs').then((m) => m.cs), hu: () => import('./i18n/more/hu').then((m) => m.hu),
  uk: () => import('./i18n/more/uk').then((m) => m.uk), tr: () => import('./i18n/more/tr').then((m) => m.tr),
  'zh-CN': () => import('./i18n/more/zh-CN').then((m) => m.zhCN), 'zh-TW': () => import('./i18n/more/zh-TW').then((m) => m.zhTW),
  ja: () => import('./i18n/more/ja').then((m) => m.ja), ko: () => import('./i18n/more/ko').then((m) => m.ko),
  id: () => import('./i18n/more/id').then((m) => m.id), th: () => import('./i18n/more/th').then((m) => m.th),
  vi: () => import('./i18n/more/vi').then((m) => m.vi),
  el: () => import('./i18n/more/el').then((m) => m.el),
  ar: () => import('./i18n/more/ar').then((m) => m.ar),
  hi: () => import('./i18n/more/hi').then((m) => m.hi),
  'sr-Latn': () => import('./i18n/more/sr-Latn').then((m) => m.srLatn),
};
/** Part c (36.32c): strings the app assembles at run time (tool hint segments, status readouts, Preferences sections). */
const EXTRA: Partial<Record<Exclude<Lang, 'en'>, () => Promise<Table>>> = {
  es: () => import('./i18n/extra/es').then((m) => m.es), 'pt-BR': () => import('./i18n/extra/pt-BR').then((m) => m.ptBR),
  fr: () => import('./i18n/extra/fr').then((m) => m.fr), de: () => import('./i18n/extra/de').then((m) => m.de),
  it: () => import('./i18n/extra/it').then((m) => m.it), nl: () => import('./i18n/extra/nl').then((m) => m.nl),
  da: () => import('./i18n/extra/da').then((m) => m.da), fi: () => import('./i18n/extra/fi').then((m) => m.fi),
  nb: () => import('./i18n/extra/nb').then((m) => m.nb), sv: () => import('./i18n/extra/sv').then((m) => m.sv),
  ru: () => import('./i18n/extra/ru').then((m) => m.ru), pl: () => import('./i18n/extra/pl').then((m) => m.pl),
  cs: () => import('./i18n/extra/cs').then((m) => m.cs), hu: () => import('./i18n/extra/hu').then((m) => m.hu),
  uk: () => import('./i18n/extra/uk').then((m) => m.uk), tr: () => import('./i18n/extra/tr').then((m) => m.tr),
  'zh-CN': () => import('./i18n/extra/zh-CN').then((m) => m.zhCN), 'zh-TW': () => import('./i18n/extra/zh-TW').then((m) => m.zhTW),
  ja: () => import('./i18n/extra/ja').then((m) => m.ja), ko: () => import('./i18n/extra/ko').then((m) => m.ko),
  id: () => import('./i18n/extra/id').then((m) => m.id), th: () => import('./i18n/extra/th').then((m) => m.th),
  vi: () => import('./i18n/extra/vi').then((m) => m.vi), ar: () => import('./i18n/extra/ar').then((m) => m.ar),
  el: () => import('./i18n/extra/el').then((m) => m.el),
  hi: () => import('./i18n/extra/hi').then((m) => m.hi),
  'sr-Latn': () => import('./i18n/extra/sr-Latn').then((m) => m.srLatn),
};
const tables = new Map<Lang, Table>([['en', {}]]);

const saved = loadPrefs().language;
let current: Lang = 'en';
let wanted: Lang = saved;
const listeners = new Set<() => void>();

/** The language codes with their own names, for a picker. */
export const languages = (): ReadonlyArray<readonly [Lang, string]> => LANG_NAMES;

export const language = (): Lang => current;

/** Whether `v` is a language code (for validating a stored preference). */
export const isLang = isLangCode;

/** Loads `l`'s table and its parent's, once each. */
async function load(l: Lang): Promise<void> {
  for (const code of [LANG_PARENT[l], l]) {
    if (!code || tables.has(code) || code === 'en') continue;
    const more = MORE[code], extra = EXTRA[code];
    const [a, b, c] = await Promise.all([LOADERS[code](), more ? more() : Promise.resolve({}), extra ? extra() : Promise.resolve({})]);
    tables.set(code, { ...c, ...b, ...a });   // the first part wins where parts share a key
  }
}

/** The text for `english` in the current language: its own table, then its parent's, then English. A trailing "..."
 *  is set aside before the lookup and put back after, so "Save As..." and "Save As" share one entry. */
export function t(english: string): string {
  if (current === 'en') return english;
  // A trailing "..." or ":" (a label before its control) is set aside too, so "Size:" shares "Size"'s entry (36.32b).
  const tail = english.endsWith('...') ? '...' : english.endsWith(':') && !english.endsWith('::') ? ':' : '';
  const base = tail ? english.slice(0, -tail.length) : english;
  const parent = LANG_PARENT[current];
  const look = (k: string): string | undefined => tables.get(current)?.[k] ?? (parent ? tables.get(parent)?.[k] : undefined);
  const found = look(base) ?? (tail ? look(english) : undefined);
  if (found === undefined) return english;
  return tail && look(base) !== undefined ? `${found}${tail}` : found;
}

/** A phrase with a number in it, in the form the language's plural rules pick for `n`. `one` and `other` are the English
 *  forms with `{n}` where the number goes ("{n} record", "{n} records"). A language's table may hold a form for each
 *  category its rules use, under the English `other` plus "#" and the category ("{n} records#few"); a category it does not
 *  list falls back to the translation of `other`, then to the English forms. The number is written in the language's own
 *  digits and grouping. */
export function tn(n: number, one: string, other: string): string {
  const lang = current;
  let cat: Intl.LDMLPluralRule = n === 1 ? 'one' : 'other';
  try { if (lang !== 'en') cat = new Intl.PluralRules(lang).select(n); } catch { /* keep the English rule */ }
  const hit = (key: string): string | undefined => { const f = t(key); return f === key ? undefined : f; };
  const form = lang === 'en' ? (n === 1 ? one : other) : hit(`${other}#${cat}`) ?? hit(cat === 'one' ? one : other) ?? hit(other) ?? (n === 1 ? one : other);
  let shown = String(n);
  try { shown = new Intl.NumberFormat(lang === 'en' ? 'en' : lang).format(n); } catch { /* keep plain digits */ }
  return form.replace('{n}', shown);
}

/** Whether `text` has an entry in the current language (the page translator only touches text that does). */
const known = (text: string): boolean => current !== 'en' && t(text) !== text;

/** Switches language once its table has loaded, then tells every listener, which re-label their text in place. A later
 *  call wins over an earlier one still loading. */
export async function setLanguage(l: Lang): Promise<void> {
  wanted = l;
  try { await load(l); } catch { return; }   // a table that cannot load leaves the language as it was
  if (wanted !== l || l === current) return;
  current = l;
  document.documentElement.lang = l;
  document.documentElement.dir = RTL_LANGS.has(l) ? 'rtl' : 'ltr';
  for (const fn of listeners) fn();
  translatePage();
}

/** At start, before the interface is built: the saved language's table loaded and made current (English on failure). */
export async function startLanguage(): Promise<void> {
  if (saved === 'en') return;
  try { await load(saved); } catch { return; }
  if (wanted !== saved) return;
  current = saved;
  document.documentElement.lang = saved;
  document.documentElement.dir = RTL_LANGS.has(saved) ? 'rtl' : 'ltr';
}

/** Calls `fn` whenever the language changes; returns the way to stop. */
export function onLanguage(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/* The page translator (36.32): interface text that is not set through t() (panel bodies, dialog notes, buttons built
 * once, tooltips) is translated where it lands, by exact match on the English. Each touched text node or attribute keeps
 * its English, so a later language change, or English again, puts the right text back. It runs from a MutationObserver,
 * whose callbacks run before the browser paints, so English is never shown first. Text the person owns is never
 * touched: inputs, text areas, editable text, the canvas, and anything inside [data-no-i18n] (layer, document, channel,
 * path and preset names). */
const ATTRS = ['title', 'aria-label', 'placeholder'] as const;
const SKIP = 'textarea, input, script, style, canvas, [contenteditable], [data-no-i18n], .cv-type-editor, .cv-layer-label, .cv-tab-name, .cv-comp-name, .cv-path-name, .cv-style-name, .cv-home-name, .cv-vtl-clip-name, .cv-vtl-lane-name, .cv-vtl-head-name';
const textEn = new WeakMap<Text, { en: string; shown: string }>();
const attrEn = new WeakMap<Element, Map<string, { en: string; shown: string }>>();
let observer: MutationObserver | null = null;

const skipped = (n: Node | null): boolean => {
  const e = n instanceof Element ? n : n?.parentElement ?? null;
  return !e || !!e.closest(SKIP);
};

function translateText(node: Text): void {
  const raw = node.data, rec = textEn.get(node);
  if (rec && raw === rec.shown) {   // ours: shown in an earlier language, the English kept
    const next = t(rec.en);
    if (next !== raw) { rec.shown = next; node.data = next; }
    if (current === 'en' || next === rec.en) textEn.delete(node);
    return;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 200 || !known(trimmed) || skipped(node)) { if (rec) textEn.delete(node); return; }
  const next = raw.replace(trimmed, t(trimmed));
  textEn.set(node, { en: raw, shown: next });
  node.data = next;
}

function translateAttrs(el: Element): void {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v === null) continue;
    let recs = attrEn.get(el);
    const rec = recs?.get(a);
    if (rec && v === rec.shown) {
      const next = t(rec.en);
      if (next !== v) { rec.shown = next; el.setAttribute(a, next); }
      continue;
    }
    if (!known(v) || skippedAttr(el)) { recs?.delete(a); continue; }
    if (!recs) { recs = new Map(); attrEn.set(el, recs); }
    const next = t(v);
    recs.set(a, { en: v, shown: next });
    el.setAttribute(a, next);
  }
}

/** Attributes follow a narrower rule than text (36.32c): a field's placeholder, title and label are interface text even
 *  though its value is the person's, so inputs and text areas are not skipped for them. */
const SKIP_ATTR = SKIP.replace('textarea, input, ', '');
const skippedAttr = (e: Element): boolean => !!e.closest(SKIP_ATTR);

function walk(root: Node): void {
  if (root instanceof Text) { translateText(root); return; }
  if (!(root instanceof Element)) return;
  if (root.closest(SKIP)) { if (root.matches('input, textarea')) translateAttrs(root); return; }
  translateAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (!(n instanceof Element) || !n.matches(SKIP)) return NodeFilter.FILTER_ACCEPT;
      if (n.matches('input, textarea')) translateAttrs(n);   // its attributes, never its value
      return NodeFilter.FILTER_REJECT;
    },
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n instanceof Text) translateText(n);
    else if (n instanceof Element) translateAttrs(n);
  }
}

/** The whole page translated (at a language change, and once when the translator starts). */
function translatePage(): void {
  if (typeof document === 'undefined') return;
  observer?.disconnect();
  walk(document.body);
  observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}

/** Starts the page translator; called once the interface exists. Idle in English until a language is chosen. */
export function startPageTranslator(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((records) => {
    if (current === 'en') return;   // English: nothing to translate; a switch back walks the page once
    observer?.disconnect();
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => walk(n));
      else if (r.type === 'characterData' && r.target instanceof Text) translateText(r.target);
      else if (r.type === 'attributes' && r.target instanceof Element) translateAttrs(r.target);
    }
    observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  });
  translatePage();
}
