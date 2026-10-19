import { SelectionMask } from './selection';
import { createSurface, ctxOf, type Ctx2D } from './surface';
import type { AlphaChannel, Doc } from './types';

/** The first "Alpha N" no channel of `list` is named. */
export function nextAlphaName(list: readonly AlphaChannel[]): string {
  const taken = new Set(list.map((a) => a.name));
  let n = 1;
  while (taken.has(`Alpha ${n}`)) n += 1;
  return `Alpha ${n}`;
}

/** The first "Spot N" no channel of `list` is named. */
export function nextSpotName(list: readonly AlphaChannel[]): string {
  const taken = new Set(list.map((a) => a.name));
  let n = 1;
  while (taken.has(`Spot ${n}`)) n += 1;
  return `Spot ${n}`;
}

/** The document's alpha channels moved with its canvas by `move` (a turn, flip or shift of each mask), as a patch for the doc. */
export function alphasMoved(doc: Doc, move: (m: SelectionMask) => SelectionMask | null): Partial<Doc> {
  return doc.alphas?.length ? { alphas: doc.alphas.map((a) => (a.mask ? { ...a, mask: move(a.mask) } : a)) } : {};
}

/** The document's alpha channels drawn anew into a canvas `w` by `h` by `draw` (given the context and each mask), as a patch for the doc. */
export function alphasRedrawn(doc: Doc, w: number, h: number, draw: (c: Ctx2D, m: SelectionMask) => void): Partial<Doc> {
  if (!doc.alphas?.length) return {};
  return {
    alphas: doc.alphas.map((a) => {
      if (!a.mask) return a;
      const s = createSurface(w, h), c = ctxOf(s);
      draw(c, a.mask);
      return { ...a, mask: SelectionMask.fromAlpha(0, 0, w, h, c.getImageData(0, 0, w, h).data) };
    }),
  };
}

/** A grey picture of a mask over a `w` by `h` document (white selected, black not), for the project file and thumbnails. */
export function alphaGrey(mask: SelectionMask | null, w: number, h: number): ImageData {
  const img = new ImageData(w, h), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  if (!mask) return img;
  for (let j = 0; j < mask.h; j++) {
    const y = mask.y + j;
    if (y < 0 || y >= h) continue;
    for (let i = 0; i < mask.w; i++) {
      const x = mask.x + i;
      if (x < 0 || x >= w) continue;
      const v = mask.data[j * mask.w + i], o = (y * w + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = v;
    }
  }
  return img;
}
