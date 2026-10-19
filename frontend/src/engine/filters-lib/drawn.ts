import type { LibContext, LibFilter, LibPath, LibValues } from '../filter-library';
import { boxOf, clipBox, copyImage, hash01, type Box } from './shared';

const num = (v: LibValues, k: string): number => v[k] as number;
const str = (v: LibValues, k: string): string => v[k] as string;

/* Render > Flame, Picture Frame and Tree: drawings built from marks in document pixels, so a preview, a band or a
   repeat draws the same picture, then painted over the frame. */

type RGB = readonly [number, number, number];
type RGBA = readonly [number, number, number, number];
type Area = { x: number; y: number; w: number; h: number };

const rgbOf = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16) || 0, parseInt(hex.slice(3, 5), 16) || 0, parseInt(hex.slice(5, 7), 16) || 0];
const tint = (c: RGB, k: number, a = 1): RGBA => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), a];
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A mark: a round-ended stroke from A to B whose radius runs from `ra` to `rb` (a dot where A and B meet), its edge
 *  softened over `soft` pixels, in a colour with an opacity. */
interface Mark { ax: number; ay: number; bx: number; by: number; ra: number; rb: number; soft: number; c: RGBA }
const stroke = (ax: number, ay: number, bx: number, by: number, ra: number, rb: number, c: RGBA, soft = 1): Mark => ({ ax, ay, bx, by, ra, rb, soft, c });
const dot = (x: number, y: number, r: number, c: RGBA, soft = 1): Mark => ({ ax: x, ay: y, bx: x, by: y, ra: r, rb: r, soft, c });

/** Paints the marks in order on a clear sheet over `clip`, then lays the sheet over the image there. */
function paint(src: ImageData, marks: readonly Mark[], clip: Box): ImageData {
  const out = copyImage(src), d = out.data, w = src.width, cw = clip.x1 - clip.x0, ch = clip.y1 - clip.y0, sheet = new Float32Array(cw * ch * 4);
  for (const m of marks) {
    const pad = Math.max(m.ra, m.rb) + m.soft + 1;
    const x0 = Math.max(clip.x0, Math.floor(Math.min(m.ax, m.bx) - pad)), x1 = Math.min(clip.x1, Math.ceil(Math.max(m.ax, m.bx) + pad));
    const y0 = Math.max(clip.y0, Math.floor(Math.min(m.ay, m.by) - pad)), y1 = Math.min(clip.y1, Math.ceil(Math.max(m.ay, m.by) + pad));
    const dx = m.bx - m.ax, dy = m.by - m.ay, len2 = dx * dx + dy * dy;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const px = x + 0.5, py = y + 0.5, t = len2 > 0 ? Math.min(1, Math.max(0, ((px - m.ax) * dx + (py - m.ay) * dy) / len2)) : 0;
      const r = m.ra + (m.rb - m.ra) * t, dist = Math.hypot(px - m.ax - dx * t, py - m.ay - dy * t), cover = Math.min(1, Math.max(0, (r - dist) / m.soft + 0.5));
      if (cover <= 0) continue;
      const a = cover * m.c[3], i = ((y - clip.y0) * cw + x - clip.x0) * 4;
      sheet[i] = m.c[0] * a + sheet[i] * (1 - a); sheet[i + 1] = m.c[1] * a + sheet[i + 1] * (1 - a); sheet[i + 2] = m.c[2] * a + sheet[i + 2] * (1 - a); sheet[i + 3] = a + sheet[i + 3] * (1 - a);
    }
  }
  for (let y = clip.y0; y < clip.y1; y++) for (let x = clip.x0; x < clip.x1; x++) {
    const i = ((y - clip.y0) * cw + x - clip.x0) * 4, a = sheet[i + 3];
    if (a <= 0) continue;
    const o = (y * w + x) * 4, da = d[o + 3] / 255, outA = a + da * (1 - a);
    for (let c = 0; c < 3; c++) d[o + c] = (sheet[i + c] + d[o + c] * da * (1 - a)) / outA;
    d[o + 3] = outA * 255;
  }
  return out;
}

/** Builds marks in document pixels for the frame (the selection or canvas, in document pixels), maps them into this
 *  image through the canvas's place and scale in it, and paints them inside both the frame and the canvas. */
function drawn(src: ImageData, ctx: LibContext, build: (area: Area, doc: { w: number; h: number }) => Mark[]): ImageData {
  const { canvas, area, doc } = ctx, kx = canvas.w / Math.max(1, doc.w), ky = canvas.h / Math.max(1, doc.h), k = (kx + ky) / 2;
  if (!(kx > 0 && ky > 0)) return copyImage(src);
  const marks = build({ x: (area.x - canvas.x) / kx, y: (area.y - canvas.y) / ky, w: area.w / kx, h: area.h / ky }, doc).map((m) => ({
    ...m, ax: canvas.x + m.ax * kx, ay: canvas.y + m.ay * ky, bx: canvas.x + m.bx * kx, by: canvas.y + m.by * ky, ra: m.ra * k, rb: m.rb * k, soft: Math.max(0.6, m.soft * k),
  }));
  const a = boxOf(area), c = boxOf(canvas), clip = clipBox({ x0: Math.max(a.x0, c.x0), y0: Math.max(a.y0, c.y0), x1: Math.min(a.x1, c.x1), y1: Math.min(a.y1, c.y1) }, src.width, src.height);
  return clip ? paint(src, marks, clip) : copyImage(src);
}

