import { Raster, createSurface, ctxOf } from './surface';
import { cleanFeatures, ensureVariant, variantFamily } from './opentype';
import { clamp, type CharacterStyle, type ID, type Layer, type ParagraphStyle, type Pt, type TextPath, type TextSpec, type TextWarp, type WarpStyle } from './types';

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
  const variant = GENERIC.has(t.family) ? null : variantFamily(t.family, t.bold, t.italic, t.features);
  const family = variant ? `"${variant}", "${t.family.replace(/["\\]/g, '')}", sans-serif` : GENERIC.has(t.family) ? t.family : `"${t.family.replace(/["\\]/g, '')}", sans-serif`;
  return `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${t.size}px ${family}`;
}

/** Waits for the spec's font to load where the browser can, so the first rendering uses it. */
export async function loadTextFont(t: TextSpec): Promise<void> {
  if (t.features?.length && !GENERIC.has(t.family)) await ensureVariant(t.family, t.bold, t.italic, t.features);
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
export function renderPlain(t: TextSpec): TextRender {
  if (t.direction === 'vertical') return renderVertical(t);
  const probe = ctxOf(createSurface(1, 1));
  setType(probe, t);
  const pad = Math.ceil(t.size * 0.1) + 2, box = t.box && t.box.w > 0 && t.box.h > 0 ? t.box : null;
  // Paragraph text wraps to its box (a word longer than the line breaks by characters); point text breaks only at
  // line breaks. `last` marks a paragraph's last line, which Justify leaves as it is.
  const lines: Array<{ text: string; last: boolean }> = box ? wrapLines(probe, t, t.content, Math.max(1, box.w - pad * 2)) : t.content.split('\n').map((text) => ({ text, last: true }));
  const metrics = lines.map((line) => probe.measureText(line.text || ' '));
  const widths = lines.map((line) => lineWidth(probe, t, line.text || ' '));
  const ascent = metrics[0].fontBoundingBoxAscent || t.size * 0.8, descent = metrics[0].fontBoundingBoxDescent || t.size * 0.25;
  const advance = t.size * t.lineHeight;
  const widest = Math.max(1, ...metrics.map((m, i) => Math.max(widths[i], (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0))));
  const width = box ? Math.max(1, Math.round(box.w)) : Math.ceil(widest) + pad * 2;
  const height = box ? Math.max(1, Math.round(box.h)) : Math.ceil(ascent + descent + advance * (lines.length - 1)) + pad * 2;
  const raster = new Raster(width, height), c = raster.ctx;
  setType(c, t);
  c.fillStyle = `rgb(${t.color.r},${t.color.g},${t.color.b})`;
  c.textBaseline = 'alphabetic';
  const perChar = !CANVAS_TRACKING && t.tracking !== 0;
  const run = (text: string, x: number, y: number): void => {   // a run of text from x, tracked as it will measure
    if (!perChar) { c.fillText(text, x, y); return; }
    for (const ch of text) { c.fillText(ch, x, y); x += c.measureText(ch).width + trackingPx(t); }
  };
  c.textAlign = 'left';
  lines.forEach((line, i) => {
    const y = pad + ascent + i * advance;
    if (box && y + descent > height) return;                       // past the box: clipped, as Photoshop's
    const inner = width - pad * 2;
    const words = line.text.split(' ');
    if (t.align === 'justify' && box && !line.last && words.length > 1) {
      const ws = words.map((w) => lineWidth(c, t, w)), gap = (inner - ws.reduce((a, b) => a + b, 0)) / (words.length - 1);
      let x = pad;
      words.forEach((w, k) => { run(w, x, y); x += ws[k] + gap; });
      return;
    }
    const lw = widths[i], x = t.align === 'center' ? (width - lw) / 2 : t.align === 'right' ? width - pad - lw : pad;
    run(line.text, x, y);
  });
  raster.touch();
  return { raster, baseline: pad + ascent, pad };
}

/** Words to lines no wider than `max`, each paragraph (a line break) on its own, its last line marked. */
function wrapLines(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TextSpec, content: string, max: number): Array<{ text: string; last: boolean }> {
  const out: Array<{ text: string; last: boolean }> = [];
  for (const para of content.split('\n')) {
    let cur = '';
    for (let w of para.split(' ')) {
      const trial = cur ? `${cur} ${w}` : w;
      if (lineWidth(c, t, trial) <= max) { cur = trial; continue; }
      if (cur) { out.push({ text: cur, last: false }); cur = ''; }
      while (w.length > 1 && lineWidth(c, t, w) > max) {
        let k = w.length - 1;
        while (k > 1 && lineWidth(c, t, w.slice(0, k)) > max) k -= 1;
        out.push({ text: w.slice(0, k), last: false });
        w = w.slice(k);
      }
      cur = w;
    }
    out.push({ text: cur, last: true });
  }
  return out;
}

/** Vertical type: each line a column, from right to left, its characters upright and stacked top to bottom, one em
 *  apart plus the tracking; columns Leading apart. `baseline` is the top padding plus the ascent, as for point text. */
function renderVertical(t: TextSpec): TextRender {
  const cols = t.content.split('\n').map((l) => [...l]);
  const probe = ctxOf(createSurface(1, 1));
  setType(probe, t);
  const m = probe.measureText('Ag'), ascent = m.fontBoundingBoxAscent || t.size * 0.8;
  const pad = Math.ceil(t.size * 0.1) + 2, step = t.size + trackingPx(t), colW = t.size * t.lineHeight;
  const rows = Math.max(1, ...cols.map((c) => c.length));
  const width = Math.ceil(colW * cols.length) + pad * 2, height = Math.ceil(step * rows) + pad * 2;
  const raster = new Raster(width, height), c = raster.ctx;
  setType(c, t);
  if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = '0px';
  c.fillStyle = `rgb(${t.color.r},${t.color.g},${t.color.b})`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  cols.forEach((col, i) => {
    const x = width - pad - colW * (i + 0.5);
    col.forEach((ch, j) => c.fillText(ch, x, pad + j * step));
  });
  raster.touch();
  return { raster, baseline: pad + ascent, pad };
}

/** Warp Text's styles, in Photoshop's order, with their names. */
export const WARP_STYLES: ReadonlyArray<readonly [WarpStyle, string]> = [['arc', 'Arc'], ['arcLower', 'Arc Lower'], ['arcUpper', 'Arc Upper'], ['arch', 'Arch'],
  ['bulge', 'Bulge'], ['shellLower', 'Shell Lower'], ['shellUpper', 'Shell Upper'], ['flag', 'Flag'], ['wave', 'Wave'], ['fish', 'Fish'], ['rise', 'Rise'],
  ['fisheye', 'Fisheye'], ['inflate', 'Inflate'], ['squeeze', 'Squeeze'], ['twist', 'Twist']];

const warpActive = (w: TextWarp | null | undefined): w is TextWarp => !!w && (w.bend !== 0 || w.horizontal !== 0 || w.vertical !== 0);

/** Where a point of the text's box goes, in coordinates from -1 to 1 across and down it. The shapes are this build's
 *  own formulas for each of Photoshop's styles (the arc and shell bends, flag and wave ripples, fisheye, inflate and
 *  squeeze swells, twist); Horizontal and Vertical Distortion then taper the box like a perspective. */
function warpPoint(w: TextWarp, u0: number, v0: number): [number, number] {
  const vert = w.orientation === 'vertical', u = vert ? v0 : u0, v = vert ? u0 : v0, b = w.bend / 100;
  let x = u, y = v;
  const curve = 1 - u * u, r = Math.hypot(u, v);
  switch (w.style) {
    case 'arc': y = v - b * curve * 0.6; x = u * (1 + b * v * 0.3); break;
    case 'arcLower': y = v - b * curve * 0.6 * ((v + 1) / 2); break;
    case 'arcUpper': y = v - b * curve * 0.6 * ((1 - v) / 2); break;
    case 'arch': y = v - b * curve * 0.6; break;
    case 'bulge': y = v * (1 + b * curve * 0.6); break;
    case 'shellLower': y = v + b * u * u * 0.6 * ((v + 1) / 2); break;
    case 'shellUpper': y = v - b * u * u * 0.6 * ((1 - v) / 2); break;
    case 'flag': y = v + b * 0.3 * Math.sin(u * Math.PI); break;
    case 'wave': y = v + b * 0.25 * Math.sin(u * Math.PI + v * Math.PI * 0.5); break;
    case 'fish': y = v * (1 + b * 0.6 * Math.cos((u * Math.PI) / 2)); x = u + b * 0.15 * v * v; break;
    case 'rise': y = v - b * u * 0.5; break;
    case 'fisheye': { const k = 1 + b * 0.5 * Math.max(0, 1 - r); x = u * k; y = v * k; break; }
    case 'inflate': x = u * (1 + b * 0.4 * (1 - v * v)); y = v * (1 + b * 0.4 * curve); break;
    case 'squeeze': x = u * (1 - b * 0.3 * (1 - v * v)); y = v * (1 + b * 0.4 * curve); break;
    case 'twist': { const a = b * (Math.PI / 2) * Math.max(0, 1 - r), c = Math.cos(a), s = Math.sin(a); x = u * c - v * s; y = u * s + v * c; break; }
  }
  y *= 1 + (w.horizontal / 100) * 0.5 * x;
  x *= 1 + (w.vertical / 100) * 0.5 * y;
  return vert ? [y, x] : [x, y];
}

/** Draws the source triangle (s0, s1, s2) of `img` onto (d0, d1, d2) of `c`: the affine map between them, clipped to
 *  the destination triangle grown by half a pixel so neighbouring cells meet without a seam. */
function triangle(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, img: CanvasImageSource, s: number[][], d: number[][]): void {
  const [[x0, y0], [x1, y1], [x2, y2]] = s, [[u0, v0], [u1, v1], [u2, v2]] = d;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 1e-9) return;
  const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det, cc = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det;
  const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det, dd = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
  const e = u0 - a * x0 - cc * y0, f = v0 - b * x0 - dd * y0;
  const mx = (u0 + u1 + u2) / 3, my = (v0 + v1 + v2) / 3, grow = (px: number, py: number): [number, number] => {
    const dx = px - mx, dy = py - my, l = Math.hypot(dx, dy) || 1; return [px + (dx / l) * 0.5, py + (dy / l) * 0.5];
  };
  c.save();
  c.beginPath();
  const g = [grow(u0, v0), grow(u1, v1), grow(u2, v2)];
  c.moveTo(g[0][0], g[0][1]); c.lineTo(g[1][0], g[1][1]); c.lineTo(g[2][0], g[2][1]); c.closePath();
  c.clip();
  c.setTransform(a, b, cc, dd, e, f);
  c.drawImage(img, 0, 0);
  c.restore();
}

