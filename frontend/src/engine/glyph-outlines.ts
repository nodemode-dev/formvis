import type { Font, PathCommand } from 'opentype.js';
import { bundledFace } from './bundled-fonts';
import { applyMat, placement, type Mat } from './geometry';
import { fontFileBytes } from './opentype';
import type { Anchor, SubPath, VectorPath } from './paths';
import { createSurface, ctxOf, type Raster } from './surface';
import { setType, wrapLines } from './text';
import type { TextSpec, Transform } from './types';

/** Glyph outlines (DEV_PLAN 32.7 part b): a type layer's letters as the font draws them, read from the font file with
 *  opentype.js, laid out the way `renderPlain` lays out the pixels, then carried to the document by the layer's own
 *  placement (position, scale, flips, rotation). Where the layout is not one this follows (warped, on a path, vertical,
 *  justified, or a face with no readable file), the caller keeps the outlines traced from the pixels. */

interface Face { font: Font; slanted: boolean }
const faces = new Map<string, Promise<Face | null>>();

/** The parsed face for a family and style, from the shipped files first, else the engine's font file route; null if neither has it. */
export function loadFace(family: string, bold: boolean, italic: boolean): Promise<Face | null> {
  const key = `${family}|${bold ? 1 : 0}|${italic ? 1 : 0}`, have = faces.get(key);
  if (have) return have;
  const job = (async (): Promise<Face | null> => {
    try {
      const shipped = bundledFace(family, bold, italic);
      const buf = shipped ? await (await fetch(shipped.url)).arrayBuffer() : await fontFileBytes(family, bold, italic);
      const ot = await import('opentype.js');
      return { font: ot.parse(buf), slanted: !!shipped?.slanted };
    } catch { return null; }
  })();
  faces.set(key, job);
  void job.then((f) => { if (!f) faces.delete(key); });
  return job;
}

/** The code points a face maps to a glyph, in order, control characters left out; null where the face cannot be read. */
export async function mappedChars(family: string, bold: boolean, italic: boolean): Promise<number[] | null> {
  const face = await loadFace(family, bold, italic), map = face?.font.tables.cmap?.glyphIndexMap;
  if (!map) return null;
  return Object.keys(map).map(Number).filter((cp) => cp >= 0x20 && !(cp >= 0x7f && cp < 0xa0) && !(cp >= 0xd800 && cp < 0xe000)).sort((a, b) => a - b);
}

const SLANT = 0.25;

function plain(t: TextSpec): boolean {
  const one = (v: number | undefined): boolean => v === undefined || v === 100 || v === 1;
  return !t.warp && !t.onPath && !t.features?.length && !t.runs?.length && t.direction !== 'vertical' && !(t.align === 'justify') && (!t.shaping || t.shaping === 'default')
    && !t.weight && !t.angle && !t.caps && !t.underline && !t.strike && !t.baselineShift && !t.variations && one(t.scaleX) && one(t.scaleY)
    && !t.indentFirst && !t.indentLeft && !t.indentRight && !t.spaceBefore && !t.spaceAfter;
}

function subpaths(cmds: readonly PathCommand[], tf: (x: number, y: number) => { x: number; y: number }): SubPath[] {
  const out: SubPath[] = [];
  let cur: Anchor[] | null = null, px = 0, py = 0;
  const corner = (x: number, y: number): Anchor => { const p = tf(x, y); return { x: p.x, y: p.y, inX: p.x, inY: p.y, outX: p.x, outY: p.y }; };
  const flush = (): void => {
    if (cur && cur.length > 1) {
      const first = cur[0], last = cur[cur.length - 1];
      if (Math.hypot(last.x - first.x, last.y - first.y) < 1e-6) { first.inX = last.inX; first.inY = last.inY; cur.pop(); }
      if (cur.length > 1) out.push({ anchors: cur, closed: true });
    }
    cur = null;
  };
  for (const c of cmds) {
    const x = c.x ?? 0, y = c.y ?? 0;
    if (c.type === 'M') { flush(); cur = [corner(x, y)]; }
    else if (c.type === 'L' && cur) cur.push(corner(x, y));
    else if (c.type === 'C' && cur) {
      const o = tf(c.x1 ?? x, c.y1 ?? y), i = tf(c.x2 ?? x, c.y2 ?? y), a = corner(x, y);
      cur[cur.length - 1].outX = o.x; cur[cur.length - 1].outY = o.y;
      a.inX = i.x; a.inY = i.y;
      cur.push(a);
    } else if (c.type === 'Q' && cur) {
      const qx = c.x1 ?? x, qy = c.y1 ?? y, o = tf(px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py)), i = tf(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y)), a = corner(x, y);
      cur[cur.length - 1].outX = o.x; cur[cur.length - 1].outY = o.y;
      a.inX = i.x; a.inY = i.y;
      cur.push(a);
    } else if (c.type === 'Z') flush();
    if (c.type !== 'Z') { px = x; py = y; }
  }
  flush();
  return out;
}