/** A path parameter's polylines in this document's pixels. */
const pathLines = (path: LibPath | null, doc: { w: number; h: number }): Array<Array<[number, number]>> =>
  !path ? [] : path.lines.map((l) => Array.from({ length: l.length >> 1 }, (_, i): [number, number] => [(l[i * 2] * doc.w) / path.w0, (l[i * 2 + 1] * doc.h) / path.h0]));

/** Points every `step` pixels along a polyline, each with the unit tangent there. */
function along(line: ReadonlyArray<readonly [number, number]>, step: number): Array<{ x: number; y: number; tx: number; ty: number }> {
  const out: Array<{ x: number; y: number; tx: number; ty: number }> = [];
  if (line.length === 1) return [{ x: line[0][0], y: line[0][1], tx: 1, ty: 0 }];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1], [x1, y1] = line[i], len = Math.hypot(x1 - x0, y1 - y0);
    if (!len) continue;
    for (let t = carry; t <= len; t += step) out.push({ x: x0 + ((x1 - x0) * t) / len, y: y0 + ((y1 - y0) * t) / len, tx: (x1 - x0) / len, ty: (y1 - y0) / len });
    carry = (step - ((len - carry) % step)) % step;
  }
  return out;
}

/** Smooth noise along one line, -1 to 1. */
function wobble(t: number, seed: number, key: number): number {
  const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f), a = hash01(i, key, 3, seed) * 2 - 1, b = hash01(i + 1, key, 3, seed) * 2 - 1;
  return a + (b - a) * s;
}

interface FlameSpec { type: string; length: number; randomizeLength: boolean; width: number; angle: number; interval: number; adjustLoops: boolean; color: RGB | null; turbulent: number; jag: number; opacity: number; lines: number; bottom: number; style: string; shape: string; randomizeShapes: boolean; seed: number; quality: number }

const FIRE: readonly RGB[] = [[150, 20, 0], [230, 70, 0], [255, 150, 20], [255, 215, 90], [255, 250, 220]];

/** One flame: tongues rising from (x, y) along the unit direction (ux, uy), tapering to points, their sway from
 *  Turbulent and Jag, their spread from the flame's shape, coloured from the outer red to a pale core. */
function flame(o: FlameSpec, x: number, y: number, ux: number, uy: number, len: number, wid: number, key: number): Mark[] {
  const marks: Mark[] = [], n = Math.max(1, Math.round(o.lines / 4)), segs = [6, 10, 16, 24, 32][Math.max(0, o.quality)] ?? 16;
  const shape = o.randomizeShapes ? ['parallel', 'toCenter', 'spread', 'oval', 'pointed'][Math.floor(hash01(key, 1, 9, o.seed) * 5)] : o.shape;
  const sway = (o.turbulent / 100) * (o.style === 'violent' ? 1.8 : 1), jag = (o.jag / 100) * (o.style === 'violent' ? 1.5 : 1), flat = o.style === 'flat' ? 0.6 : 1;
  const nx = -uy, ny = ux;
  for (let layer = 0; layer < FIRE.length; layer++) {
    const shrink = 1 - layer * 0.17, col = o.color ? mixRgb(o.color, [255, 255, 235], layer / (FIRE.length * 1.3)) : FIRE[layer];
    for (let k = 0; k < n; k++) {
      const across = n === 1 ? 0 : (k / (n - 1) - 0.5) * wid * 0.6 * shrink, lift = (1 - o.bottom / 100) * (hash01(key, k, 7, o.seed) - 0.5) * len * 0.25;
      const tl = len * shrink * flat * (0.75 + 0.25 * hash01(key, k, 8, o.seed)), base = (wid / Math.max(1, Math.sqrt(n))) * 0.5 * shrink;
      let px = x + nx * across + ux * lift, py = y + ny * across + uy * lift;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs, lean = shape === 'toCenter' ? -across * t : shape === 'spread' ? across * t * 0.8 : 0;
        const side = wobble(t * 3 + k * 1.7 + layer * 0.3, o.seed, key * 31 + k) * sway * wid * 0.45 * t + wobble(t * 14 + k, o.seed, key * 17 + k + 5) * jag * wid * 0.12 * t;
        const qx = x + nx * (across + lean + side) + ux * (lift + tl * t), qy = y + ny * (across + lean + side) + uy * (lift + tl * t);
        const prof = (tt: number): number => (shape === 'oval' ? Math.sin(Math.PI * Math.min(1, tt * 0.9 + 0.1)) : shape === 'pointed' ? (1 - tt) ** 1.6 : 1 - tt);
        marks.push(stroke(px, py, qx, qy, base * prof(t - 1 / segs), base * prof(t), [col[0], col[1], col[2], (o.opacity / 100) * (0.35 + 0.12 * layer)], 1.5));
        px = qx; py = qy;
      }
    }
  }
  return marks;
}

/** A candle's flame: a narrow teardrop with a pale core and a bluish foot. */
function candle(o: FlameSpec, x: number, y: number, len: number, wid: number): Mark[] {
  const h = len * 0.5, r = wid * 0.18, a = o.opacity / 100;
  return [
    stroke(x, y, x, y - h, r * 1.3, 0, [255, 120, 30, a * 0.5], 2),
    stroke(x, y - h * 0.05, x, y - h * 0.8, r, 0, [255, 200, 70, a * 0.8], 1.5),
    stroke(x, y - h * 0.1, x, y - h * 0.5, r * 0.55, 0, [255, 252, 230, a], 1),
    dot(x, y - r * 0.2, r * 0.45, [90, 120, 255, a * 0.6], 1.5),
  ];
}

