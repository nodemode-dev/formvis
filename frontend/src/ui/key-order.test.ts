import { describe, expect, it } from 'vitest';

// A command's keys must be written as comboOf writes a key press (Alt, Shift, Mod, then the key), or no press can ever
// match them (1.53.4: Photoshop's Keyboard Shortcuts key was first written Mod+Alt+Shift+K).
const sources = import.meta.glob(['../**/*.ts', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ORDER: Record<string, number> = { Alt: 0, Shift: 1, Mod: 2 };

describe('key combinations a press can match (1.53.4)', () => {
  it('orders modifiers as comboOf does', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      for (const m of src.matchAll(/keys:\s*\[([^\]]*)\]/g)) for (const [, combo] of m[1].matchAll(/'([^']+)'/g)) {
        const mods = combo.split('+').slice(0, -1).filter((p) => p in ORDER);
        if (mods.join() !== [...mods].sort((a, b) => ORDER[a] - ORDER[b]).join()) bad.push(`${file}: ${combo}`);
      }
    }
    expect(bad).toEqual([]);
    expect(Object.keys(sources).length).toBeGreaterThan(50);   // the sources were found
  });
});
