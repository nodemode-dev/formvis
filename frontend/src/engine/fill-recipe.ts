import { createSurface, ctxOf, type Surface } from './surface';
import { compositeOp, type BlendMode, type RGB } from './types';

/* A solid colour fill's recipe (DEV_PLAN 36.18): what Edit > Fill with a colour does to a rectangle of a layer, kept in
   place of the pixels it left there. The step keeps its `before` (undo needs it) and redo works the `after` out again. */
export interface SolidFill { color: RGB; blend: BlendMode; opacity: number; preserve: boolean; w: number; h: number; cover: Surface | null }

/** The pixels a solid fill leaves in its rectangle, given the pixels it found there: the same draws fillWith makes
 *  (colour, the selection's coverage, the blend at the opacity, the layer's transparency kept when asked), then the
 *  result laid on a cleared surface as it is laid on the cleared layer. */
export function solidFillPixels(before: ImageData, f: SolidFill): ImageData {
  const { w, h } = f, s = createSurface(w, h), sc = ctxOf(s);
  sc.fillStyle = `rgba(${f.color.r},${f.color.g},${f.color.b},1)`;
  sc.fillRect(0, 0, w, h);
  if (f.cover) { sc.globalCompositeOperation = 'destination-in'; sc.drawImage(f.cover, 0, 0); }
  const orig = createSurface(w, h), out = createSurface(w, h), oc = ctxOf(out);
  ctxOf(orig).putImageData(before, 0, 0);
  oc.drawImage(orig, 0, 0);
  oc.globalAlpha = f.opacity;
  oc.globalCompositeOperation = compositeOp(f.blend);
  oc.drawImage(s, 0, 0);
  if (f.preserve) { oc.globalAlpha = 1; oc.globalCompositeOperation = 'destination-in'; oc.drawImage(orig, 0, 0); }
  const fin = createSurface(w, h), fc = ctxOf(fin);
  fc.drawImage(out, 0, 0);
  const img = fc.getImageData(0, 0, w, h);
  for (const x of [s, orig, out, fin]) { x.width = 0; x.height = 0; }
  return img;
}

/** Whether two images hold the same bytes. */
export function sameImage(a: ImageData, b: ImageData): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const x = a.data, y = b.data;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
