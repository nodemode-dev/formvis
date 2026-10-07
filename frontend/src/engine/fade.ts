import { blendPixels } from './blend';
import { createSurface, ctxOf } from './surface';
import { canvasBlend, compositeOp, type BlendMode } from './types';

/** `after` laid over `before` in `mode`: by the canvas where it has the mode, else per pixel. */
function laidOver(before: ImageData, after: ImageData, mode: BlendMode): Uint8ClampedArray {
  const w = after.width, h = after.height;
  if (mode === 'normal') return after.data;
  if (!canvasBlend(mode)) {
    const out = new Uint8ClampedArray(before.data);
    blendPixels(out, after.data, mode, 1, (i) => [i % w, Math.floor(i / w)]);
    return out;
  }
  const base = createSurface(w, h), top = createSurface(w, h), c = ctxOf(base);
  c.putImageData(before, 0, 0);
  ctxOf(top).putImageData(after, 0, 0);
  c.globalCompositeOperation = compositeOp(mode);
  c.drawImage(top, 0, 0);
  const out = c.getImageData(0, 0, w, h).data;
  base.width = base.height = top.width = top.height = 0;
  return out;
}

/** Edit > Fade: the last step's result (`after`) laid over the image as it was (`before`) in `mode`, then mixed with
 *  that earlier image by `opacity` (0 to 1), premultiplied so that edges against transparency keep their colour.
 *  Dissolve keeps each pixel of the result or not at all, with a chance of `opacity`, on its fixed pattern. */
export function fadeImages(before: ImageData, after: ImageData, mode: BlendMode, opacity: number): ImageData {
  const w = after.width, h = after.height, k = Math.min(1, Math.max(0, opacity));
  if (mode === 'dissolve') {
    const out = new Uint8ClampedArray(before.data);
    blendPixels(out, after.data, 'dissolve', k, (i) => [i % w, Math.floor(i / w)]);
    return new ImageData(out, w, h);
  }
  const top = laidOver(before, after, mode), b = before.data, out = new ImageData(w, h), d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const a0 = b[i + 3] / 255, a1 = top[i + 3] / 255, a = a0 * (1 - k) + a1 * k;
    d[i + 3] = a * 255;
    if (a <= 1e-9) continue;
    for (let c = 0; c < 3; c++) d[i + c] = (b[i + c] * a0 * (1 - k) + top[i + c] * a1 * k) / a;
  }
  return out;
}
