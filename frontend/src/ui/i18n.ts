import { loadPrefs } from './prefs';
import { es } from './i18n/es';
import { it } from './i18n/it';
import { ko } from './i18n/ko';
import { zhCN } from './i18n/zh-CN';

/** The interface languages (DEV_PLAN 35.5). English is the source text and needs no table. */
export type Lang = 'en' | 'es' | 'it' | 'ko' | 'zh-CN';

const TABLES: Record<Lang, Record<string, string>> = { en: {}, es, it, ko, 'zh-CN': zhCN };
const NAMES: ReadonlyArray<readonly [Lang, string]> = [['en', 'English'], ['es', 'Español'], ['it', 'Italiano'], ['ko', '한국어'], ['zh-CN', '简体中文']];

let current: Lang = loadPrefs().language;
const listeners = new Set<() => void>();

/** The language codes with their own names, for a picker. */
export const languages = (): ReadonlyArray<readonly [Lang, string]> => NAMES;

export const language = (): Lang => current;

/** Whether `v` is a language code (for validating a stored preference). */
export const isLang = (v: unknown): v is Lang => NAMES.some(([k]) => k === v);

/** The text for `english` in the current language. A trailing "..." is set aside before the lookup and put back after,
 *  so "Save As..." and "Save As" share one entry. Text with no entry stays English. */
export function t(english: string): string {
  if (current === 'en') return english;
  const dots = english.endsWith('...');
  const base = dots ? english.slice(0, -3) : english;
  const found = TABLES[current][base];
  if (found === undefined) return english;
  return dots ? `${found}...` : found;
}

/** Switches language and tells every listener, which re-label their text in place. */
export function setLanguage(l: Lang): void {
  if (l === current) return;
  current = l;
  document.documentElement.lang = l;
  for (const fn of listeners) fn();
}

/** Calls `fn` whenever the language changes; returns the way to stop. */
export function onLanguage(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
