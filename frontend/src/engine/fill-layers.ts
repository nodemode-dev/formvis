import { mix32 } from './filters';
import { colorAt } from './gradients';
import { applyMat, boundsOf, intersectRect, placement } from './geometry';
import { patternById } from './patterns';
import { Raster } from './surface';
import { clamp, type FillContent, type FillStop, type Layer, type Pt, type Rect } from './types';

/* Fill layers (Layer > New Fill Layer, 1.66.0): the frame a fill is laid out in, its pixels, and its saved form. */

type Style = Extract<FillContent, { kind: 'gradient' }>['style'];

/** Where along a gradient fill (0 to 1) a point falls, for a fill laid out in `frame`. The gradient runs through the
 *  frame's centre, moved by `offset` (in fractions of the frame), at `angle` degrees counter-clockwise from the right,
 *  and at a `scale` of 1 spans the frame's whole extent along that angle: Linear from one end of it to the other,
 *  Reflected from the centre out both ways, Radial and Diamond from the centre to half of it, and Angle once round
 *  counter-clockwise from the angle. Worked out once for a whole layer's pixels. */
function gradientPosition(style: Style, angle: number, scale: number, reverse: boolean, offset: Pt, frame: Rect): (x: number, y: number) => number {
  const w = Math.max(1, frame.w), h = Math.max(1, frame.h), cx = frame.x + w * (0.5 + offset.x), cy = frame.y + h * (0.5 + offset.y);
  const a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = -Math.sin(a), extent = Math.max(1, (Math.abs(dx) * w + Math.abs(dy) * h) * Math.max(0.01, scale)), half = extent / 2;
  const t = (v: number): number => { const c = Math.min(1, Math.max(0, v)); return reverse ? 1 - c : c; };
  const along = (x: number, y: number): number => (x - cx) * dx + (y - cy) * dy, across = (x: number, y: number): number => (y - cy) * dx - (x - cx) * dy;
  switch (style) {
    case 'linear': return (x, y) => t(along(x, y) / extent + 0.5);
    case 'reflected': return (x, y) => t(Math.abs(along(x, y)) / half);
    case 'radial': return (x, y) => t(Math.hypot(x - cx, y - cy) / half);
    case 'diamond': return (x, y) => t((Math.abs(along(x, y)) + Math.abs(across(x, y))) / half);
    default: return (x, y) => { const turn = (Math.atan2(cy - y, x - cx) - a) / (2 * Math.PI); return t(turn - Math.floor(turn)); };
  }
}

/** A gradient's dither at a pixel: a fixed value from -0.5 to 0.5 added to each channel, a level of grain that keeps
 *  smooth ramps from banding. */
const ditherAt = (x: number, y: number): number => mix32(mix32(x | 0) ^ Math.imul(y | 0, 0x2545f491)) / 4294967296 - 0.5;

/** The frame a fill is laid out in: with a gradient's Align with Layer or a pattern's Link with Layer, the bounds of
 *  what the layer's mask shows (a fill made from a selection fits it); otherwise, or without a mask, the canvas. */
export function fillFrame(l: Layer, W: number, H: number): Rect {
  const canvas = { x: 0, y: 0, w: W, h: H }, c = l.fillContent, m = l.mask;
  const laid = c?.kind === 'gradient' ? c.align : c?.kind === 'pattern' ? c.link : false;
  if (!laid || !m?.enabled || !m.raster) return canvas;
  const r = m.raster, d = r.ctx.getImageData(0, 0, r.width, r.height).data;
  let x0 = r.width, y0 = r.height, x1 = -1, y1 = -1;
  for (let y = 0; y < r.height; y++) for (let x = 0, i = y * r.width * 4 + 3; x < r.width; x++, i += 4) {
    if (!d[i]) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    y1 = y;
  }
  if (x1 < 0) return canvas;
  const mat = placement(m.placement ?? l.transform, r.width, r.height);
  const b = boundsOf([applyMat(mat, x0, y0), applyMat(mat, x1 + 1, y0), applyMat(mat, x1 + 1, y1 + 1), applyMat(mat, x0, y1 + 1)]);
  const box = { x: Math.floor(b.x + 1e-6), y: Math.floor(b.y + 1e-6), w: 0, h: 0 };
  box.w = Math.ceil(b.x + b.w - 1e-6) - box.x;
  box.h = Math.ceil(b.y + b.h - 1e-6) - box.y;
  return intersectRect(box, canvas) ?? canvas;
}

/** A fill's pixels over a `W` by `H` canvas, laid out in `frame`; null when its pattern is not defined here. */
export function renderFill(c: FillContent, W: number, H: number, frame: Rect): Raster | null {
  if (c.kind === 'solid') return Raster.filled(W, H, `rgb(${c.color.r},${c.color.g},${c.color.b})`);
  const r = new Raster(W, H);
  if (c.kind === 'pattern') {
    const pat = patternById(c.pattern), fill = pat ? r.ctx.createPattern(pat.surface as CanvasImageSource, 'repeat') : null;
    if (!fill) return null;
    const origin = { x: (c.link ? frame.x : 0) + c.phase.x, y: (c.link ? frame.y : 0) + c.phase.y };
    fill.setTransform(new DOMMatrix().translateSelf(origin.x, origin.y).rotateSelf(-c.angle).scaleSelf(clamp(c.scale, 0.01, 10)));
    r.ctx.fillStyle = fill;
    r.ctx.fillRect(0, 0, W, H);
    r.touch();
    return r;
  }
  const stops = c.stops.map((s) => ({ at: clamp(s.at, 0, 1), rgb: s.color, alpha: clamp(s.alpha, 0, 1), mid: s.mid })).sort((a, b) => a.at - b.at);
  const N = 4096, lut = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) lut.set(colorAt(stops, i / (N - 1)), i * 4);
  const at = gradientPosition(c.style, c.angle, c.scale, c.reverse, c.offset, frame), img = new ImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = Math.round(at(x + 0.5, y + 0.5) * (N - 1)) * 4, o = (y * W + x) * 4, n = c.dither ? ditherAt(x, y) : 0;
    d[o] = lut[j] + n; d[o + 1] = lut[j + 1] + n; d[o + 2] = lut[j + 2] + n; d[o + 3] = lut[j + 3];
  }
  r.write(img);
  return r;
}

