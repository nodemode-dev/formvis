import type { ParamSpec } from '../../frontend/src/engine/adjust-params';
import { desaturatePixels, equalizePixels } from '../../frontend/src/engine/adjust';
import { addNoise, gaussianBlur, motionBlur, unsharpMask } from '../../frontend/src/engine/filters';

export interface FilterDef { id: string; label: string; specs: ParamSpec[]; run: (img: ImageData, v: Record<string, unknown>) => ImageData }

const range = (key: string, label: string, min: number, max: number, def: number, step = 1): ParamSpec => ({ key, label, kind: 'range', min, max, step, def });
const n = (v: Record<string, unknown>, k: string): number => Number(v[k]);

export const FILTERS: FilterDef[] = [
  { id: 'gaussian', label: 'Gaussian Blur', specs: [range('radius', 'Radius (px)', 0, 40, 4, 0.1)], run: (img, v) => gaussianBlur(img, n(v, 'radius')) },
  { id: 'motion', label: 'Motion Blur', specs: [range('angle', 'Angle', -180, 180, 0), range('distance', 'Distance (px)', 1, 80, 20)], run: (img, v) => motionBlur(img, n(v, 'angle'), n(v, 'distance')) },
  { id: 'unsharp', label: 'Unsharp Mask', specs: [range('amount', 'Amount (%)', 1, 500, 120), range('radius', 'Radius (px)', 0.1, 40, 2, 0.1), range('threshold', 'Threshold', 0, 255, 0)], run: (img, v) => unsharpMask(img, n(v, 'amount'), n(v, 'radius'), n(v, 'threshold')) },
  {
    id: 'noise', label: 'Add Noise',
    specs: [range('amount', 'Amount (%)', 0, 100, 12, 0.1), { key: 'gaussian', label: 'Gaussian', kind: 'check', def: true }, { key: 'mono', label: 'Monochromatic', kind: 'check', def: false }],
    run: (img, v) => addNoise(img, n(v, 'amount'), v.gaussian === true, v.mono === true, 1234567),
  },
];

export function applyPixelOp(canvas: HTMLCanvasElement, kind: 'desaturate' | 'equalize' | 'invert'): void {
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  if (kind === 'desaturate') desaturatePixels(img.data);
  else if (kind === 'equalize') equalizePixels(img.data);
  else {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
  }
  g.putImageData(img, 0, 0);
}
