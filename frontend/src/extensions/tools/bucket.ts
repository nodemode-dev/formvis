import { BLEND_MODES, allPatterns } from '../../engine';
import type { Tool } from '../registry';

export const bucketTool: Tool = {
  id: 'bucket', label: 'Paint Bucket', key: 'G', order: 71,
  icon: () => 'tBucket',
  hint: (e) => `Click to fill the area of similar color with ${e.bucket.source === 'pattern' ? 'the pattern' : 'the foreground color'} \u00b7 Tolerance sets how similar \u00b7 Stays inside the selection`,
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button === 0) ctx.engine.paintBucket(p.doc); },
  options: (e) => [
    { kind: 'title', text: 'Paint Bucket' },
    // Source, Pattern and Mode (1.49.10, the owner's tool list), as Photoshop's bar.
    { kind: 'segment', label: 'Source', choices: [{ id: 'fg', label: 'Foreground' }, { id: 'pattern', label: 'Pattern' }], get: () => e.bucket.source, set: (v) => e.setBucket({ source: v === 'pattern' ? 'pattern' : 'fg' }) },
    { kind: 'select', label: 'Pattern', choices: allPatterns().map((x) => ({ id: x.id, label: x.name })), get: () => e.bucket.pattern ?? allPatterns()[0]?.id ?? '', set: (v: string) => e.setBucket({ pattern: v }), when: () => e.bucket.source === 'pattern' },
    { kind: 'select', label: 'Mode', choices: BLEND_MODES.map((m) => ({ id: m.id, label: m.label })), get: () => e.bucket.mode, set: (v: string) => e.setBucket({ mode: v as typeof e.bucket.mode }) },
    { kind: 'range', label: 'Tolerance', min: 0, max: 255, get: () => e.bucket.tolerance, set: (v) => e.setBucket({ tolerance: v }) },
    { kind: 'range', label: 'Opacity', min: 1, max: 100, get: () => Math.round(e.bucket.opacity * 100), set: (v) => e.setBucket({ opacity: v / 100 }) },
    { kind: 'toggle', label: 'Contiguous', get: () => e.bucket.contiguous, set: (v) => e.setBucket({ contiguous: v }) },
    { kind: 'toggle', label: 'Anti-alias', get: () => e.bucket.antiAlias, set: (v) => e.setBucket({ antiAlias: v }) },
    { kind: 'toggle', label: 'Sample all layers', get: () => e.bucket.sampleAll, set: (v) => e.setBucket({ sampleAll: v }) },
  ],
};
