import { TEXT_FONTS } from '../engine';

/** Fonts for the Type tool (Phase 19.1). Two sources: a broad list of common families across macOS, Windows and Linux,
 *  each kept if this machine has it (text measured in it differs from each generic fallback), and, where the browser has
 *  the Local Font Access API (Chromium), the machine's full font list, read with the user's permission on a click. The
 *  desktop shell's webview has no such API; its native font list needs a shell command not built yet, so there the
 *  common families found are what is offered. */

const COMMON = ['Arial', 'Arial Black', 'Avenir', 'Avenir Next', 'Baskerville', 'Book Antiqua', 'Calibri', 'Cambria', 'Candara',
  'Century Gothic', 'Charter', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'DejaVu Sans', 'DejaVu Sans Mono',
  'DejaVu Serif', 'Didot', 'Franklin Gothic Medium', 'Futura', 'Garamond', 'Geneva', 'Georgia', 'Gill Sans', 'Helvetica',
  'Helvetica Neue', 'Hoefler Text', 'Impact', 'Inter', 'Lato', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif',
  'Lucida Console', 'Lucida Grande', 'Menlo', 'Monaco', 'Noto Sans', 'Noto Serif', 'Open Sans', 'Optima', 'Palatino',
  'Palatino Linotype', 'Roboto', 'Rockwell', 'Segoe UI', 'SF Pro Display', 'SF Pro Text', 'Tahoma', 'Times', 'Times New Roman',
  'Trebuchet MS', 'Ubuntu', 'Ubuntu Mono', 'Verdana'];
const GENERICS = ['monospace', 'serif', 'sans-serif'];

let detected: string[] | null = null;
let system: string[] = [];

/** Whether a family is available: a test string set in it measures differently from the same string in each generic
 *  family it would otherwise fall back to. */
export function installed(family: string): boolean {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return false;
  const probe = 'mmmmmmmmmmlli1WQ@#', width = (font: string): number => { c.font = `72px ${font}`; return c.measureText(probe).width; };
  const quoted = `"${family.replace(/["\\]/g, '')}"`;
  return GENERICS.some((g) => width(`${quoted}, ${g}`) !== width(g));
}

/** The families the font menu offers: the defaults first, then every other family found, alphabetically. */
export function fontFamilies(): string[] {
  detected ??= COMMON.filter(installed);
  const rest = [...new Set([...detected, ...system])].filter((f) => !TEXT_FONTS.includes(f)).sort((a, b) => a.localeCompare(b));
  return [...TEXT_FONTS, ...rest];
}

/** Whether this browser can list the machine's fonts (Local Font Access). */
export const canListSystemFonts = (): boolean => typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === 'function';

/** The machine's font families through Local Font Access, which asks the user's permission (so call it from a click);
 *  null where the API is missing or permission is refused. */
export async function loadSystemFonts(): Promise<string[] | null> {
  const query = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts;
  if (!query) return null;
  try {
    const fonts = await query();
    system = [...new Set(fonts.map((f) => f.family).filter((f) => typeof f === 'string' && f.trim()))];
    return system;
  } catch {
    return null;
  }
}
