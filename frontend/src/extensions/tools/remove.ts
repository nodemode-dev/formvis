import { mul, setMat, type Pt } from '../../engine';
import type { Tool } from '../registry';
import { brushKeys, brushOptions, drawBrushCursor } from './brush-common';

let hover: Pt | null = null;

/** Remove (J, with the healing tools): paint over something to take it out; on release what the stroke covered is
 *  rebuilt by content-aware fill from the rest of the layer. Remove Wires and Cables finds thin dark lines on the layer
 *  by itself and fills them. Remove People and Remove Distractions (1.57.4) find people other than the subject, and
 *  salient objects other than the subject, with models on this computer, and fill them with LaMa as one step. */
export const removeTool: Tool = {
  id: 'remove', label: 'Remove', key: 'J', order: 55.5,
  icon: () => 'tRemove',
  hint: (e) => (e.retouch.removeCollect ? 'Paint over everything to remove, then press Enter to fill it in one go (Esc drops it) · [ ] size' : 'Paint over what to remove; it is filled from its surroundings when you release · [ ] size'),
  cursor: () => 'none',
  down(ctx, p) { if (p.button !== 0) return; hover = p.doc; ctx.engine.beginRetouchStroke('remove', p.doc, p.shift); },
  move(ctx, p) { hover = p.doc; ctx.engine.strokeTo(p.doc); ctx.engine.emit('overlay', null); },
  up(ctx) { ctx.engine.endStroke(); },
  hover(ctx, p) { hover = p ? p.doc : null; ctx.engine.emit('overlay', null); },
  cancel(ctx) { if (ctx.engine.stroking) ctx.engine.cancelStroke(); else ctx.engine.removeDiscard(); },
  keydown: (ctx, e) => {
    if (ctx.engine.removePendingView() && !ctx.engine.stroking && (e.key === 'Enter' || e.key === 'Escape')) { if (e.key === 'Enter') ctx.engine.removeCommit(); else ctx.engine.removeDiscard(); return true; }
    return brushKeys(ctx, e);
  },
  overlay(ctx, g) {
    const pending = ctx.engine.removePendingView();
    if (pending) {
      const v = ctx.view(), o = v.toScreen({ x: 0, y: 0 }), ex = v.toScreen({ x: 1, y: 0 }), ey = v.toScreen({ x: 0, y: 1 }), t = g.getTransform();
      g.save();
      setMat(g, mul(mul([t.a, t.b, t.c, t.d, t.e, t.f], [ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y]), pending.m));
      g.drawImage(pending.image as CanvasImageSource, 0, 0);
      g.restore();
    }
    drawBrushCursor(ctx, g, hover);
  },
  options: (e) => [
    { kind: 'title', text: e.retouch.removeLama ? (e.warmRemove?.(), 'Remove') : 'Remove' },
    ...brushOptions(e).filter((o) => !('label' in o) || !(o.label ?? '').startsWith('Pressure')),
    { kind: 'select', label: 'Sample', priority: 20, choices: [{ id: 'current', label: 'Current Layer' }, { id: 'below', label: 'Current & Below' }, { id: 'all', label: 'All Layers' }], get: () => e.retouch.removeSample, set: (v: string) => { e.retouch.removeSample = v === 'below' || v === 'all' ? v : 'current'; e.emit('options', null); }, when: () => !(e.retouch.removeLama && e.removeModelReady) },
    { kind: 'toggle', label: 'LaMa when downloaded (new layer)', priority: 25, get: () => e.retouch.removeLama, set: (v: boolean) => { e.retouch.removeLama = v; if (v) e.warmRemove?.(); e.emit('options', null); } },
    { kind: 'toggle', label: 'Collect strokes (Enter fills)', priority: 24, get: () => e.retouch.removeCollect, set: (v: boolean) => { e.retouch.removeCollect = v; if (!v) e.removeDiscard(); e.emit('options', null); } },
    { kind: 'button', label: 'Fill collected', priority: 23, run: () => { e.removeCommit(); }, when: () => !!e.removePendingView() },
    { kind: 'button', label: 'Discard collected', priority: 22, run: () => e.removeDiscard(), when: () => !!e.removePendingView() },
    { kind: 'button', label: 'Remove Wires and Cables', icon: 'tRemove', run: () => { e.removeWires(); } },
    { kind: 'button', label: 'Remove People', icon: 'tRemove', run: () => { void e.removeFinder?.('people'); } },
    { kind: 'button', label: 'Remove Distractions', icon: 'tRemove', run: () => { void e.removeFinder?.('distractions'); } },
  ],
};
