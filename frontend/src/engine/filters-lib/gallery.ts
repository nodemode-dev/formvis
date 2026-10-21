import type { LibFilter, LibParam, LibValues } from '../filter-library';
import { boxOf, clipBox, copyImage, type Box } from './shared';

const num = (v: LibValues, k: string): number => v[k] as number;

export interface SpinSettings { cx: number; cy: number; rx: number; ry: number; angle: number; blur: number }

/** Blur Gallery > Spin Blur: inside an ellipse (centre, radii, turned by `angle` degrees) each pixel is smeared along
 *  the ellipse's own arcs through it, over `blur` degrees, fully inside and fading to nothing a tenth of the radius
 *  beyond the rim, sampled bilinearly about a pixel apart; pixels outside `clip` (the canvas in this image) are left
 *  alone. */
export function spinImage(src: ImageData, o: SpinSettings, clip: Box): ImageData {
  const out = copyImage(src), b = clipBox(clip, src.width, src.height);
  if (!b || o.blur <= 0 || o.rx <= 0 || o.ry <= 0) return out;
  const { width: w, height: h } = src, s = src.data, d = out.data, t = (o.angle * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t), span = (o.blur * Math.PI) / 180;
  const acc = new Float64Array(4), tap = (q: number, wt: number): void => { const al = s[q + 3] * wt; acc[0] += s[q] * al; acc[1] += s[q + 1] * al; acc[2] += s[q + 2] * al; acc[3] += al; };
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const dx = x + 0.5 - o.cx, dy = y + 0.5 - o.cy, u = (dx * cs + dy * sn) / o.rx, v = (-dx * sn + dy * cs) / o.ry, rho = Math.hypot(u, v);
    const weight = rho <= 1 ? 1 : rho >= 1.1 ? 0 : (1.1 - rho) / 0.1;
    if (weight <= 0 || rho === 0) continue;
    const arc = span * weight, n = Math.max(3, Math.min(240, Math.ceil(arc * rho * Math.max(o.rx, o.ry)) + 1)), phi = Math.atan2(v, u);
    acc.fill(0);
    for (let k = 0; k < n; k++) {
      const a = phi + arc * (k / (n - 1) - 0.5), su = Math.cos(a) * rho * o.rx, sv = Math.sin(a) * rho * o.ry;
      const fx = Math.min(w - 1, Math.max(0, o.cx + su * cs - sv * sn - 0.5)), fy = Math.min(h - 1, Math.max(0, o.cy + su * sn + sv * cs - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      tap((y0 * w + x0) * 4, (1 - tx) * (1 - ty)); tap((y0 * w + x1) * 4, tx * (1 - ty)); tap((y1 * w + x0) * 4, (1 - tx) * ty); tap((y1 * w + x1) * 4, tx * ty);
    }
    const i = (y * w + x) * 4;
    if (acc[3] > 0) { d[i] = acc[0] / acc[3]; d[i + 1] = acc[1] / acc[3]; d[i + 2] = acc[2] / acc[3]; }
    d[i + 3] = acc[3] / n;
  }
  return out;
}

export const GALLERY_FILTERS: LibFilter[] = [
  {
    id: 'spinBlur', label: 'Spin Blur', group: 'Blur Gallery', grows: false, reach: null,
    note: 'Up to three spins; each has its center in percent of the selection or canvas and its radii in percent of their shorter side. Spins 2 and 3 apply only when Spins says so.',
    params: [
      { key: 'blurAngle', label: 'Blur Angle (°)', kind: 'range', min: 0, max: 360, step: 1, def: 15 },
      { key: 'x', label: 'Center X (%)', kind: 'range', min: 0, max: 100, step: 1, def: 50 },
      { key: 'y', label: 'Center Y (%)', kind: 'range', min: 0, max: 100, step: 1, def: 50 },
      { key: 'radiusX', label: 'Radius X (%)', kind: 'range', min: 1, max: 100, step: 1, def: 30 },
      { key: 'radiusY', label: 'Radius Y (%)', kind: 'range', min: 1, max: 100, step: 1, def: 30 },
      { key: 'angle', label: 'Rotation (°)', kind: 'range', min: -180, max: 180, step: 1, def: 0 },
      { key: 'spins', label: 'Spins', kind: 'range', min: 1, max: 3, step: 1, def: 1 },
      ...([2, 3] as const).flatMap((n): LibParam[] => [
        { key: `blurAngle${n}`, label: `Spin ${n} Blur Angle (°)`, kind: 'range', min: 0, max: 360, step: 1, def: 15 },
        { key: `x${n}`, label: `Spin ${n} Center X (%)`, kind: 'range', min: 0, max: 100, step: 1, def: n === 2 ? 25 : 75 },
        { key: `y${n}`, label: `Spin ${n} Center Y (%)`, kind: 'range', min: 0, max: 100, step: 1, def: 50 },
        { key: `radiusX${n}`, label: `Spin ${n} Radius X (%)`, kind: 'range', min: 1, max: 100, step: 1, def: 15 },
        { key: `radiusY${n}`, label: `Spin ${n} Radius Y (%)`, kind: 'range', min: 1, max: 100, step: 1, def: 15 },
        { key: `angle${n}`, label: `Spin ${n} Rotation (°)`, kind: 'range', min: -180, max: 180, step: 1, def: 0 },
      ]),
    ],
    run: (src, v, ctx) => {
      const a = ctx.area, short = Math.max(1, Math.min(a.w, a.h)), c = boxOf(ctx.canvas), clip = clipBox(c, src.width, src.height) ?? { x0: 0, y0: 0, x1: src.width, y1: src.height };
      let out = src;
      for (let n = 1; n <= Math.round(num(v, 'spins')); n++) {
        const k = n === 1 ? '' : String(n);
        out = spinImage(out, { cx: a.x + (a.w * num(v, `x${k}`)) / 100, cy: a.y + (a.h * num(v, `y${k}`)) / 100, rx: (short * num(v, `radiusX${k}`)) / 100, ry: (short * num(v, `radiusY${k}`)) / 100, angle: num(v, `angle${k}`), blur: num(v, `blurAngle${k}`) }, clip);
      }
      return out;
    },
  },
];
