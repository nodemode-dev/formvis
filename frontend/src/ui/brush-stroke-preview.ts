import type { Engine } from '../engine';
import type { SampledTip } from '../engine/abr';
import type { BrushPreset, BrushShape } from '../engine/brush-dynamics';

/** A brush as a short S-shaped stroke on a canvas: dabs at the brush's spacing with its angle, roundness, flips, jitters
 *  and scatter, in the page's text colour. A picture of the setting, not the engine's stroke, so it is cheap enough to draw
 *  for every row of a list and again on each slider move. */
export interface PreviewBrush { diameter: number; hardness: number; opacity: number; tip?: SampledTip | null; shape?: Partial<BrushShape>; angle?: number; roundness?: number; spacing?: number | null }

export const previewOfEngine = (e: Engine): PreviewBrush => ({ ...e.brush, shape: e.brushShape, angle: e.brushShape.angle, roundness: e.brushShape.roundness, spacing: e.brushShape.spacing });
export const previewOfPreset = (p: BrushPreset): PreviewBrush => ({ diameter: p.diameter, hardness: p.hardness, opacity: p.opacity, tip: p.tip, shape: p.shape, angle: p.angle, roundness: p.roundness, spacing: p.spacing ?? null });

const tinted = new WeakMap<Uint8Array, Map<string, HTMLCanvasElement>>();
function tipImage(tip: SampledTip, color: string): HTMLCanvasElement {
  const byColor = tinted.get(tip.data) ?? new Map<string, HTMLCanvasElement>();
  tinted.set(tip.data, byColor);
  const hit = byColor.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = tip.w; c.height = tip.h;
  const g = c.getContext('2d') as CanvasRenderingContext2D, img = g.createImageData(tip.w, tip.h);
  for (let i = 0; i < tip.data.length; i++) img.data[i * 4 + 3] = tip.data[i];
  g.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, tip.w, tip.h);
  byColor.set(color, c);
  return c;
}

/** Draws `b` into `canvas` (cleared first); the same brush always gives the same picture. */
export function drawBrushStroke(canvas: HTMLCanvasElement, b: PreviewBrush): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width, H = canvas.height, color = getComputedStyle(canvas).color || '#999999', sh = b.shape ?? {};
  g.clearRect(0, 0, W, H);
  let seed = 12345;
  const rnd = (): number => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const fit = Math.min(1, (H * 0.62) / Math.max(1, b.diameter)), d = Math.max(2, b.diameter * fit), r = d / 2, step = Math.max(1, d * ((b.spacing ?? sh.spacing ?? 25) / 100));
  const pad = r + 3, amp = Math.max(0, H / 2 - r - 3), len = W - pad * 2;
  if (len <= 0) return;
  const side = Math.max(2, Math.ceil(d)), soft = document.createElement('canvas');
  soft.width = side; soft.height = side;
  const sg = soft.getContext('2d') as CanvasRenderingContext2D, grad = sg.createRadialGradient(side / 2, side / 2, 0, side / 2, side / 2, side / 2);
  grad.addColorStop(0, '#000'); grad.addColorStop(Math.min(0.99, Math.max(0, b.hardness)), '#000'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grad; sg.fillRect(0, 0, side, side);
  sg.globalCompositeOperation = 'source-in'; sg.fillStyle = color; sg.fillRect(0, 0, side, side);
  const tip = b.tip ? tipImage(b.tip, color) : null, base = b.angle ?? sh.angle ?? 0, round = Math.max(0.05, (b.roundness ?? sh.roundness ?? 100) / 100);
  const at = (t: number): { x: number; y: number } => ({ x: pad + t * len, y: H / 2 + Math.sin(t * Math.PI * 2) * amp });
  const total = Math.max(1, Math.round(len * (1 + Math.abs(amp) * 0.02) / step));
  g.globalAlpha = Math.max(0.12, Math.min(1, b.opacity) * 0.55);
  for (let i = 0; i <= total; i++) {
    const t = i / total, p = at(t), q = at(Math.min(1, t + 0.01)), dir = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
    for (let k = 0, n = Math.max(1, Math.min(8, Math.round(sh.count ?? 1))); k < n; k++) {
      const size = 1 - ((sh.sizeJitter ?? 0) / 100) * rnd(), ang = base + (sh.angleControl === 'direction' ? dir : 0) + (rnd() * 2 - 1) * ((sh.angleJitter ?? 0) / 100) * 180;
      const spread = ((sh.scatter ?? 0) / 100) * d, ox = sh.bothAxes ? (rnd() * 2 - 1) * spread : 0, oy = (rnd() * 2 - 1) * spread;
      g.save();
      g.translate(p.x + ox, p.y + oy);
      g.rotate((-ang * Math.PI) / 180);
      g.scale((sh.flipX ? -1 : 1) * size, (sh.flipY ? -1 : 1) * size * round);
      if (tip) { const s = d / Math.max(tip.width, tip.height); g.drawImage(tip, (-tip.width * s) / 2, (-tip.height * s) / 2, tip.width * s, tip.height * s); }
      else g.drawImage(soft, -r, -r, d, d);
      g.restore();
    }
  }
  g.globalAlpha = 1;
}
