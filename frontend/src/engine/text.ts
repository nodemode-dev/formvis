import { Raster, createSurface, ctxOf } from './surface';
import { RUN_KEYS, cleanFeatures, cleanRuns, ensureVariant, runsStyled, styleSegments, variantFamily, type RunPatch } from './opentype';
import { SMALL_CAP_SCALE, opticalKern, smallCapPieces } from './text-attrs';
import { BUNDLED_FAMILIES, ensureBundledFont } from './bundled-fonts';
import { clamp, type CharacterStyle, type ID, type Layer, type ParaAttrs, type ParagraphStyle, type Pt, type RunAttrs, type TextExtras, type TextPath, type TextSpec, type TextWarp, type WarpStyle } from './types';

/** Type layers: text set in a font, drawn into a layer's pixels and kept editable while those pixels are untouched. */

export const TEXT_FONTS = [...BUNDLED_FAMILIES.map((b) => b.family), 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact', 'serif', 'sans-serif', 'monospace'];
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);

export function defaultText(): TextSpec {
  return { content: '', family: 'Inter', size: 48, color: { r: 0, g: 0, b: 0 }, align: 'left', bold: false, italic: false, lineHeight: 1.2, tracking: 0, kerning: 'metrics' };
}

/** Tracking in pixels at the spec's size: tracking is in thousandths of an em. */
export const trackingPx = (t: TextSpec): number => (t.tracking / 1000) * t.size;

/** Whether this browser's canvas spaces letters itself (letterSpacing); where not, text with tracking is set character by
 *  character. */
const CANVAS_TRACKING = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

/** The language Language Options implies when the layer names none. */
export const shapingLang = (t: Pick<TextSpec, 'shaping'>): string => (t.shaping === 'eastAsian' ? 'ja' : t.shaping === 'middleEastern' ? 'ar' : t.shaping === 'southAsian' ? 'hi' : '');

/** The paragraph's base direction: the layer's own setting, else right-to-left for Middle Eastern features. */
export const baseDirection = (t: Pick<TextSpec, 'shaping' | 'bidi'>): 'ltr' | 'rtl' => t.bidi ?? (t.shaping === 'middleEastern' ? 'rtl' : 'ltr');

export interface ParaLook { align: 'left' | 'center' | 'right' | 'justify'; dir: 'ltr' | 'rtl'; iL: number; iR: number; iF: number; before: number; after: number; lastLine: TextSpec['lastLine'] }

/** Paragraph `i` as it is set: its own settings over the layer's. A start or end edge (its own, or the layer's when the
 *  paragraph names no alignment of its own) puts left and right aligned text on the side the paragraph's direction means. */
export function paraOf(t: TextSpec, i: number): ParaLook {
  const p = t.paras?.[i], dir = p?.bidi ?? baseDirection(t), base = p?.align ?? t.align, edge = p?.edge ?? (p?.align ? undefined : t.edge);
  return {
    align: edge && (base === 'left' || base === 'right') ? ((edge === 'start') === (dir === 'ltr') ? 'left' : 'right') : base, dir,
    iL: Math.max(0, p?.indentLeft ?? t.indentLeft ?? 0), iR: Math.max(0, p?.indentRight ?? t.indentRight ?? 0), iF: p?.indentFirst ?? t.indentFirst ?? 0,
    before: Math.max(0, p?.spaceBefore ?? t.spaceBefore ?? 0), after: Math.max(0, p?.spaceAfter ?? t.spaceAfter ?? 0), lastLine: p?.lastLine ?? t.lastLine,
  };
}

/** Whether any paragraph names settings of its own. */
export const hasParas = (t: Pick<TextSpec, 'paras'>): boolean => !!t.paras?.some((p) => p && Object.keys(p).length);

/** A context's text direction, set only when it changes. */
function dirOn(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, d: 'ltr' | 'rtl'): void {
  const k = c as unknown as { direction?: string };
  if ('direction' in c && k.direction !== d) k.direction = d;
}

/** Sets a context's font, kerning and, where the canvas can, tracking, as `renderText` draws with them. */
export function setType(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TextSpec): void {
  c.font = fontCss(t);
  const k = c as unknown as { fontKerning?: string; letterSpacing?: string; lang?: string; direction?: string; textRendering?: string };
  const lang = t.language || shapingLang(t);
  if (lang && 'lang' in c) k.lang = lang;
  if ('direction' in c) k.direction = baseDirection(t);
  if (t.shaping && t.shaping !== 'default' && 'textRendering' in c) k.textRendering = 'optimizeLegibility';
  if ('fontKerning' in c) k.fontKerning = t.kerning === 'none' ? 'none' : 'normal';
  if (CANVAS_TRACKING) k.letterSpacing = `${trackingPx(t)}px`;
}

/** A line's advance with the spec's tracking: the canvas's own measure where it spaces letters, else each character's
 *  advance plus the tracking after it (kerning between characters is then lost, as each is set alone). */
