import { describe, expect, it } from 'vitest';
import './setup';
import { motionBlur } from '../src/engine/filters';
import { estimateShake } from '../src/engine/shake';

const texture = (w: number, h: number, seed = 7): ImageData => {
  let s = seed;
  const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  // Smoothed random noise: no direction of its own. (Axis-aligned blocks exactly half the blur's length make the
  // horizontal and vertical statistics equal by construction, which no estimator could tell apart.)
  const raw = Array.from({ length: w * h }, () => rnd() * 255), img = new ImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { a += raw[yy * w + xx]; n++; } }
    const v = Math.round(a / n);
    img.data.set([v, v, v, 255], (y * w + x) * 4);
  }
  return img;
};
const angleGap = (a: number, b: number): number => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

describe('Shake Reduction trace estimate', () => {
  for (const [angle, length] of [[0, 12], [30, 16], [-45, 10], [75, 14]] as const) {
    it(`recovers a ${length} px blur at ${angle} degrees`, () => {
      const est = estimateShake(motionBlur(texture(240, 180), angle, length));
      expect(angleGap(est.angle, angle)).toBeLessThanOrEqual(6);
      expect(Math.abs(est.length - length)).toBeLessThanOrEqual(Math.max(2, length * 0.25));
    });
  }
});
