import type { Anchor, SubPath, VectorPath } from '../engine/paths';
import type { RGB } from '../engine/types';

/** File > Open SVG as Layers (DEV_PLAN 34.4): an SVG read into one editable shape per drawable element, in document
 *  order, with group transforms and the viewBox folded into the outlines. Text, gradients, clip paths, masks and symbols
 *  are not carried over (text and use are counted as skipped). */

export interface SvgShape { name: string; path: VectorPath; fill: RGB | null; stroke: { color: RGB; width: number } | null }
export interface SvgLayers { width: number; height: number; shapes: SvgShape[]; skipped: number }

type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];

/** a followed by b, so a point goes through b first. */
function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function numList(s: string): number[] { return (s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number); }

function parseTransform(s: string | null): Mat {
  let m = IDENT;
  if (!s) return m;
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const n = numList(args);
    let t: Mat | null = null;
    if (fn === 'matrix' && n.length >= 6) t = [n[0], n[1], n[2], n[3], n[4], n[5]];
    else if (fn === 'translate') t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
    else if (fn === 'scale') t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const a = ((n[0] ?? 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a), cx = n[1] ?? 0, cy = n[2] ?? 0;
      t = [cs, sn, -sn, cs, cx - cs * cx + sn * cy, cy - sn * cx - cs * cy];
    } else if (fn === 'skewX') t = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === 'skewY') t = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    if (t) m = mul(m, t);
  }
  return m;
}

// Colours -------------------------------------------------------------------------------------------------------------

const NAMED: Record<string, RGB> = {
  black: { r: 0, g: 0, b: 0 }, white: { r: 255, g: 255, b: 255 }, red: { r: 255, g: 0, b: 0 }, green: { r: 0, g: 128, b: 0 },
  blue: { r: 0, g: 0, b: 255 }, yellow: { r: 255, g: 255, b: 0 }, orange: { r: 255, g: 165, b: 0 }, purple: { r: 128, g: 0, b: 128 },
  gray: { r: 128, g: 128, b: 128 }, grey: { r: 128, g: 128, b: 128 }, cyan: { r: 0, g: 255, b: 255 }, magenta: { r: 255, g: 0, b: 255 },
  lime: { r: 0, g: 255, b: 0 }, navy: { r: 0, g: 0, b: 128 }, teal: { r: 0, g: 128, b: 128 }, maroon: { r: 128, g: 0, b: 0 },
  silver: { r: 192, g: 192, b: 192 }, pink: { r: 255, g: 192, b: 203 }, brown: { r: 165, g: 42, b: 42 }, gold: { r: 255, g: 215, b: 0 },
};

/** A paint value as a colour; null for none or transparent. A url() reference (gradient, pattern) falls back to grey. */
function parseColor(v: string): RGB | null {
  const s = v.trim().toLowerCase();
  if (s === 'none' || s === 'transparent' || s === '') return null;
  if (s === 'currentcolor') return { r: 0, g: 0, b: 0 };
  if (s.startsWith('url(')) return { r: 128, g: 128, b: 128 };
  const hex = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
    if (h.length === 6 || h.length === 8) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    return { r: 0, g: 0, b: 0 };
  }
  const fn = /^rgba?\(([^)]*)\)/.exec(s);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    const c = parts.map((p) => Math.max(0, Math.min(255, Math.round(p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)))));
    if (c.length === 3 && c.every((x) => Number.isFinite(x))) return { r: c[0], g: c[1], b: c[2] };
  }
  return NAMED[s] ?? { r: 0, g: 0, b: 0 };
}

// Path data -----------------------------------------------------------------------------------------------------------

type Seg = { t: 'M' | 'L'; x: number; y: number } | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number } | { t: 'Z' };

