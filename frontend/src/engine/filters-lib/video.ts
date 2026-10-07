import type { LibFilter } from '../filter-library';
import { copyImage } from './shared';

/** De-Interlace: the rows of one field (the odd rows, counted from 1 at the canvas's top, which lies at row `top` of
 *  this image, or the even ones) replaced, by the mean of the rows either side or by the row above (the row below at
 *  the top edge). */
export function deInterlaceImage(img: ImageData, eliminateEven: boolean, interpolate: boolean, top = 0): ImageData {
  const { width: w, height: h } = img, s = img.data, out = copyImage(img), d = out.data, rowLen = w * 4;
  for (let y = 0; y < h; y++) {
    const oddRow = (((y - top) % 2) + 2) % 2 === 0;
    if (oddRow === eliminateEven) continue;
    const up = y > 0 ? y - 1 : y + 1, down = y < h - 1 ? y + 1 : y - 1;
    if (up < 0 || up >= h) continue;
    for (let i = 0; i < rowLen; i++) {
      d[y * rowLen + i] = interpolate && down >= 0 && down < h ? (s[up * rowLen + i] + s[down * rowLen + i]) / 2 : s[up * rowLen + i];
    }
  }
  return out;
}

/** NTSC Colors: each colour's chroma, measured in YIQ, reduced until the composite signal stays between -0.1 and 1.0
 *  of white, so the image is safe to broadcast; brightness kept. */
export function ntscImage(img: ImageData): ImageData {
  const out = copyImage(img), d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const y = 0.299 * r + 0.587 * g + 0.114 * b, iq = 0.596 * r - 0.274 * g - 0.322 * b, q = 0.211 * r - 0.523 * g + 0.312 * b;
    const c = Math.hypot(iq, q);
    if (c <= 1e-6) continue;
    const k = Math.min(1, (1 - y) / c, (y + 0.1) / c);
    if (k >= 1) continue;
    const i2 = iq * Math.max(0, k), q2 = q * Math.max(0, k);
    d[i] = (y + 0.956 * i2 + 0.621 * q2) * 255;
    d[i + 1] = (y - 0.272 * i2 - 0.647 * q2) * 255;
    d[i + 2] = (y - 1.106 * i2 + 1.703 * q2) * 255;
  }
  return out;
}

export const VIDEO_FILTERS: LibFilter[] = [
  {
    id: 'deInterlace', label: 'De-Interlace', group: 'Video', grows: false,
    params: [
      { key: 'eliminate', label: 'Eliminate', kind: 'select', def: 'oddFields', options: [['oddFields', 'Odd Fields'], ['evenFields', 'Even Fields']] },
      { key: 'createBy', label: 'Create New Fields by', kind: 'select', def: 'interpolation', options: [['interpolation', 'Interpolation'], ['duplication', 'Duplication']] },
    ],
    reach: null,
    run: (src, v, ctx) => deInterlaceImage(src, v.eliminate === 'evenFields', v.createBy !== 'duplication', Math.round(ctx.canvas.y)),
  },
  {
    id: 'ntscColors', label: 'NTSC Colors', group: 'Video', params: [], grows: false,
    reach: () => 0,
    run: (src) => ntscImage(src),
  },
];
