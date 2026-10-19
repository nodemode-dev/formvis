// Boxes (region prompting): rectangles on the document that say what goes where. The Boxes tool draws them, the Generate
// panel lists them, and Generate writes them into the prompt as plain text, one line per box. Saved with the document.
import type { Project } from './project';
import { uid, type BoxKind, type DocBox, type ID, type Pt, type Rect } from './types';

export const BOX_KINDS: ReadonlyArray<{ id: BoxKind; label: string }> = [
  { id: 'new', label: 'New' }, { id: 'keep', label: 'Keep' }, { id: 'move', label: 'Move' },
  { id: 'remove', label: 'Remove' }, { id: 'reference', label: 'From reference' }, { id: 'text', label: 'Text' },
];
export const kindLabel = (k: BoxKind): string => BOX_KINDS.find((x) => x.id === k)?.label ?? 'New';
/** The kinds whose box is of no use without words. */
const NEEDS_WORDS: ReadonlySet<BoxKind> = new Set(['new', 'move', 'reference', 'text']);
export const MIN_BOX = 4;
export const MAX_BOXES = 24;

/** What the box methods need of the Engine. */
export interface BoxHost {
  activeBox: ID | null;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  selectionRect(): Rect | null;
}

/** The first name "New 1", "New 2"... not taken by a box. */
export function autoName(list: readonly DocBox[], kind: BoxKind): string {
  const base = kindLabel(kind), used = new Set(list.map((b) => b.name));
  let n = 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
const isAuto = (b: DocBox): boolean => b.name === `${kindLabel(b.kind)} ${b.name.slice(kindLabel(b.kind).length + 1)}` && /^\d+$/.test(b.name.slice(kindLabel(b.kind).length + 1));

/** A rectangle made whole: integers, at least MIN_BOX across, inside the canvas. */
export function fitRect(r: Rect, W: number, H: number): Rect {
  const w = Math.min(W, Math.max(MIN_BOX, Math.round(r.w))), h = Math.min(H, Math.max(MIN_BOX, Math.round(r.h)));
  return { x: Math.min(W - w, Math.max(0, Math.round(r.x))), y: Math.min(H - h, Math.max(0, Math.round(r.y))), w, h };
}

export function addBox(host: BoxHost, rect: Rect, kind: BoxKind = 'new', text = ''): ID | null {
  let id: ID | null = null;
  host.edit('New Box', (p) => {
    const list = p.doc.boxes ?? [];
    if (list.length >= MAX_BOXES) return false;
    const b: DocBox = { id: uid(), kind, name: autoName(list, kind), text, ...fitRect(rect, p.doc.width, p.doc.height) };
    p.doc = { ...p.doc, boxes: [...list, b] };
    id = b.id;
    return true;
  });
  if (id) host.activeBox = id;
  return id;
}
export function setBox(host: BoxHost, id: ID, patch: Partial<Omit<DocBox, 'id'>>, name = 'Edit Box'): void {
  host.edit(name, (p) => {
    const list = p.doc.boxes ?? [], b = list.find((x) => x.id === id);
    if (!b) return false;
    let next: DocBox = { ...b, ...patch };
    if (patch.kind && patch.kind !== b.kind && isAuto(b) && patch.name === undefined) next = { ...next, name: autoName(list.filter((x) => x.id !== id), patch.kind) };
    if (patch.x !== undefined || patch.y !== undefined || patch.w !== undefined || patch.h !== undefined) next = { ...next, ...fitRect(next, p.doc.width, p.doc.height) };
    if (JSON.stringify(next) === JSON.stringify(b)) return false;
    p.doc = { ...p.doc, boxes: list.map((x) => (x.id === id ? next : x)) };
    return true;
  });
}
export function removeBox(host: BoxHost, id: ID): void {
  host.edit('Delete Box', (p) => { const list = p.doc.boxes ?? []; if (!list.some((x) => x.id === id)) return false; p.doc = { ...p.doc, boxes: list.filter((x) => x.id !== id) }; return true; });
  if (host.activeBox === id) host.activeBox = null;
}
export function duplicateBox(host: BoxHost, id: ID): ID | null {
  let out: ID | null = null;
  host.edit('Duplicate Box', (p) => {
    const list = p.doc.boxes ?? [], b = list.find((x) => x.id === id);
    if (!b || list.length >= MAX_BOXES) return false;
    const copy: DocBox = { ...b, id: uid(), name: autoName(list, b.kind), ...fitRect({ ...b, x: b.x + 16, y: b.y + 16 }, p.doc.width, p.doc.height) };
    p.doc = { ...p.doc, boxes: [...list, copy] };
    out = copy.id;
    return true;
  });
  if (out) host.activeBox = out;
  return out;
}
export function clearBoxes(host: BoxHost): void {
  host.edit('Clear Boxes', (p) => { if (!p.doc.boxes?.length) return false; p.doc = { ...p.doc, boxes: [] }; return true; });
  host.activeBox = null;
}
/** A New box over the selection's bounds; null when nothing is selected. */
export function boxFromSelection(host: BoxHost, kind: BoxKind = 'new'): ID | null {
  const r = host.selectionRect();
  return r ? addBox(host, r, kind) : null;
}
/** The next box after `id` in the list (or before it), wrapping; the first when none is chosen. */
export function cycleBox(list: readonly DocBox[], id: ID | null, back = false): ID | null {
  if (!list.length) return null;
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) return list[back ? list.length - 1 : 0].id;
  return list[(i + (back ? list.length - 1 : 1)) % list.length].id;
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();

/** The boxes as plain text a prompt can carry: a heading, then a line for each box, "box 1 | New | x=10 y=20 w=300 h=200 | a red car".
 *  Rectangles are in document pixels, the origin at the top left. Empty when the document has no boxes. */
export function boxesText(boxes: readonly DocBox[] | undefined, size?: { width: number; height: number }): string {
  if (!boxes?.length) return '';
  const head = `Layout boxes (rectangles in document pixels${size ? `, the picture is ${size.width} x ${size.height}` : ''}; kind | rectangle | description):`;
  return [head, ...boxes.map((b, i) => `box ${i + 1} | ${kindLabel(b.kind)} | x=${b.x} y=${b.y} w=${b.w} h=${b.h} | ${oneLine(b.text)}`.trimEnd())].join('\n');
}
/** The prompt with the document's boxes after it. */
export function withBoxes(prompt: string, doc: { boxes?: readonly DocBox[]; width: number; height: number }): string {
  const t = boxesText(doc.boxes, { width: doc.width, height: doc.height });
  return t ? `${prompt}\n\n${t}` : prompt;
}

const overlap = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Things worth a look before generating, in words. */
export function boxWarnings(boxes: readonly DocBox[] | undefined, W: number, H: number): string[] {
  const out: string[] = [];
  if (!boxes?.length) return out;
  boxes.forEach((b, i) => {
    if (NEEDS_WORDS.has(b.kind) && !b.text.trim()) out.push(`${b.name} has no description.`);
    if (b.w < 32 || b.h < 32) out.push(`${b.name} is very small (${b.w} x ${b.h}): a model may ignore it.`);
    if (b.w * b.h > 0.9 * W * H) out.push(`${b.name} covers nearly the whole picture.`);
    for (let j = i + 1; j < boxes.length; j++) {
      const c = boxes[j], o = overlap(b, c);
      if (o > 0.5 * Math.min(b.w * b.h, c.w * c.h) && b.kind !== 'keep' && c.kind !== 'keep') out.push(`${b.name} and ${c.name} overlap by more than half.`);
    }
  });
  if (boxes.length >= MAX_BOXES) out.push(`The most boxes a picture holds is ${MAX_BOXES}.`);
  return out;
}

/** The area a model would be shown for a box: the box with room around it (a fifth of its size, at least 32 pixels), kept on the canvas. */
export function cropFor(b: Rect, W: number, H: number): Rect {
  const px = Math.max(32, Math.round(b.w / 5)), py = Math.max(32, Math.round(b.h / 5));
  const x0 = Math.max(0, b.x - px), y0 = Math.max(0, b.y - py), x1 = Math.min(W, b.x + b.w + px), y1 = Math.min(H, b.y + b.h + py);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The boxes carried through a change of canvas: each box is the bounds of its four corners, cut to the canvas; one that
 *  is left with less than a pixel goes. */
export function carryBoxes(boxes: readonly DocBox[], map: (x: number, y: number) => Pt, width: number, height: number): DocBox[] {
  return boxes.flatMap((b) => {
    const q = [map(b.x, b.y), map(b.x + b.w, b.y), map(b.x, b.y + b.h), map(b.x + b.w, b.y + b.h)], xs = q.map((a) => a.x), ys = q.map((a) => a.y);
    const x0 = Math.max(0, Math.round(Math.min(...xs))), y0 = Math.max(0, Math.round(Math.min(...ys)));
    const x1 = Math.min(width, Math.round(Math.max(...xs))), y1 = Math.min(height, Math.round(Math.max(...ys)));
    return x1 - x0 < 1 || y1 - y0 < 1 ? [] : [{ ...b, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
  });
}
