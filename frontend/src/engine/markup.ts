import type { VectorPath } from './paths';
import { DEFAULT_PATH_SHAPE, closed, linePath } from './shape-paths';
import type { Pt } from './types';

/** Markup (1.60.3, the register's L2, DEV_PLAN 23.13): quick marks on a picture, each its own vector layer so it stays
 *  editable: an arrow, a callout (a box with a tail pointing at what it is about), a highlight, and a redaction box,
 *  which Apply Redactions burns into the pixels beneath it. Pure geometry here; the engine renders and inserts. */
export type MarkupKind = 'arrow' | 'callout' | 'highlight' | 'redact';
export const MARKUP_KINDS: ReadonlyArray<{ id: MarkupKind; label: string }> = [
  { id: 'arrow', label: 'Arrow' }, { id: 'callout', label: 'Callout' }, { id: 'highlight', label: 'Highlight' }, { id: 'redact', label: 'Redact' },
];

/** The quarter circle of `r` around `c` from angle `a0` to `a1` (radians), as `n` points. */
function arc(c: Pt, r: number, a0: number, a1: number, n = 6): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n; out.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }); }
  return out;
}

/** The path a drag from `a` to `b` makes. An arrow runs from a to its tip at b, its head in proportion to `width`.
 *  A highlight or a redaction box is the rectangle a to b. A callout is the rounded box a to b's far part with a tail
 *  back to `a`: the drag starts at what the callout is about and ends where its box should be. */
export function markupPath(kind: MarkupKind, a: Pt, b: Pt, width: number): VectorPath {
  const w = Math.max(1, width);
  if (kind === 'arrow') return linePath('arrow', a, b, { ...DEFAULT_PATH_SHAPE, weight: w, headLength: w * 4, headWidth: w * 4 });
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  if (kind !== 'callout') return closed([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]);
  // The box takes the part of the drag away from `a` (its far 60% each way); the tail leaves the side nearer `a`.
  const bx0 = a.x <= b.x ? x0 + (x1 - x0) * 0.4 : x0, bx1 = a.x <= b.x ? x1 : x1 - (x1 - x0) * 0.4;
  const by0 = a.y <= b.y ? y0 + (y1 - y0) * 0.4 : y0, by1 = a.y <= b.y ? y1 : y1 - (y1 - y0) * 0.4;
  const r = Math.min(16, (bx1 - bx0) / 4, (by1 - by0) / 4), H = Math.PI / 2;
  const box: Pt[] = [
    ...arc({ x: bx0 + r, y: by0 + r }, r, Math.PI, Math.PI + H), ...arc({ x: bx1 - r, y: by0 + r }, r, -H, 0),
    ...arc({ x: bx1 - r, y: by1 - r }, r, 0, H), ...arc({ x: bx0 + r, y: by1 - r }, r, H, Math.PI),
  ];
  // The tail: a notch in the box's edge nearest `a` (top or bottom), its tip at `a`.
  const top = a.y < by0, edgeY = top ? by0 : by1, mid = Math.min(bx1 - r - 4, Math.max(bx0 + r + 4, a.x)), half = Math.max(6, (bx1 - bx0) * 0.08);
  const notch: Pt[] = top ? [{ x: mid - half, y: edgeY }, { x: a.x, y: a.y }, { x: mid + half, y: edgeY }] : [{ x: mid + half, y: edgeY }, { x: a.x, y: a.y }, { x: mid - half, y: edgeY }];
  // Splice the notch into the top edge (between the first two corners) or the bottom edge (between the last two).
  const corner = box.length / 4;
  return closed(top ? [...box.slice(0, corner), ...notch, ...box.slice(corner)] : [...box.slice(0, corner * 3), ...notch, ...box.slice(corner * 3)]);
}
