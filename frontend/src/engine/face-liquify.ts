import type { LiquifyField } from './liquify';

/** Face-Aware Liquify (1.56.7, the parity plan's M3), with Face-Aware sliders: a face's five landmarks
 *  (engine YuNet: the eyes, the nose tip, the mouth corners, and its box) place smooth local warps on Liquify's own
 *  displacement grid, recomputed from the sliders each time one moves, so they never compound. Sizes scale with the
 *  distance between the eyes. Positive values enlarge, raise, widen or smile. Eye Tilt, Eye Width, Upper and Lower
 *  Lip and Jawline need more landmarks than YuNet gives and wait for a landmark model. */

export interface Face { box: [number, number, number, number]; eyeLeft: [number, number]; eyeRight: [number, number]; nose: [number, number]; mouthLeft: [number, number]; mouthRight: [number, number] }
export type FaceSlider = 'eyeSize' | 'eyeHeight' | 'eyeDistance' | 'noseHeight' | 'noseWidth' | 'smile' | 'mouthWidth' | 'mouthHeight' | 'forehead' | 'chinHeight' | 'faceWidth';
export const FACE_SLIDERS: ReadonlyArray<readonly [FaceSlider, string]> = [['eyeSize', 'Eye Size'], ['eyeHeight', 'Eye Height'], ['eyeDistance', 'Eye Distance'], ['noseHeight', 'Nose Height'], ['noseWidth', 'Nose Width'], ['smile', 'Smile'], ['mouthWidth', 'Mouth Width'], ['mouthHeight', 'Mouth Height'], ['forehead', 'Forehead'], ['chinHeight', 'Chin Height'], ['faceWidth', 'Face Width']];
export type FaceSettings = Record<FaceSlider, number>;
export const noFaceChange = (): FaceSettings => Object.fromEntries(FACE_SLIDERS.map(([k]) => [k, 0])) as FaceSettings;

const smooth = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** The face's displacement for `f`'s grid (two floats a node), each node weighed by one minus its freeze. */
export function faceField(f: LiquifyField, face: Face, s: FaceSettings): Float32Array {
  const d = new Float32Array(f.d.length);
  const [elx, ely] = face.eyeLeft, [erx, ery] = face.eyeRight, [nx, ny] = face.nose, [mlx, mly] = face.mouthLeft, [mrx, mry] = face.mouthRight;
  const ed = Math.max(4, Math.hypot(erx - elx, ery - ely)), ex = (elx + erx) / 2, ey = (ely + ery) / 2, mx = (mlx + mrx) / 2, my = (mly + mry) / 2;
  /** Moves what lies around (cx, cy) by (dx, dy), fading to nothing at `r`. */
  const move = (cx: number, cy: number, r: number, dx: number, dy: number): void => visit(cx, cy, r, (i, _px, _py, w) => { d[i] += dx * w; d[i + 1] += dy * w; });
  /** Scales what lies around (cx, cy) by kx and ky (above 1 enlarges), fading at `r`. */
  const scale = (cx: number, cy: number, r: number, kx: number, ky: number): void => visit(cx, cy, r, (i, px, py, w) => { d[i] += (px - cx) * (1 - 1 / kx) * w; d[i + 1] += (py - cy) * (1 - 1 / ky) * w; });
  const visit = (cx: number, cy: number, radius: number, fn: (i: number, px: number, py: number, w: number) => void): void => {
    const r = Math.max(2, radius), x0 = Math.max(0, Math.floor((cx - r) / f.cell)), y0 = Math.max(0, Math.floor((cy - r) / f.cell));
    const x1 = Math.min(f.gw - 1, Math.ceil((cx + r) / f.cell)), y1 = Math.min(f.gh - 1, Math.ceil((cy + r) / f.cell));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const px = gx * f.cell, py = gy * f.cell, t = Math.hypot(px - cx, py - cy) / r, n = gy * f.gw + gx;
      if (t >= 1) continue;
      fn(n * 2, px, py, smooth(1 - t) * (f.freeze ? 1 - f.freeze[n] : 1));
    }
  };
  const v = (k: FaceSlider): number => Math.max(-100, Math.min(100, s[k] ?? 0)) / 100;
  if (v('eyeSize')) { const k = 1 + v('eyeSize') * 0.3; scale(elx, ely, ed * 0.38, k, k); scale(erx, ery, ed * 0.38, k, k); }
  if (v('eyeHeight')) { const dy = -v('eyeHeight') * ed * 0.12; move(elx, ely, ed * 0.45, 0, dy); move(erx, ery, ed * 0.45, 0, dy); }
  if (v('eyeDistance')) { const dx = v('eyeDistance') * ed * 0.1; move(elx, ely, ed * 0.45, -dx, 0); move(erx, ery, ed * 0.45, dx, 0); }
  if (v('noseHeight')) move(nx, ny, ed * 0.4, 0, -v('noseHeight') * ed * 0.1);
  if (v('noseWidth')) scale(nx, ny, ed * 0.38, 1 + v('noseWidth') * 0.3, 1);
  if (v('smile')) { const dy = -v('smile') * ed * 0.1; move(mlx, mly, ed * 0.3, -Math.abs(dy) * 0.3, dy); move(mrx, mry, ed * 0.3, Math.abs(dy) * 0.3, dy); }
  if (v('mouthWidth')) { const dx = v('mouthWidth') * ed * 0.1; move(mlx, mly, ed * 0.35, -dx, 0); move(mrx, mry, ed * 0.35, dx, 0); }
  if (v('mouthHeight')) scale(mx, my, ed * 0.45, 1, 1 + v('mouthHeight') * 0.35);
  if (v('forehead')) move(ex, ey - ed * 0.9, ed * 0.85, 0, -v('forehead') * ed * 0.15);
  if (v('chinHeight')) move(mx, my + ed * 0.75, ed * 0.6, 0, v('chinHeight') * ed * 0.15);
  if (v('faceWidth')) { const dx = v('faceWidth') * ed * 0.12, cy = (ey + my) / 2, half = Math.max(ed * 0.9, face.box[2] / 2); move(ex - half, cy, ed * 0.7, -dx, 0); move(ex + half, cy, ed * 0.7, dx, 0); }
  return d;
}