function lineWidth(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TextSpec, line: string, at?: number): number {
  return walk(c, t, line, 0, 0, false, at) * hScale(t);
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const hScale = (t: TextSpec): number => (t.scaleX ?? 100) / 100;

let keepColour: { r: number; g: number; b: number } | null = null;
const fillOf = (c: { r: number; g: number; b: number }): string => (keepColour && (keepColour.r !== c.r || keepColour.g !== c.g || keepColour.b !== c.b) ? 'rgba(0,0,0,0)' : `rgb(${c.r},${c.g},${c.b})`);

/** The colours a type spec draws in (its own, then its runs') and, per pixel, which one carries most of the coverage there,
 *  each colour's coverage taken from the same render with the other colours left undrawn; null when it draws in one colour. */
export function colourIndex(t: TextSpec, width: number, height: number): { colors: Array<{ r: number; g: number; b: number }>; index: Uint8Array } | null {
  const colors: Array<{ r: number; g: number; b: number }> = [];
  for (const c of [t.color, ...(t.runs ?? []).map((q) => q.color)]) if (c && !colors.some((q) => q.r === c.r && q.g === c.g && q.b === c.b)) colors.push({ r: c.r, g: c.g, b: c.b });
  if (colors.length < 2) return null;
  const index = new Uint8Array(width * height), best = new Uint8Array(width * height);
  try {
    colors.forEach((c, k) => {
      keepColour = c;
      const r = renderText(t).raster;
      if (r.width !== width || r.height !== height) throw new Error('size');
      const d = r.read().data;
      for (let j = 0; j < best.length; j++) if (d[j * 4 + 3] > best[j]) { best[j] = d[j * 4 + 3]; index[j] = k; }
    });
  } catch { return null; } finally { keepColour = null; }
  return { colors, index };
}

/** Sets a line's pieces from (x, y) when `draw` is on, and returns its unscaled advance. Synthetic small capitals are set
 *  as capitals at 80 percent of the size; optical kerning, and tracking where the canvas cannot space letters, set one
 *  character at a time. The common case is the canvas's own measure and fill of the whole line. */
function walk(c: Ctx, t: TextSpec, line: string, x: number, y: number, draw: boolean, at?: number): number {
  if (at !== undefined && t.runs?.length) {   // runs: the line is set in pieces, each with its own features and attributes
    const segs = styleSegments(t.features, t.runs, at, at + line.length);
    if (segs.length > 1 || (segs[0] && (segs[0].features.join(',') !== cleanFeatures(t.features).join(',') || Object.keys(segs[0].attrs).length))) {
      let cx = x;
      const fill = c.fillStyle;
      for (const s of segs) {
        const st = specWith(t, s.attrs, s.features);
        setType(c, st);
        if (draw && s.attrs.color) c.fillStyle = fillOf(st.color);
        const piece = line.slice(s.from - at, s.to - at), by = y + (t.baselineShift ?? 0) - (st.baselineShift ?? 0);
        // a run's own scale is absolute; the layer's scale is applied by the caller, so the run is set at the ratio to it
        const rx = s.attrs.scaleX ? s.attrs.scaleX / 100 / hScale(t) : 1, ry = s.attrs.scaleY ? s.attrs.scaleY / (t.scaleY ?? 100) : 1;
        const scaled = rx !== 1 || ry !== 1;
        if (draw && scaled) { c.save(); c.translate(cx, by); c.scale(rx, ry); }
        const text = s.attrs.caps === 'all' && t.caps !== 'all' ? piece.toUpperCase() : piece;
        const adv = walk(c, st, text, draw && scaled ? 0 : cx, draw && scaled ? 0 : by, draw);
        if (draw && (s.attrs.underline || s.attrs.strike)) {   // a run's own underline and strikethrough, over the run's advance
          const th = Math.max(1, st.size / 18), ox = scaled ? 0 : cx, oy = scaled ? 0 : by;
          if (s.attrs.underline) c.fillRect(ox, oy + st.size * 0.12, adv, th);
          if (s.attrs.strike) c.fillRect(ox, oy - st.size * 0.3, adv, th);
        }
        if (draw && scaled) c.restore();
        cx += adv * rx;
        if (draw && s.attrs.color) c.fillStyle = fill;
      }
      setType(c, t);
      return cx - x;
    }
  }
  const small = t.caps === 'small', optical = t.kerning === 'optical', perChar = optical || (!CANVAS_TRACKING && t.tracking !== 0);
  if (!small && !perChar) {
    if (draw) c.fillText(line, x, y);
    return c.measureText(line).width;
  }
  let cx = x, prev = '';
  for (const p of smallCapPieces(line, small)) {
    const st = p.small ? { ...t, size: t.size * SMALL_CAP_SCALE } : t;
    if (small) setType(c, st);
    if (!perChar) { if (draw) c.fillText(p.text, cx, y); cx += c.measureText(p.text).width; continue; }
    const font48 = optical ? fontCss({ ...st, size: 48 }) : '';
    for (const ch of p.text) {
      if (optical && prev) cx += opticalKern(font48, prev, ch, st.size);
      if (draw) c.fillText(ch, cx, y);
      cx += c.measureText(ch).width + (CANVAS_TRACKING ? 0 : trackingPx(st));
      prev = ch;
    }
  }
  if (small) setType(c, t);
  return cx - x;
}

/** The spec with one run's attributes and features laid over it, for drawing that piece (its own runs dropped). */
export function specWith(t: TextSpec, a: RunAttrs, features: string[] = cleanFeatures(t.features)): TextSpec {
  return {
    ...t, features, runs: undefined,
    ...(a.family ? { family: a.family } : {}), ...(a.size ? { size: a.size } : {}), ...(a.color ? { color: { ...a.color } } : {}),
    ...(a.bold !== undefined ? { bold: a.bold, weight: a.weight } : a.weight !== undefined ? { weight: a.weight } : {}),
    ...(a.italic !== undefined ? { italic: a.italic } : {}), ...(a.baselineShift !== undefined ? { baselineShift: a.baselineShift } : {}),
    ...(a.tracking !== undefined ? { tracking: a.tracking } : {}), ...(a.language ? { language: a.language } : {}),
    ...(a.caps ? { caps: a.caps } : {}),
  };
}

/** Fonts tried, in order, for a script the family has no glyph for: the system faces that cover it on each platform, with
 *  the Noto families where installed, and the bundled Inter for Cyrillic and Greek. The chain runs the layer's language
 *  first (for Han text with none, the app's locale), then each script the text holds in this table's order; the browser's
 *  own fallback still follows the list. */
export const SCRIPT_FALLBACKS: ReadonlyArray<{ id: string; test: RegExp; langs: RegExp; fonts: string[] }> = [
  { id: 'ja', test: /[\u3040-\u30ff\u31f0-\u31ff]/, langs: /^ja/i, fonts: ['Hiragino Sans', 'Yu Gothic', 'Meiryo', 'Noto Sans CJK JP', 'Noto Sans JP'] },
  { id: 'ko', test: /[\uac00-\ud7af\u1100-\u11ff]/, langs: /^ko/i, fonts: ['Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR', 'Noto Sans KR'] },
  { id: 'zh-hant', test: /(?!)/, langs: /^zh-(hant|tw|hk|mo)/i, fonts: ['PingFang TC', 'Microsoft JhengHei', 'Noto Sans CJK TC', 'Noto Sans TC'] },
  { id: 'zh', test: /[\u3400-\u4dbf\u4e00-\u9fff]/, langs: /^zh/i, fonts: ['PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC'] },
  { id: 'ar', test: /[\u0600-\u06ff\u0750-\u077f]/, langs: /^(ar|fa|ur)/i, fonts: ['Geeza Pro', 'Segoe UI', 'Tahoma', 'Noto Sans Arabic'] },
  { id: 'he', test: /[\u0590-\u05ff]/, langs: /^he/i, fonts: ['Arial Hebrew', 'Segoe UI', 'Noto Sans Hebrew'] },
  { id: 'th', test: /[\u0e00-\u0e7f]/, langs: /^th/i, fonts: ['Thonburi', 'Leelawadee UI', 'Noto Sans Thai'] },
  { id: 'hi', test: /[\u0900-\u097f]/, langs: /^(hi|mr|ne|sa)/i, fonts: ['Kohinoor Devanagari', 'Nirmala UI', 'Noto Sans Devanagari'] },
  { id: 'cyr', test: /[\u0400-\u052f]/, langs: /^(ru|uk|bg|sr|be|mk|kk)/i, fonts: ['Inter', 'Segoe UI', 'Helvetica Neue', 'Arial', 'Noto Sans', 'Liberation Sans'] },
  { id: 'el', test: /[\u0370-\u03ff\u1f00-\u1fff]/, langs: /^el/i, fonts: ['Inter', 'Segoe UI', 'Helvetica Neue', 'Arial', 'Noto Sans', 'Liberation Sans'] },
];

const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const HAN_FACES = new Set(['ja', 'ko', 'zh-hant', 'zh']);

/** Preferences > Type > Enable Missing Glyph Protection: a character the family lacks is tried in the script's own faces; off, only the browser's default is left to find one. */
export const typePrefs = { glyphProtection: true };

const chains = new Map<string, string>();
let lastChain: { content: string; language: string; css: string } | null = null;

/** The fallback fonts for a spec as CSS, ordered for its language (a tag, else the scripts its text holds), then the
 *  colour emoji faces; always ends in the generic sans-serif. */
export function fallbackCss(t: Pick<TextSpec, 'content' | 'language' | 'shaping'>): string {
  if (!typePrefs.glyphProtection) return 'sans-serif';
  const language = t.language || shapingLang(t), content = t.content ?? '';
  if (lastChain && lastChain.content === content && lastChain.language === language) return lastChain.css;
  const locale = typeof navigator === 'undefined' ? '' : navigator.language || '';
  const ids: string[] = [], byLang = SCRIPT_FALLBACKS.find((s) => language && s.langs.test(language))
    ?? (!language && HAN.test(content) ? SCRIPT_FALLBACKS.find((s) => HAN_FACES.has(s.id) && s.langs.test(locale)) : undefined);
  if (byLang) ids.push(byLang.id);
  for (const s of SCRIPT_FALLBACKS) if (!ids.includes(s.id) && content && s.test.test(content)) ids.push(s.id);
  const emoji = /\p{Extended_Pictographic}/u.test(content), key = `${ids.join('|')}${emoji ? '+e' : ''}`;
  let css = chains.get(key);
  if (css === undefined) {
    const names = ids.flatMap((id) => SCRIPT_FALLBACKS.find((s) => s.id === id)?.fonts ?? []);
    css = [...names, ...(emoji ? ['Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'] : [])].map((n) => `"${n}"`).concat('sans-serif').join(', ');
    chains.set(key, css);
  }
  lastChain = { content, language, css };
  return css;
}

/** The CSS font for a spec, with the script fallbacks after a named family. */
export function fontCss(t: TextSpec): string {
  const variant = GENERIC.has(t.family) ? null : variantFamily(t.family, t.bold, t.italic, t.features, t.variations), fall = fallbackCss(t);
  const family = variant ? `"${variant}", "${t.family.replace(/["\\]/g, '')}", ${fall}` : GENERIC.has(t.family) ? `${t.family}, ${fall}` : `"${t.family.replace(/["\\]/g, '')}", ${fall}`;
  return `${t.italic ? 'italic ' : ''}${t.weight ?? (t.bold ? 700 : 400)} ${t.size}px ${family}`;
}

/** Waits for the spec's font, and the fonts its runs name, to load where the browser can, so the first rendering uses them. */
export async function loadTextFont(t: TextSpec): Promise<void> {
  await ensureBundledFont(t.family, (t.weight ?? (t.bold ? 700 : 400)) >= 600);
  if ((t.features?.length || (t.variations && Object.keys(t.variations).length)) && !GENERIC.has(t.family)) await ensureVariant(t.family, t.bold, t.italic, t.features ?? [], t.variations);
  const pieces = t.runs?.length ? styleSegments(t.features, t.runs, 0, t.content.length) : [];
  for (const s of pieces) {
    const st = specWith(t, s.attrs, s.features);
    await ensureBundledFont(st.family, (st.weight ?? (st.bold ? 700 : 400)) >= 600);
    if ((s.features.length || (st.variations && Object.keys(st.variations).length)) && !GENERIC.has(st.family)) await ensureVariant(st.family, st.bold, st.italic, s.features, st.variations);
    if (Object.keys(s.attrs).length) { try { await document.fonts?.load(fontCss(st), t.content.slice(s.from, s.to) || 'Ag'); } catch { /* the canvas falls back */ } }
  }
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
  // Indents, space before and after, scale, baseline shift and caps (all optional, none by default).
  const text = t.caps === 'all' ? t.content.toUpperCase() : t.content;
  const own = hasParas(t), look = (p: number): ParaLook => paraOf(t, p), head = look(0), gapPara = head.before + head.after;
  const ky = (t.scaleY ?? 100) / 100, shift = t.baselineShift ?? 0, kx = hScale(t);
  const room = (p: number): number => (box ? Math.max(1, box.w - pad * 2 - look(p).iL - look(p).iR) : 0);
  const lines: Array<{ text: string; last: boolean }> = box ? wrapLines(probe, t, text, room(0), Math.max(1, room(0) - head.iF), own ? (p) => ({ wide: room(p), first: Math.max(1, room(p) - look(p).iF) }) : undefined) : text.split('\n').map((s) => ({ text: s, last: true }));
  // Each line's paragraph, and whether it opens it (it takes the first-line indent).
  const para: number[] = [], opens: boolean[] = [];
  lines.forEach((_, i) => { para.push(i && lines[i - 1].last ? para[i - 1] + 1 : i ? para[i - 1] : 0); opens.push(i === 0 || lines[i - 1].last); });
  const lead = (i: number): number => look(para[i]).iL + (opens[i] ? look(para[i]).iF : 0);
  // What each paragraph adds above it: the space after those before it and its own space before (none above the first).
  const gaps: number[] = [0];
  for (let p = 1; p <= (para[para.length - 1] ?? 0); p++) gaps.push(gaps[p - 1] + look(p - 1).after + look(p).before);
  const gapAt = (p: number): number => (own ? gaps[p] : p * gapPara);
  // A paragraph set in its own direction is measured and drawn with a spec that says so.
  const specs: TextSpec[] = [], specFor = (p: number): TextSpec => specs[p] || (specs[p] = look(p).dir === baseDirection(t) ? t : { ...t, bidi: look(p).dir });
  const starts = t.runs?.length ? lineStarts(text, lines) : [];   // where each line begins in the text, for feature runs
  const styled = runsStyled(t.runs);   // runs with sizes or shifts change a line's height: it takes its largest size
  const segsOf = (i: number): ReturnType<typeof styleSegments> => styleSegments(t.features, t.runs, starts[i], starts[i] + lines[i].text.length);
  const lineK = lines.map((_, i) => (styled ? Math.max(...segsOf(i).map((s) => (s.attrs.size ?? t.size) * (s.attrs.scaleY ? s.attrs.scaleY / (t.scaleY ?? 100) : 1))) / t.size : 1));
  const shifts = styled ? lines.flatMap((_, i) => segsOf(i).map((s) => s.attrs.baselineShift ?? shift)) : [shift];
  const metrics = lines.map((line, i) => { if (own) dirOn(probe, look(para[i]).dir); return probe.measureText(line.text || ' '); });
  const widths = lines.map((line, i) => { if (own) dirOn(probe, look(para[i]).dir); return lineWidth(probe, specFor(para[i]), line.text || ' ', starts[i]); });
  const ascent = (metrics[0].fontBoundingBoxAscent || t.size * 0.8) * ky * lineK[0], descent = (metrics[0].fontBoundingBoxDescent || t.size * 0.25) * ky * lineK[lines.length - 1];
  const advance = t.size * t.lineHeight, up = Math.max(0, ...shifts), down = Math.max(0, ...shifts.map((s) => -s));
  const offs: number[] = [];
  lines.forEach((_, i) => offs.push(styled ? (i ? offs[i - 1] + advance * lineK[i] : 0) : i * advance));
  const widest = Math.max(1, ...metrics.map((m, i) => Math.max(widths[i], ((m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0)) * kx) + lead(i) + look(para[i]).iR));
  const width = box ? Math.max(1, Math.round(box.w)) : Math.ceil(widest) + pad * 2;
  const height = box ? Math.max(1, Math.round(box.h)) : Math.ceil(ascent + descent + offs[lines.length - 1] + gapAt(para[lines.length - 1]) + up + down) + pad * 2;
  // A type angle turns the drawing itself, so the glyphs are rasterized at the angle and stay sharp: the raster is the turned
  // box's bounds, the first baseline's start (by alignment; a box's corner) the turn's centre, and pad and baseline say where it lies.
  const rad = ((t.angle ?? 0) * Math.PI) / 180, turned = rad !== 0, cs = Math.cos(rad), sn = Math.sin(rad), side = t.align === 'center' || t.align === 'right' ? t.align : 'left';
  const ax = box ? 0 : side === 'center' ? width / 2 : side === 'right' ? width - pad : pad, ay = box ? 0 : pad + up + ascent;
  const turnedPts = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => [(x - ax) * cs - (y - ay) * sn, (x - ax) * sn + (y - ay) * cs]);
  const minX = Math.min(...turnedPts.map((q) => q[0])), maxX = Math.max(...turnedPts.map((q) => q[0])), minY = Math.min(...turnedPts.map((q) => q[1])), maxY = Math.max(...turnedPts.map((q) => q[1]));
  const rw = turned ? Math.max(1, Math.ceil(side === 'center' && !box ? 2 * Math.max(-minX, maxX) : maxX - minX)) : width, rh = turned ? Math.max(1, Math.ceil(maxY - minY)) : height;
  const rax = turned ? (side === 'center' && !box ? rw / 2 : -minX) : 0, ray = turned ? -minY : 0;
  const raster = new Raster(rw, rh), c = raster.ctx;
  setType(c, t);
  if (turned) { c.translate(rax, ray); c.rotate(rad); c.translate(-ax, -ay); }
  c.fillStyle = fillOf(t.color);
  c.textBaseline = 'alphabetic';
  const run =(s: string, x: number, y: number, at: number | undefined, ts: TextSpec): void => {   // a run of text from x, scaled, spaced as it will measure
    c.save();
    c.translate(x, y);
    if (kx !== 1 || ky !== 1) c.scale(kx, ky);
    walk(c, ts, s, 0, 0, true, at);
    c.restore();
  };
  const rule = (x: number, y: number, w: number): void => {   // underline and strikethrough
    const th = Math.max(1, t.size / 18);
    if (t.underline) c.fillRect(x, y + t.size * 0.12 * ky, w, th);
    if (t.strike) c.fillRect(x, y - t.size * 0.3 * ky, w, th);
  };
  c.textAlign = 'left';
  const base = pad + up + ascent;
  lines.forEach((line, i) => {
    const q = look(para[i]), ts = specFor(para[i]), y = base + offs[i] + gapAt(para[i]);
    if (box && y + descent > height) return;                       // past the box: clipped
    const left = pad + lead(i), right = width - pad - q.iR, words = line.text.split(' '), ty = y - shift;
    if (own) dirOn(c, q.dir);
    const rtl = (own || !!t.edge) && q.dir === 'rtl', rest = rtl ? 'right' : 'left';
    let al: 'left' | 'center' | 'right' | 'justify' = q.align === 'justify' ? (!line.last || q.lastLine === 'all' ? 'justify' : q.lastLine ?? rest) : q.align;
    if (al === 'justify' && !(box && words.length > 1)) al = rest;
    if (al === 'justify') {
      const ats: number[] = [];
      words.reduce((o, w) => { ats.push(o); return o + w.length + 1; }, starts[i] ?? 0);
      const ws = words.map((w, k) => lineWidth(c, ts, w, starts.length ? ats[k] : undefined)), gap = (right - left - ws.reduce((a, b) => a + b, 0)) / (words.length - 1);
      let x = rtl ? right : left;
      words.forEach((w, k) => { if (rtl) x -= ws[k]; run(w, x, ty, starts.length ? ats[k] : undefined, ts); x += rtl ? -gap : ws[k] + gap; });
      rule(left, ty, right - left);
      return;
    }
    const lw = widths[i], x = al === 'center' ? left + (right - left - lw) / 2 : al === 'right' ? right - lw : left;
    run(line.text, x, ty, starts[i], ts);
    rule(x, ty, lw);
  });
  raster.touch();
  return turned ? { raster, baseline: ray, pad: side === 'right' && !box ? rw - rax : rax } : { raster, baseline: base, pad };
}

