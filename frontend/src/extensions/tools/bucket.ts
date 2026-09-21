import type { Tool } from '../registry';

export const bucketTool: Tool = {
  id: 'bucket', label: 'Paint Bucket', key: 'G', order: 71,
  icon: () => 'bucket',
  hint: () => 'Click to fill the area of similar color with the foreground color \u00b7 Tolerance sets how similar \u00b7 Stays inside the selection',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button === 0) ctx.engine.paintBucket(p.doc); },
  options: (e) => [
    { kind: 'title', text: 'Paint Bucket' },
    { kind: 'range', label: 'Tolerance', min: 0, max: 255, get: () => e.bucket.tolerance, set: (v) => e.setBucket({ tolerance: v }) },
    { kind: 'range', label: 'Opacity', min: 1, max: 100, get: () => Math.round(e.bucket.opacity * 100), set: (v) => e.setBucket({ opacity: v / 100 }) },
    { kind: 'toggle', label: 'Contiguous', get: () => e.bucket.contiguous, set: (v) => e.setBucket({ contiguous: v }) },
    { kind: 'toggle', label: 'Anti-alias', get: () => e.bucket.antiAlias, set: (v) => e.setBucket({ antiAlias: v }) },
    { kind: 'toggle', label: 'Sample all layers', get: () => e.bucket.sampleAll, set: (v) => e.setBucket({ sampleAll: v }) },
  ],
};
