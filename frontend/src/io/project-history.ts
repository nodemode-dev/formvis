import { Raster, liveText, type Doc, type ID, type Layer, type SelectionMask } from '../engine';
import type { History } from '../engine/history';
import type { FilePart } from './api';

type Json = Record<string, unknown>;

/** What a project file keeps of the steps behind a document: its saved states, newest last, within a byte cap. */
export interface HistorySource { doc: Doc; selection: SelectionMask | null; history: History }
export interface StoredHistory { names: string[]; manifests: Json[]; files: FilePart[]; bytes: number }
export type StateEncoder = (doc: Doc, activeId: ID | null, selection: SelectionMask | null) => Promise<{ manifest: Json; files: FilePart[] }>;

const plain = (d: Doc): boolean => (!d.depth || d.depth === 8) && (!d.mode || d.mode === 'rgb') && !d.layers.some((l) => l.tiled || l.channels || l.video);

/** The families the document's text layers use, once each, in the order they first appear. */
export function fontsUsed(doc: Doc): string[] {
  const found = new Set<string>();
  for (const l of doc.layers) {
    if (!liveText(l) || !l.text) continue;
    if (l.text.family) found.add(l.text.family);
    for (const r of l.text.runs ?? []) if (r.family) found.add(r.family);
  }
  return [...found];
}

/** The earlier states of a document, newest first, each encoded by `encode` and its files named h<n>.<name>. Pixels of
 *  an earlier state are the layer's pixels with the later steps' patches taken back on a copy, so the live layers stay
 *  as they are. It stops at a step whose pixels live in the engine's undo store, at `steps`, or when `cap` bytes are
 *  reached. */
export async function collectHistory(src: HistorySource, cap: number, steps: number, encode: StateEncoder): Promise<StoredHistory> {
  const out: StoredHistory = { names: [], manifests: [], files: [], bytes: 0 };
  if (!plain(src.doc) || cap <= 0 || steps <= 0) return out;
  const done = src.history.steps.current, past = src.history.entries().slice(0, done);
  const clones = new Map<Raster, Raster>();
  const swap = (r: Raster | null | undefined): Raster | null => (r ? clones.get(r) ?? r : null);
  const newest: Array<{ name: string; manifest: Json; files: FilePart[] }> = [];
  for (let k = done; k > 0 && newest.length < steps; k--) {
    const e = past[k - 1];
    if (e.streamed || e.patches.some((q) => q.paged || q.disk || !('canvas' in q.raster) || q.before.data.length !== q.before.width * q.before.height * 4)) break;
    for (let i = e.patches.length - 1; i >= 0; i--) {
      const q = e.patches[i], r = q.raster as Raster;
      let c = clones.get(r);
      if (!c) { c = r.clone(); clones.set(r, c); }
      c.write(q.before, q.x, q.y);
    }
    const before = e.before.doc;
    if (!plain(before)) break;
    const layers: Layer[] = before.layers.map((l) => ({ ...l, raster: swap(l.raster), ...(l.mask ? { mask: { ...l.mask, raster: swap(l.mask.raster) } } : {}) }));
    const made = await encode({ ...before, layers }, e.before.activeId, e.before.selection);
    const size = made.files.reduce((n, f) => n + f.blob.size, 0);
    if (out.bytes + size > cap) break;
    out.bytes += size;
    newest.push({ name: e.name, manifest: made.manifest, files: made.files });
  }
  newest.reverse().forEach((s, i) => {
    out.names.push(s.name);
    out.manifests.push(s.manifest);
    for (const f of s.files) out.files.push({ name: `h${i}.${f.name}`, blob: f.blob });
  });
  return out;
}