/** Each wrapped line's first character in `text`: lines run in order, a break at a space or line break uses it up, and a
 *  hyphen a break added is not a character of the text. */
function lineStarts(text: string, lines: ReadonlyArray<{ text: string; last: boolean }>): number[] {
  const out: number[] = [];
  let at = 0;
  for (const line of lines) {
    out.push(at);
    const added = !line.last && line.text.endsWith('-') && text[at + line.text.length - 1] !== '-' ? 1 : 0;
    at += line.text.length - added;
    if (text[at] === (line.last ? '\n' : ' ')) at += 1;
  }
  return out;
}

/** Where a word that does not fit after `lead` may break with a hyphen: the largest cut of two to length-2 letters that
 *  fits, preferring one between a vowel and a consonant (a syllable end); 0 where the word is short or nothing fits. */
function hyphenAt(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TextSpec, lead: string, w: string, max: number): number {
  if (w.length < 5 || !/^\p{L}+$/u.test(w)) return 0;
  const vowel = (ch: string): boolean => /[aeiouyáàâäéèêëíîïóôöúûüåæø]/i.test(ch);
  let any = 0;
  for (let k = w.length - 2; k >= 2; k--) {
    if (lineWidth(c, t, `${lead}${w.slice(0, k)}-`) > max) continue;
    if (!any) any = k;
    if (vowel(w[k - 1]) && !vowel(w[k])) return k;
  }
  return any;
}