function flameMarks(o: FlameSpec, lines: Array<Array<[number, number]>>): Mark[] {
  const marks: Mark[] = [], t = (o.angle * Math.PI) / 180, ux = Math.sin(t), uy = -Math.cos(t);
  let key = 0;
  for (const line of lines) {
    const spots = along(line, o.type === 'oneFlameAlongPath' ? Math.max(2, o.width * 0.4) : Math.max(2, o.interval));
    for (const p of spots) {
      key++;
      const various = o.type === 'multipleFlamesVariousLength' || o.randomizeLength, len = o.length * (various ? 0.45 + 0.8 * hash01(key, 0, 2, o.seed) : 1);
      if (o.type === 'candleLight') { marks.push(...candle(o, p.x, p.y, len, o.width)); continue; }
      const [dx, dy] = o.type === 'multipleFlamesPathDirections' ? [p.ty, -p.tx] : [ux, uy];
      marks.push(...flame(o, p.x, p.y, dx, dy, len, o.width, key));
    }
  }
  return marks;
}

const FRAME_STYLES: ReadonlyArray<readonly [string, string]> = [
  ['vineWithFlowers', 'Vine with Flowers'], ['vine', 'Vine'], ['leafGarland', 'Leaf Garland'], ['flowerBorder', 'Flower Border'], ['berries', 'Berries'],
  ['ribbon', 'Ribbon'], ['waves', 'Waves'], ['zigzag', 'Zigzag'], ['dots', 'Dots'], ['rope', 'Rope'], ['scallops', 'Scallops'], ['lines', 'Lines'],
  ['stars', 'Stars'], ['hearts', 'Hearts'], ['snowflakes', 'Snowflakes'], ['bamboo', 'Bamboo'],
];

interface FrameSpec { style: string; margin: number; size: number; arrangement: number; lines: number; thickness: number; fade: number; vine: RGB; flower: RGB; leaf: RGB; seed: number }

/** The frame's border as one closed run of points inset into the area, each with its unit inward normal. */
function border(area: Area, inset: number, step: number): Array<{ x: number; y: number; nx: number; ny: number; tx: number; ty: number }> {
  const x0 = area.x + inset, y0 = area.y + inset, x1 = area.x + area.w - inset, y1 = area.y + area.h - inset, out: Array<{ x: number; y: number; nx: number; ny: number; tx: number; ty: number }> = [];
  const side = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number): void => {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) out.push({ x: ax + ((bx - ax) * i) / n, y: ay + ((by - ay) * i) / n, nx, ny, tx: (bx - ax) / len, ty: (by - ay) / len });
  };
  side(x0, y0, x1, y0, 0, 1); side(x1, y0, x1, y1, -1, 0); side(x1, y1, x0, y1, 0, -1); side(x0, y1, x0, y0, 1, 0);
  return out;
}

/** A small motif: a five-petal flower, a leaf, a berry cluster, a star, a heart or a snowflake, at (x, y). */
function motif(kind: string, x: number, y: number, s: number, o: FrameSpec, angle: number, alpha: number): Mark[] {
  const m: Mark[] = [];
  if (kind === 'flower') {
    for (let i = 0; i < 5; i++) { const a = angle + (i * 2 * Math.PI) / 5; m.push(dot(x + Math.cos(a) * s * 0.45, y + Math.sin(a) * s * 0.45, s * 0.33, tint(o.flower, 1, alpha))); }
    m.push(dot(x, y, s * 0.22, [255, 220, 90, alpha]));
  } else if (kind === 'leaf') m.push(stroke(x, y, x + Math.cos(angle) * s * 1.1, y + Math.sin(angle) * s * 1.1, s * 0.32, 0, tint(o.leaf, 1, alpha)));
  else if (kind === 'berries') for (let i = 0; i < 3; i++) m.push(dot(x + Math.cos(angle + i * 2.1) * s * 0.28, y + Math.sin(angle + i * 2.1) * s * 0.28, s * 0.22, tint(o.flower, 0.8 + 0.1 * i, alpha)));
  else if (kind === 'star') for (let i = 0; i < 5; i++) { const a = angle + (i * 2 * Math.PI) / 5 - Math.PI / 2; m.push(stroke(x, y, x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.16, 0.5, tint(o.flower, 1, alpha))); }
  else if (kind === 'heart') m.push(dot(x - s * 0.18, y - s * 0.1, s * 0.22, tint(o.flower, 1, alpha)), dot(x + s * 0.18, y - s * 0.1, s * 0.22, tint(o.flower, 1, alpha)), stroke(x - s * 0.3, y, x, y + s * 0.38, s * 0.12, 0.6, tint(o.flower, 1, alpha)), stroke(x + s * 0.3, y, x, y + s * 0.38, s * 0.12, 0.6, tint(o.flower, 1, alpha)));
  else if (kind === 'snow') for (let i = 0; i < 6; i++) {
    const a = angle + (i * Math.PI) / 3, ex = x + Math.cos(a) * s * 0.55, ey = y + Math.sin(a) * s * 0.55;
    m.push(stroke(x, y, ex, ey, s * 0.05, s * 0.05, [235, 245, 255, alpha]));
    for (const b of [-0.6, 0.6]) m.push(stroke(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3, x + Math.cos(a) * s * 0.3 + Math.cos(a + b) * s * 0.2, y + Math.sin(a) * s * 0.3 + Math.sin(a + b) * s * 0.2, s * 0.04, s * 0.04, [235, 245, 255, alpha]));
  }
  return m;
}

