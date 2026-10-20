import { Renderer } from './renderer';
import { Raster, createSurface, ctxOf } from './surface';
import type { DeepPixels, Doc, Layer } from './types';
import { composeFloat } from './compose-float';
import type { CompIn, CompOut, WireLayer } from './composite-bands';
import type { FxDone, FxJob, FxPartWire, FxPut } from './fx-wire';
import { addPattern } from './patterns';

/** One band of the CPU composite, drawn by the very renderer the page uses on its own thread: the worker keeps the layer
 *  pixels it was sent (by key, so a layer that has not changed is not sent again), builds a document of them and renders
 *  rows y0 to y1 with the view moved up by y0. The bytes are the single-thread composite's. */

const renderer = new Renderer();
const rasters = new Map<string, Raster>();
const scope = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent<CompIn | FxPut | FxJob>) => void) | null };

function keep(key: string, width: number, height: number, pixels: ArrayBufferLike): void {
  const r = new Raster(width, height), bytes = new Uint8ClampedArray(pixels.byteLength);
  bytes.set(new Uint8ClampedArray(pixels));
  r.ctx.putImageData(new ImageData(bytes, width, height), 0, 0);
  rasters.set(key, r);
}

function layerOf(w: WireLayer): Layer {
  const raster = w.raster ? rasters.get(w.raster) ?? null : null, mr = w.mask ? rasters.get(w.mask.raster) ?? null : null;
  const l = { id: w.id, name: w.name, isGroup: w.isGroup, parentId: w.parentId, visible: w.visible, opacity: w.opacity, blend: w.blend, transform: w.transform, raster, mask: w.mask ? { raster: mr, enabled: w.mask.enabled, linked: false, placement: w.mask.placement } : null, fill: w.fill, clipId: null, adjustment: null };
  return l as unknown as Layer;
}

function keepBitmap(key: string, width: number, height: number, bitmap: ImageBitmap): void {
  const r = new Raster(width, height);
  r.ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  rasters.set(key, r);
}

/** A previewed layer's effect parts (CO-0274), drawn by the renderer's own builder and handed back as bitmaps. */
function buildEffects(m: FxJob): void {
  const began = performance.now();
  try {
    const live = new Set<string>(m.live);
    for (const k of [...rasters.keys()]) if (!live.has(k)) rasters.delete(k);
    const src = rasters.get(m.src), mr = m.mask ? rasters.get(m.mask.key) ?? null : null;
    const cv = m.cover ? rasters.get(m.cover) ?? null : null;
    if (!src || (m.mask && !mr) || (m.cover && !cv)) throw new Error('a layer picture is missing');
    for (const p of m.patterns) { const r = rasters.get(p.key); if (r) addPattern('Pattern', r.canvas, p.id); }
    const layer = { id: m.layerId, name: '', raster: src, mask: null, transparencyShapes: m.shapes ? undefined : false } as unknown as Layer;
    const own = m.mask && mr ? { src: mr.canvas, w: m.mask.w, h: m.mask.h, t: m.mask.t, covers: m.mask.covers } : null;
    renderer.fastEffects = m.fast;
    renderer.previewPixels = m.pixels;
    const out: FxPartWire[] = renderer.buildDetached(layer, m.fx, src.canvas, m.t, own, m.docW, m.docH, cv ? cv.canvas : null).map((p) => ({ bitmap: (p.s as OffscreenCanvas).transferToImageBitmap(), w: p.s.width, h: p.s.height, x: p.x, y: p.y, k: p.k, alpha: p.alpha, op: p.op, above: p.above, name: p.name, kept: p.kept }));
    scope.postMessage({ type: 'fxdone', id: m.id, ms: performance.now() - began, parts: out } satisfies FxDone, out.map((p) => p.bitmap));
  } catch (err) {
    scope.postMessage({ type: 'fxdone', id: m.id, ms: 0, error: String(err) } satisfies FxDone);
  }
}

const floats = new Map<string, DeepPixels>();

function floatBand(m: Extract<CompIn, { type: 'fband' }>): void {
  try {
    const bh = m.y1 - m.y0;
    const layers = m.layers.map((w) => {
      const channels = w.raster ? floats.get(w.raster) : undefined;
      return { id: w.id, name: w.name, isGroup: w.isGroup, parentId: w.parentId, visible: w.visible, opacity: w.opacity, blend: w.blend, transform: { ...w.transform, y: w.transform.y - m.y0 }, raster: channels ? {} : null, channels, mask: null, fill: w.fill, clipId: null, adjustment: null };
    });
    if (m.layers.some((w) => w.raster && !floats.has(w.raster))) throw new Error('a layer picture is missing');
    const doc = { width: m.width, height: bh, mode: 'rgb', depth: m.linear ? 32 : 16, layers } as unknown as Doc;
    const c = composeFloat(doc, 3, false, null, m.linear);
    if ('error' in c) throw new Error(c.error);
    if (m.out) {
      new Float32Array(m.out, m.y0 * m.width * 16, m.width * bh * 4).set(c.data);
      scope.postMessage({ id: m.id, y0: m.y0, y1: m.y1 } satisfies CompOut);
    } else {
      const buffer = c.data.buffer as ArrayBuffer;
      scope.postMessage({ id: m.id, y0: m.y0, y1: m.y1, pixels: buffer } satisfies CompOut, [buffer]);
    }
  } catch (err) {
    scope.postMessage({ id: m.id, y0: m.y0, y1: m.y1, error: String(err) } satisfies CompOut);
  }
}

scope.onmessage = (e: MessageEvent<CompIn | FxPut | FxJob>) => {
  const m = e.data;
  if (m.type === 'put') { keep(m.key, m.width, m.height, m.pixels); return; }
  if (m.type === 'fput') { floats.set(m.key, { mode: 'rgb', n: 3, width: m.width, height: m.height, data: new Float32Array(m.pixels) }); return; }
  if (m.type === 'fdrop') { floats.clear(); return; }
  if (m.type === 'fband') { floatBand(m); return; }
  if (m.type === 'fxput') { keepBitmap(m.key, m.width, m.height, m.bitmap); return; }
  if (m.type === 'fx') { buildEffects(m); return; }
  try {
    const live = new Set<string>(m.keys);
    for (const k of [...rasters.keys()]) if (!live.has(k)) rasters.delete(k);
    const doc = { width: m.width, height: m.height, layers: m.layers.map(layerOf) } as unknown as Doc;
    const bh = m.y1 - m.y0, target = createSurface(m.width, bh), v = m.matrix;
    renderer.render({ doc, target, view: [v[0], v[1], v[2], v[3], v[4], v[5] - m.y0], quality: m.quality, background: null });
    const px = ctxOf(target).getImageData(0, 0, m.width, bh).data;
    if (m.out) {
      new Uint8ClampedArray(m.out, m.y0 * m.width * 4, m.width * bh * 4).set(px);
      scope.postMessage({ id: m.id, y0: m.y0, y1: m.y1 } satisfies CompOut);
    } else {
      const buffer = px.buffer as ArrayBuffer;
      scope.postMessage({ id: m.id, y0: m.y0, y1: m.y1, pixels: buffer } satisfies CompOut, [buffer]);
    }
  } catch (err) {
    scope.postMessage({ id: m.id, y0: m.y0, y1: m.y1, error: String(err) } satisfies CompOut);
  }
};
