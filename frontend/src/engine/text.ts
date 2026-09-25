import { Raster, createSurface, ctxOf } from './surface';
import { clamp, type Layer, type TextSpec } from './types';

/** Type layers: text set in a font, drawn into a layer's pixels and kept editable while those pixels are untouched. */

export const TEXT_FONTS = ['Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact', 'serif', 'sans-serif', 'monospace'];
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);

export function defaultText(): TextSpec {
  return { content: '', family: 'Inter', size: 48, color: { r: 0, g: 0, b: 0 }, align: 'left', bold: false, italic: false, lineHeight: 1.2, tracking: 0, kerning: 'metrics' };
}

/** Tracking in pixels at the spec's size: Photoshop's thousandths of an em. */
export const trackingPx = (t: TextSpec): number => (t.tracking / 1000) * t.size;

/** Whether this browser's canvas spaces letters itself (letterSpacing); where not, text with tracking is set character by
 *  character. */
const CANVAS_TRACKING = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

/** Sets a context's font, kerning and, where the canvas can, tracking, as `renderText` draws with them. */
function setType(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TextSpec): void {
  c.font = fontCss(t);
  const k = c as unknown as { fontKerning?: string; letterSpacing?: string };
  if ('fontKerning' in c) k.fontKerning = t.kerning === 'none' ? 'none' : 'normal';
  if (CANVAS_TRACKING) k.letterSpacing = `${trackingPx(t)}px`;
}

/** A line's advance with the spec's tracking: the canvas's own measure where it spaces letters, else each character's
 *  advance plus the tracking after it (kerning between characters is then lost, as each is set alone). */
function lineWidth(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TextSpec, line: string): number {
  if (CANVAS_TRACKING || !t.tracking) return c.measureText(line).width;
  return [...line].reduce((w, ch) => w + c.measureText(ch).width + trackingPx(t), 0);
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

/** The padding and font ascent and descent `renderText` uses, for placing things on its first baseline. */
export function textMetrics(t: TextSpec): { pad: number; ascent: number; descent: number } {
  const probe = ctxOf(createSurface(1, 1));
  probe.font = fontCss(t);
  const m = probe.measureText('Ag');
  return { pad: Math.ceil(t.size * 0.1) + 2, ascent: m.fontBoundingBoxAscent || t.size * 0.8, descent: m.fontBoundingBoxDescent || t.size * 0.25 };
}

export interface TextRender { raster: Raster; baseline: number; pad: number }

/** The text drawn into a fresh raster: one line per line break, each measured, with line boxes from the font's ascent
 *  and descent so every line sits the same distance apart, padding for overhangs such as italics, and `baseline`, the
 *  first baseline's distance from the top. */
export function renderText(t: TextSpec): TextRender {
  const lines = t.content.split('\n');
  const probe = ctxOf(createSurface(1, 1));
  setType(probe, t);
  const metrics = lines.map((line) => probe.measureText(line || ' '));
  const widths = lines.map((line) => lineWidth(probe, t, line || ' '));
  const ascent = metrics[0].fontBoundingBoxAscent || t.size * 0.8, descent = metrics[0].fontBoundingBoxDescent || t.size * 0.25;
  const advance = t.size * t.lineHeight, pad = Math.ceil(t.size * 0.1) + 2;
  const widest = Math.max(1, ...metrics.map((m, i) => Math.max(widths[i], (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0))));
  const width = Math.ceil(widest) + pad * 2, height = Math.ceil(ascent + descent + advance * (lines.length - 1)) + pad * 2;
  const raster = new Raster(width, height), c = raster.ctx;
  setType(c, t);
  c.fillStyle = `rgb(${t.color.r},${t.color.g},${t.color.b})`;
  c.textBaseline = 'alphabetic';
  const perChar = !CANVAS_TRACKING && t.tracking !== 0;
  c.textAlign = perChar ? 'left' : t.align;
  lines.forEach((line, i) => {
    const y = pad + ascent + i * advance;
    if (!perChar) { c.fillText(line, t.align === 'center' ? width / 2 : t.align === 'right' ? width - pad : pad, y); return; }
    let x = t.align === 'center' ? (width - widths[i]) / 2 : t.align === 'right' ? width - pad - widths[i] : pad;
    for (const ch of line) { c.fillText(ch, x, y); x += c.measureText(ch).width + trackingPx(t); }
  });
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
    lineHeight: num(o.lineHeight, d.lineHeight, 0.5, 4), tracking: Math.round(num(o.tracking, 0, -1000, 10000)), kerning: o.kerning === 'none' ? 'none' : 'metrics',
    rendered: textKey(raster),
  };
}
