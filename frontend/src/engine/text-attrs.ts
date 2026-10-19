// Type attributes that need their own measuring: synthetic small capitals and optical kerning. Pure functions of a CSS
// font string and characters, so text.ts and the tests can use them without a layer.
import { createSurface, ctxOf } from './surface';

export interface CapPiece { text: string; small: boolean }

/** A line split into runs for synthetic small capitals: lower case letters become capitals marked small (set at a smaller
 *  size), everything else stays as it is. With `small` false the line is one piece. */
export function smallCapPieces(line: string, small: boolean): CapPiece[] {
  if (!small) return [{ text: line, small: false }];
  const out: CapPiece[] = [];
  for (const ch of line) {
    const lower = ch !== ch.toUpperCase();
    const text = lower ? ch.toUpperCase() : ch;
    const last = out[out.length - 1];
    if (last && last.small === lower) last.text += text;
    else out.push({ text, small: lower });
  }
  return out;
}

/** Smaller capitals are set at this share of the size. */
export const SMALL_CAP_SCALE = 0.8;

const S = 48;
interface Edges { adv: number; left: Array<number | null>; right: Array<number | null> }
const edges = new Map<string, Edges>();

/** A character's ink edges row by row (cap-height band, measured at 48 px): where the ink begins and ends on each row, from
 *  the origin, and the advance. */
function glyphEdges(font48: string, ch: string): Edges {
  const key = `${font48}|${ch}`, have = edges.get(key);
  if (have) return have;
  const w = Math.ceil(S * 2.5), h = Math.ceil(S * 1.5), ox = S / 2, base = S;
  const c = ctxOf(createSurface(w, h));
  c.font = font48;
  (c as unknown as { letterSpacing?: string }).letterSpacing = '0px';
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#000';
  c.fillText(ch, ox, base);
  const adv = c.measureText(ch).width, top = Math.round(base - S * 0.72), bottom = Math.round(base + S * 0.02);
  const data = c.getImageData(0, 0, w, h).data, left: Array<number | null> = [], right: Array<number | null> = [];
  for (let y = top; y < bottom; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 96) { if (lo < 0) lo = x; hi = x + 1; }
    left.push(lo < 0 ? null : lo - ox);
    right.push(hi < 0 ? null : hi - ox);
  }
  const e = { adv, left, right };
  edges.set(key, e);
  return e;
}

/** The mean optical space between two characters over the rows either one has ink on; an empty side counts as a fixed
 *  distance, and a row's space is capped, so a diagonal or a round letter reads as the loose space it looks like. */
function opticalGap(font48: string, a: string, b: string): number {
  const ea = glyphEdges(font48, a), eb = glyphEdges(font48, b), cap = S * 0.3;
  let sum = 0, n = 0;
  for (let i = 0; i < ea.left.length; i++) {
    const r = ea.right[i], l = eb.left[i];
    if (r === null && l === null) continue;
    sum += Math.min(2 * cap, (r === null ? cap : ea.adv - r) + (l === null ? cap : l));
    n += 1;
  }
  return n ? sum / n : 2 * cap;
}

const pairs = new Map<string, number>();

/** The optical kerning between `a` and `b` in pixels at `size`: the space the pair would have if it looked as even as two
 *  round stems ('nn'), taken up halfway, never tighter than 0.2 em or looser than 0.1 em. `font48` is the CSS font at
 *  48 px. Spaces and unmeasurable characters add nothing. */
export function opticalKern(font48: string, a: string, b: string, size: number): number {
  if (/\s/.test(a) || /\s/.test(b)) return 0;
  const key = `${font48}|${a}|${b}`, have = pairs.get(key);
  if (have !== undefined) return have * (size / S);
  const adj = Math.max(-0.2 * S, Math.min(0.1 * S, (opticalGap(font48, 'n', 'n') - opticalGap(font48, a, b)) * 0.5));
  pairs.set(key, adj);
  return adj * (size / S);
}
