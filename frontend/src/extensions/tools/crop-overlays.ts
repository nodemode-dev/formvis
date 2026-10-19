import type { Pt } from '../../engine';

/** The Crop tool's composition overlays, offered in its options bar (O cycles them, Shift+O flips the
 *  Triangle and Golden Spiral): Rule of Thirds, Grid, Diagonal, Triangle, Golden Ratio, Golden Spiral. */
export type CropOverlay = 'thirds' | 'grid' | 'diagonal' | 'triangle' | 'golden' | 'spiral';
export const CROP_OVERLAYS: ReadonlyArray<{ id: CropOverlay; label: string }> = [
  { id: 'thirds', label: 'Rule of Thirds' }, { id: 'grid', label: 'Grid' }, { id: 'diagonal', label: 'Diagonal' },
  { id: 'triangle', label: 'Triangle' }, { id: 'golden', label: 'Golden Ratio' }, { id: 'spiral', label: 'Golden Spiral' },
];
/** Overlays whose orientation Shift+O cycles. */
export const ORIENTED: ReadonlySet<CropOverlay> = new Set(['triangle', 'spiral']);

const G = (Math.sqrt(5) - 1) / 2; // 0.618...

/** The overlay's lines within the frame at `x, y` sized `w` by `h`, in the same coordinates, as polylines. `orient`
 *  (0 to 3) mirrors Triangle and Golden Spiral across the frame's vertical (bit 1) and horizontal (bit 2) centre lines. */
export function overlayLines(kind: CropOverlay, x: number, y: number, w: number, h: number, orient = 0): Pt[][] {
  const out: Pt[][] = [];
  const fx = (orient & 1) === 1, fy = (orient & 2) === 2;
  const at = (u: number, v: number): Pt => ({ x: x + (fx ? 1 - u : u) * w, y: y + (fy ? 1 - v : v) * h });
  const across = (fractions: number[]): void => {
    for (const f of fractions) { out.push([at(f, 0), at(f, 1)]); out.push([at(0, f), at(1, f)]); }
  };
  if (kind === 'thirds') across([1 / 3, 2 / 3]);
  else if (kind === 'golden') across([1 - G, G]);
  else if (kind === 'grid') across([1, 2, 3, 4, 5, 6, 7].map((i) => i / 8));
  else if (kind === 'diagonal') {
    // A 45 degree line into the frame from each corner, as long as the frame's shorter side.
    const t = Math.min(w, h);
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) out.push([{ x: cx, y: cy }, { x: cx + dx * t, y: cy + dy * t }]);
  } else if (kind === 'triangle') {
    // One diagonal, and from each of the other two corners the line meeting it at a right angle (in pixels, so the
    // right angles hold whatever the frame's shape).
    const a = at(0, 1), b = at(1, 0), dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    out.push([a, b]);
    for (const c of [at(0, 0), at(1, 1)]) {
      const k = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
      out.push([c, { x: a.x + k * dx, y: a.y + k * dy }]);
    }
  } else {
    // The golden spiral: a quarter arc across each of eight rectangles cut from the frame at the golden ratio, each arc
    // starting where the last ended.
    let r = { x: 0, y: 0, w: 1, h: 1 };
    const line: Pt[] = [];
    const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): void => {
      for (let i = line.length ? 1 : 0; i <= 16; i++) { const t = a0 + ((a1 - a0) * i) / 16; line.push(at(cx + rx * Math.cos(t), cy + ry * Math.sin(t))); }
    };
    for (let i = 0; i < 8; i++) {
      const d = i % 4;
      if (d === 0) { arc(r.x + r.w * G, r.y + r.h, r.w * G, r.h, Math.PI, 1.5 * Math.PI); r = { x: r.x + r.w * G, y: r.y, w: r.w * (1 - G), h: r.h }; }
      else if (d === 1) { arc(r.x, r.y + r.h * G, r.w, r.h * G, -0.5 * Math.PI, 0); r = { x: r.x, y: r.y + r.h * G, w: r.w, h: r.h * (1 - G) }; }
      else if (d === 2) { arc(r.x + r.w * (1 - G), r.y, r.w * G, r.h, 0, 0.5 * Math.PI); r = { x: r.x, y: r.y, w: r.w * (1 - G), h: r.h }; }
      else { arc(r.x + r.w, r.y + r.h * (1 - G), r.w, r.h * G, 0.5 * Math.PI, Math.PI); r = { x: r.x, y: r.y, w: r.w, h: r.h * (1 - G) }; }
    }
    out.push(line);
  }
  return out;
}
