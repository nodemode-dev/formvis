import { CANVAS_PIXELS } from '../engine/surface';
import { TiledRaster, type TileStore } from '../engine/tiled';
import { LIMITS, docTransform, newLayer, uid, type Doc, type ID, type Layer } from '../engine/types';
import { giantTiles } from './project-io';
import { blobSource, peekHeader, planComposite, planLayer, readBand, readStructure, resolutionOf, SETTINGS_ONLY, type PsbHeader, type PsbLayer, type PsbPlan, type PsbSource } from './psb-bands';
import { readIccProfile } from './psd-channels';
import { resourceBlocks } from './psd-paths';
import { reportOf, type PsdReport } from './psd';

/** A PSD or PSB too large for one canvas (a side past 30,000 pixels, or more pixels than a canvas holds) opens here
 *  instead of through the layer reader, which would make a canvas for every layer: each layer's channels are decoded a
 *  band of rows at a time (psb-bands.ts) straight into a tiled layer, tiles that stay empty are never made, and the
 *  tiles go to the engine's disk as they fill, so memory follows the tiles, not the layer. */
export interface GiantOpen { step?: (done: number, total: number) => void; stopped?: () => boolean }

export async function giantPsd(file: Blob): Promise<boolean> {
  const h = await peekHeader(blobSource(file)).catch(() => null);
  return !!h && (h.width > LIMITS.side || h.height > LIMITS.side || h.width * h.height > CANVAS_PIXELS);
}

const idle: TileStore = { put: async () => '', get: async () => new ArrayBuffer(0), drop: () => undefined };

/** Rows of one layer in bands a power of two tall, so a band never straddles two rows of tiles, written as tiles; a tile
 *  segment whose pixels are all clear is not written. */
async function fill(t: TiledRaster, width: number, height: number, rows: (y0: number, y1: number) => Promise<Uint8ClampedArray<ArrayBuffer> | null>, onRows: (n: number) => void, stopped?: () => boolean): Promise<void> {
  const B = 2 ** Math.floor(Math.log2(Math.max(16, Math.min(512, Math.floor(4_194_304 / width))))), store = giantTiles.store;
  for (let y0 = 0; y0 < height; y0 += B) {
    if (stopped?.()) throw new Error('Opening was stopped; nothing was opened.');
    const y1 = Math.min(height, y0 + B), n = y1 - y0, px = await rows(y0, y1);
    if (px) {
      for (let x0 = 0; x0 < width; x0 += t.tile) {
        const w = Math.min(t.tile, width - x0);
        let any = false;
        for (let yy = 0; yy < n && !any; yy++) for (let i = (yy * width + x0) * 4 + 3, e = i + w * 4; i < e; i += 4) if (px[i] !== 0) { any = true; break; }
        if (!any) continue;
        if (store) await t.ensure(x0, y0, w, n, store);
        if (w === width) { t.write(new ImageData(px, w, n), 0, y0); continue; }
        const seg = new ImageData(w, n);
        for (let yy = 0; yy < n; yy++) seg.data.set(px.subarray((yy * width + x0) * 4, (yy * width + x0 + w) * 4), yy * w * 4);
        t.write(seg, x0, y0);
      }
    }
    onRows(n);
    if (store) while (t.residentBytes > giantTiles.share()) { const k = t.leastUsed(); if (k === null || !(await t.pageOut(k, store))) break; }
  }
}

