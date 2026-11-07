import { blendPixels } from '../../frontend/src/engine/blend';
import { canvasBlend, compositeOp } from '../../frontend/src/engine/types';
import type { Kernel, KernelContext } from '../../frontend/src/engine/kernels';
import { adjustDef } from './adjust-defs';
import { makeCanvas, type AdjustLayer, type Doc, type PixelLayer } from './model';

const kernels = new WeakMap<AdjustLayer, { key: string; kernel: Kernel }>();

function kernelOf(l: AdjustLayer): Kernel | null {
  const key = l.def + JSON.stringify(l.values);
  const hit = kernels.get(l);
  if (hit && hit.key === key) return hit.kernel;
  const def = adjustDef(l.def);
  if (!def) return null;
  const kernel = def.kernel(l.values);
  kernels.set(l, { key, kernel });
  return kernel;
}

let flat = makeCanvas(1, 1);
let scratch = makeCanvas(1, 1);
const cut = makeCanvas(1, 1);

export function bakeMask(l: PixelLayer, into: HTMLCanvasElement = cut): HTMLCanvasElement {
  if (into.width !== l.canvas.width) into.width = l.canvas.width;
  if (into.height !== l.canvas.height) into.height = l.canvas.height;
  const g = into.getContext('2d')!;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, into.width, into.height);
  g.drawImage(l.canvas, 0, 0);
  if (l.mask) {
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(l.mask, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }
  return into;
}

function fit(c: HTMLCanvasElement, w: number, h: number): void {
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
}

export function compose(doc: Doc, upTo = doc.layers.length): HTMLCanvasElement {
  const { w, h } = doc;
  fit(flat, w, h);
  fit(scratch, w, h);
  const ctx = flat.getContext('2d', { willReadFrequently: true })!;
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  const kctx: KernelContext = { width: w, height: h, originX: 0, originY: 0, unitsPerPixel: 1 };
  for (let i = 0; i < upTo; i++) {
    const l = doc.layers[i];
    if (!l.visible) continue;
    if (l.kind === 'pixel') {
      const source = l.mask ? bakeMask(l) : l.canvas;
      if (canvasBlend(l.blend)) {
        ctx.globalAlpha = l.opacity;
        ctx.globalCompositeOperation = compositeOp(l.blend);
        ctx.drawImage(source, l.x, l.y);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else {
        sctx.clearRect(0, 0, w, h);
        sctx.drawImage(source, l.x, l.y);
        const src = sctx.getImageData(0, 0, w, h);
        const dst = ctx.getImageData(0, 0, w, h);
        blendPixels(dst.data, src.data, l.blend, l.opacity, (p) => [p % w, (p / w) | 0]);
        ctx.putImageData(dst, 0, 0);
      }
    } else {
      const kernel = kernelOf(l);
      if (!kernel) continue;
      const img = ctx.getImageData(0, 0, w, h);
      if (l.opacity >= 1) {
        kernel(img.data, kctx);
      } else {
        const before = new Uint8ClampedArray(img.data);
        kernel(img.data, kctx);
        const d = img.data, t = l.opacity;
        for (let p = 0; p < d.length; p += 4) {
          d[p] = before[p] + (d[p] - before[p]) * t;
          d[p + 1] = before[p + 1] + (d[p + 1] - before[p + 1]) * t;
          d[p + 2] = before[p + 2] + (d[p + 2] - before[p + 2]) * t;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
  }
  return flat;
}

export function flatImage(doc: Doc): ImageData {
  const c = compose(doc);
  return c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, doc.w, doc.h);
}

export function detached(doc: Doc, upTo = doc.layers.length): HTMLCanvasElement {
  const src = compose(doc, upTo);
  const out = makeCanvas(src.width, src.height);
  out.getContext('2d')!.drawImage(src, 0, 0);
  return out;
}
