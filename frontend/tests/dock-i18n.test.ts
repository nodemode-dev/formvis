import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/dock/strings';

const UI = join(__dirname, '../src/ui/i18n');
const adapter = readFileSync(join(__dirname, '../src/dock-adapter.ts'), 'utf8');
const WORDS: Record<string, string> = { app: 'formvis', noun: 'picture', start: './formvis boot' };
const NAMES = new Set(['Codex', 'Cursor', 'Antigravity']);
const TRANSLATED = ['ar', 'cs', 'da', 'de', 'el', 'es', 'fi', 'fr', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ru', 'sr-Latn', 'sv', 'th', 'tr', 'uk', 'vi', 'zh-CN', 'zh-TW'];

const own = (pattern: RegExp): string => (adapter.match(pattern)?.[1] ?? '').replace(/\\'/g, "'");
const OVERRIDES: Record<string, string> = { tourChatBody: own(/tourChatBody: '((?:[^'\\]|\\.)*)'/) };
const LEAD = own(/lead: "([^"]*)"/);
const lookup = (english: string): string => english.replace(/\{(app|noun|start)\}/g, (_m, name: string) => WORDS[name] ?? '');
const KEYS = [...Object.entries(STRINGS).map(([key, english]) => lookup(OVERRIDES[key] ?? english)), LEAD].filter((k) => !NAMES.has(k));
const holes = (s: string): string[] => (s.match(/\{[a-z]+\}/g) ?? []).sort();

async function table(lang: string): Promise<Record<string, string>> {
  const parts = await Promise.all(['', 'more', 'extra'].map(async (dir) => Object.values(await import(join(UI, dir, `${lang}.ts`)) as Record<string, Record<string, string>>)[0]));
  return Object.assign({}, ...parts.reverse()) as Record<string, string>;
}

describe('the dock module\'s sentences are in the language tables', () => {
  it('the adapter still fills app, noun and start before the lookup, and nothing else', () => {
    expect(adapter.includes("t(english.replace(/\\{(app|noun|start)\\}/g, (_m, name: string) => ({ app: 'formvis', noun: 'picture', start: './formvis boot' })[name] ?? ''))")).toBe(true);
    expect(OVERRIDES.tourChatBody.length).toBeGreaterThan(20);
    expect(LEAD.length).toBeGreaterThan(20);
  });
  it('the tables named here exist', () => {
    const files = readdirSync(join(UI, 'more')).map((f) => f.replace(/\.ts$/, ''));
    for (const lang of TRANSLATED) expect(files.includes(lang), lang).toBe(true);
    expect(files.filter((lang) => !TRANSLATED.includes(lang))).toEqual([]);
  });
  for (const lang of TRANSLATED) {
    it(`${lang} has every module sentence, each with the same placeholders and no em dash`, async () => {
      const t = await table(lang);
      for (const k of KEYS) {
        expect(typeof t[k], `${lang}: ${k}`).toBe('string');
        expect(holes(t[k]), `${lang}: ${k}`).toEqual(holes(k));
        expect(t[k].includes(String.fromCharCode(0x2014)), `${lang}: ${k}`).toBe(false);
      }
    });
  }
});
