/** The interface languages (DEV_PLAN 35.5 and 36.32): English is the source text and the default; every other
 *  language has a table keyed by the English. A regional variant (Mexican Spanish, French Canadian) keeps only the
 *  words that differ and falls back to its parent. No imports here, so prefs and i18n can both read the list. */
export const LANG_CODES = ['en', 'es', 'es-MX', 'pt-BR', 'fr', 'fr-CA', 'de', 'it', 'nl', 'da', 'fi', 'nb', 'sv', 'ru', 'pl', 'cs', 'hu', 'uk', 'tr', 'zh-CN', 'zh-TW', 'ja', 'ko', 'id', 'th', 'vi', 'ar', 'hi'] as const;
export type Lang = typeof LANG_CODES[number];

/** Each language in its own name, in the order the picker lists them. */
export const LANG_NAMES: ReadonlyArray<readonly [Lang, string]> = [
  ['en', 'English'], ['es', 'Español'], ['es-MX', 'Español (México)'], ['pt-BR', 'Português (Brasil)'], ['fr', 'Français'],
  ['fr-CA', 'Français (Canada)'], ['de', 'Deutsch'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['da', 'Dansk'], ['fi', 'Suomi'],
  ['nb', 'Norsk bokmål'], ['sv', 'Svenska'], ['ru', 'Русский'], ['pl', 'Polski'], ['cs', 'Čeština'], ['hu', 'Magyar'],
  ['uk', 'Українська'], ['tr', 'Türkçe'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['ja', '日本語'], ['ko', '한국어'],
  ['id', 'Bahasa Indonesia'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['ar', 'العربية'], ['hi', 'हिन्दी'],
];

/** The languages written right to left: the window takes dir="rtl" while one is chosen. */
export const RTL_LANGS: ReadonlySet<Lang> = new Set<Lang>(['ar']);

/** The table a regional variant falls back to for words it does not change. */
export const LANG_PARENT: Partial<Record<Lang, Lang>> = { 'es-MX': 'es', 'fr-CA': 'fr' };

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANG_CODES as readonly string[]).includes(v);
