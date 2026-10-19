import type { Doc, ID, Layer } from '../engine/types';
import { api, type PsdPartSpec } from './api';
import { giantTiles } from './project-io';

/** A layered PSD or PSB written in parts (SC-ED-0263): for a document with giant tiled layers, whose layers cannot be
 *  drawn to one canvas each, every layer's rows are read a band at a time (tiles brought back from the engine's disk as
 *  needed) and sent to the engine's layered writer, which spools each channel and joins them behind the layer records;
 *  the merged picture is rendered in bands by the caller. Layers are written at their stored pixels and places; what the
 *  writer does not carry is returned as notes. */
export interface PartsOptions { step?: (done: number, total: number) => void; stopped?: () => boolean }

const bandRows = (w: number): number => Math.max(16, Math.min(512, Math.floor(4_194_304 / Math.max(1, w))));

export async function writePsdInParts(doc: Doc, psb: boolean, merged: (put: (rows: Uint8ClampedArray<ArrayBuffer>) => Promise<void>) => Promise<unknown>, opts: PartsOptions = {}): Promise<{ blob: Blob; notes: string[] }> {
  const items: Array<{ kind: 'begin' | 'end' | 'layer'; l: Layer }> = [], closed = new Set<ID>(doc.collapsed ?? []);
  const walk = (parent: ID | null): void => {
    for (const l of doc.layers) {
      if ((l.parentId ?? null) !== parent) continue;
      if (l.isGroup) { items.push({ kind: 'begin', l }); walk(l.id); items.push({ kind: 'end', l }); } else items.push({ kind: 'layer', l });
    }
  };
  walk(null);
  const clipped = new Set<ID>(doc.layers.filter((l) => l.clipId).map((l) => l.id)), notes: string[] = [];
  let skipped = 0, moved = 0, masks = 0, styles = 0;
  const sized = (l: Layer): { w: number; h: number } | null => (l.tiled ? { w: l.tiled.width, h: l.tiled.height } : l.raster ? { w: l.raster.width, h: l.raster.height } : null);
  const specs: PsdPartSpec[] = items.map(({ kind, l }) => {
    const base = { name: l.name, opacity: l.opacity, visible: l.visible, clipping: clipped.has(l.id) };
    if (kind === 'begin') return { ...base, left: 0, top: 0, width: 0, height: 0, blend: 'normal', section: 3 as const };
    if (kind === 'end') return { ...base, left: 0, top: 0, width: 0, height: 0, blend: !l.isolate && l.blend === 'normal' ? 'pass' : l.blend, section: closed.has(l.id) ? 2 as const : 1 as const };
    const px = sized(l);
    if (!px) skipped++;
    if (l.transform.rotation || l.transform.flipX || l.transform.flipY || (px && (Math.round(l.transform.w) !== px.w || Math.round(l.transform.h) !== px.h))) moved++;
    if (l.mask) masks++;
    if (l.effects) styles++;
    return { ...base, left: Math.round(l.transform.x), top: Math.round(l.transform.y), width: px?.w ?? 0, height: px?.h ?? 0, blend: l.blend, section: 0 as const };
  });
  const work = specs.reduce((n, s) => n + s.height, 0) + doc.height, store = giantTiles.store;
  let done = 0;
  const key = await api.psdLayersBegin(doc.width, doc.height, doc.resolution ?? 72, psb, specs, doc.profile?.icc ?? null);
  for (let i = 0; i < items.length; i++) {
    const { kind, l } = items[i], sp = specs[i];
    if (kind !== 'layer' || !sp.width || !sp.height) continue;
    const B = bandRows(sp.width);
    for (let y0 = 0; y0 < sp.height; y0 += B) {
      if (opts.stopped?.()) throw new Error('The export was stopped; nothing was written.');
      const h = Math.min(B, sp.height - y0);
      let rows: Uint8ClampedArray<ArrayBuffer>;
      if (l.tiled) {
        if (store) await l.tiled.ensure(0, y0, sp.width, h, store);
        rows = l.tiled.read(0, y0, sp.width, h).data as Uint8ClampedArray<ArrayBuffer>;
      } else rows = (l.raster as NonNullable<Layer['raster']>).ctx.getImageData(0, y0, sp.width, h).data as Uint8ClampedArray<ArrayBuffer>;
      await api.psdLayersPut(key, rows, i);
      done += h;
      opts.step?.(done, work);
      if (l.tiled) await giantTiles.page();
    }
  }
  await merged((rows) => { done += rows.length / (doc.width * 4); opts.step?.(done, work); return api.psdLayersPut(key, rows, null); });
  if (skipped) notes.push(`${skipped} adjustment, fill or other layer${skipped === 1 ? ' was' : 's were'} written empty: a document this large is written in parts, from pixels only.`);
  if (moved) notes.push(`${moved} layer${moved === 1 ? ' was' : 's were'} written at ${moved === 1 ? 'its' : 'their'} stored pixels, without ${moved === 1 ? 'its' : 'their'} rotation, flip or scale.`);
  if (masks) notes.push(`${masks} layer mask${masks === 1 ? ' was' : 's were'} left out.`);
  if (styles) notes.push(`${styles} layer${styles === 1 ? "'s style was" : "s' styles were"} left out.`);
  notes.push('Written at 8 bits per channel, channels uncompressed.');
  return { blob: await api.psdLayersEnd(key), notes };
}
