import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import { DEFAULT_ACCENT, DEFAULT_THEME, THEMES } from './themes';

// index.html paints the saved profile before the bundle loads (no flash); themes.ts owns it afterwards. The two must
// hold the same values, or the first paint and the second differ.
const NAMES = ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--border-color', '--border-light', '--text-primary', '--text-secondary', '--text-muted', '--canvas-bg', '--grid-color'];

function bootProfiles(): Record<string, string[]> {
  const block = html.slice(html.indexOf('var PROFILES = {'), html.indexOf('};', html.indexOf('var PROFILES = {')));
  const out: Record<string, string[]> = {};
  for (const m of block.matchAll(/'([a-z-]+)':\s*\[([^\]]*)\]/g)) out[m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map((v) => v[1]);
  return out;
}

describe('theme boot', () => {
  it('holds every profile with the same values as themes.ts', () => {
    const boot = bootProfiles();
    expect(Object.keys(boot).sort()).toEqual(Object.keys(THEMES).sort());
    for (const [id, p] of Object.entries(THEMES)) {
      NAMES.forEach((name, i) => expect(`${id} ${name} ${boot[id][i]}`).toBe(`${id} ${name} ${p.vars[name]}`));
      if (boot[id][10]) expect(`${id} --bg-node ${boot[id][10]}`).toBe(`${id} --bg-node ${p.vars['--bg-node']}`);
    }
  });

  it('starts from the same default theme and accent: Studio Dark, lavender', () => {
    expect(html).toContain(`var DEFAULT_THEME = '${DEFAULT_THEME}';`);
    expect(html).toContain(`var DEFAULT_ACCENT = '${DEFAULT_ACCENT}';`);
    expect([DEFAULT_THEME, DEFAULT_ACCENT]).toEqual(['studio', '#aba0d3']);
  });
});