/** A rendered text warped: its raster drawn through a 32 by 16 mesh, each cell as two triangles to the warped places of
 *  its corners, onto a raster sized to the warped bounds; the baseline and pad move by where the original's origin
 *  lands, so the layer is placed as before. */
function warpRender(r: TextRender, w: TextWarp): TextRender {
  const W = r.raster.width, H = r.raster.height, NX = 32, NY = 16, pts: number[][][] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = 0; j <= NY; j++) {
    const row: number[][] = [];
    for (let i = 0; i <= NX; i++) {
      const [u, v] = warpPoint(w, (i / NX) * 2 - 1, (j / NY) * 2 - 1), px = ((u + 1) / 2) * W, py = ((v + 1) / 2) * H;
      row.push([px, py]);
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
    }
    pts.push(row);
  }
  const ox = Math.ceil(-x0) + 2, oy = Math.ceil(-y0) + 2, out = new Raster(Math.max(1, Math.ceil(x1 - x0) + 4), Math.max(1, Math.ceil(y1 - y0) + 4)), c = out.ctx;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const s = (a: number, b2: number): number[] => [((i + a) / NX) * W, ((j + b2) / NY) * H], d = (a: number, b2: number): number[] => [pts[j + b2][i + a][0] + ox, pts[j + b2][i + a][1] + oy];
    triangle(c, r.raster.canvas, [s(0, 0), s(1, 0), s(1, 1)], [d(0, 0), d(1, 0), d(1, 1)]);
    triangle(c, r.raster.canvas, [s(0, 0), s(1, 1), s(0, 1)], [d(0, 0), d(1, 1), d(0, 1)]);
  }
  out.touch();
  return { raster: out, baseline: r.baseline + oy, pad: r.pad + ox };
}

