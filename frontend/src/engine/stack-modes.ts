/** Smart object stack modes (DEV_PLAN 33.1): per-pixel, per-channel statistics over a stack of same-size RGBA rasters,
 *  as in Layer > Smart Objects > Stack Mode. Pure pixel maths, no DOM. */

export type StackMode = 'none' | 'entropy' | 'kurtosis' | 'maximum' | 'mean' | 'median' | 'minimum' | 'range' | 'skewness' | 'stddev' | 'summation' | 'variance' | 'majority';

/** Every mode with its menu label, in menu order; the id is the suffix of the `stack-mode-<id>` command. */
export const STACK_MODES: ReadonlyArray<{ id: StackMode; label: string }> = [
  { id: 'none', label: 'None' }, { id: 'entropy', label: 'Entropy' }, { id: 'kurtosis', label: 'Kurtosis' }, { id: 'maximum', label: 'Maximum' },
  { id: 'mean', label: 'Mean' }, { id: 'median', label: 'Median' }, { id: 'minimum', label: 'Minimum' }, { id: 'range', label: 'Range' },
  { id: 'skewness', label: 'Skewness' }, { id: 'stddev', label: 'Standard Deviation' }, { id: 'summation', label: 'Summation' },
  { id: 'variance', label: 'Variance' }, { id: 'majority', label: 'Majority' },
];

export function isStackMode(v: unknown): v is StackMode { return STACK_MODES.some((m) => m.id === v); }

/** One statistic over the samples `v` (length n >= 1, values 0..255), not yet clamped. */
function statistic(mode: StackMode, v: number[]): number {
  const n = v.length;
  switch (mode) {
    case 'none': return v[n - 1];
    case 'maximum': return Math.max(...v);
    case 'minimum': return Math.min(...v);
    case 'range': return Math.max(...v) - Math.min(...v);
    case 'summation': return v.reduce((a, b) => a + b, 0);
    case 'mean': return v.reduce((a, b) => a + b, 0) / n;
    case 'median': { const s = [...v].sort((a, b) => a - b); return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
    case 'entropy': {
      const count = new Map<number, number>();
      for (const x of v) count.set(x, (count.get(x) ?? 0) + 1);
      let h = 0;
      for (const c of count.values()) { const q = c / n; h -= q * Math.log2(q); }
      return (h * 255) / 8;
    }
    case 'majority': {
      const count = new Map<number, number>();
      for (const x of v) count.set(x, (count.get(x) ?? 0) + 1);
      let best = v[n - 1], top = 0;
      // Ties go to the value seen last, so the topmost layer decides among equals.
      for (const x of v) { const c = count.get(x) ?? 0; if (c >= top) { top = c; best = x; } }
      return best;
    }
    default: {
      const mean = v.reduce((a, b) => a + b, 0) / n;
      let m2 = 0, m3 = 0, m4 = 0;
      for (const x of v) { const d = x - mean; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
      m2 /= n; m3 /= n; m4 /= n;
      if (mode === 'variance') return m2;
      if (mode === 'stddev') return Math.sqrt(m2);
      if (m2 < 1e-9) return 0;
      return mode === 'skewness' ? m3 / Math.pow(m2, 1.5) : m4 / (m2 * m2) - 3;
    }
  }
}

/** The shown pixels of a stack: `layers` are same-size RGBA pixels, bottom first. Alpha is the mean of the alphas; each
 *  colour channel is the statistic over the samples that are not fully transparent. Results clamp to 0..255. */
export function computeStack(layers: ImageData[], mode: StackMode): ImageData {
  const first = layers[0], out = new ImageData(first.width, first.height), o = out.data, n = layers.length, px = first.width * first.height;
  const ch: number[][] = [[], [], []];
  for (let i = 0; i < px; i++) {
    let a = 0;
    ch[0].length = ch[1].length = ch[2].length = 0;
    for (let k = 0; k < n; k++) {
      const d = layers[k].data, al = d[i * 4 + 3];
      a += al;
      if (al > 0) { ch[0].push(d[i * 4]); ch[1].push(d[i * 4 + 1]); ch[2].push(d[i * 4 + 2]); }
    }
    o[i * 4 + 3] = a / n;
    if (!ch[0].length) continue;
    for (let c = 0; c < 3; c++) o[i * 4 + c] = statistic(mode, ch[c]);
  }
  return out;
}
