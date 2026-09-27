import { allPatterns, type Pt } from '../../engine';
import type { Tool } from '../registry';
import { lassoTool } from './lasso';

let drag: { start: Pt; now: Pt } | null = null;

/** Patch (J, Shift+J cycles): draw a selection as with the Lasso (or use any selection), then drag it onto the area to
 *  copy from; on release the selected area takes that area's texture, blended to meet its own edges. */
export const patchTool: Tool = {
  id: 'patch', label: 'Patch', key: 'J', order: 57,
  icon: () => 'tPatch',
  hint: (e) => e.retouch.patchFrom === 'destination'
    ? 'Draw around the area to copy, then drag the selection onto the area it should cover · Shift+J cycles the healing tools'
    : 'Draw around the area to fix, then drag the selection onto the area to copy from · Shift+J cycles the healing tools',
  options: (e) => [
    { kind: 'title', text: 'Patch' },
    { kind: 'segment', label: 'Patch', choices: [{ id: 'normal', label: 'Normal' }, { id: 'contentAware', label: 'Content-Aware' }], get: () => e.retouch.patchMode, set: (v) => { e.retouch.patchMode = v as 'normal' | 'contentAware'; e.emit('options', null); } },
    { kind: 'segment', label: 'From', choices: [{ id: 'source', label: 'Source' }, { id: 'destination', label: 'Destination' }], get: () => e.retouch.patchFrom, set: (v) => { e.retouch.patchFrom = v as 'source' | 'destination'; e.emit('options', null); e.emit('tool', null); } },
    { kind: 'toggle', label: 'Transparent', get: () => e.retouch.patchTransparent, set: (v) => { e.retouch.patchTransparent = v; e.emit('options', null); } },
    { kind: 'number', label: 'Diffusion', min: 1, max: 7, step: 1, get: () => e.retouch.patchDiffusion, set: (v: number) => { e.retouch.patchDiffusion = Math.round(Math.min(7, Math.max(1, v))); e.emit('options', null); }, when: () => e.retouch.patchMode === 'normal' },
    { kind: 'number', label: 'Structure', min: 1, max: 7, step: 1, get: () => e.retouch.patchStructure, set: (v: number) => { e.retouch.patchStructure = Math.round(Math.min(7, Math.max(1, v))); e.emit('options', null); }, when: () => e.retouch.patchMode === 'contentAware' },
    { kind: 'number', label: 'Color', min: 0, max: 10, step: 1, get: () => e.retouch.patchColor, set: (v: number) => { e.retouch.patchColor = Math.round(Math.min(10, Math.max(0, v))); e.emit('options', null); }, when: () => e.retouch.patchMode === 'contentAware' },
    { kind: 'toggle', label: 'Sample All Layers', get: () => e.retouch.patchSampleAll, set: (v) => { e.retouch.patchSampleAll = v; e.emit('options', null); }, when: () => e.retouch.patchMode === 'contentAware' },
    { kind: 'select', label: 'Pattern', choices: [], live: () => allPatterns().map((pt) => ({ id: pt.id, label: pt.name })), get: () => e.retouch.patchPattern ?? allPatterns()[0]?.id ?? '', set: (v: string) => { e.retouch.patchPattern = v; e.emit('options', null); }, when: () => e.retouch.patchMode === 'normal' },
    { kind: 'button', label: 'Use Pattern', run: () => e.patchWithPattern(), when: () => e.retouch.patchMode === 'normal' },
  ],
  cursor: (ctx, p) => {
    const sel = ctx.engine.current?.selection;
    return p && sel && sel.valueAt(Math.floor(p.doc.x), Math.floor(p.doc.y)) > 0 ? 'move' : 'crosshair';
  },
  down(ctx, p) {
    const sel = ctx.engine.current?.selection;
    if (p.button === 0 && sel && !p.shift && !p.alt && sel.valueAt(Math.floor(p.doc.x), Math.floor(p.doc.y)) > 0) {
      drag = { start: p.doc, now: p.doc };
      return;
    }
    lassoTool.down?.(ctx, p);
  },
  move(ctx, p) {
    if (drag) { drag.now = p.doc; ctx.engine.emit('overlay', null); return; }
    lassoTool.move?.(ctx, p);
  },
  up(ctx, p) {
    const d = drag;
    if (d) {
      drag = null;
      ctx.engine.emit('overlay', null);
      const dx = Math.round(d.now.x - d.start.x), dy = Math.round(d.now.y - d.start.y);
      if (dx || dy) ctx.engine.patchSelection(dx, dy);
      return;
    }
    lassoTool.up?.(ctx, p);
  },
  cancel(ctx) { if (drag) { drag = null; ctx.engine.emit('overlay', null); } else lassoTool.cancel?.(ctx); },
  overlay(ctx, g) {
    const sel = ctx.engine.current?.selection;
    if (!drag || !sel) { lassoTool.overlay?.(ctx, g); return; }
    // The selection's box where it is being dragged, which is where the patch will copy from.
    const v = ctx.view(), dx = drag.now.x - drag.start.x, dy = drag.now.y - drag.start.y;
    const a = v.toScreen({ x: sel.x + dx, y: sel.y + dy }), b = v.toScreen({ x: sel.x + sel.w + dx, y: sel.y + sel.h + dy });
    const pal = ctx.paint();
    g.save();
    g.setLineDash([4, 4]);
    g.lineWidth = 1;
    g.strokeStyle = pal.accent;
    g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
    g.restore();
  },
};