/** Type on a path: one line (line breaks read as spaces) set character by character along the path's polyline, each at
 *  the point its centre falls on, turned to the path's direction there, sitting on it, from Start Offset; characters
 *  that would run past the path's end are not drawn, as in Photoshop. Set one by one, pairs are not kerned. */
function renderPathText(t: TextSpec, tp: TextPath): TextRender {
  const raster = new Raster(Math.max(1, Math.round(tp.frame.w)), Math.max(1, Math.round(tp.frame.h))), c = raster.ctx, pts = tp.points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1];
  if (pts.length < 2 || total <= 0) { raster.touch(); return { raster, baseline: 0, pad: 0 }; }
  const at = (d: number): { x: number; y: number; a: number } => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1, f = Math.max(0, Math.min(1, (d - cum[i - 1]) / seg)), p = pts[i - 1], q = pts[i];
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, a: Math.atan2(q.y - p.y, q.x - p.x) };
  };
  setType(c, t);
  c.fillStyle = `rgb(${t.color.r},${t.color.g},${t.color.b})`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'center';
  let d = (Math.max(0, Math.min(100, tp.offset)) / 100) * total;
  for (const ch of t.content.replace(/\r?\n/g, ' ')) {
    const w = c.measureText(ch).width + (CANVAS_TRACKING ? 0 : trackingPx(t));
    if (d + w > total + 0.5) break;
    const p = at(d + w / 2);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.a);
    c.fillText(ch, 0, 0);
    c.restore();
    d += w;
  }
  raster.touch();
  return { raster, baseline: 0, pad: 0 };
}