/** Picture Frame: a border inset by Margin around the frame, drawn in the chosen style: a vine with flowers, leaves or
 *  berries, a ribbon, waves, a zigzag, dots, rope, scallops, plain lines, or a row of stars, hearts, snowflakes or
 *  bamboo canes. Size scales its parts, Arrangement spaces them, Number of Lines repeats line styles inward, Thickness
 *  sets their weight and Fade lightens the repeats. */
function frameMarks(o: FrameSpec, area: Area): Mark[] {
  const short = Math.max(1, Math.min(area.w, area.h)), s = short * 0.06 * (0.3 + o.size / 70), inset = short * (o.margin / 100) + s, gap = s * (1.4 + o.arrangement / 40);
  const th = Math.max(0.6, s * 0.12 * (0.3 + o.thickness / 40)), marks: Mark[] = [], alphaAt = (k: number): number => 1 - (o.fade / 100) * (k / Math.max(1, o.lines));
  const pts = border(area, inset, Math.max(1, s * 0.25)), run = (f: (p: (typeof pts)[number], i: number) => [number, number], col: RGBA, width: number): void => {
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = f(pts[i], i), [bx, by] = f(pts[(i + 1) % pts.length], i + 1);
      marks.push(stroke(ax, ay, bx, by, width, width, col, 0.8));
    }
  };
  const phase = (i: number): number => (i * s * 0.25 * 2 * Math.PI) / gap;
  const style = o.style;
  for (let k = 0; k < Math.max(1, Math.round(o.lines)); k++) {
    const off = k * s * 0.9, a = alphaAt(k), at = (p: (typeof pts)[number], d: number): [number, number] => [p.x + p.nx * (off + d), p.y + p.ny * (off + d)];
    if (style === 'waves') run((p, i) => at(p, Math.sin(phase(i)) * s * 0.35), tint(o.vine, 1, a), th);
    else if (style === 'zigzag') run((p, i) => at(p, (Math.abs(((phase(i) / Math.PI) % 2) - 1) - 0.5) * s * 0.7), tint(o.vine, 1, a), th);
    else if (style === 'rope') { run((p, i) => at(p, Math.sin(phase(i)) * s * 0.18), tint(o.vine, 1.15, a), th * 1.4); run((p, i) => at(p, -Math.sin(phase(i)) * s * 0.18), tint(o.vine, 0.75, a), th * 1.4); }
    else if (style === 'lines' || k > 0 && !['vine', 'vineWithFlowers', 'leafGarland', 'berries'].includes(style)) run((p) => at(p, 0), tint(o.vine, 1, a), th);
    if (k > 0) continue;
    if (['vine', 'vineWithFlowers', 'leafGarland', 'berries'].includes(style)) {
      run((p, i) => at(p, Math.sin(phase(i)) * s * 0.3), tint(o.vine, 1, a), th);
      for (let i = 0; i < pts.length; i += Math.max(1, Math.round(gap / (s * 0.25)))) {
        const p = pts[i], side = Math.sin(phase(i)) >= 0 ? 1 : -1, [x, y] = at(p, Math.sin(phase(i)) * s * 0.3), ang = Math.atan2(p.ty, p.tx) + side * 0.9 + (hash01(i, 0, 1, o.seed) - 0.5) * 0.6;
        marks.push(...motif('leaf', x, y, s * 0.8, o, ang, a));
        if (style === 'vineWithFlowers' && hash01(i, 1, 2, o.seed) < 0.45) marks.push(...motif('flower', x + p.nx * s * 0.2, y + p.ny * s * 0.2, s * 0.7, o, hash01(i, 2, 3, o.seed) * 6, a));
        if (style === 'berries' && hash01(i, 1, 4, o.seed) < 0.5) marks.push(...motif('berries', x, y, s * 0.8, o, hash01(i, 2, 5, o.seed) * 6, a));
      }
      continue;
    }
    const step = Math.max(1, Math.round(gap / (s * 0.25)));
    for (let i = 0; i < pts.length; i += step) {
      const p = pts[i], [x, y] = at(p, 0), turn = hash01(i, 0, 6, o.seed) * Math.PI * 2;
      if (style === 'flowerBorder') marks.push(...motif('flower', x, y, s, o, turn, a));
      else if (style === 'dots') marks.push(dot(x, y, s * 0.22, tint(o.flower, 1, a)));
      else if (style === 'stars') marks.push(...motif('star', x, y, s, o, turn * 0.2, a));
      else if (style === 'hearts') marks.push(...motif('heart', x, y, s, o, 0, a));
      else if (style === 'snowflakes') marks.push(...motif('snow', x, y, s, o, turn, a));
      else if (style === 'scallops') for (let q = 0; q <= 8; q++) { const t = (q / 8) * Math.PI, cx = x + p.tx * Math.cos(t) * gap * 0.5, cy = y + p.ty * Math.cos(t) * gap * 0.5; marks.push(dot(cx + p.nx * Math.sin(t) * s * 0.4, cy + p.ny * Math.sin(t) * s * 0.4, th, tint(o.vine, 1, a))); }
      else if (style === 'ribbon') marks.push(stroke(x - p.tx * gap * 0.35, y - p.ty * gap * 0.35, x + p.tx * gap * 0.35 + p.nx * s * 0.3, y + p.ty * gap * 0.35 + p.ny * s * 0.3, s * 0.18, s * 0.18, tint(o.flower, (i / step) % 2 ? 0.8 : 1.1, a)));
      else if (style === 'bamboo') { marks.push(stroke(x - p.tx * gap * 0.45, y - p.ty * gap * 0.45, x + p.tx * gap * 0.45, y + p.ty * gap * 0.45, s * 0.16, s * 0.16, tint(o.leaf, 1, a))); marks.push(dot(x + p.tx * gap * 0.45, y + p.ty * gap * 0.45, s * 0.2, tint(o.leaf, 0.7, a))); }
    }
  }
  return marks;
}

