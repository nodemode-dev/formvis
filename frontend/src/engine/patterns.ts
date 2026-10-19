import { createSurface, ctxOf, type Ctx2D, type Surface } from './surface';
import { uid, type ID } from './types';
import { PROCEDURAL_TEXTURES, textureGrey } from './procedural-tips';

/** Patterns for Pattern Overlay: a few built in, drawn here, and those defined with Edit > Define Pattern. Styles
 *  refer to a pattern by id; projects carry the patterns their styles use, so they open the same elsewhere. */
export interface Pattern { id: ID; name: string; surface: Surface; builtin: boolean; group?: string }

const registry = new Map<ID, Pattern>();
let seeded = false;

function builtin(id: ID, name: string, size: number, draw: (c: Ctx2D, n: number) => void): void {
  const surface = createSurface(size, size);
  draw(ctxOf(surface), size);
  registry.set(id, { id, name, surface, builtin: true });
}

function seed(): void {
  if (seeded) return;
  seeded = true;
  builtin('builtin:checker', 'Checker', 16, (c, n) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, n, n); c.fillStyle = '#000000'; c.fillRect(0, 0, n / 2, n / 2); c.fillRect(n / 2, n / 2, n / 2, n / 2); });
  builtin('builtin:dots', 'Dots', 12, (c, n) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, n, n); c.fillStyle = '#000000'; c.beginPath(); c.arc(n / 2, n / 2, 3, 0, Math.PI * 2); c.fill(); });
  builtin('builtin:stripes', 'Stripes', 16, (c, n) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, n, n); c.fillStyle = '#000000'; c.fillRect(0, 0, n, n / 2); });
  builtin('builtin:grid', 'Grid', 16, (c, n) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, n, n); c.fillStyle = '#808080'; c.fillRect(0, 0, n, 1); c.fillRect(0, 0, 1, n); });
  for (const [kind, name, size] of PROCEDURAL_TEXTURES) {
    builtin(`builtin:${kind}`, name, size, (c, n) => {
      const img = c.createImageData(n, n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const g = Math.round(textureGrey(kind, x, y, n)), i = (y * n + x) * 4; img.data[i] = g; img.data[i + 1] = g; img.data[i + 2] = g; img.data[i + 3] = 255; }
      c.putImageData(img, 0, 0);
    });
  }
}

/** Patterns that arrived inside an opened project: they render its styles but do not join the library. */
export const projectPatterns = new Set<ID>();

export function patternById(id: ID | null | undefined): Pattern | null { seed(); return id ? registry.get(id) ?? null : null; }

/** Every pattern known, built-ins first. */
export function allPatterns(): Pattern[] { seed(); return [...registry.values()].sort((a, b) => Number(b.builtin) - Number(a.builtin)); }

/** Registers a pattern, keeping `id` when one is given (as a project's embedded pattern keeps its own). */
export function addPattern(name: string, surface: Surface, id?: ID): Pattern {
  seed();
  const p: Pattern = { id: id ?? `pattern-${uid()}`, name: name.trim().slice(0, 80) || 'Pattern', surface, builtin: false };
  registry.set(p.id, p);
  return p;
}

/** Removes a pattern of the person's own; built-ins stay. Returns whether one was removed. */
export function removePattern(id: ID): boolean {
  const p = registry.get(id);
  if (!p || p.builtin) return false;
  projectPatterns.delete(id);
  return registry.delete(id);
}

/** Puts a pattern of the person's own in a named group (empty takes it out of any group). */
export function setPatternGroup(id: ID, group: string): boolean {
  const p = registry.get(id);
  if (!p || p.builtin) return false;
  const g = group.trim().slice(0, 40);
  if (g) p.group = g; else delete p.group;
  return true;
}

/** Moves a pattern of the person's own one place up (-1) or down (1) among their own. */
export function stepPattern(id: ID, by: -1 | 1): boolean {
  const own = [...registry.values()].filter((p) => !p.builtin), i = own.findIndex((p) => p.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= own.length) return false;
  [own[i], own[j]] = [own[j], own[i]];
  for (const p of own) registry.delete(p.id);
  for (const p of own) registry.set(p.id, p);
  return true;
}

/** Renames a pattern of the person's own; built-ins keep their names. */
export function renamePattern(id: ID, name: string): boolean {
  const p = registry.get(id), n = name.trim().slice(0, 80);
  if (!p || p.builtin || !n) return false;
  p.name = n;
  return true;
}