/** The type as it is drawn: along its path, or plain, then warped when the spec has an active Warp Text. */
export function renderText(t: TextSpec): TextRender {
  if (t.onPath) return renderPathText(t, t.onPath);
  const plain = renderPlain(t);
  return antialiased(warpActive(t.warp) ? warpRender(plain, t.warp) : plain, t.antialias);
}

/** The anti-aliasing method on the rendered edges: None thresholds them at half; Sharp steepens them. */
function antialiased(r: TextRender, how: TextSpec['antialias']): TextRender {
  if (!how || how === 'smooth') return r;
  const c = r.raster.ctx, img = c.getImageData(0, 0, r.raster.width, r.raster.height), d = img.data;
  for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a === 0 || a === 255) continue; d[i] = how === 'none' ? (a >= 128 ? 255 : 0) : Math.max(0, Math.min(255, Math.round((a - 128) * 2 + 128))); }
  c.putImageData(img, 0, 0);
  r.raster.touch();
  return r;
}

/** A type spec's settings as a paragraph style named `name`. */
export function styleOf(t: TextSpec, id: ID, name: string): ParagraphStyle {
  return { id, name, family: t.family, size: t.size, color: { ...t.color }, align: t.align, bold: t.bold, italic: t.italic, lineHeight: t.lineHeight, tracking: t.tracking, kerning: t.kerning };
}

/** A spec taking a paragraph style's settings, keeping its own text, warp and path, and linked to the style. */
export function withStyle(t: TextSpec, s: ParagraphStyle): TextSpec {
  return { ...t, family: s.family, size: s.size, color: { ...s.color }, align: s.align, bold: s.bold, italic: s.italic, lineHeight: s.lineHeight, tracking: s.tracking, kerning: s.kerning, style: s.id, rendered: undefined };
}

/** A spec's character style, if any, applied: the style's set fields over the spec's own (the effective spec to render). */
export function withCharStyle(t: TextSpec, s: CharacterStyle | undefined): TextSpec {
  if (!s) return t;
  return {
    ...t,
    ...(s.family !== undefined ? { family: s.family } : {}), ...(s.size !== undefined ? { size: s.size } : {}),
    ...(s.color !== undefined ? { color: { ...s.color } } : {}), ...(s.bold !== undefined ? { bold: s.bold } : {}),
    ...(s.italic !== undefined ? { italic: s.italic } : {}), ...(s.tracking !== undefined ? { tracking: s.tracking } : {}),
    ...(s.features !== undefined ? { features: [...s.features] } : {}),
  };
}

/** A character style from a type spec: its family, size, colour, weight, slant, tracking and features, all set. */
export function charStyleOf(t: TextSpec, id: ID, name: string): CharacterStyle {
  return { id, name, family: t.family, size: t.size, color: { ...t.color }, bold: t.bold, italic: t.italic, tracking: t.tracking, features: cleanFeatures(t.features) };
}

