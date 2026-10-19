import { Viewport, type Pt } from '../../engine';
import type { Tool } from '../registry';

let drag: { start: Pt; at: Pt; z0: number; moved: boolean; alt: boolean } | null = null;
let scrubby = true;

export const zoomTool: Tool = {
  id: 'zoom', label: 'Zoom', key: 'Z', order: 95,
  icon: () => 'tZoom',
  hint: () => 'Click zooms in · Alt-click zooms out · Drag right or left to zoom smoothly · Space pans',
  cursor: (_ctx, p) => (p?.alt ? 'zoom-out' : 'zoom-in'),
  down(ctx, p) {
    drag = { start: p.screen, at: p.screen, z0: ctx.engine.current?.viewport.zoom ?? 1, moved: false, alt: p.alt };
  },
  move(ctx, p) {
    if (!drag) return;
    const dx = p.screen.x - drag.start.x;
    drag.at = p.screen;
    if (!drag.moved && Math.abs(dx) < 3 && (scrubby || Math.abs(p.screen.y - drag.start.y) < 3)) return;
    drag.moved = true;
    if (scrubby) ctx.engine.zoomTo(drag.z0 * Math.pow(2, dx / 100), drag.start);
    else ctx.engine.emit('overlay', null);
  },
  up(ctx, p) {
    const d = drag;
    drag = null;
    if (!d) return;
    const v = ctx.engine.current?.viewport;
    if (d.moved && !scrubby && v) {
      const w = Math.abs(p.screen.x - d.start.x), h = Math.abs(p.screen.y - d.start.y);
      const z = d.alt ? d.z0 / 2 : Math.min((v.width - Viewport.insetRight) / Math.max(1, w / d.z0), v.height / Math.max(1, h / d.z0));
      const mid = { x: (p.screen.x + d.start.x) / 2, y: (p.screen.y + d.start.y) / 2 };
      ctx.engine.zoomTo(z, mid);
      ctx.engine.pan(v.centerX - mid.x, v.height / 2 - mid.y);
      ctx.engine.emit('overlay', null);
      return;
    }
    if (!d.moved) ctx.engine.zoomSmooth(Viewport.ladderStep(ctx.engine.current?.viewport.zoom ?? 1, !d.alt), p.screen, ctx.engine.zoomPrefs.centreClick);
  },
  cancel() { drag = null; },
  overlay(ctx, g) {
    if (!drag?.moved || scrubby) return;
    const a = drag.start, b = drag.at;
    g.save();
    g.strokeStyle = ctx.paint().accent;
    g.setLineDash([4, 3]);
    g.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    g.restore();
  },
  options: (e) => [
    { kind: 'title', text: 'Zoom' },
    { kind: 'toggle', label: 'Scrubby Zoom', get: () => scrubby, set: (v) => { scrubby = v; e.emit('options', null); } },
    { kind: 'button', label: 'Zoom in', icon: 'zoomIn', run: () => e.zoomStep(true) },
    { kind: 'button', label: 'Zoom out', icon: 'zoomOut', run: () => e.zoomStep(false) },
    { kind: 'button', label: '100%', run: () => e.zoomTo(1) },
    { kind: 'button', label: 'Fit', icon: 'fitView', run: () => e.fit() },
    { kind: 'button', label: 'Fill Screen', run: () => e.fillScreen() },
  ]
};