/** A tree kind: how it grows (broad crowns branch, conifers tier, columns rise narrow, palms and bamboo fan or stand in
 *  canes, shrubs spread low, weeping crowns hang), its leaf, colours, and any fruit or blossom. */
interface TreeKind { id: string; name: string; form: 'broad' | 'conifer' | 'column' | 'palm' | 'bamboo' | 'shrub' | 'weeping' | 'bare'; spread: number; leaf: RGB; bark: RGB; extra?: RGB }
const T = (id: string, name: string, form: TreeKind['form'], spread: number, leaf: RGB, bark: RGB, extra?: RGB): TreeKind => ({ id, name, form, spread, leaf, bark, extra });
const BARK: RGB = [92, 66, 44], GREEN: RGB = [64, 128, 48], DEEP: RGB = [34, 88, 48];
const TREES: readonly TreeKind[] = [
  T('oak', 'Oak', 'broad', 0.75, GREEN, BARK), T('maple', 'Maple', 'broad', 0.65, [86, 140, 40], BARK), T('autumnMaple', 'Autumn Maple', 'broad', 0.65, [214, 92, 30], BARK),
  T('birch', 'Birch', 'broad', 0.45, [118, 166, 56], [226, 222, 212]), T('elm', 'Elm', 'broad', 0.85, [72, 130, 56], BARK), T('apple', 'Apple', 'broad', 0.7, GREEN, BARK, [214, 30, 30]),
  T('cherryBlossom', 'Cherry Blossom', 'broad', 0.7, [244, 186, 206], [74, 50, 42]), T('olive', 'Olive', 'broad', 0.6, [120, 140, 100], [120, 112, 100]),
  T('willow', 'Weeping Willow', 'weeping', 0.8, [118, 160, 60], [96, 88, 76]), T('pine', 'Pine', 'conifer', 0.42, DEEP, BARK), T('fir', 'Fir', 'conifer', 0.36, [30, 96, 60], BARK),
  T('spruce', 'Spruce', 'conifer', 0.3, [26, 76, 52], BARK), T('cypress', 'Cypress', 'column', 0.16, DEEP, BARK), T('poplar', 'Poplar', 'column', 0.2, [84, 140, 50], [120, 112, 100]),
  T('palm', 'Palm', 'palm', 0.5, [70, 130, 46], [140, 118, 84]), T('coconutPalm', 'Coconut Palm', 'palm', 0.55, [76, 140, 40], [150, 126, 92], [110, 80, 40]),
  T('bamboo', 'Bamboo', 'bamboo', 0.3, [96, 156, 56], [140, 166, 76]), T('shrub', 'Shrub', 'shrub', 1.2, GREEN, BARK), T('bareWinterTree', 'Bare Winter Tree', 'bare', 0.7, GREEN, [80, 68, 60]),
  T('beech', 'Beech', 'broad', 0.7, [92, 128, 44], [132, 122, 110]), T('ash', 'Ash', 'broad', 0.6, [104, 150, 62], [112, 104, 92]), T('linden', 'Linden', 'broad', 0.8, [98, 152, 70], BARK),
  T('chestnut', 'Chestnut', 'broad', 0.8, [58, 112, 44], BARK, [120, 78, 36]), T('aspen', 'Aspen', 'column', 0.26, [188, 190, 70], [222, 218, 204]), T('plumBlossom', 'Plum Blossom', 'broad', 0.65, [236, 150, 182], [66, 46, 40]),
  T('pear', 'Pear', 'broad', 0.55, [112, 156, 60], BARK, [196, 190, 60]), T('orange', 'Orange Tree', 'broad', 0.6, [54, 120, 50], BARK, [238, 140, 30]), T('jacaranda', 'Jacaranda', 'broad', 0.8, [150, 120, 196], [96, 78, 64]),
  T('acacia', 'Acacia', 'broad', 1.05, [118, 142, 58], [98, 80, 62]), T('redwood', 'Redwood', 'conifer', 0.24, [38, 96, 56], [130, 70, 50]), T('cedar', 'Cedar', 'conifer', 0.5, [44, 100, 70], [112, 82, 62]),
  T('larch', 'Larch', 'conifer', 0.38, [170, 170, 60], BARK), T('datePalm', 'Date Palm', 'palm', 0.45, [92, 134, 52], [150, 124, 90], [176, 110, 40]), T('autumnBirch', 'Autumn Birch', 'broad', 0.45, [226, 168, 40], [226, 222, 212]),
];

interface TreeSpec { kind: string; light: number; amount: number; leafSize: number; branchHeight: number; thickness: number; leafColor: RGB | null; branchColor: RGB | null; flat: boolean; seed: number; x: number; y: number; size: number }

/** Tree: a tree of the chosen kind standing at Position X and Base Y with its height a share of the frame, its
 *  branches' height and thickness and its leaves' amount and size as set, lit from Light Direction (1 the left, 3
 *  above, 5 the right) unless Flat Shading. */
