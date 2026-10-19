/** Limit for filter and adjustment layers: how much of the layer's effect each pixel gets, from what lies beneath it.
 *  Luminosity and colour range read the pixel beneath; depth reads the Depth Map layer at the same place. Ranges are
 *  in percent (depth and luminosity 0 to 100, near and bright high), softness is the ramp width beyond each end. */

export type LimitMode = 'luminosity' | 'depth' | 'color';
export interface Limit { mode: LimitMode; lo: number; hi: number; soft: number; invert: boolean; hue: number; width: number }

export const LIMIT_MODES: ReadonlyArray<readonly [LimitMode | 'none', string]> = [['none', 'Everything'], ['luminosity', 'Luminosity'], ['depth', 'Depth'], ['color', 'Color range']];

/** The layer whose limit is shown as a grey matte instead of its effect (Show the effect), or null. */
export const limitView: { id: string | null } = { id: null };

const n = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** The limit saved in an adjustment's data, checked and clamped; null when there is none or it keeps everything. */
export function limitOf(adj: { data: Record<string, unknown> } | null | undefined): Limit | null {
  const o = adj?.data?.limit;
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>, mode = (['luminosity', 'depth', 'color'] as const).find((m) => m === r.mode);
  if (!mode) return null;
  return { mode, lo: n(r.lo, 0, 100, 0), hi: n(r.hi, 0, 100, 100), soft: n(r.soft, 0, 50, 10), invert: r.invert === true, hue: n(r.hue, 0, 360, 0), width: n(r.width, 5, 360, 60) };
}

const ramp = (v: number, lo: number, hi: number, soft: number): number => {
  if (v >= lo && v <= hi) return 1;
  if (soft <= 0) return 0;
  const d = v < lo ? lo - v : v - hi, t = 1 - d / soft;
  return t <= 0 ? 0 : t * t * (3 - 2 * t);
};

/** One 0 to 255 weight per pixel of `px` (RGBA, the pixels beneath). `depth` holds the grey depth per pixel (same
 *  count) for the Depth mode; without it that mode keeps everything. */
export function limitWeights(limit: Limit, px: Uint8ClampedArray, depth: Uint8Array | null): Uint8Array {
  const count = px.length >> 2, out = new Uint8Array(count), lo = Math.min(limit.lo, limit.hi), hi = Math.max(limit.lo, limit.hi);
  for (let p = 0; p < count; p++) {
    const i = p * 4, r = px[i], g = px[i + 1], b = px[i + 2];
    let w = 1;
    if (limit.mode === 'luminosity') w = ramp(((0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100, lo, hi, limit.soft);
    else if (limit.mode === 'depth') w = depth ? ramp((depth[p] / 255) * 100, lo, hi, limit.soft) : 1;
    else {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d === 0) w = 0;
      else {
        let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
        let dh = Math.abs(h - limit.hue);
        if (dh > 180) dh = 360 - dh;
        w = ramp(dh, 0, limit.width / 2, limit.soft * 1.8) * Math.min(1, d / 255 / 0.15);
      }
    }
    out[p] = Math.round((limit.invert ? 1 - w : w) * 255);
  }
  return out;
}
