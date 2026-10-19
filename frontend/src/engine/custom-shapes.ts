import { pathBounds, type Anchor, type SubPath, type VectorPath } from './paths';
import type { Rect } from './types';

/** Custom shapes for the Shape tool, a library of formvis's own simple
 *  designs. Each is drawn in a 100 x 100 box as absolute SVG path commands (M, L, C and Z) and fitted to
 *  the dragged box, so it stays an editable vector layer. Shapes are filled by the nonzero rule, so an outline wound
 *  the other way inside another cuts a hole (the ring, the tag's eyelet) and overlapping outlines wound alike join
 *  (the cloud). */

const K = 0.5523; // cubic handle length for a quarter circle, as a fraction of the radius

/** A circle as SVG commands, clockwise on screen, or anticlockwise when `hole`, which makes it cut a hole. */
function circle(cx: number, cy: number, r: number, hole = false): string {
  const k = r * K;
  return hole
    ? `M${cx + r} ${cy} C${cx + r} ${cy - k} ${cx + k} ${cy - r} ${cx} ${cy - r} C${cx - k} ${cy - r} ${cx - r} ${cy - k} ${cx - r} ${cy} C${cx - r} ${cy + k} ${cx - k} ${cy + r} ${cx} ${cy + r} C${cx + k} ${cy + r} ${cx + r} ${cy + k} ${cx + r} ${cy} Z`
    : `M${cx + r} ${cy} C${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} C${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} C${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} C${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} Z`;
}

export const CUSTOM_SHAPES: ReadonlyArray<{ id: string; label: string; d: string }> = [
  { id: 'check', label: 'Check mark', d: 'M8 52 L22 38 L40 56 L78 18 L92 32 L40 84 Z' },
  { id: 'cross', label: 'Cross', d: 'M20 8 L50 38 L80 8 L92 20 L62 50 L92 80 L80 92 L50 62 L20 92 L8 80 L38 50 L8 20 Z' },
  { id: 'plus', label: 'Plus', d: 'M38 8 L62 8 L62 38 L92 38 L92 62 L62 62 L62 92 L38 92 L38 62 L8 62 L8 38 L38 38 Z' },
  { id: 'bolt', label: 'Lightning', d: 'M58 4 L18 56 L46 56 L36 96 L82 38 L54 38 L66 4 Z' },
  { id: 'speech', label: 'Speech bubble', d: 'M20 10 L80 10 C91 10 96 15 96 26 L96 58 C96 69 91 74 80 74 L44 74 L22 92 L26 74 L20 74 C9 74 4 69 4 58 L4 26 C4 15 9 10 20 10 Z' },
  { id: 'drop', label: 'Drop', d: 'M50 4 C60 18 84 44 84 64 C84 83 69 96 50 96 C31 96 16 83 16 64 C16 44 40 18 50 4 Z' },
  { id: 'ring', label: 'Ring', d: `${circle(50, 50, 46)} ${circle(50, 50, 28, true)}` },
  { id: 'moon', label: 'Crescent', d: 'M62 6 C38 10 18 30 18 54 C18 78 38 96 62 96 C74 96 84 92 92 84 C80 86 68 84 58 76 C44 66 38 52 38 40 C38 26 46 14 62 6 Z' },
  { id: 'tag', label: 'Tag', d: `M4 50 L30 16 L96 16 L96 84 L30 84 Z ${circle(28, 50, 7, true)}` },
  { id: 'shield', label: 'Shield', d: 'M50 4 L90 16 L90 46 C90 72 72 88 50 96 C28 88 10 72 10 46 L10 16 Z' },
  { id: 'cloud', label: 'Cloud', d: `M22 62 L78 62 L78 80 L22 80 Z ${circle(28, 62, 18)} ${circle(50, 46, 26)} ${circle(74, 58, 20)}` },
  { id: 'house', label: 'House', d: 'M50 6 L94 44 L82 44 L82 94 L60 94 L60 64 L40 64 L40 94 L18 94 L18 44 L6 44 Z' },
  { id: 'arrow-right', label: 'Block arrow', d: 'M4 36 L56 36 L56 12 L96 50 L56 88 L56 64 L4 64 Z' },
];

const user: Array<{ id: string; label: string; d: string }> = [];
const USER_KEY = 'formvis.customShapes';

/** The built-in shapes, then the ones the person defined from paths. */
export function allCustomShapes(): ReadonlyArray<{ id: string; label: string; d: string }> {
  return [...CUSTOM_SHAPES, ...user];
}

/** Removes a shape the person defined; built-ins stay. Returns whether one was removed. */
export function removeCustomShape(id: string): boolean {
  const i = user.findIndex((u) => u.id === id);
  if (i < 0) return false;
  user.splice(i, 1);
  keepUserShapes();
  return true;
}

/** Renames a shape the person defined; built-ins keep their labels. */
export function renameCustomShape(id: string, label: string): boolean {
  const s = user.find((u) => u.id === id), l = label.trim().slice(0, 80);
  if (!s || !l) return false;
  s.label = l;
  keepUserShapes();
  return true;
}

