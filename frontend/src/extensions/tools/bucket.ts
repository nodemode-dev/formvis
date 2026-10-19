import { BLEND_MODES, allPatterns, canvasBlend } from '../../engine';
import { digitOpacity, type Tool } from '../registry';
import { badgeCursor } from './cursor-badges';

export const bucketTool: Tool = {
  id: 'bucket', label: 'Paint Bucket', key: 'G', order: 71,
  icon: () => 'tBucket',
  hint: (e) => `Click to fill the area of similar color with ${e.bucket.source === 'pattern' ? 'the pattern' : 'the foreground color'} \u00b7 Tolerance sets how similar \u00b7 Stays inside the selection`,
  cursor: () => badgeCursor('bucket'),
  down(ctx, p) {
    if (p.button !== 0) return;
    if (p.alt) { const c = ctx.engine.sampleColor(p.doc); if (c) ctx.engine.setColors(c); return; }
    ctx.engine.paintBucket(p.doc);
  },
  keydown(ctx, e) {
    const v = e.metaKey || e.ctrlKey ? null : digitOpacity(e);
    if (v === null) return false;
    ctx.engine.setBucket({ opacity: v });
    return true;
  },
  options: (e) => [
    { kind: 'title', text: 'Paint Bucket' },
    // Source, Pattern and Mode (1.49.10, the owner's tool list).
    { kind: 'segment', label: 'Source', priority: 70, choices: [{ id: 'fg', label: 'Foreground' }, { id: 'pattern', label: 'Pattern' }], get: () => e.bucket.source, set: (v) => e.setBucket({ source: v === 'pattern' ? 'pattern' : 'fg' }) },
    { kind: 'select', label: 'Pattern', priority: 65, choices: allPatterns().map((x) => ({ id: x.id, label: x.name })), get: () => e.bucket.pattern ?? allPatterns()[0]?.id ?? '', set: (v: string) => e.setBucket({ pattern: v }), when: () => e.bucket.source === 'pattern' },
    { kind: 'range', label: 'Pattern scale', priority: 62, min: 10, max: 500, unit: '%', get: () => e.bucket.scale, set: (v) => e.setBucket({ scale: Math.max(10, Math.min(500, Math.round(v))) }), when: () => e.bucket.source === 'pattern' },
    { kind: 'range', label: 'Pattern angle', priority: 61, min: -180, max: 180, get: () => e.bucket.angle, set: (v) => e.setBucket({ angle: Math.max(-180, Math.min(180, Math.round(v))) }), when: () => e.bucket.source === 'pattern' },
    { kind: 'select', label: 'Mode', priority: 75, choices: BLEND_MODES.filter((m) => canvasBlend(m.id)).map((m) => ({ id: m.id, label: m.label })), get: () => e.bucket.mode, set: (v: string) => e.setBucket({ mode: v as typeof e.bucket.mode }) },
    { kind: 'range', label: 'Tolerance', priority: 90, min: 0, max: 255, get: () => e.bucket.tolerance, set: (v) => e.setBucket({ tolerance: v }) },
    { kind: 'range', label: 'Opacity', priority: 95, min: 1, max: 100, get: () => Math.round(e.bucket.opacity * 100), set: (v) => e.setBucket({ opacity: v / 100 }) },
    { kind: 'toggle', label: 'Contiguous', priority: 55, get: () => e.bucket.contiguous, set: (v) => e.setBucket({ contiguous: v }) },
    { kind: 'toggle', label: 'Anti-alias', priority: 40, get: () => e.bucket.antiAlias, set: (v) => e.setBucket({ antiAlias: v }) },
    { kind: 'toggle', label: 'Sample all layers', priority: 45, get: () => e.bucket.sampleAll, set: (v) => e.setBucket({ sampleAll: v }) },
  ],
};