/** The outlines of a type layer's letters in document pixels, or null where they cannot be read from the font. `spec` is
 *  the layer's type with any character style already applied. The result is checked against the layer's own pixels: its
 *  bounds must lie within a few pixels of the drawn letters' bounds, else null. */
export async function glyphOutlines(spec: TextSpec, raster: Raster, transform: Transform): Promise<VectorPath | null> {
  if (!plain(spec) || !spec.content.trim()) return null;
  const face = await loadFace(spec.family, spec.bold, spec.italic);
  if (!face) return null;
  const font = face.font;
  for (const ch of spec.content) if (/\S/.test(ch) && !font.charToGlyphIndex(ch)) return null;
  const probe = ctxOf(createSurface(1, 1));
  setType(probe, spec);
  const pad = Math.ceil(spec.size * 0.1) + 2, box = spec.box && spec.box.w > 0 && spec.box.h > 0 ? spec.box : null;
  const lines = box ? wrapLines(probe, spec, spec.content, Math.max(1, box.w - pad * 2)) : spec.content.split('\n').map((text) => ({ text }));
  const m0 = probe.measureText(lines[0].text || ' '), ascent = m0.fontBoundingBoxAscent || spec.size * 0.8, descent = m0.fontBoundingBoxDescent || spec.size * 0.25;
  const advance = spec.size * spec.lineHeight, width = raster.width;
  const to: Mat = placement(transform, raster.width, raster.height);
  const out: SubPath[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < lines.length; i++) {
    const base = pad + ascent + i * advance, text = lines[i].text;
    if ((box && base + descent > raster.height) || !text.trim()) continue;
    const lw = probe.measureText(text).width, x = spec.align === 'center' ? (width - lw) / 2 : spec.align === 'right' ? width - pad - lw : pad;
    // Each letter sits where the canvas put it: the advance of the text up to it, less its own advance, so kerning and tracking agree.
    const chars = [...text];
    let upTo = '';
    chars.forEach((ch) => {
      upTo += ch;
      const cx = x + probe.measureText(upTo).width - probe.measureText(ch).width;
      const glyph = font.glyphs.get(font.charToGlyphIndex(ch)), path = glyph.getPath(cx, base, spec.size), bb = path.getBoundingBox();
      if (path.commands.length && Number.isFinite(bb.x1)) {
        const slant = (px: number, py: number): { x: number; y: number } => (face.slanted ? { x: px + (base - py) * SLANT, y: py } : { x: px, y: py });
        out.push(...subpaths(path.commands, (px, py) => { const s = slant(px, py); return applyMat(to, s.x, s.y); }));
        const sa = face.slanted ? (base - bb.y1) * SLANT : 0, sb = face.slanted ? (base - bb.y2) * SLANT : 0;
        x0 = Math.min(x0, bb.x1 + Math.min(sa, sb)); x1 = Math.max(x1, bb.x2 + Math.max(sa, sb)); y0 = Math.min(y0, bb.y1); y1 = Math.max(y1, bb.y2);
      }
    });
  }
  if (!out.length) return null;
  const d = raster.ctx.getImageData(0, 0, raster.width, raster.height).data;
  let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity;
  for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
    if (d[(y * raster.width + x) * 4 + 3] < 128) continue;
    if (x < ax0) ax0 = x; if (x + 1 > ax1) ax1 = x + 1; if (y < ay0) ay0 = y; if (y + 1 > ay1) ay1 = y + 1;
  }
  const tol = Math.max(2.5, spec.size * 0.05);
  if (!Number.isFinite(ax0) || Math.abs(x0 - ax0) > tol || Math.abs(x1 - ax1) > tol || Math.abs(y0 - ay0) > tol || Math.abs(y1 - ay1) > tol) return null;
  return { subpaths: out };
}