/** An SVG elliptical arc as cubic segments (the implementation notes of the SVG specification, F.6.5 and F.6.6). */
function arcToCubics(x0: number, y0: number, rxIn: number, ryIn: number, rotDeg: number, large: boolean, sweep: boolean, x: number, y: number): Seg[] {
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if ((x0 === x && y0 === y)) return [];
  if (rx === 0 || ry === 0) return [{ t: 'L', x, y }];
  const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x0 + x) / 2, cy = sp * cxp + cp * cyp + (y0 + y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  else if (sweep && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), step = dth / n, k = (4 / 3) * Math.tan(step / 4);
  const out: Seg[] = [];
  const pt = (a: number): [number, number] => [cx + rx * Math.cos(a) * cp - ry * Math.sin(a) * sp, cy + rx * Math.cos(a) * sp + ry * Math.sin(a) * cp];
  const dv = (a: number): [number, number] => [-rx * Math.sin(a) * cp - ry * Math.cos(a) * sp, -rx * Math.sin(a) * sp + ry * Math.cos(a) * cp];
  for (let i = 0; i < n; i++) {
    const a1 = th1 + i * step, a2 = a1 + step;
    const p1 = pt(a1), p2 = i === n - 1 ? ([x, y] as [number, number]) : pt(a2), d1 = dv(a1), d2 = dv(a2);
    out.push({ t: 'C', x1: p1[0] + k * d1[0], y1: p1[1] + k * d1[1], x2: p2[0] - k * d2[0], y2: p2[1] - k * d2[1], x: p2[0], y: p2[1] });
  }
  return out;
}

/** Path data as absolute M, L, C and Z segments: every command in absolute and relative form, S, Q and T raised to
 *  cubics, arcs split into cubics. A malformed tail stops the parse and keeps what was read. */
function pathSegments(d: string): Seg[] {
  const segs: Seg[] = [];
  const tokens = [...d.matchAll(/([a-zA-Z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g)].map((m) => m[1] ?? Number(m[2]));
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lqx = 0, lqy = 0, prev = '';
  const num = (): number => { const v = tokens[i++]; return typeof v === 'number' ? v : NaN; };
  const flag = (): boolean => num() !== 0;
  while (i < tokens.length) {
    const tk = tokens[i];
    if (typeof tk === 'string') { cmd = tk; i++; if (cmd === 'z' || cmd === 'Z') { segs.push({ t: 'Z' }); cx = sx; cy = sy; prev = 'Z'; continue; } }
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'Z') { i++; continue; }
    let ok = true;
    if (C === 'M') {
      const x = num() + ox, y = num() + oy;
      if (!Number.isFinite(x + y)) break;
      segs.push({ t: 'M', x, y }); cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; prev = 'M';
    } else if (C === 'L' || C === 'H' || C === 'V') {
      const x = C === 'V' ? cx : num() + ox, y = C === 'H' ? cy : num() + oy;
      if (!Number.isFinite(x + y)) break;
      segs.push({ t: 'L', x, y }); cx = x; cy = y; prev = 'L';
    } else if (C === 'C' || C === 'S') {
      let x1: number, y1: number;
      if (C === 'C') { x1 = num() + ox; y1 = num() + oy; } else if (prev === 'C') { x1 = 2 * cx - lcx; y1 = 2 * cy - lcy; } else { x1 = cx; y1 = cy; }
      const x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy;
      if (![x1, y1, x2, y2, x, y].every(Number.isFinite)) break;
      segs.push({ t: 'C', x1, y1, x2, y2, x, y }); lcx = x2; lcy = y2; cx = x; cy = y; prev = 'C';
    } else if (C === 'Q' || C === 'T') {
      let qx: number, qy: number;
      if (C === 'Q') { qx = num() + ox; qy = num() + oy; } else if (prev === 'Q') { qx = 2 * cx - lqx; qy = 2 * cy - lqy; } else { qx = cx; qy = cy; }
      const x = num() + ox, y = num() + oy;
      if (![qx, qy, x, y].every(Number.isFinite)) break;
      segs.push({ t: 'C', x1: cx + (2 / 3) * (qx - cx), y1: cy + (2 / 3) * (qy - cy), x2: x + (2 / 3) * (qx - x), y2: y + (2 / 3) * (qy - y), x, y });
      lqx = qx; lqy = qy; cx = x; cy = y; prev = 'Q';
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), la = flag(), sw = flag(), x = num() + ox, y = num() + oy;
      if (![rx, ry, rot, x, y].every(Number.isFinite)) break;
      segs.push(...arcToCubics(cx, cy, rx, ry, rot, la, sw, x, y)); cx = x; cy = y; prev = 'A';
    } else ok = false;
    if (!ok) break;
  }
  return segs;
}

