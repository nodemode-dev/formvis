import { describe, expect, it } from 'vitest';
import { histogram, vectorscope, waveform } from './scopes';

const img = (w: number, h: number, px: (x: number, y: number) => [number, number, number]): ImageData => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = px(x, y); data.set([r, g, b, 255], (y * w + x) * 4); }
  return { width: w, height: h, data, colorSpace: 'srgb' } as ImageData;
};

describe('scopes (1.53.4)', () => {
  it('counts each channel and luma in the histogram', () => {
    const h = histogram(img(10, 10, (x) => (x < 5 ? [255, 0, 0] : [0, 0, 0])));
    expect([h.r[255], h.r[0], h.g[0], h.l[54], h.l[0]]).toEqual([50, 50, 100, 50, 50]);   // red's Rec. 709 luma is 54
  });

  it('places bright columns high and dark ones low on the waveform', () => {
    const w = waveform(img(64, 8, (x) => (x < 32 ? [255, 255, 255] : [0, 0, 0])), 2, 4);
    expect([w[0 * 2 + 0], w[3 * 2 + 1]]).toEqual([256, 256]);   // left column top row, right column bottom row
  });

  it('puts grey at the centre of the vectorscope, red up and left, blue right', () => {
    const at = (rgb: [number, number, number]): [number, number] => { const v = vectorscope(img(4, 4, () => rgb), 100), i = v.findIndex((n) => n > 0); return [i % 100, Math.floor(i / 100)]; };
    expect(at([128, 128, 128])).toEqual([50, 50]);
    const [rx, ry] = at([255, 0, 0]), [bx, by] = at([0, 0, 255]);
    expect(rx < 50 && ry < 50 && bx > 50 && by > 40).toBe(true);
  });
});