function treeMarks(o: TreeSpec, area: Area): Mark[] {
  const kind = TREES.find((t) => t.id === o.kind) ?? TREES[0], H = area.h * o.size * 0.9, x0 = area.x + area.w * o.x, y0 = area.y + area.h * o.y;
  const bark = o.branchColor ?? kind.bark, leafCol = o.leafColor ?? kind.leaf, lightX = (o.light - 3) / 2, marks: Mark[] = [], tips: Array<[number, number]> = [];
  const thick = H * 0.035 * (o.thickness / 100), rnd = (a: number, b: number): number => hash01(a, b, 13, o.seed);
  const shadeAt = (dx: number): number => (o.flat ? 1 : 1 + Math.max(-0.35, Math.min(0.3, dx * lightX * 0.6)));
  const limb = (x: number, y: number, ang: number, len: number, r: number, depth: number, id: number): void => {
    const ex = x + Math.sin(ang) * len, ey = y - Math.cos(ang) * len;
    marks.push(stroke(x, y, ex, ey, r, r * 0.68, tint(bark, shadeAt(Math.sin(ang)), 1), 1));
    if (depth <= 0 || r < 0.4) { tips.push([ex, ey]); return; }
    const kids = 2 + (rnd(id, depth) < 0.35 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const turn = (k - (kids - 1) / 2) * kind.spread * 0.9 + (rnd(id * 7 + k, depth) - 0.5) * 0.5;
      limb(ex, ey, ang + turn, len * (0.68 + 0.14 * rnd(id * 5 + k, depth + 9)), r * 0.68, depth - 1, id * 4 + k + 1);
    }
  };
  const leaves = (cx: number, cy: number, reach: number, count: number, col: RGB, size: number): void => {
    for (let i = 0; i < count; i++) {
      const a = rnd(i, 21) * Math.PI * 2, d = Math.sqrt(rnd(i, 22)) * reach, lx = cx + Math.cos(a) * d, ly = cy + Math.sin(a) * d * 0.8;
      marks.push(dot(lx, ly, size * (0.7 + 0.6 * rnd(i, 23)), tint(col, shadeAt((lx - cx) / Math.max(1, reach)) * (0.85 + 0.25 * rnd(i, 24)), 0.95), 1));
    }
  };
  const leafSize = H * 0.018 * (o.leafSize / 100), amount = o.amount / 100, trunk = H * 0.32 * (o.branchHeight / 100);
  if (kind.form === 'conifer' || kind.form === 'column') {
    marks.push(stroke(x0, y0, x0, y0 - H, thick, thick * 0.3, tint(bark, 1, 1)));
    const tiers = kind.form === 'column' ? 30 : 14;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, y = y0 - trunk * 0.4 - (H - trunk * 0.4) * t, half = H * kind.spread * (1 - t) * (kind.form === 'column' ? 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)) : 1);
      for (const side of [-1, 1]) {
        marks.push(stroke(x0, y, x0 + side * half, y + half * 0.35, Math.max(0.6, thick * 0.35), 0.5, tint(bark, 0.9, 1)));
        if (amount > 0) for (let k = 0; k <= 6; k++) { const f = k / 6, px = x0 + side * half * f, py = y + half * 0.35 * f; marks.push(stroke(px, py, px + side * leafSize * 1.6, py + leafSize * 1.4, leafSize * 0.9 * (0.4 + amount), 0.6, tint(leafCol, shadeAt(side * f), 0.95))); }
      }
    }
    return marks;
  }
  if (kind.form === 'palm') {
    let px = x0, py = y0;
    const bend = (rnd(1, 1) - 0.5) * 0.6;
    for (let i = 1; i <= 12; i++) { const t = i / 12, qx = x0 + Math.sin(t * 1.2) * bend * H * 0.3, qy = y0 - H * 0.85 * t; marks.push(stroke(px, py, qx, qy, thick * (1 - t * 0.4), thick * (1 - t * 0.45), tint(bark, i % 2 ? 1 : 0.85, 1))); px = qx; py = qy; }
    const fronds = Math.round(6 + amount * 8);
    for (let f = 0; f < fronds; f++) {
      const a = -Math.PI / 2 + ((f / (fronds - 1)) - 0.5) * 3.4, len = H * 0.32 * (0.7 + 0.4 * rnd(f, 3)) * (o.leafSize / 100 + 0.5) / 1.5;
      let fx = px, fy = py;
      for (let s = 1; s <= 8; s++) {
        const t = s / 8, qx = px + Math.cos(a) * len * t, qy = py + Math.sin(a) * len * t + t * t * len * 0.45;
        marks.push(stroke(fx, fy, qx, qy, leafSize * 0.6, leafSize * 0.5, tint(leafCol, shadeAt(Math.cos(a)), 1)));
        for (const side of [-1, 1]) marks.push(stroke(qx, qy, qx + side * Math.sin(a) * leafSize * 3 * (1 - t * 0.6), qy - side * Math.cos(a) * leafSize * 3 * (1 - t * 0.6) + leafSize * 1.5, leafSize * 0.35, 0.4, tint(leafCol, shadeAt(Math.cos(a)) * 0.9, 0.95)));
        fx = qx; fy = qy;
      }
    }
    if (kind.extra) for (let i = 0; i < 4; i++) marks.push(dot(px + (rnd(i, 40) - 0.5) * thick * 3, py + thick * (0.5 + rnd(i, 41)), thick * 0.7, tint(kind.extra, 1, 1)));
    return marks;
  }
  if (kind.form === 'bamboo') {
    for (let c = 0; c < 5; c++) {
      const cx = x0 + (c - 2) * thick * 3.2, h = H * (0.75 + 0.25 * rnd(c, 50)), segs = 9;
      for (let s = 0; s < segs; s++) {
        const ya = y0 - (h * s) / segs, yb = y0 - (h * (s + 1)) / segs;
        marks.push(stroke(cx, ya, cx, yb + thick * 0.15, thick * 0.55, thick * 0.55, tint(bark, shadeAt(-0.3), 1)), dot(cx, yb, thick * 0.62, tint(bark, 0.75, 1)));
        if (s > 3 && rnd(c * 10 + s, 51) < amount) for (const side of [-1, 1]) marks.push(stroke(cx, yb, cx + side * leafSize * 4, yb - leafSize * 1.5, leafSize * 0.6, 0.5, tint(leafCol, shadeAt(side), 0.95)));
      }
    }
    return marks;
  }
  const crown = kind.form === 'shrub' ? 0.2 : 1;
  limb(x0, y0, 0, trunk * crown, thick * (kind.form === 'shrub' ? 0.6 : 1), kind.form === 'shrub' ? 4 : 5, 1);
  if (kind.form === 'bare' || amount <= 0) return marks;
  for (const [tx, ty] of tips) {
    if (kind.form === 'weeping') {
      for (let k = 0; k < 3; k++) { const sx = tx + (rnd(tx | 0, k) - 0.5) * leafSize * 4, len = H * 0.25 * (0.6 + rnd(ty | 0, k)); marks.push(stroke(sx, ty, sx + (rnd(k, tx | 0) - 0.5) * leafSize * 3, ty + len, leafSize * 0.7 * amount + 0.4, 0.4, tint(leafCol, shadeAt(0), 0.85))); }
      continue;
    }
    leaves(tx, ty, leafSize * 4.5, Math.round(4 + amount * 14), leafCol, leafSize);
    if (kind.extra && rnd(tx | 0, ty | 0) < 0.6) marks.push(dot(tx + leafSize, ty + leafSize, leafSize * 0.9, tint(kind.extra, 1, 1)));
  }
  return marks;
}