function keepUserShapes(): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* storage full or blocked: the shape lasts for the session */ }
}

/** Restores the shapes kept in localStorage; well-formed entries only, once. */
export function loadCustomShapes(): void {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return;
    const got: unknown = JSON.parse(raw);
    if (!Array.isArray(got)) return;
    for (const s of got) {
      if (!s || typeof s !== 'object') continue;
      const { id, label, d } = s as { id?: unknown; label?: unknown; d?: unknown };
      if (typeof id === 'string' && typeof label === 'string' && typeof d === 'string' && !user.some((u) => u.id === id)) user.push({ id, label, d });
    }
  } catch { /* unreadable storage: start with the built-ins */ }
}

/** Adds a shape from a path: fitted into the 100 x 100 box keeping its aspect and centred, kept as M, C and Z. Returns its id. */
export function addCustomShape(label: string, path: VectorPath): string {
  const b = pathBounds(path), w = Math.max(b?.w ?? 0, 1e-6), h = Math.max(b?.h ?? 0, 1e-6);
  const k = 100 / Math.max(w, h), ox = 50 - ((b?.x ?? 0) + w / 2) * k, oy = 50 - ((b?.y ?? 0) + h / 2) * k;
  const f = (v: number, o: number): string => String(Math.round((v * k + o) * 100) / 100);
  const pt = (x: number, y: number): string => `${f(x, ox)} ${f(y, oy)}`;
  const parts: string[] = [];
  for (const sp of path.subpaths) {
    const a = sp.anchors;
    if (!a.length) continue;
    parts.push(`M${pt(a[0].x, a[0].y)}`);
    const n = sp.closed ? a.length : a.length - 1;
    for (let i = 0; i < n; i++) {
      const p = a[i], q = a[(i + 1) % a.length];
      parts.push(`C${pt(p.outX, p.outY)} ${pt(q.inX, q.inY)} ${pt(q.x, q.y)}`);
    }
    if (sp.closed) parts.push('Z');
  }
  const id = `user-${Date.now().toString(36)}-${user.length}`;
  user.push({ id, label, d: parts.join(' ') });
  keepUserShapes();
  return id;
}

/** Absolute M, L, C and Z commands as subpaths of anchors with handles; a closing point equal to the start is merged. */
export function parseShape(d: string): VectorPath {
  const nums = (s: string): number[] => (s.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  const subpaths: SubPath[] = [];
  let cur: Anchor[] | null = null;
  for (const [, cmd, args] of d.matchAll(/([MLCZ])([^MLCZ]*)/gi)) {
    const n = nums(args), c = cmd.toUpperCase();
    if (c === 'M') { cur = [{ x: n[0], y: n[1], inX: n[0], inY: n[1], outX: n[0], outY: n[1] }]; subpaths.push({ anchors: cur, closed: false }); }
    else if (!cur) throw new Error('A shape path must start with M.');
    else if (c === 'L') for (let i = 0; i + 1 < n.length; i += 2) cur.push({ x: n[i], y: n[i + 1], inX: n[i], inY: n[i + 1], outX: n[i], outY: n[i + 1] });
    else if (c === 'C') for (let i = 0; i + 5 < n.length; i += 6) {
      const prev = cur[cur.length - 1];
      prev.outX = n[i]; prev.outY = n[i + 1];
      cur.push({ x: n[i + 4], y: n[i + 5], inX: n[i + 2], inY: n[i + 3], outX: n[i + 4], outY: n[i + 5] });
    } else if (c === 'Z') {
      const sp = subpaths[subpaths.length - 1], first = cur[0], last = cur[cur.length - 1];
      if (cur.length > 1 && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) { first.inX = last.inX; first.inY = last.inY; cur.pop(); }
      sp.closed = true;
      cur = null;
    }
  }
  return { subpaths };
}

/** A custom shape fitted to `box` (its 100 x 100 design box scaled to the box); an unknown id gives the first. */
export function customShapePath(id: string, box: Rect): VectorPath {
  const def = allCustomShapes().find((s) => s.id === id) ?? CUSTOM_SHAPES[0], sx = box.w / 100, sy = box.h / 100;
  const px = (v: number): number => box.x + v * sx, py = (v: number): number => box.y + v * sy;
  const vp = parseShape(def.d);
  return { subpaths: vp.subpaths.map((sp) => ({ closed: sp.closed, anchors: sp.anchors.map((a) => ({ x: px(a.x), y: py(a.y), inX: px(a.inX), inY: py(a.inY), outX: px(a.outX), outY: py(a.outY) })) })) };
}

/** Twice the signed area of a subpath's anchor polygon (positive clockwise on screen, where y points down). */
export function windingArea(anchors: readonly Anchor[]): number {
  let s = 0;
  for (let i = 0; i < anchors.length; i++) { const a = anchors[i], b = anchors[(i + 1) % anchors.length]; s += a.x * b.y - b.x * a.y; }
  return s;
}
