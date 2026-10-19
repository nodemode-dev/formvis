// Default type styles: the Type settings and styles a person saved as their defaults (Type > Save Default Type Styles),
// kept on this computer, and the Basic Paragraph style every document starts with.
import { Raster } from './surface';
import { characterStylesFrom, defaultText, paragraphStylesFrom, styleOf, textFromData } from './text';
import type { CharacterStyle, ParagraphStyle, TextSpec } from './types';

const KEY = 'formvis.defaultTypeStyles';

export const BASIC_PARAGRAPH = 'basic-paragraph';

/** The Basic Paragraph style: the factory type settings. A document that redefines it keeps its own copy. */
export const basicParagraph = (): ParagraphStyle => styleOf(defaultText(), BASIC_PARAGRAPH, 'Basic Paragraph');

/** The attributes Reset Character and Reset Paragraph take away. */
export const CHARACTER_RESET = ['weight', 'caps', 'scaleX', 'scaleY', 'baselineShift', 'underline', 'strike', 'variations'] as const;
export const PARAGRAPH_RESET = ['indentFirst', 'indentLeft', 'indentRight', 'spaceBefore', 'spaceAfter', 'lastLine'] as const;

export interface TypeDefaults { settings: TextSpec | null; paragraphStyles: ParagraphStyle[]; characterStyles: CharacterStyle[] }

/** Keeps the settings and styles as the defaults; false where the browser will not store them. */
export function saveTypeDefaults(d: { settings: TextSpec; paragraphStyles: readonly ParagraphStyle[]; characterStyles: readonly CharacterStyle[] }): boolean {
  try {
    const { content: _c, rendered: _r, ...settings } = d.settings;
    localStorage.setItem(KEY, JSON.stringify({ settings, paragraphStyles: d.paragraphStyles, characterStyles: d.characterStyles }));
    return true;
  } catch { return false; }
}

/** The saved defaults, each part checked as a document's own are; null where nothing was saved. */
export function readTypeDefaults(): TypeDefaults | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const s = o.settings && typeof o.settings === 'object' ? textFromData({ ...(o.settings as object), content: 'x' }, new Raster(1, 1)) : null;
    return { settings: s ? { ...s, content: '', rendered: undefined } : null, paragraphStyles: paragraphStylesFrom(o.paragraphStyles), characterStyles: characterStylesFrom(o.characterStyles) };
  } catch { return null; }
}
