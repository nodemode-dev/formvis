import type { Pt } from '../../engine';
import type { Tool } from '../registry';

let last: Pt | null = null;

export const handTool: Tool = {
  id: 'hand', label: 'Hand', key: 'H', order: 90,
  icon: () => 'tHand',
  hint: () => 'Drag to pan · Scroll pans · Cmd or Ctrl with scroll zooms · Hold Space with any tool to pan',
  cursor: () => (last ? 'grabbing' : 'grab'),
  down(_ctx, p) { last = p.screen; },
  move(ctx, p) { if (!last) return; ctx.engine.pan(p.screen.x - last.x, p.screen.y - last.y); last = p.screen; },
  up() { last = null; },
  cancel() { last = null; },
  options: (e) => [
    { kind: 'title', text: 'Hand' },
    { kind: 'button', label: 'Fit', icon: 'fitView', run: () => e.fit() },
    { kind: 'button', label: 'Actual pixels', icon: 'maximize', run: () => e.zoomTo(1) },
  ],
};