const flameSpec = (v: LibValues): FlameSpec => ({
  type: str(v, 'flameType'), length: num(v, 'length'), randomizeLength: v.randomizeLength === true, width: num(v, 'width'), angle: num(v, 'angle'), interval: num(v, 'interval'),
  adjustLoops: v.adjustIntervalForLoops === true, color: v.customColor === true ? rgbOf(str(v, 'color')) : null, turbulent: num(v, 'turbulent'), jag: num(v, 'jag'), opacity: num(v, 'opacity'),
  lines: num(v, 'flameLines'), bottom: num(v, 'flameBottomAlignment'), style: str(v, 'flameStyle'), shape: str(v, 'flameShape'), randomizeShapes: v.randomizeShapes === true, seed: num(v, 'seed'),
  quality: ['draft', 'low', 'medium', 'high', 'fine'].indexOf(str(v, 'quality')),
});

export const DRAWN_FILTERS: LibFilter[] = [
  {
    id: 'flame', label: 'Flame', group: 'Render', grows: false, reach: null, fills: true,
    note: 'Follows the chosen path; with none, an arc low in the selection or canvas.',
    params: [
      { key: 'path', label: 'Path', kind: 'path', def: null },
      { key: 'flameType', label: 'Flame Type', kind: 'select', def: 'oneFlameAlongPath', options: [['oneFlameAlongPath', 'One Flame Along Path'], ['multipleFlamesAlongPath', 'Multiple Flames Along Path'], ['multipleFlamesPathDirections', 'Multiple Flames Path Directions'], ['multipleFlamesVariousLength', 'Multiple Flames Various Length'], ['candleLight', 'Candle Light'], ['multipleFlamesOneDirection', 'Multiple Flames One Direction']] },
      { key: 'length', label: 'Length (px)', kind: 'range', min: 1, max: 1000, step: 1, def: 150 },
      { key: 'randomizeLength', label: 'Randomize Length', kind: 'check', def: false },
      { key: 'width', label: 'Width (px)', kind: 'range', min: 1, max: 1000, step: 1, def: 40 },
      { key: 'angle', label: 'Angle (°)', kind: 'range', min: -180, max: 180, step: 1, def: 0 },
      { key: 'interval', label: 'Interval (px)', kind: 'range', min: 1, max: 1000, step: 1, def: 60 },
      { key: 'adjustIntervalForLoops', label: 'Adjust Interval for Loops', kind: 'check', def: true },
      { key: 'quality', label: 'Quality', kind: 'select', def: 'medium', options: [['draft', 'Draft'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['fine', 'Fine']] },
      { key: 'customColor', label: 'Custom Color for Flames', kind: 'check', def: false },
      { key: 'color', label: 'Color', kind: 'color', def: '#ff7a1a' },
      { key: 'turbulent', label: 'Turbulent', kind: 'range', min: 0, max: 100, step: 1, def: 25 },
      { key: 'jag', label: 'Jag', kind: 'range', min: 0, max: 100, step: 1, def: 25 },
      { key: 'opacity', label: 'Opacity (%)', kind: 'range', min: 0, max: 100, step: 1, def: 75 },
      { key: 'flameLines', label: 'Flame Lines (Complexity)', kind: 'range', min: 1, max: 100, step: 1, def: 20 },
      { key: 'flameBottomAlignment', label: 'Flame Bottom Alignment', kind: 'range', min: 0, max: 100, step: 1, def: 20 },
      { key: 'flameStyle', label: 'Flame Style', kind: 'select', def: 'normal', options: [['normal', 'Normal'], ['violent', 'Violent'], ['flat', 'Flat']] },
      { key: 'flameShape', label: 'Flame Shape', kind: 'select', def: 'parallel', options: [['parallel', 'Parallel'], ['toCenter', 'To Center'], ['spread', 'Spread'], ['oval', 'Oval'], ['pointed', 'Pointed']] },
      { key: 'randomizeShapes', label: 'Randomize Flame Shapes', kind: 'check', def: false },
      { key: 'seed', label: 'Arrangement', kind: 'seed', def: 0 },
      { key: 'newLayer', label: 'New Layer', kind: 'check', def: false },
    ],
    run: (src, v, ctx) => drawn(src, ctx, (area, doc) => {
      const o = flameSpec(v), lines = pathLines(v.path as LibPath | null, doc);
      const arc: Array<[number, number]> = o.type === 'candleLight' ? [[area.x + area.w * 0.5, area.y + area.h * 0.72]] : Array.from({ length: 25 }, (_, k): [number, number] => [area.x + area.w * (0.15 + (0.7 * k) / 24), area.y + area.h * (0.82 - 0.06 * Math.sin((Math.PI * k) / 24))]);
      return flameMarks(o, lines.length ? lines : [arc]);
    }),
  },
  {
    id: 'pictureFrame', label: 'Picture Frame', group: 'Render', grows: false, reach: null, fills: true,
    params: [
      { key: 'frame', label: 'Frame', kind: 'select', def: 'vineWithFlowers', options: FRAME_STYLES },
      { key: 'margin', label: 'Margin (%)', kind: 'range', min: 0, max: 30, step: 1, def: 4 },
      { key: 'size', label: 'Size', kind: 'range', min: 1, max: 100, step: 1, def: 50 },
      { key: 'arrangement', label: 'Arrangement', kind: 'range', min: 1, max: 100, step: 1, def: 50 },
      { key: 'lines', label: 'Number of Lines', kind: 'range', min: 1, max: 5, step: 1, def: 1 },
      { key: 'thickness', label: 'Thickness', kind: 'range', min: 1, max: 100, step: 1, def: 30 },
      { key: 'fade', label: 'Fade (%)', kind: 'range', min: 0, max: 100, step: 1, def: 0 },
      { key: 'vineColor', label: 'Vine Color', kind: 'color', def: '#406626' },
      { key: 'flowerColor', label: 'Flower Color', kind: 'color', def: '#e64d73' },
      { key: 'leafColor', label: 'Leaf Color', kind: 'color', def: '#4d9933' },
      { key: 'seed', label: 'Pattern', kind: 'seed', def: 0 },
      { key: 'newLayer', label: 'New Layer', kind: 'check', def: false },
    ],
    run: (src, v, ctx) => drawn(src, ctx, (area) => frameMarks({
      style: str(v, 'frame'), margin: num(v, 'margin'), size: num(v, 'size'), arrangement: num(v, 'arrangement'), lines: num(v, 'lines'), thickness: num(v, 'thickness'), fade: num(v, 'fade'),
      vine: rgbOf(str(v, 'vineColor')), flower: rgbOf(str(v, 'flowerColor')), leaf: rgbOf(str(v, 'leafColor')), seed: num(v, 'seed'),
    }, area)),
  },
  {
    id: 'tree', label: 'Tree', group: 'Render', grows: false, reach: null, fills: true,
    note: 'Position and height in percent of the selection or canvas.',
    params: [
      { key: 'baseTreeType', label: 'Base Tree Type', kind: 'select', def: 'oak', options: TREES.map((t) => [t.id, t.name] as const) },
      { key: 'lightDirection', label: 'Light Direction', kind: 'range', min: 1, max: 5, step: 1, def: 3 },
      { key: 'leavesAmount', label: 'Leaves Amount', kind: 'range', min: 0, max: 100, step: 1, def: 50 },
      { key: 'leavesSize', label: 'Leaves Size', kind: 'range', min: 0, max: 200, step: 1, def: 100 },
      { key: 'branchesHeight', label: 'Branches Height', kind: 'range', min: 50, max: 300, step: 1, def: 100 },
      { key: 'branchesThickness', label: 'Branches Thickness', kind: 'range', min: 50, max: 200, step: 1, def: 100 },
      { key: 'defaultLeaves', label: 'Default Leaves', kind: 'check', def: true },
      { key: 'leavesColor', label: 'Leaves Color', kind: 'color', def: '#3d8529' },
      { key: 'customBranchColor', label: 'Custom Color for Branches', kind: 'check', def: false },
      { key: 'branchesColor', label: 'Branches Color', kind: 'color', def: '#5c4029' },
      { key: 'flatShading', label: 'Flat Shading', kind: 'check', def: false },
      { key: 'x', label: 'Position X (%)', kind: 'range', min: 0, max: 100, step: 1, def: 50 },
      { key: 'y', label: 'Base Y (%)', kind: 'range', min: 0, max: 100, step: 1, def: 95 },
      { key: 'size', label: 'Height (%)', kind: 'range', min: 5, max: 200, step: 1, def: 80 },
      { key: 'seed', label: 'Arrangement', kind: 'seed', def: 0 },
      { key: 'newLayer', label: 'New Layer', kind: 'check', def: false },
    ],
    run: (src, v, ctx) => drawn(src, ctx, (area) => treeMarks({
      kind: str(v, 'baseTreeType'), light: num(v, 'lightDirection'), amount: num(v, 'leavesAmount'), leafSize: num(v, 'leavesSize'), branchHeight: num(v, 'branchesHeight'), thickness: num(v, 'branchesThickness'),
      leafColor: v.defaultLeaves === false ? rgbOf(str(v, 'leavesColor')) : null, branchColor: v.customBranchColor === true ? rgbOf(str(v, 'branchesColor')) : null, flat: v.flatShading === true,
      seed: num(v, 'seed'), x: num(v, 'x') / 100, y: num(v, 'y') / 100, size: num(v, 'size') / 100,
    }, area)),
  },
];
