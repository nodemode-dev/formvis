import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../src/ui/i18n/extra');
const source = (f: string): string => readFileSync(join(__dirname, '../src/ui', f), 'utf8');

/** Every English key the install, selection and no-key prompts pass to t() or show as fixed text. */
const KEYS = [
  'This model runs on fal, which needs a fal API key: fal is a paid service and charges for each run. Add your key, or use a model that runs on this computer for free.',
  'Add a fal key', 'Use a local model', 'Paste your fal API key above, or use a model that runs on this computer.',
  'Install now ({size})', 'Installing {name}. The action carries on when it is done.', '{name} did not download.',
  'Try again from Preferences > Plugins > Local models.', '{name} could not start downloading ({reason}).', 'the engine did not answer', 'Install {name}?',
  'This needs {name}, which is not on this computer yet. It downloads once, about {size}, and then runs on this computer, with no key and no cost. It can be removed in Preferences > Plugins > Local models.',
  '{name} is the recommended model for Select Subject: it finds the subject with cleaner edges, hair and fine detail than the small model, {small}. It downloads once, about {size}, and runs on this computer, with no key and no cost ({license}). You can switch in Preferences > Plugins > Local models.',
  '{name} is the recommended model for Object Selection: it follows the object you click more closely than the small model, {small}. It downloads once, about {size}, and runs on this computer, with no key and no cost ({license}). You can switch in Preferences > Plugins > Local models.',
  'Use {name} for {action}?', 'Use the small model', 'The model choice could not be saved.', 'Selection models', '{action} model',
  '{name}, recommended ({size})', '{name}, small ({size})', '{name} is not downloaded yet, so {action} uses the small model until it is.', '{action} uses {name}.',
  'Download {name} ({size})',
];
const holes = (s: string): string[] => (s.match(/\{[a-z]+\}/g) ?? []).sort();

describe('the install and selection prompts are translated', () => {
  it('every key is still the text the code shows', () => {
    const code = ['model-install.ts', 'panels/local-models.ts', 'panels/generative-dialog.ts'].map(source).join('\n');
    for (const k of KEYS) expect(code.includes(k), k).toBe(true);
  });
  const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));
  it('covers all 27 run-time tables', () => { expect(files.length).toBe(27); });
  for (const file of files) {
    it(`${file} has every key, each with the same placeholders and no em dash`, async () => {
      const mod = await import(join(DIR, file)) as Record<string, Record<string, string>>;
      const table = Object.values(mod)[0];
      for (const k of KEYS) {
        expect(typeof table[k], `${file}: ${k}`).toBe('string');
        expect(holes(table[k]), `${file}: ${k}`).toEqual(holes(k));
        expect(table[k].includes('—'), `${file}: ${k}`).toBe(false);
      }
    });
  }
});