/** Segments as a VectorPath with every point sent through `m` (exact for cubics, as the map is affine). */
function toVectorPath(segs: Seg[], m: Mat): VectorPath {
  const tx = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const subpaths: SubPath[] = [];
  let cur: Anchor[] | null = null, sp: SubPath | null = null;
  const anchor = (x: number, y: number): Anchor => { const [px, py] = tx(x, y); return { x: px, y: py, inX: px, inY: py, outX: px, outY: py }; };
  const begin = (x: number, y: number): void => { cur = [anchor(x, y)]; sp = { anchors: cur, closed: false }; subpaths.push(sp); };
  for (const s of segs) {
    if (s.t === 'M') begin(s.x, s.y);
    else if (s.t === 'Z') {
      if (cur && sp) {
        const first: Anchor = cur[0], last: Anchor = cur[cur.length - 1];
        if (cur.length > 1 && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) { first.inX = last.inX; first.inY = last.inY; cur.pop(); }
        sp.closed = true;
        const start = cur[0];
        cur = null; sp = null;
        // A segment after Z starts again at the subpath's start.
        begin2 = { x: start.x, y: start.y };
      }
    } else {
      if (!cur) { const b = begin2; if (!b) continue; cur = [{ x: b.x, y: b.y, inX: b.x, inY: b.y, outX: b.x, outY: b.y }]; sp = { anchors: cur, closed: false }; subpaths.push(sp); }
      const prevA: Anchor = cur[cur.length - 1];
      if (s.t !== 'C') cur.push(anchor(s.x, s.y));
      else {
        const [o1x, o1y] = tx(s.x1, s.y1), [i2x, i2y] = tx(s.x2, s.y2), a = anchor(s.x, s.y);
        prevA.outX = o1x; prevA.outY = o1y; a.inX = i2x; a.inY = i2y;
        cur.push(a);
      }
    }
  }
  return { subpaths: subpaths.filter((p) => p.anchors.length > 1) };
}
let begin2: { x: number; y: number } | null = null;

// Elements ------------------------------------------------------------------------------------------------------------

const f = (n: number): string => (Math.round(n * 1e4) / 1e4).toString();

function rectD(x: number, y: number, w: number, h: number, rxIn: number, ryIn: number): string {
  let rx = Math.min(rxIn, w / 2), ry = Math.min(ryIn, h / 2);
  if (rx <= 0 || ry <= 0) { rx = 0; ry = 0; }
  if (!rx) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
  return `M${f(x + rx)} ${f(y)}H${f(x + w - rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w)} ${f(y + ry)}V${f(y + h - ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w - rx)} ${f(y + h)}H${f(x + rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x)} ${f(y + h - ry)}V${f(y + ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + rx)} ${f(y)}Z`;
}

