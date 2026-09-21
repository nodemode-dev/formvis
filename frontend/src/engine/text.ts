import { Raster, createSurface, ctxOf } from './surface';
import { clamp, type Layer, type TextSpec } from './types';

/** Type layers: text set in a font, drawn into a layer's pixels and kept editable while those pixels are untouched. */

export const TEXT_FONTS = ['Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact', 'serif', 'sans-serif', 'monospace'];
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);

export function defaultText(): TextSpec {
  return { content: '', family: 'Inter', size: 48, color: { r: 0, g: 0, b: 0 }, align: 'left', bold: false, italic: false, lineHeight: 1.2 };
}

/** The CSS font for a spec, with a sans-serif fallback for named families. */
export function fontCss(t: TextSpec): string {
  const family = GENERIC.has(t.family) ? t.family : `"${t.family.replace(/["\\]/g, '')}", sans-serif`;
  return `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${t.size}px ${family}`;
}

/** Waits for the spec's font to load where the browser can, so the first rendering uses it. */
export async function loadTextFont(t: TextSpec): Promise<void> {
  try { await document.fonts?.load(fontCss(t), t.content || 'Ag'); } catch { /* the canvas falls back to what it has */ }
}

/** The identity of a raster's current pixels. */
export const textKey = (r: Raster): string => `${r.id}:${r.version}`;

/** True while a layer's pixels are still the rendering of its text. */
export function liveText(l: Layer | null | undefined): boolean {
  return !!l?.text && !!l.raster && l.text.rendered === textKey(l.raster);
}

export interface TextRender { raster: Raster; baseline: number; pad: number }

/** The text drawn into a fresh raster: one line per line break, each measured, with line boxes from the font's ascent
 *  and descent so every line sits the same distance apart, padding for overhangs such as italics, and `baseline`, the
 *  first baseline's distance from the top. */
export function renderText(t: TextSpec): TextRender {
  const font = fontCss(t), lines = t.content.split('\n');
  const probe = ctxOf(createSurface(1, 1));
  probe.font = font;
  const metrics = lines.map((line) => probe.measureText(line || ' '));
  const ascent = metrics[0].fontBoundingBoxAscent || t.size * 0.8, descent = metrics[0].fontBoundingBoxDescent || t.size * 0.25;
  const advance = t.size * t.lineHeight, pad = Math.ceil(t.size * 0.1) + 2;
  const widest = Math.max(1, ...metrics.map((m) => Math.max(m.width, (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0))));
  const width = Math.ceil(widest) + pad * 2, height = Math.ceil(ascent + descent + advance * (lines.length - 1)) + pad * 2;
  const raster = new Raster(width, height), c = raster.ctx;
  c.font = font;
  c.fillStyle = `rgb(${t.color.r},${t.color.g},${t.color.b})`;
  c.textBaseline = 'alphabetic';
  c.textAlign = t.align;
  const x = t.align === 'center' ? width / 2 : t.align === 'right' ? width - pad : pad;
  lines.forEach((line, i) => c.fillText(line, x, pad + ascent + i * advance));
  raster.touch();
  return { raster, baseline: pad + ascent, pad };
}

/** A spec read back from saved data, checked and clamped, paired with the raster it was saved with; null if unusable. */
export function textFromData(raw: unknown, raster: Raster | null): TextSpec | null {
  if (!raster || !raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, d = defaultText();
  if (typeof o.content !== 'string' || !o.content.trim()) return null;
  const num = (v: unknown, fallback: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);
  const c = o.color && typeof o.color === 'object' ? (o.color as Record<string, unknown>) : {};
  return {
    content: o.content.slice(0, 20000), family: typeof o.family === 'string' && o.family.trim() ? o.family.slice(0, 80) : d.family,
    size: num(o.size, d.size, 1, 2000), color: { r: Math.round(num(c.r, 0, 0, 255)), g: Math.round(num(c.g, 0, 0, 255)), b: Math.round(num(c.b, 0, 0, 255)) },
    align: o.align === 'center' || o.align === 'right' ? o.align : 'left', bold: o.bold === true, italic: o.italic === true,
    lineHeight: num(o.lineHeight, d.lineHeight, 0.5, 4), rendered: textKey(raster),
  };
}
