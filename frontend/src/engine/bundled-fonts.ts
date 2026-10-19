import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import mono400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import mono700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url';

/** The font files that ship with the window (the weights fonts.css loads), so a face needs no engine to be read.
 *  Bold takes Inter's 600, the face the canvas picks for 700; italic is not shipped, the canvas slants these itself. */
export interface BundledFace { url: string; slanted: boolean }

export function bundledFace(family: string, bold: boolean, italic: boolean): BundledFace | null {
  const name = family.trim().toLowerCase();
  if (name === 'inter') return { url: bold ? inter600 : inter400, slanted: italic };
  if (name === 'jetbrains mono') return { url: bold ? mono700 : mono400, slanted: italic };
  return null;
}

export const FONT_CATEGORIES = ['Sans Serif', 'Serif', 'Display', 'Handwriting', 'Monospace'] as const;
export type FontCategory = typeof FONT_CATEGORIES[number];

interface ShippedFamily { family: string; category: FontCategory; slug: string; bold: boolean }
const shipped = (family: string, category: FontCategory, bold = true): ShippedFamily => ({ family, category, bold, slug: family.toLowerCase().replace(/\s+/g, '-') });

/** Open-licensed families kept as latin woff2 files under public/fonts (400, and 700 where the family has a bold). They join
 *  the document's font set through the FontFace API the first time a type layer or the font menu needs one, never at start. */
const LAZY: readonly ShippedFamily[] = [
  shipped('Lato', 'Sans Serif'), shipped('Montserrat', 'Sans Serif'), shipped('Open Sans', 'Sans Serif'), shipped('Roboto', 'Sans Serif'),
  shipped('Lora', 'Serif'), shipped('Merriweather', 'Serif'), shipped('Playfair Display', 'Serif'),
  shipped('Anton', 'Display', false), shipped('Bebas Neue', 'Display', false), shipped('Oswald', 'Display'),
  shipped('Caveat', 'Handwriting'), shipped('Dancing Script', 'Handwriting'), shipped('Pacifico', 'Handwriting', false),
  shipped('IBM Plex Mono', 'Monospace'), shipped('Source Code Pro', 'Monospace'),
];

/** The 17 bundled text families by category: Inter and JetBrains Mono come with the window's own CSS, the others are the lazy files. */
export const BUNDLED_FAMILIES: ReadonlyArray<{ family: string; category: FontCategory }> = FONT_CATEGORIES.flatMap((category) =>
  [...(category === 'Sans Serif' ? ['Inter'] : category === 'Monospace' ? ['JetBrains Mono'] : []), ...LAZY.filter((f) => f.category === category).map((f) => f.family)]
    .sort((a, b) => a.localeCompare(b)).map((family) => ({ family, category })));

export const isLazyFont = (family: string): boolean => LAZY.some((f) => f.family === family);

const fontSet = (): FontFaceSet | undefined => (typeof document !== 'undefined' ? document.fonts : (globalThis as unknown as { fonts?: FontFaceSet }).fonts);
const added = new Set<string>();

/** Adds a shipped family's faces to the font set, once. The browser fetches a face only when text is set in it or it is asked to load. */
export function registerBundledFont(family: string): boolean {
  const f = LAZY.find((x) => x.family === family), set = fontSet();
  if (!f || !set || typeof FontFace === 'undefined') return false;
  if (!added.has(family)) {
    added.add(family);
    for (const w of f.bold ? [400, 700] : [400]) set.add(new FontFace(f.family, `url("${import.meta.env.BASE_URL}fonts/${f.slug}/${f.slug}-${w}.woff2") format("woff2")`, { weight: String(w), display: 'swap' }));
  }
  return true;
}

/** Registers a shipped family if it is one, and waits for its regular or bold face; any other family resolves at once. */
export async function ensureBundledFont(family: string, bold = false): Promise<void> {
  if (!registerBundledFont(family)) return;
  try { await fontSet()?.load(`${bold ? 700 : 400} 16px "${family}"`); } catch { /* the canvas falls back to what it has */ }
}
