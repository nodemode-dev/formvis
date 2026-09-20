import type { Pt } from '../../engine';
import type { Tool } from '../registry';

let drag: { start: Pt; z0: number; moved: boolean; alt: boolean } | null = null;

export const zoomTool: Tool = {
  id: 'zoom', label: 'Zoom', key: 'Z', order: 95,
  icon: () => 'zoomIn',
  hint: () => 'Click zooms in · Alt-click zooms out · Drag right or left to zoom smoothly · Space pans',
  cursor: (_ctx, p) => (p?.alt ? 'zoom-out' : 'zoom-in'),
  down(ctx, p) { drag = { start: p.screen, z0: ctx.engine.current?.viewport.zoom ?? 1, moved: false, alt: p.alt }; },
  move(ctx, p) {
    if (!drag) return;
    const dx = p.screen.x - drag.start.x;
    // the reference app: right zooms in, left out, doubling for every 100 points dragged.
    if (Math.abs(dx) >= 3) drag.moved = true;
    if (drag.moved) ctx.engine.zoomTo(drag.z0 * Math.pow(2, dx / 100), drag.start);
  },
  up(ctx, p) {
    if (drag && !drag.moved) ctx.engine.zoomTo(drag.z0 * (drag.alt ? 0.5 : 2), p.screen);
    drag = null;
  },
  cancel() { drag = null; },
  options: (e) => [
    { kind: 'title', text: 'Zoom' },
    { kind: 'button', label: 'Zoom in', icon: 'zoomIn', run: () => e.zoomStep(true) },
    { kind: 'button', label: 'Zoom out', icon: 'zoomOut', run: () => e.zoomStep(false) },
    { kind: 'button', label: 'Fit', icon: 'fitView', run: () => e.fit() },
  ],
};
