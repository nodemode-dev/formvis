import { SelectionMask } from './selection';

/** An alpha channel as a document-sized grey picture (the value in red, green and blue, opaque), for an adjustment to work on. */
export function alphaPlane(mask: SelectionMask | null, w: number, h: number): ImageData {
  const img = new ImageData(w, h), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  if (!mask) return img;
  for (let j = 0; j < mask.h; j++) {
    const y = mask.y + j;
    if (y < 0 || y >= h) continue;
    for (let i = 0; i < mask.w; i++) {
      const x = mask.x + i;
      if (x < 0 || x >= w) continue;
      const o = (y * w + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = mask.data[j * mask.w + i];
    }
  }
  return img;
}

/** The channel after an edit: the grey of `out` where `region` selects it (blended by its coverage), `src` elsewhere. Null when nothing is left. */
export function planeMask(src: ImageData, out: ImageData, region: SelectionMask | null): SelectionMask | null {
  const w = src.width, h = src.height, data = new Uint8Array(w * h), s = src.data, o = out.data;
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    const was = s[j], made = Math.round((o[j] + o[j + 1] + o[j + 2]) / 3), k = region ? region.valueAt(i % w, Math.floor(i / w)) : 255;
    data[i] = k === 255 ? made : k === 0 ? was : Math.round(was + ((made - was) * k) / 255);
  }
  return SelectionMask.cropped(0, 0, w, h, data);
}