/** A document's saved character styles read back: an id and a name are needed; each field is kept only when it is valid. */
export function characterStylesFrom(raw: unknown): CharacterStyle[] {
  if (!Array.isArray(raw)) return [];
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  return raw.flatMap((r): CharacterStyle[] => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id || typeof o.name !== 'string') return [];
    const c = o.color && typeof o.color === 'object' ? (o.color as Record<string, unknown>) : null;
    return [{
      id: o.id, name: o.name.slice(0, 80) || 'Character Style',
      ...(typeof o.family === 'string' && o.family.trim() ? { family: o.family.slice(0, 80) } : {}),
      ...(fin(o.size) ? { size: clamp(o.size, 1, 2000) } : {}),
      ...(c ? { color: { r: Math.round(clamp(fin(c.r) ? c.r : 0, 0, 255)), g: Math.round(clamp(fin(c.g) ? c.g : 0, 0, 255)), b: Math.round(clamp(fin(c.b) ? c.b : 0, 0, 255)) } } : {}),
      ...(typeof o.bold === 'boolean' ? { bold: o.bold } : {}), ...(typeof o.italic === 'boolean' ? { italic: o.italic } : {}),
      ...(fin(o.tracking) ? { tracking: Math.round(clamp(o.tracking, -1000, 10000)) } : {}),
      ...(Array.isArray(o.features) ? { features: cleanFeatures(o.features) } : {}),
    }];
  });
}

/** A document's saved paragraph styles read back: each needs an id and a name; its settings are read as type is. */
export function paragraphStylesFrom(raw: unknown): ParagraphStyle[] {
  if (!Array.isArray(raw)) return [];
  const probe = new Raster(1, 1);
  return raw.flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id || typeof o.name !== 'string') return [];
    const t = textFromData({ ...o, content: 'x' }, probe);
    return t ? [styleOf(t, o.id, o.name.slice(0, 80) || 'Paragraph Style')] : [];
  });
}

/** A saved type path read back: at least two finite points, a finite frame, the offset clamped; anything else is none. */
function pathFrom(raw: unknown): TextPath | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const pts = Array.isArray(o.points) ? o.points.filter((q): q is Pt => !!q && fin((q as Pt).x) && fin((q as Pt).y)).map((q) => ({ x: q.x, y: q.y })) : [];
  const f = o.frame as { w?: unknown; h?: unknown } | undefined;
  if (pts.length < 2 || !f || !fin(f.w) || !fin(f.h) || f.w < 1 || f.h < 1) return null;
  return { points: pts, offset: fin(o.offset) ? Math.max(0, Math.min(100, o.offset)) : 0, frame: { w: f.w, h: f.h } };
}

/** A saved Warp Text read back: the style checked against the list, the values clamped; anything else is no warp. */
function warpFrom(raw: unknown): TextWarp | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, style = WARP_STYLES.find(([id]) => id === o.style)?.[0];
  if (!style) return null;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-100, Math.min(100, Math.round(v))) : 0);
  return { style, orientation: o.orientation === 'vertical' ? 'vertical' : 'horizontal', bend: n(o.bend), horizontal: n(o.horizontal), vertical: n(o.vertical) };
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
    align: o.align === 'center' || o.align === 'right' || o.align === 'justify' ? o.align : 'left', bold: o.bold === true, italic: o.italic === true,
    ...(o.box && typeof o.box === 'object' ? (() => { const b = o.box as Record<string, unknown>; const w = num(b.w, 0, 0, 30000), h = num(b.h, 0, 0, 30000); return w >= 1 && h >= 1 ? { box: { w, h } } : {}; })() : {}),
    ...(o.direction === 'vertical' ? { direction: 'vertical' as const } : {}),
    ...(o.antialias === 'none' || o.antialias === 'sharp' ? { antialias: o.antialias } : {}),
    ...(cleanFeatures(o.features).length ? { features: cleanFeatures(o.features) } : {}),
    lineHeight: num(o.lineHeight, d.lineHeight, 0.5, 4), tracking: Math.round(num(o.tracking, 0, -1000, 10000)), kerning: o.kerning === 'none' ? 'none' : 'metrics',
    warp: warpFrom(o.warp), onPath: pathFrom(o.onPath), style: typeof o.style === 'string' && o.style ? o.style : null,
    ...(typeof o.charStyle === 'string' && o.charStyle ? { charStyle: o.charStyle } : {}),
    rendered: textKey(raster),
  };
}
