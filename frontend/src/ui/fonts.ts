import { TEXT_FONTS } from '../engine';
import { loadPrefs, updatePrefs, type FontPreview } from './prefs';

/** Keeps `family` as the newest recently used font (Preferences > Type); nothing is written when it is already first. */
export function rememberFont(family: string): void {
  const p = loadPrefs();
  if (!family || p.recentFonts[0] === family) return;
  updatePrefs({ recentFonts: [family, ...p.recentFonts.filter((f) => f !== family)].slice(0, 20) });
}

const PREVIEW_PX: Record<FontPreview, number> = { none: 0, small: 11, medium: 13, large: 16, extra: 20, huge: 28 };

/** Type > Font Preview Size (36.31): a font menu entry drawn in its own family at the chosen size, or plain when the
 *  preview is off. Only the option's inline style changes, so menus are not rebuilt. Chromium draws option fonts on
 *  Windows and Linux; macOS's native menu shows them plain whatever is set. */
export function previewFont(o: HTMLOptionElement, family: string): void {
  const px = PREVIEW_PX[loadPrefs().fontPreview];
  const ff = px ? `"${family.replace(/"/g, '')}", sans-serif` : '', fs = px ? `${px}px` : '';
  if (o.style.fontFamily !== ff) o.style.fontFamily = ff;
  if (o.style.fontSize !== fs) o.style.fontSize = fs;
}

/** Fonts for the Type tool (Phase 19.1). Two sources: a broad list of common families across macOS, Windows and Linux,
 *  each kept if this machine has it (text measured in it differs from each generic fallback), and, where the browser has
 *  the Local Font Access API (Chromium), the machine's full font list, read with the user's permission on a click. The
 *  desktop app's web view has no such API; there the shell's `system_fonts` command (src-tauri, fontdb) lists the
 *  installed families, at start and without asking. */

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

const added: string[] = [];
const postscript = new Map<string, { family: string; style: string }>();

/** A font name as typed or read from a file, matched to a family: a listed family in its own spelling, else a PostScript name
 *  (as Local Font Access reports them, or the family part of a name such as Family-BoldItalic). Null when nothing matches. */
export function resolveFontName(name: string): { family: string; bold: boolean; italic: boolean } | null {
  const raw = name.trim(), key = raw.toLowerCase();
  if (!raw) return null;
  const listed = fontFamilies().find((f) => f.toLowerCase() === key);
  if (listed) return { family: listed, bold: false, italic: false };
  const ps = postscript.get(key);
  if (ps) return { family: ps.family, bold: /bold|black|heavy/i.test(ps.style), italic: /italic|oblique/i.test(ps.style) };
  const m = /^(.+?)[-_ ]?(BoldItalic|BoldOblique|Bold|Italic|Oblique|Regular|Roman|Book)?(MT|PSMT)?$/.exec(raw.replace(/\s+/g, ''));
  const bare = (m?.[1] ?? raw).toLowerCase(), style = m?.[2] ?? '';
  const hit = fontFamilies().find((f) => f.replace(/\s+/g, '').toLowerCase() === bare);
  return hit ? { family: hit, bold: /bold/i.test(style), italic: /italic|oblique/i.test(style) } : null;
}

/** Registers a font the person brings (SC-ED-0179, PC-AU-0143) under `family` from a font file's bytes or a web address
 *  (CORS permitting) and lists it in the font menus; the family is returned. Rejects where the file is not a font. */
export async function addFontFace(family: string, source: ArrayBuffer | string): Promise<string> {
  const name = family.replace(/["\\]/g, '').trim();
  if (!name) throw new Error('A font family name is needed.');
  const face = new FontFace(name, typeof source === 'string' ? `url("${source.replace(/["\\]/g, '')}")` : source);
  await face.load();
  document.fonts.add(face);
  if (!added.includes(name)) added.push(name);
  return name;
}

/** The family a font file's name suggests: the name without its extension, hyphens and underscores as spaces. */
export const familyOfFile = (file: string): string => file.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim();

/** The families the font menu offers: the defaults first, then every other family found, alphabetically. */
export function fontFamilies(): string[] {
  detected ??= COMMON.filter(installed);
  const all = [...new Set([...detected, ...system, ...added])].filter((f) => !TEXT_FONTS.includes(f));
  const p = loadPrefs(), recent = p.recentFonts.filter((f) => all.includes(f) || TEXT_FONTS.includes(f)).slice(0, p.recentFontCount);
  const rest = all.filter((f) => !recent.includes(f)).sort((a, b) => a.localeCompare(b));
  return [...new Set([...recent, ...TEXT_FONTS, ...rest])];
}

/** Whether formvis runs as the desktop app (the Tauri shell's web view). */
const inDesktopApp = (): boolean => '__TAURI_INTERNALS__' in window;

/** Whether the machine's fonts can be listed: in the desktop app through the shell's `system_fonts` command (the web
 *  views there have no Local Font Access), in a browser through Local Font Access. */
export const canListSystemFonts = (): boolean => inDesktopApp() || typeof (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts === 'function';

/** The machine's font families: in the desktop app from the shell, which reads the system's font folders (no permission
 *  asked); in a browser through Local Font Access, which asks the user's permission (so call it from a click). Null
 *  where neither is there or permission is refused. */
export async function loadSystemFonts(): Promise<string[] | null> {
  if (inDesktopApp()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const families = await invoke<string[]>('system_fonts');
      system = [...new Set(families.filter((f) => typeof f === 'string' && f.trim()))];
      return system;
    } catch {
      return null;
    }
  }
  const query = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts;
  if (!query) return null;
  try {
    const fonts = await query() as Array<{ family: string; postscriptName?: string; style?: string }>;
    for (const f of fonts) if (f.postscriptName) postscript.set(f.postscriptName.toLowerCase(), { family: f.family, style: f.style ?? '' });
    system = [...new Set(fonts.map((f) => f.family).filter((f) => typeof f === 'string' && f.trim()))];
    return system;
  } catch {
    return null;
  }
}