export async function readGiantPsd(file: Blob, opts: GiantOpen = {}): Promise<{ doc: Doc; notes: string[]; activeId: ID | null; paths: null; report: PsdReport }> {
  const src: PsbSource = blobSource(file), h: PsbHeader | null = await peekHeader(src);
  if (!h) throw new Error('This is not a PSD or PSB file.');
  if (h.mode !== 1 && h.mode !== 3) throw new Error(`This file is ${h.width.toLocaleString('en-US')} by ${h.height.toLocaleString('en-US')} pixels: a picture that large opens only in RGB or Grayscale mode.`);
  if (h.depth !== 8 && h.depth !== 16) throw new Error(`This file is ${h.depth} bits per channel: a picture past one canvas opens at 8 or 16 bits per channel.`);
  const st = await readStructure(src, h), prefix = st.resourcesEnd <= 1 << 26 ? (await src.read(0, st.resourcesEnd)).slice().buffer : null;
  const blocks = prefix ? resourceBlocks(prefix) : new Map<number, Uint8Array>(), icc = prefix ? readIccProfile(prefix) : null;
  const doc: Doc = { id: uid(), width: h.width, height: h.height, resolution: resolutionOf(blocks.get(1005)) ?? 72, layers: [] };
  const layers: Layer[] = [], notes: string[] = [], kept: string[] = [], closed: ID[] = [], store = giantTiles.store ?? idle;
  const real = st.layers.filter((l) => l.section === 0), pixelRows = real.reduce((n, l) => n + l.height, 0), total = Math.max(1, pixelRows || h.height);
  const stack: Layer[] = [], bases: Array<Layer | null> = [null], count = { settings: 0, masks: 0, styles: 0, vectors: 0, zip: 0, type: 0, smart: 0 };
  let done = 0;
  const onRows = (n: number): void => { done += n; opts.step?.(Math.min(done, total), total); };
  const free = (): void => { for (const l of layers) l.tiled?.release(store); };
  try {
    for (const l of st.layers) {
      const parent = stack.at(-1)?.id ?? null;
      if (l.section === 3) { stack.push(newLayer('Group', doc, { isGroup: true, parentId: parent })); bases.push(null); continue; }
      if (l.section === 1 || l.section === 2) {
        const g = stack.pop();
        bases.pop();
        if (!g) continue;
        const through = l.blend === 'pass', blend = through ? 'normal' : l.blend;
        Object.assign(g, { name: l.name, visible: !l.hidden, opacity: l.opacity, blend, ...(!through && blend === 'normal' ? { isolate: true } : {}) });
        if (l.section === 2) closed.push(g.id);
        layers.push(g);
        bases[bases.length - 1] = null;
        continue;
      }
      if (l.keys.some((k) => SETTINGS_ONLY.has(k)) && (l.width === 0 || l.height === 0)) { count.settings++; continue; }
      if (l.masked) count.masks++;
      if (l.keys.some((k) => k === 'lfx2' || k === 'lrFX' || k === 'lfxs')) count.styles++;
      if (l.keys.some((k) => k === 'vmsk' || k === 'vsms')) count.vectors++;
      if (l.keys.includes('TySh') || l.keys.includes('tySh')) count.type++;
      if (l.keys.includes('SoLd') || l.keys.includes('PlLd') || l.keys.includes('SoLE')) count.smart++;
      const plans: PsbPlan[] = await planLayer(src, h, l), readable = !plans.some((p) => p.comp > 1);
      if (!readable) count.zip++;
      const t = new TiledRaster(Math.max(1, l.width || h.width), Math.max(1, l.height || h.height));
      if (readable && plans.length && l.width > 0 && l.height > 0) {
        await fill(t, l.width, l.height, (y0, y1) => readBand(src, h, plans, l.width, y0, y1), onRows, opts.stopped).catch((err) => { t.release(store); throw err; });
      } else onRows(l.height);
      const base = bases[bases.length - 1];
      const layer = newLayer(l.name, doc, { raster: null, tiled: t, transform: { ...docTransform(t.width, t.height), x: l.left, y: l.top }, visible: !l.hidden, opacity: l.opacity, blend: l.blend === 'pass' ? 'normal' : l.blend, parentId: parent, ...(l.clipping && base ? { clipId: base.id } : {}) });
      if (!(l.clipping && base)) bases[bases.length - 1] = layer;
      layers.push(layer);
    }
    if (!real.length) {
      const plans = await planComposite(src, h, st.compositeAt);
      if (!plans.length || plans.some((p) => p.comp > 1)) throw new Error('This picture has no layers and its merged image is stored in a form that is not read in bands.');
      const t = new TiledRaster(h.width, h.height);
      await fill(t, h.width, h.height, (y0, y1) => readBand(src, h, plans, h.width, y0, y1), onRows, opts.stopped).catch((err) => { t.release(store); throw err; });
      layers.push(newLayer('Background', doc, { raster: null, tiled: t }));
      notes.push('This file has no layers; it opened as a single one.');
    }
  } catch (err) { free(); throw err; }
  while (stack.length) layers.push(stack.pop() as Layer);
  if (closed.length) doc.collapsed = closed;
  if (icc) { doc.profile = icc; kept.push(`Colour profile ${icc.name}.`); }
  kept.push(`${Math.round((h.width * h.height) / 1e6).toLocaleString('en-US')} megapixels opened in tiles: ${h.width.toLocaleString('en-US')} by ${h.height.toLocaleString('en-US')} pixels, each layer read a band of rows at a time.`);
  if (h.depth === 16) notes.push('This 16-bit file opened at 8 bits per channel.');
  if (count.zip) notes.push(`${count.zip} layer${count.zip === 1 ? ' is' : 's are'} stored with ZIP compression, which is not read in bands; ${count.zip === 1 ? 'it was' : 'they were'} left blank and keep their names and places.`);
  if (count.settings) notes.push(`${count.settings} adjustment or fill layer${count.settings === 1 ? ' was' : 's were'} left out: a picture this large opens only the layers that hold pixels.`);
  if (count.masks) notes.push(`${count.masks} layer mask${count.masks === 1 ? ' was' : 's were'} left out.`);
  if (count.styles) notes.push(`${count.styles} layer${count.styles === 1 ? "'s" : 's\''} styles were left out.`);
  if (count.vectors) notes.push(`${count.vectors} vector mask${count.vectors === 1 ? ' was' : 's were'} left out.`);
  if (count.type) notes.push(`${count.type} type layer${count.type === 1 ? ' opened' : 's opened'} as pixels, not editable type.`);
  if (count.smart) notes.push(`${count.smart} smart object${count.smart === 1 ? ' opened' : 's opened'} as pixels, without ${count.smart === 1 ? 'its' : 'their'} contents.`);
  if ([...blocks.keys()].some((k) => k >= 2000 && k <= 2997)) notes.push("The file's saved paths were left out.");
  return { doc: { ...doc, layers }, notes, activeId: layers.at(-1)?.id ?? null, paths: null, report: reportOf(layers.filter((l) => !l.isGroup).length, kept, notes) };
}