const SPACELESS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const NO_LINE_START = /^[\p{Pe}\p{Pf}\p{Po}・ー]/u, NO_LINE_END = /[\p{Ps}\p{Pi}]$/u;
type WordSegmenter = { segment(s: string): Iterable<{ segment: string }> };
const SegmenterClass = (typeof Intl !== 'undefined' ? (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => WordSegmenter }).Segmenter : undefined);
const segmenters = new Map<string, WordSegmenter | null>();

/** The pieces of a word a line may break between. Chinese, Japanese, Thai and the like are written without spaces, so a
 *  word set in them is cut at the word boundaries Intl.Segmenter finds (a closing mark stays with the word before it, an
 *  opening one with the word after); where the browser has no Segmenter, or the word holds no such script, it is whole. */
function wordParts(word: string, lang: string): string[] {
  if (!SegmenterClass || !SPACELESS.test(word)) return [word];
  let seg = segmenters.get(lang);
  if (seg === undefined) {
    try { seg = new SegmenterClass(lang || undefined, { granularity: 'word' }); } catch { seg = null; }
    segmenters.set(lang, seg);
  }
  if (!seg) return [word];
  const parts: string[] = [];
  let cur = '';
  for (const { segment } of seg.segment(word)) {
    const last = [...cur].pop() ?? '', first = String.fromCodePoint(segment.codePointAt(0) ?? 32);
    if (cur && (SPACELESS.test(last) || SPACELESS.test(first)) && !NO_LINE_START.test(first) && !NO_LINE_END.test(last)) { parts.push(cur); cur = ''; }
    cur += segment;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** A paragraph as the pieces its lines are built from, each with what lies before it: a space between words, nothing
 *  between the pieces of one word. */
function breakUnits(para: string, lang: string): Array<{ w: string; join: string }> {
  const out: Array<{ w: string; join: string }> = [];
  para.split(' ').forEach((word, i) => wordParts(word, lang).forEach((w, k) => out.push({ w, join: k || !i ? '' : ' ' })));
  return out;
}

/** Words to lines no wider than `max`, each paragraph (a line break) on its own, its last line marked. `limits` gives a
 *  paragraph's own widths (its lines, and its first line when indented) where the paragraphs differ. */
export function wrapLines(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: TextSpec, content: string, wide: number, wideFirst = wide, limits?: (para: number) => { wide: number; first: number }): Array<{ text: string; last: boolean }> {
  const out: Array<{ text: string; last: boolean }> = [], lang = t.language || shapingLang(t);
  let origin = 0, index = 0;   // where the paragraph begins in `content`, so a run's size and tracking count in the measure
  for (const para of content.split('\n')) {
    let cur = '', curAt = origin, pos = origin;
    const from = out.length, lim = limits ? limits(index) : { wide, first: wideFirst };
    index += 1;
    for (const unit of breakUnits(para, lang)) {
      let w = unit.w;
      const join = unit.join;
      pos += join.length;
      let wAt = pos, max = out.length === from ? lim.first : lim.wide;   // a paragraph's first line may be indented
      pos += w.length;
      const trial = cur ? `${cur}${join}${w}` : w;
      if (lineWidth(c, t, trial, cur ? curAt : wAt) <= max) { if (!cur) curAt = wAt; cur = trial; continue; }
      const cut = t.hyphenate && !SPACELESS.test(w) ? hyphenAt(c, t, cur ? `${cur}${join}` : '', w, max) : 0;
      if (cut) { out.push({ text: `${cur ? `${cur}${join}` : ''}${w.slice(0, cut)}-`, last: false }); w = w.slice(cut); wAt += cut; cur = ''; }
      if (cur) { out.push({ text: cur, last: false }); cur = ''; }
      max = out.length === from ? lim.first : lim.wide;
      while (w.length > 1 && lineWidth(c, t, w, wAt) > max) {
        const dash = t.hyphenate && !SPACELESS.test(w) ? '-' : '';
        let k = w.length - 1;
        while (k > 1 && lineWidth(c, t, w.slice(0, k) + dash, wAt) > max) k -= 1;
        out.push({ text: w.slice(0, k) + dash, last: false });
        w = w.slice(k);
        wAt += k;
        max = lim.wide;
      }
      cur = w;
      curAt = wAt;
    }
    out.push({ text: cur, last: true });
    origin += para.length + 1;
  }
  return out;
}

/** Vertical type: each line a column, from right to left, its characters upright and stacked top to bottom, one em
 *  apart plus the tracking; columns Leading apart. `baseline` is the top padding plus the ascent, as for point text. */
function renderVertical(t: TextSpec): TextRender {
  const cols = (t.caps ? t.content.toUpperCase() : t.content).split('\n').map((l) => [...l]);
  const probe = ctxOf(createSurface(1, 1));
  setType(probe, t);
  const m = probe.measureText('Ag'), ascent = m.fontBoundingBoxAscent || t.size * 0.8;
  const pad = Math.ceil(t.size * 0.1) + 2, step = t.size + trackingPx(t), colW = t.size * t.lineHeight;
  const rows = Math.max(1, ...cols.map((c) => c.length));
  const width = Math.ceil(colW * cols.length) + pad * 2, height = Math.ceil(step * rows) + pad * 2;
  const raster = new Raster(width, height), c = raster.ctx;
  setType(c, t);
  if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = '0px';
  c.fillStyle = fillOf(t.color);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  cols.forEach((col, i) => {
    const x = width - pad - colW * (i + 0.5);
    col.forEach((ch, j) => c.fillText(ch, x, pad + j * step));
  });
  raster.touch();
  return { raster, baseline: pad + ascent, pad };
}

/** Warp Text's styles, in the usual order, with their names. */
export const WARP_STYLES: ReadonlyArray<readonly [WarpStyle, string]> = [['arc', 'Arc'], ['arcLower', 'Arc Lower'], ['arcUpper', 'Arc Upper'], ['arch', 'Arch'],
  ['bulge', 'Bulge'], ['shellLower', 'Shell Lower'], ['shellUpper', 'Shell Upper'], ['flag', 'Flag'], ['wave', 'Wave'], ['fish', 'Fish'], ['rise', 'Rise'],
  ['fisheye', 'Fisheye'], ['inflate', 'Inflate'], ['squeeze', 'Squeeze'], ['twist', 'Twist']];

const warpActive = (w: TextWarp | null | undefined): w is TextWarp => !!w && (w.bend !== 0 || w.horizontal !== 0 || w.vertical !== 0);

/** Where a point of the text's box goes, in coordinates from -1 to 1 across and down it. The shapes are this build's
 *  own formulas for each of the styles (the arc and shell bends, flag and wave ripples, fisheye, inflate and
 *  squeeze swells, twist); Horizontal and Vertical Distortion then taper the box like a perspective. */
export function warpPoint(w: TextWarp, u0: number, v0: number): [number, number] {
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
 *  that would run past the path's end are not drawn. Set one by one, pairs are not kerned. */
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
  c.fillStyle = fillOf(t.color);
  c.textBaseline = tp.flip ? 'top' : 'alphabetic';
  c.textAlign = 'center';
  let d = (Math.max(0, Math.min(100, tp.offset)) / 100) * total;
  let idx = 0;
  const styled = runsStyled(t.runs);   // runs set size, colour, face, shift, tracking or language per character
  for (const ch of t.content.replace(/\r?\n/g, ' ')) {
    const seg = styled ? styleSegments(t.features, t.runs, idx, idx + ch.length)[0] : null, st = seg ? specWith(t, seg.attrs, seg.features) : t;
    idx += ch.length;
    if (seg) { setType(c, st); c.fillStyle = fillOf(st.color); }
    const w = c.measureText(ch).width + (CANVAS_TRACKING ? 0 : trackingPx(st));
    if (d + w > total + 0.5) break;
    const p = at(d + w / 2);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.a);
    c.fillText(ch, 0, -(st.baselineShift ?? 0));
    c.restore();
    d += w;
  }
  raster.touch();
  return { raster, baseline: 0, pad: 0 };
}

/** The type as it is drawn: along its path, or plain, then warped when the spec has an active Warp Text. */
export function renderText(t: TextSpec): TextRender {
  if (t.onPath) return blendGamma(renderPathText(t, t.onPath));
  const plain = renderPlain(t);
  return blendGamma(antialiased(warpActive(t.warp) ? warpRender(plain, t.warp) : plain, t.antialias));
}

let blendGammaValue = 1;
/** Color Settings > Blend text colors using gamma: set from the settings; type drawn after it carries the gamma. */
export function setTextBlendGamma(g: number): void { blendGammaValue = g >= 1 && g <= 2.4 ? g : 1; }

/** Edge coverage moved to what blending the text over an opposite-tone backdrop in a space of this gamma would show:
 *  the blend of F over B at coverage a is ((1-a) B^g + a F^g)^(1/g), and the coverage that gives the same result by
 *  plain blending is kept in the alpha. Dark type gets thinner and light type heavier as the gamma rises. */
function blendGamma(r: TextRender): TextRender {
  const g = blendGammaValue;
  if (g === 1) return r;
  const w = r.raster.width, h = r.raster.height, c = r.raster.ctx, img = c.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0 || a === 255) continue;
    const f = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255, b = f >= 0.5 ? 0 : 1, k = a / 255;
    const x = ((1 - k) * b ** g + k * f ** g) ** (1 / g);
    d[i + 3] = Math.max(0, Math.min(255, Math.round(((x - b) / (f - b)) * 255)));
  }
  c.putImageData(img, 0, 0);
  r.raster.touch();
  return r;
}

