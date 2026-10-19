import { BUNDLED_FAMILIES, FONT_CATEGORIES, TEXT_FONTS, ensureBundledFont, isLazyFont, noteFamilies, notePostscript, resolveFace } from '../engine';
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
  const box = px && isLazyFont(family) ? o.closest('select') : null;
  if (box && !armed.has(box)) { armed.add(box); for (const ev of ['pointerenter', 'focus', 'pointerdown']) box.addEventListener(ev, warmFonts, { once: true }); }
}

const armed = new WeakSet<HTMLSelectElement>();

/** Joins the bundled families to the font set and loads their regular faces. Nothing calls it at start: a font menu does when
 *  the pointer or focus reaches it, so its entries show in their own faces and no file is fetched before then. */
export function warmFonts(): void { for (const b of BUNDLED_FAMILIES) void ensureBundledFont(b.family); }

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

/** A font name as typed or read from a file, matched to a family: a listed family in its own spelling, else a PostScript
 *  name (Local Font Access, the engine's user fonts, the bundled families) or a name such as Family-BoldItalic, through the
 *  one lookup that opening PSD type uses. Null when nothing matches. */
export function resolveFontName(name: string): { family: string; bold: boolean; italic: boolean } | null {
  const raw = name.trim(), key = raw.toLowerCase();
  if (!raw) return null;
  const all = fontFamilies(), listed = all.find((f) => f.toLowerCase() === key);
  return listed ? { family: listed, bold: false, italic: false } : resolveFace(raw, all);
}

const userUrls = new Set<string>();
interface UserFont { family: string; style: string; postscript: string; bold: boolean; italic: boolean; url: string }

/** Fonts in the engine's data folder (its fonts subfolder): listed by the engine, joined to the font set from the engine's
 *  font route so the browser build can set type in them (a face loads when text first uses it), and noted with their
 *  PostScript names. The families are returned; null where there is no engine. */
export async function loadUserFonts(): Promise<string[] | null> {
  try {
    const res = await fetch('/api/fonts/user');
    if (!res.ok) return null;
    const list = ((await res.json()) as { fonts?: UserFont[] }).fonts ?? [];
    for (const f of list) {
      if (!f.family || !f.url || userUrls.has(f.url)) continue;
      userUrls.add(f.url);
      document.fonts.add(new FontFace(f.family, `url("${f.url}")`, { weight: f.bold ? '700' : '400', style: f.italic ? 'italic' : 'normal' }));
      if (!added.includes(f.family)) added.push(f.family);
    }
    notePostscript(list);
    return list.map((f) => f.family);
  } catch {
    return null;
  }
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
  const out = [...new Set([...recent, ...TEXT_FONTS, ...rest])];
  noteFamilies(out);
  return out;
}

export interface FontGroup { label: string; families: string[] }

/** The font menu in sections: the recent families, the bundled ones under their category headings, then the common faces and
 *  the machine's other families. A recent family shows again in its own section, so the categories stay whole. */
export function fontGroups(): FontGroup[] {
  const flat = fontFamilies(), bundled = new Set(BUNDLED_FAMILIES.map((b) => b.family)), p = loadPrefs();
  const recent = p.recentFonts.filter((f) => flat.includes(f)).slice(0, p.recentFontCount), rest = flat.filter((f) => !bundled.has(f) && !TEXT_FONTS.includes(f)).sort((a, b) => a.localeCompare(b));
  const out: FontGroup[] = recent.length ? [{ label: 'Recent', families: recent }] : [];
  for (const c of FONT_CATEGORIES) out.push({ label: c, families: BUNDLED_FAMILIES.filter((b) => b.category === c).map((b) => b.family) });
  out.push({ label: 'Common', families: TEXT_FONTS.filter((f) => !bundled.has(f)) });
  if (rest.length) out.push({ label: 'System', families: rest });
  return out;
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
      const families = await invoke<string[]>(loadPrefs().fontNamesEnglish ? 'system_fonts_english' : 'system_fonts');
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
    notePostscript(fonts.map((f) => ({ postscript: f.postscriptName ?? '', family: f.family, style: f.style })));
    system = [...new Set(fonts.map((f) => f.family).filter((f) => typeof f === 'string' && f.trim()))];
    return system;
  } catch {
    return null;
  }
}
