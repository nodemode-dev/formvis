import { Renderer } from './renderer';
import { Raster, createSurface, ctxOf } from './surface';
import type { Doc, Layer } from './types';
import type { CompIn, CompOut, WireLayer } from './composite-bands';

/** One band of the CPU composite, drawn by the very renderer the page uses on its own thread: the worker keeps the layer
 *  pixels it was sent (by key, so a layer that has not changed is not sent again), builds a document of them and renders
 *  rows y0 to y1 with the view moved up by y0. The bytes are the single-thread composite's. */

const renderer = new Renderer();
const rasters = new Map<string, Raster>();
const scope = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent<CompIn>) => void) | null };

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

scope.onmessage = (e: MessageEvent<CompIn>) => {
  const m = e.data;
  if (m.type === 'put') { keep(m.key, m.width, m.height, m.pixels); return; }
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
