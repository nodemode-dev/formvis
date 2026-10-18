import type { Pt } from '../../engine';
import type { RelightLight } from '../../engine/relight';
import type { Tool, ToolContext } from '../registry';

export interface RelightHost {
  active(): boolean;
  size(): { w: number; h: number };
  lights(): readonly RelightLight[];
  selected(): string | null;
  select(id: string): void;
  move(id: string, part: 'pos' | 'aim', at: { x: number; y: number }, done: boolean): void;
  commit(): void;
  cancel(): void;
}

let host: RelightHost | null = null;
export const setRelightHost = (h: RelightHost | null): void => { host = h; };

type Drag = { id: string; part: 'pos' | 'aim' } | null;
let drag: Drag = null;

const frac = (p: Pt, s: { w: number; h: number }): { x: number; y: number } => ({ x: p.x / Math.max(1, s.w), y: p.y / Math.max(1, s.h) });
const docOf = (l: RelightLight, part: 'pos' | 'aim', s: { w: number; h: number }): Pt => ({ x: l[part].x * s.w, y: l[part].y * s.h });

function hit(ctx: ToolContext, screen: Pt): Drag {
  if (!host?.active()) return null;
  const v = ctx.view(), s = host.size(), sel = host.selected();
  const order = [...host.lights()].sort((a, b) => (a.id === sel ? -1 : b.id === sel ? 1 : 0));
  for (const l of order) {
    if (!l.visible) continue;
    for (const part of ['pos', 'aim'] as const) {
      const q = v.toScreen(docOf(l, part, s));
      if (Math.hypot(q.x - screen.x, q.y - screen.y) <= (part === 'pos' ? 14 : 10)) return { id: l.id, part };
    }
  }
  return null;
}

export const relightTool: Tool = {
  id: 'relight',
  label: 'Relight',
  key: '',
  order: 999,
  hidden: true,
  icon: () => 'sun',
  hint: () => 'Drag a light on the image, or adjust it in the Properties panel.',
  cursor: (ctx, p) => (p && hit(ctx, p.screen) ? 'grab' : 'crosshair'),
  down(ctx, p) {
    if (!host?.active()) return;
    drag = hit(ctx, p.screen);
    const sel = host.selected();
    if (!drag && sel) drag = { id: sel, part: p.alt ? 'aim' : 'pos' };
    if (!drag) return;
    host.select(drag.id);
    host.move(drag.id, drag.part, frac(p.doc, host.size()), false);
  },
  move(ctx, p) {
    if (!drag || !host?.active()) return;
    host.move(drag.id, drag.part, frac(p.doc, host.size()), false);
    ctx.engine.emit('overlay', null);
  },
  up(_ctx, p) {
    if (!drag || !host?.active()) { drag = null; return; }
    host.move(drag.id, drag.part, frac(p.doc, host.size()), true);
    drag = null;
  },
  keydown(_ctx, ev) {
    if (!host?.active() || ev.metaKey || ev.ctrlKey) return false;
    if (ev.key === 'Enter') { host.commit(); return true; }
    if (ev.key === 'Escape') { host.cancel(); return true; }
    return false;
  },
  cancel() { drag = null; },
  overlay(ctx, g) {
    if (!host?.active()) return;
    const v = ctx.view(), pal = ctx.paint(), s = host.size(), sel = host.selected();
    g.save();
    for (const l of host.lights()) {
      if (!l.visible) continue;
      const on = l.id === sel, a = v.toScreen(docOf(l, 'pos', s)), b = v.toScreen(docOf(l, 'aim', s));
      g.setLineDash([5, 4]);
      g.lineWidth = 1.5;
      g.strokeStyle = on ? pal.antsB : pal.antsA;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      if (on && l.pattern.kind !== 'none') {
        const k = l.pattern, unit = Math.max(s.w, s.h) * v.zoom, rot = (k.rotation * Math.PI) / 180;
        const hw = k.kind === 'strip' ? 0.5 * k.width / 100 * 0.25 * k.scale / 100 * unit : (k.kind === 'blinds' ? 0.5 * k.scale / 100 * k.width / 100 : 0.32 * k.scale / 100) * unit;
        const hh = k.kind === 'strip' ? 0.5 * k.length / 100 * k.scale / 100 * unit : (k.kind === 'blinds' ? 0.5 * k.scale / 100 : 0.42 * k.scale / 100) * unit;
        g.save(); g.translate(b.x, b.y); g.rotate(rot); g.strokeRect(-hw, -hh, hw * 2, hh * 2); g.restore();
      }
      g.setLineDash([]);
      g.beginPath(); g.arc(b.x, b.y, 6, 0, Math.PI * 2); g.lineWidth = 1.5; g.strokeStyle = pal.antsB; g.stroke();
      g.beginPath(); g.arc(b.x, b.y, 1.5, 0, Math.PI * 2); g.fillStyle = pal.antsB; g.fill();
      g.beginPath(); g.arc(a.x, a.y, on ? 13 : 11, 0, Math.PI * 2);
      g.fillStyle = pal.handle; g.fill();
      g.lineWidth = on ? 2.5 : 1.5; g.strokeStyle = pal.accent; g.stroke();
      g.beginPath(); g.arc(a.x, a.y, on ? 7 : 6, 0, Math.PI * 2);
      g.fillStyle = `rgb(${l.color.r},${l.color.g},${l.color.b})`; g.fill();
    }
    g.restore();
  },
  options: () => [
    { kind: 'title', text: 'Drag a light on the image, or adjust it in the Properties panel.' },
    { kind: 'button', label: 'Cancel', icon: 'close', compact: true, run: () => host?.cancel() },
    { kind: 'button', label: 'Done', icon: 'check', compact: true, run: () => host?.commit() },
  ],
};