export const TEXT_ANTIALIAS = ['none', 'sharp', 'crisp', 'strong', 'smooth', 'windows-lcd', 'windows'] as const;

/** The anti-aliasing method on the rendered edges: None thresholds them at half; Sharp steepens them about half
 *  coverage; Crisp steepens them less and centres them a little lower; Strong steepens and lowers the centre, so the
 *  letters read heavier; Windows applies a coverage gamma, as ClearType-less grayscale text has; Windows LCD first
 *  averages each pixel's coverage with its horizontal neighbours (the three-tap filter of LCD text) and then the gamma.
 *  The pixels stay grayscale, so LCD text has the filter and not colour fringes. */
function antialiased(r: TextRender, how: TextSpec['antialias']): TextRender {
  if (!how || how === 'smooth') return r;
  const w = r.raster.width, h = r.raster.height;
  const c = r.raster.ctx, img = c.getImageData(0, 0, w, h), d = img.data;
  if (how === 'windows-lcd') {
    const src = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * w + x; d[o * 4 + 3] = Math.round(((x > 0 ? src[o - 1] : 0) + src[o] + (x < w - 1 ? src[o + 1] : 0)) / 3); }
  }
  const shape = (a: number): number => {
    switch (how) {
      case 'none': return a >= 128 ? 255 : 0;
      case 'crisp': return (a - 112) * 1.5 + 128;
      case 'strong': return (a - 96) * 2 + 128;
      case 'windows': case 'windows-lcd': return 255 * Math.pow(a / 255, 0.8);
      default: return (a - 128) * 2 + 128;
    }
  };
  for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a === 0 || (a === 255 && how !== 'windows-lcd')) continue; d[i] = Math.max(0, Math.min(255, Math.round(shape(a)))); }
  c.putImageData(img, 0, 0);
  r.raster.touch();
  return r;
}

