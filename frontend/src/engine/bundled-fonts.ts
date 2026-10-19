import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import mono400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';

/** The font files that ship with the window (the weights fonts.css loads), so a face needs no engine to be read.
 *  Bold takes Inter's 600, the face the canvas picks for 700; italic is not shipped, the canvas slants these itself. */
export interface BundledFace { url: string; slanted: boolean }

export function bundledFace(family: string, bold: boolean, italic: boolean): BundledFace | null {
  const name = family.trim().toLowerCase();
  if (name === 'inter') return { url: bold ? inter600 : inter400, slanted: italic };
  if (name === 'jetbrains mono' && !bold) return { url: mono400, slanted: italic };
  return null;
}