export type GradientFill = Extract<FillContent, { kind: 'gradient' }>;

/** The line a gradient fill is drawn along in `frame`, for editing on the canvas: from the 0 end to the 1 end for
 *  Linear, from the centre out to the 1 end for the other styles. */
export function fillLine(c: GradientFill, frame: Rect): { start: Pt; end: Pt } {
  const w = Math.max(1, frame.w), h = Math.max(1, frame.h), cx = frame.x + w * (0.5 + c.offset.x), cy = frame.y + h * (0.5 + c.offset.y);
  const a = (c.angle * Math.PI) / 180, dx = Math.cos(a), dy = -Math.sin(a), half = Math.max(1, (Math.abs(dx) * w + Math.abs(dy) * h) * Math.max(0.01, c.scale)) / 2;
  return { start: c.style === 'linear' ? { x: cx - dx * half, y: cy - dy * half } : { x: cx, y: cy }, end: { x: cx + dx * half, y: cy + dy * half } };
}

/** `c` redrawn along the line from `start` to `end` in `frame` (angle, scale and offset follow it); null for a line under a pixel. */
export function fillFromLine(c: GradientFill, frame: Rect, start: Pt, end: Pt): GradientFill | null {
  const dx = end.x - start.x, dy = end.y - start.y, len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const w = Math.max(1, frame.w), h = Math.max(1, frame.h), deg = (Math.atan2(-dy, dx) * 180) / Math.PI, a = (deg * Math.PI) / 180;
  const reach = Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * h, lin = c.style === 'linear';
  const mid = lin ? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } : start, r4 = (v: number): number => Math.round(v * 10000) / 10000;
  return { ...c, angle: Math.round(deg * 100) / 100, scale: r4(clamp((lin ? len : len * 2) / reach, 0.1, 1.5)), offset: { x: r4((mid.x - frame.x) / w - 0.5), y: r4((mid.y - frame.y) / h - 0.5) } };
}

/** A new stop at `at` (0 to 1) coloured as the gradient is there, the stops kept in order; its index is returned. */
export function addFillStop(c: GradientFill, at: number): { content: GradientFill; index: number } {
  const t = clamp(Math.round(at * 1000) / 1000, 0, 1), k = colorAt(c.stops.map((s) => ({ at: s.at, rgb: s.color, alpha: s.alpha })).sort((a, b) => a.at - b.at), t);
  const stops = [...c.stops, { at: t, color: { r: Math.round(k[0]), g: Math.round(k[1]), b: Math.round(k[2]) }, alpha: Math.round((k[3] / 255) * 1000) / 1000 }].sort((a, b) => a.at - b.at);
  return { content: { ...c, stops }, index: stops.findIndex((s) => s.at === t) };
}

/** A fill layer's default name: Color Fill, Gradient Fill or Pattern Fill. */
export const fillName = (c: FillContent): string => (c.kind === 'solid' ? 'Color Fill' : c.kind === 'gradient' ? 'Gradient Fill' : 'Pattern Fill');

/** A fill read back from saved data, every field checked and clamped; null when it is not one. */
export function fillContentFrom(raw: unknown): FillContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, n = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
  const rgb = (v: unknown) => { const q = (v ?? {}) as Record<string, unknown>; return { r: Math.round(n(q.r, 0, 255, 0)), g: Math.round(n(q.g, 0, 255, 0)), b: Math.round(n(q.b, 0, 255, 0)) }; };
  const pt = (v: unknown, lo: number, hi: number): Pt => { const q = (v ?? {}) as Record<string, unknown>; return { x: n(q.x, lo, hi, 0), y: n(q.y, lo, hi, 0) }; };
  if (o.kind === 'solid' && o.color && typeof o.color === 'object') return { kind: 'solid', color: rgb(o.color) };
  if (o.kind === 'gradient' && Array.isArray(o.stops)) {
    const stops: FillStop[] = o.stops.slice(0, 64).flatMap((s) => (s && typeof s === 'object' ? [{ at: n((s as FillStop).at, 0, 1, 0), color: rgb((s as FillStop).color), alpha: n((s as FillStop).alpha, 0, 1, 1), ...(typeof (s as FillStop).mid === 'number' ? { mid: n((s as FillStop).mid, 0.05, 0.95, 0.5) } : {}) }] : []));
    const style = (['linear', 'radial', 'angle', 'reflected', 'diamond'] as const).find((x) => x === o.style) ?? 'linear';
    return stops.length >= 2 ? { kind: 'gradient', stops, style, angle: n(o.angle, -360, 360, 90), scale: n(o.scale, 0.1, 1.5, 1), reverse: o.reverse === true, dither: o.dither === true, align: o.align !== false, offset: pt(o.offset, -10, 10) } : null;
  }
  if (o.kind === 'pattern' && typeof o.pattern === 'string' && o.pattern) return { kind: 'pattern', pattern: o.pattern.slice(0, 120), scale: n(o.scale, 0.01, 10, 1), angle: n(o.angle, -180, 180, 0), link: o.link !== false, phase: pt(o.phase, -1e6, 1e6) };
  return null;
}