/** A type spec's settings as a paragraph style named `name`. */
export function styleOf(t: TextSpec, id: ID, name: string): ParagraphStyle {
  return { id, name, family: t.family, size: t.size, color: { ...t.color }, align: t.align, bold: t.bold, italic: t.italic, lineHeight: t.lineHeight, tracking: t.tracking, kerning: t.kerning, ...pick(t, PARA_KEYS) };
}

/** A spec taking a paragraph style's settings, keeping its own text, warp and path, and linked to the style. */
export function withStyle(t: TextSpec, s: ParagraphStyle): TextSpec {
  const own = { ...t };
  for (const k of PARA_KEYS) delete own[k];
  return { ...own, family: s.family, size: s.size, color: { ...s.color }, align: s.align, bold: s.bold, italic: s.italic, lineHeight: s.lineHeight, tracking: s.tracking, kerning: s.kerning, ...pick(s, PARA_KEYS), style: s.id, rendered: undefined };
}

const PARA_KEYS = ['indentFirst', 'indentLeft', 'indentRight', 'spaceBefore', 'spaceAfter', 'lastLine', 'bidi', 'edge'] as const;
const CHAR_KEYS = ['caps', 'scaleX', 'scaleY', 'baselineShift', 'underline', 'strike', 'variations'] as const;