function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 1 ${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 1 ${f(cx + rx)} ${f(cy)}Z`;
}

interface Paint { fill: string; stroke: string; sw: number }

const SKIPPED = new Set(['defs', 'clippath', 'mask', 'symbol', 'text', 'use', 'image', 'foreignobject', 'pattern', 'marker']);
const IGNORED = new Set(['title', 'desc', 'metadata', 'style', 'lineargradient', 'radialgradient', 'filter', 'script', 'namedview']);

/** An SVG file as shapes in document order, sized by its width and height with the viewBox fitted in (else the
 *  viewBox, else 512 px square). */
export function svgToShapes(text: string): SvgLayers {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('That file is not a readable SVG.');
  const len = (v: string | null): number => { const n = v ? parseFloat(v) : NaN; return Number.isFinite(n) && n > 0 && !(v ?? '').trim().endsWith('%') ? n : NaN; };
  const vb = numList(root.getAttribute('viewBox') ?? '');
  let width = 512, height = 512, base: Mat = IDENT;
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    // The width and height when given (as a browser draws it), the viewBox fitted into them uniformly and centred
    // (preserveAspectRatio's default, xMidYMid meet); the viewBox's own size otherwise.
    const w = len(root.getAttribute('width')), h = len(root.getAttribute('height'));
    width = Number.isFinite(w) ? w : Number.isFinite(h) ? h * vb[2] / vb[3] : vb[2];
    height = Number.isFinite(h) ? h : Number.isFinite(w) ? w * vb[3] / vb[2] : vb[3];
    const s = Math.min(width / vb[2], height / vb[3]), ox = (width - vb[2] * s) / 2, oy = (height - vb[3] * s) / 2;
    base = [s, 0, 0, s, ox - vb[0] * s, oy - vb[1] * s];
  } else {
    const w = len(root.getAttribute('width')), h = len(root.getAttribute('height'));
    if (Number.isFinite(w)) width = w;
    if (Number.isFinite(h)) height = h;
  }
  width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
  const shapes: SvgShape[] = [];
  let skipped = 0;
  const counts = new Map<string, number>();

  const style = (el: Element): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const k of ['fill', 'stroke', 'stroke-width']) { const v = el.getAttribute(k); if (v !== null) o[k] = v; }
    for (const decl of (el.getAttribute('style') ?? '').split(';')) {
      const at = decl.indexOf(':');
      if (at > 0) o[decl.slice(0, at).trim().toLowerCase()] = decl.slice(at + 1).trim();
    }
    return o;
  };

  const walk = (el: Element, parent: Mat, inherited: Paint): void => {
    const tag = el.localName.toLowerCase();
    if (SKIPPED.has(tag)) { skipped++; return; }
    if (IGNORED.has(tag)) return;
    const st = style(el);
    const paint: Paint = { fill: st.fill ?? inherited.fill, stroke: st.stroke ?? inherited.stroke, sw: st['stroke-width'] !== undefined ? parseFloat(st['stroke-width']) : inherited.sw };
    const m = mul(parent, parseTransform(el.getAttribute('transform')));
    if (tag === 'g' || tag === 'svg' || tag === 'a' || tag === 'switch') {
      for (const child of Array.from(el.children)) walk(child, m, paint);
      return;
    }
    const a = (k: string): number => { const n = parseFloat(el.getAttribute(k) ?? ''); return Number.isFinite(n) ? n : 0; };
    let d = '';
    let open = false;
    if (tag === 'path') d = el.getAttribute('d') ?? '';
    else if (tag === 'rect') {
      const w = a('width'), h = a('height'), rxA = el.getAttribute('rx'), ryA = el.getAttribute('ry');
      const rx = rxA !== null ? a('rx') : ryA !== null ? a('ry') : 0, ry = ryA !== null ? a('ry') : rx;
      if (w > 0 && h > 0) d = rectD(a('x'), a('y'), w, h, rx, ry);
    } else if (tag === 'circle') { const r = a('r'); if (r > 0) d = ellipseD(a('cx'), a('cy'), r, r); }
    else if (tag === 'ellipse') {
      const rx = a('rx'), ry = a('ry');
      if (rx > 0 && ry > 0) d = ellipseD(a('cx'), a('cy'), rx, ry);
    } else if (tag === 'line') { d = `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`; open = true; }
    else if (tag === 'polyline' || tag === 'polygon') {
      const n = numList(el.getAttribute('points') ?? '');
      if (n.length >= 4) {
        d = 'M' + n.slice(0, n.length - (n.length % 2)).map((v, k) => (k % 2 === 0 && k > 0 ? `L${v}` : String(v))).join(' ');
        if (tag === 'polygon') d += 'Z'; else open = true;
      }
    } else return;
    const path = toVectorPath(pathSegments(d), m);
    if (!path.subpaths.length) return;
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    let fill = parseColor(paint.fill === '' ? 'black' : paint.fill);
    if (open) fill = tag === 'line' ? null : fill;
    const sc = parseColor(paint.stroke === '' ? 'none' : paint.stroke), sw = Number.isFinite(paint.sw) ? paint.sw : 1;
    const stroke = sc && sw * scale > 0 ? { color: sc, width: Math.max(0.1, sw * scale) } : null;
    if (!fill && !stroke) return;
    const id = el.getAttribute('id');
    let name = id && id.trim() ? id.trim().slice(0, 60) : '';
    if (!name) { const c = (counts.get(tag) ?? 0) + 1; counts.set(tag, c); name = `${tag} ${c}`; }
    shapes.push({ name, path, fill, stroke });
  };

  walk(root, base, { fill: 'black', stroke: 'none', sw: 1 });
  return { width, height, shapes, skipped };
}
