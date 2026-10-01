import { createSurface, ctxOf, type Surface } from './surface';

/** The Art History Brush (1.56.3, the parity plan's L4), as Photoshop's: stylised strokes in the colours of a
 *  source state (the History Brush's snapshot), so painting over a picture turns it into a painted version of itself.
 *  The strokes are laid over the whole layer as the stroke starts, each in the source's colour where it begins and
 *  running along the picture's contours (across its brightness gradient); the brush then reveals them where it paints,
 *  as the History Brush reveals its snapshot. Tight styles follow the contours closely, loose ones wander; Dab lays
 *  dots; the curl styles bend. Tolerance leaves alone the pixels already within that many levels of the source. */

export type ArtStyle = 'tightShort' | 'tightMedium' | 'tightLong' | 'looseMedium' | 'looseLong' | 'dab' | 'tightCurl' | 'tightCurlLong' | 'looseCurl' | 'looseCurlLong';
export const ART_STYLES: ReadonlyArray<readonly [ArtStyle, string]> = [['tightShort', 'Tight Short'], ['tightMedium', 'Tight Medium'], ['tightLong', 'Tight Long'], ['looseMedium', 'Loose Medium'], ['looseLong', 'Loose Long'], ['dab', 'Dab'], ['tightCurl', 'Tight Curl'], ['tightCurlLong', 'Tight Curl Long'], ['looseCurl', 'Loose Curl'], ['looseCurlLong', 'Loose Curl Long']];

/** Length in stroke widths, angle wander in radians, bend per segment in radians. */
const SHAPE: Record<ArtStyle, { length: number; wander: number; curl: number }> = {
  tightShort: { length: 2, wander: 0.15, curl: 0 }, tightMedium: { length: 4, wander: 0.15, curl: 0 }, tightLong: { length: 7, wander: 0.15, curl: 0 },
  looseMedium: { length: 4, wander: 0.8, curl: 0 }, looseLong: { length: 7, wander: 0.8, curl: 0 }, dab: { length: 0, wander: 0, curl: 0 },
  tightCurl: { length: 4, wander: 0.15, curl: 0.45 }, tightCurlLong: { length: 7, wander: 0.15, curl: 0.35 }, looseCurl: { length: 4, wander: 0.8, curl: 0.45 }, looseCurlLong: { length: 7, wander: 0.8, curl: 0.35 },
};

/** The painted version of `src` (a picture the layer's size): strokes `width` pixels wide in `style`; `current`, with
 *  `tolerance` above 0, keeps the strokes off pixels already within that many levels of the source. */
export function artHistoryTexture(src: ImageData, style: ArtStyle, width: number, seed: number, current: ImageData | null = null, tolerance = 0): Surface {
  const { width: W, height: H, data: d } = src, out = createSurface(W, H), g = ctxOf(out), shape = SHAPE[style];
  const w = Math.max(1.5, width), spacing = Math.max(1, w * 0.75), cap = 250_000;
  const step = Math.max(spacing, Math.sqrt((W * H) / cap));
  let s = (seed >>> 0) || 1;
  const rnd = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const lum = (x: number, y: number): number => { const xi = Math.max(0, Math.min(W - 1, x | 0)), yi = Math.max(0, Math.min(H - 1, y | 0)), o = (yi * W + xi) * 4; return d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114; };
  const pts: Array<[number, number]> = [];
  for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) pts.push([x + (rnd() - 0.5) * step, y + (rnd() - 0.5) * step]);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w;
  for (const [x0, y0] of pts) {
    const xi = Math.max(0, Math.min(W - 1, x0 | 0)), yi = Math.max(0, Math.min(H - 1, y0 | 0)), o = (yi * W + xi) * 4;
    if (d[o + 3] === 0) continue;
    const colour = `rgba(${d[o]},${d[o + 1]},${d[o + 2]},${d[o + 3] / 255})`;
    if (shape.length === 0) { g.fillStyle = colour; g.beginPath(); g.arc(x0, y0, w / 2, 0, Math.PI * 2); g.fill(); continue; }
    const gx = lum(x0 + 1, y0) - lum(x0 - 1, y0), gy = lum(x0, y0 + 1) - lum(x0, y0 - 1);
    let a = Math.hypot(gx, gy) > 2 ? Math.atan2(gy, gx) + Math.PI / 2 : rnd() * Math.PI * 2;
    a += (rnd() * 2 - 1) * shape.wander;
    const bend = shape.curl * (rnd() < 0.5 ? -1 : 1), segs = Math.max(2, Math.round(shape.length * 2)), seg = (shape.length * w) / segs;
    let x = x0 - Math.cos(a) * (shape.length * w) / 2, y = y0 - Math.sin(a) * (shape.length * w) / 2;
    g.strokeStyle = colour; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < segs; k++) { a += bend; x += Math.cos(a) * seg; y += Math.sin(a) * seg; g.lineTo(x, y); }
    g.stroke();
  }
  if (current && tolerance > 0) {
    const img = g.getImageData(0, 0, W, H), t = img.data, c = current.data;
    for (let i = 0; i < t.length; i += 4) if (Math.abs(c[i] - d[i]) <= tolerance && Math.abs(c[i + 1] - d[i + 1]) <= tolerance && Math.abs(c[i + 2] - d[i + 2]) <= tolerance) t[i + 3] = 0;
    g.putImageData(img, 0, 0);
  }
  return out;
}