/** The listed keys of `o` that are set (not undefined), copied. */
function pick<K extends keyof TextExtras>(o: TextExtras, keys: readonly K[]): Pick<TextExtras, K> {
  const out = {} as Pick<TextExtras, K>;
  for (const k of keys) if (o[k] !== undefined) out[k] = (typeof o[k] === 'object' && o[k] ? { ...(o[k] as object) } : o[k]) as TextExtras[K];
  return out;
}

/** The character and paragraph attributes of saved data, each kept only when valid and not at its default. */
export function extrasFrom(o: Record<string, unknown>): TextExtras {
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v), out: TextExtras = {};
  if (o.caps === 'all' || o.caps === 'small') out.caps = o.caps;
  if (fin(o.weight)) out.weight = Math.round(clamp(o.weight, 1, 1000));
  if (fin(o.scaleX) && o.scaleX !== 100) out.scaleX = clamp(o.scaleX, 10, 500);
  if (fin(o.scaleY) && o.scaleY !== 100) out.scaleY = clamp(o.scaleY, 10, 500);
  if (fin(o.baselineShift) && o.baselineShift !== 0) out.baselineShift = clamp(o.baselineShift, -2000, 2000);
  if (fin(o.angle) && o.angle !== 0) out.angle = clamp(o.angle, -360, 360);
  if (o.underline === true) out.underline = true;
  if (o.strike === true) out.strike = true;
  if (o.variations && typeof o.variations === 'object') {
    const v = Object.fromEntries(Object.entries(o.variations as Record<string, unknown>).filter(([k, n]) => /^[A-Za-z0-9]{4}$/.test(k) && fin(n)).slice(0, 16).map(([k, n]) => [k, clamp(n as number, -1000, 10000)]));
    if (Object.keys(v).length) out.variations = v;
  }
  if (fin(o.indentFirst) && o.indentFirst !== 0) out.indentFirst = clamp(o.indentFirst, -2000, 5000);
  if (fin(o.indentLeft) && o.indentLeft > 0) out.indentLeft = clamp(o.indentLeft, 0, 5000);
  if (fin(o.indentRight) && o.indentRight > 0) out.indentRight = clamp(o.indentRight, 0, 5000);
  if (fin(o.spaceBefore) && o.spaceBefore > 0) out.spaceBefore = clamp(o.spaceBefore, 0, 5000);
  if (fin(o.spaceAfter) && o.spaceAfter > 0) out.spaceAfter = clamp(o.spaceAfter, 0, 5000);
  if (o.lastLine === 'center' || o.lastLine === 'right' || o.lastLine === 'all') out.lastLine = o.lastLine;
  if (o.bidi === 'ltr' || o.bidi === 'rtl') out.bidi = o.bidi;
  if (o.edge === 'start' || o.edge === 'end') out.edge = o.edge;
  return out;
}

const PARA_OWN = ['indentFirst', 'indentLeft', 'indentRight', 'spaceBefore', 'spaceAfter', 'lastLine', 'bidi', 'edge', 'align'] as const;

/** Saved per-paragraph settings read back: a list by paragraph, each field kept only when valid, entries past the last
 *  paragraph and empty ones at the end dropped. */
export function parasFrom(raw: unknown, count: number): ParaAttrs[] {
  if (!Array.isArray(raw)) return [];
  const out = raw.slice(0, count).map((r): ParaAttrs => {
    if (!r || typeof r !== 'object') return {};
    const o = r as Record<string, unknown>, p: ParaAttrs = pick(extrasFrom(o), PARA_KEYS);
    if (o.align === 'left' || o.align === 'center' || o.align === 'right' || o.align === 'justify') p.align = o.align;
    return p;
  });
  while (out.length && !Object.keys(out[out.length - 1]).length) out.pop();
  return out;
}

/** Paragraph settings with `patch` laid over them: a value sets the field, undefined clears it. */
export function withParaAttrs(p: ParaAttrs | undefined, patch: Partial<Record<keyof ParaAttrs, unknown>>): ParaAttrs {
  const out: Record<string, unknown> = { ...p };
  for (const k of PARA_OWN) {
    if (!(k in patch)) continue;
    if (patch[k] === undefined) delete out[k];
    else out[k] = patch[k];
  }
  return out as ParaAttrs;
}

/** A layer's paragraph settings with the named fields cleared from every paragraph, for a change made to the whole layer. */
export function dropParaKeys(paras: ParaAttrs[] | undefined, keys: readonly string[]): ParaAttrs[] | undefined {
  if (!paras?.length) return paras;
  const out = paras.map((p) => withParaAttrs(p, Object.fromEntries(keys.map((k) => [k, undefined]))));
  while (out.length && !Object.keys(out[out.length - 1]).length) out.pop();
  return out.length ? out : undefined;
}

/** Paragraph settings following an edit of the text from `was` to `now`: a paragraph split by a line break gives its
 *  settings to the new one, and joined paragraphs keep the first one's. */
