import { BUNDLED_FAMILIES } from './bundled-fonts';

/** Font names as other files spell them (a PSD's PostScript name such as ArialMT or Playfair-BoldItalic) resolved to a family
 *  formvis can set and the style the name carries. One lookup serves opening PSD type and the font menu's typed names. */
export interface NamedFace { family: string; bold: boolean; italic: boolean }

const BOLD = /bold|black|heavy|demi/i;
const SLANT = /italic|oblique|slanted/i;
const STYLE_ONLY = /^(?:regular|roman|book|normal|(?:extra|ultra|semi|demi)?bold|black|heavy|medium|light|thin|italic|oblique|slanted|condensed|narrow|mt|psmt|ps)*$/;
const flat = (s: string): string => s.replace(/[^a-z0-9]/gi, '').toLowerCase();

const exact = new Map<string, NamedFace>();
let offered: string[] = [];

/** Notes the families this machine and the engine's font folder offer, so a name can resolve to one of them. */
export function noteFamilies(list: Iterable<string>): void { offered = [...new Set(list)]; }

/** Notes PostScript names with their family and style (Local Font Access, the engine's user fonts). */
export function notePostscript(list: Iterable<{ postscript: string; family: string; style?: string }>): void {
  for (const f of list) {
    if (!f.postscript || !f.family) continue;
    const style = f.style || f.postscript;
    exact.set(flat(f.postscript), { family: f.family, bold: BOLD.test(style), italic: SLANT.test(style) });
  }
}

/** A PostScript name, or a family-and-style name, as a family and style: a noted PostScript name first, else the longest
 *  bundled, noted or given family the name starts with where the rest names only a style. Null when nothing matches. */
export function resolveFace(name: string, extra: readonly string[] = []): NamedFace | null {
  const key = flat(name);
  if (!key) return null;
  const hit = exact.get(key);
  if (hit) return { ...hit };
  let best = '';
  for (const f of [...BUNDLED_FAMILIES.map((b) => b.family), ...offered, ...extra]) {
    const k = flat(f);
    if (k.length > flat(best).length && key.startsWith(k) && STYLE_ONLY.test(key.slice(k.length))) best = f;
  }
  if (!best) return null;
  const rest = key.slice(flat(best).length);
  return { family: best, bold: BOLD.test(rest), italic: SLANT.test(rest) };
}
