import { createSurface, ctxOf, type Ctx2D, type Surface } from './surface';
import { uid, type ID } from './types';

/** Patterns for Pattern Overlay: a few built in, drawn here, and those defined with Edit > Define Pattern. Styles
 *  refer to a pattern by id; projects carry the patterns their styles use, so they open the same elsewhere. */
export interface Pattern { id: ID; name: string; surface: Surface; builtin: boolean }

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