export function shiftParas(paras: ParaAttrs[] | undefined, was: string, now: string): ParaAttrs[] | undefined {
  if (!paras?.length || was === now) return paras;
  const lines = (s: string): number => { let n = 0; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return n; };
  const max = Math.min(was.length, now.length);
  let head = 0, tail = 0;
  while (head < max && was[head] === now[head]) head++;
  while (tail < max - head && was[was.length - 1 - tail] === now[now.length - 1 - tail]) tail++;
  const at = lines(was.slice(0, head)), gone = lines(was.slice(head, was.length - tail)), added = lines(now.slice(head, now.length - tail));
  if (gone === added) return paras;
  const all: ParaAttrs[] = Array.from({ length: lines(was) + 1 }, (_, i) => paras[i] ?? {});
  const next = [...all.slice(0, at + 1), ...Array.from({ length: added }, () => ({ ...all[at] })), ...all.slice(at + 1 + gone)];
  while (next.length && !Object.keys(next[next.length - 1]).length) next.pop();
  return next.length ? next : undefined;
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
    ...pick(s, CHAR_KEYS),
  };
}

/** A character style from a type spec: its family, size, colour, weight, slant, tracking and features, all set, with the
 *  caps, scale, baseline shift, line and axis settings the spec has. */
export function charStyleOf(t: TextSpec, id: ID, name: string): CharacterStyle {
  return { id, name, family: t.family, size: t.size, color: { ...t.color }, bold: t.bold, italic: t.italic, tracking: t.tracking, features: cleanFeatures(t.features), ...pick(t, CHAR_KEYS) };
}

/** A run patch from command arguments (size, color as #rrggbb or {r,g,b}, family, weight, bold, italic, baseline_shift,
 *  tracking, language): a valid value sets that attribute, null clears it, `clear` true clears them all. */
export function runPatchFrom(a: Record<string, unknown> | undefined): RunPatch {
  const out: Record<string, unknown> = {};
  if (!a) return out;
  if (a.clear === true) { for (const k of RUN_KEYS) out[k] = null; return out; }
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const put = (key: string, from: string, ok: (v: unknown) => unknown): void => {
    if (a[from] === null) out[key] = null;
    else if (a[from] !== undefined) { const v = ok(a[from]); if (v !== undefined) out[key] = v; }
  };
  put('size', 'size', (v) => (fin(v) ? clamp(v, 1, 2000) : undefined));
  put('color', 'color', (v) => {
    if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim())) { const h = v.trim().replace('#', ''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; }
    const o = v as Record<string, unknown>;
    return o && typeof o === 'object' && fin(o.r) && fin(o.g) && fin(o.b) ? { r: Math.round(clamp(o.r, 0, 255)), g: Math.round(clamp(o.g, 0, 255)), b: Math.round(clamp(o.b, 0, 255)) } : undefined;
  });
  put('family', 'family', (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined));
  put('weight', 'weight', (v) => (fin(v) ? Math.round(clamp(v, 1, 1000)) : undefined));
  put('bold', 'bold', (v) => (typeof v === 'boolean' ? v : undefined));
  put('italic', 'italic', (v) => (typeof v === 'boolean' ? v : undefined));
  put('baselineShift', 'baseline_shift', (v) => (fin(v) ? clamp(v, -2000, 2000) : undefined));
  put('tracking', 'tracking', (v) => (fin(v) ? Math.round(clamp(v, -1000, 10000)) : undefined));
  put('language', 'language', (v) => (typeof v === 'string' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v) ? v : undefined));
  put('underline', 'underline', (v) => (typeof v === 'boolean' ? v || null : undefined));
  put('strike', 'strike', (v) => (typeof v === 'boolean' ? v || null : undefined));
  put('caps', 'caps', (v) => (v === 'all' || v === 'small' ? v : v === 'normal' ? null : undefined));
  put('scaleX', 'scale_x', (v) => (fin(v) ? (v === 100 ? null : clamp(v, 10, 500)) : undefined));
  put('scaleY', 'scale_y', (v) => (fin(v) ? (v === 100 ? null : clamp(v, 10, 500)) : undefined));
  return out as RunPatch;
}

/** The run attributes a character style sets (family, size, colour, weight, slant, tracking, baseline shift). */
export function runPatchOfStyle(s: CharacterStyle): RunPatch {
  return {
    ...(s.family !== undefined ? { family: s.family } : {}), ...(s.size !== undefined ? { size: s.size } : {}), ...(s.color !== undefined ? { color: { ...s.color } } : {}),
    ...(s.bold !== undefined ? { bold: s.bold } : {}), ...(s.italic !== undefined ? { italic: s.italic } : {}), ...(s.tracking !== undefined ? { tracking: s.tracking } : {}),
    ...(s.baselineShift !== undefined ? { baselineShift: s.baselineShift } : {}),
    ...(s.caps !== undefined ? { caps: s.caps } : {}), ...(s.underline !== undefined ? { underline: s.underline || null } : {}), ...(s.strike !== undefined ? { strike: s.strike || null } : {}),
    ...(s.scaleX !== undefined ? { scaleX: s.scaleX === 100 ? null : s.scaleX } : {}), ...(s.scaleY !== undefined ? { scaleY: s.scaleY === 100 ? null : s.scaleY } : {}),
  };
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
      ...pick(extrasFrom(o), CHAR_KEYS),
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
  return { points: pts, offset: fin(o.offset) ? Math.max(0, Math.min(100, o.offset)) : 0, frame: { w: f.w, h: f.h }, ...(o.flip === true ? { flip: true } : {}) };
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
    ...(TEXT_ANTIALIAS.some((m) => m === o.antialias) && o.antialias !== 'smooth' ? { antialias: o.antialias as TextSpec['antialias'] } : {}),
    ...(cleanFeatures(o.features).length ? { features: cleanFeatures(o.features) } : {}),
    ...(cleanRuns(o.runs, o.content.length).length ? { runs: cleanRuns(o.runs, o.content.length) } : {}),
    ...(() => { const paras = parasFrom(o.paras, (o.content as string).split('\n').length); return paras.length ? { paras } : {}; })(),
    ...(o.hyphenate === true ? { hyphenate: true } : {}),
    ...(o.shaping === 'eastAsian' || o.shaping === 'middleEastern' || o.shaping === 'southAsian' ? { shaping: o.shaping } : {}),
    ...(typeof o.language === 'string' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(o.language) ? { language: o.language } : {}),
    ...extrasFrom(o),
    lineHeight: num(o.lineHeight, d.lineHeight, 0.5, 4), tracking: Math.round(num(o.tracking, 0, -1000, 10000)), kerning: o.kerning === 'none' || o.kerning === 'optical' ? o.kerning : 'metrics',
    warp: warpFrom(o.warp), onPath: pathFrom(o.onPath), style: typeof o.style === 'string' && o.style ? o.style : null,
    ...(typeof o.charStyle === 'string' && o.charStyle ? { charStyle: o.charStyle } : {}),
    rendered: textKey(raster),
  };
}
