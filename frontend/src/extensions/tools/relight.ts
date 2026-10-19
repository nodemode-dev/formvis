import type { Pt } from '../../engine';
import type { RelightLight } from '../../engine/relight';
import type { Tool, ToolContext } from '../registry';

export interface RelightHost {
  active(): boolean;
  size(): { w: number; h: number };
  lights(): readonly RelightLight[];
  selected(): string | null;
  select(id: string): void;
  move(id: string, part: 'pos' | 'aim' | 'center', at: { x: number; y: number }, done: boolean): void;
  nudge(dx: number, dy: number, aim: boolean): void;
  cycle(back: boolean): void;
  commit(): void;
  cancel(): void;
  add(at: { x: number; y: number }): void;
  remove(): void;
  adjust(id: string, key: 'intensity' | 'diffusion', delta: number): void;
  /** Which way the picture's own light seems to come from (a unit vector in picture pixels, y down) and how strongly, for the compass. */
  original(): { x: number; y: number; strength: number } | null;
}

let hidden = false;
let over: Pt | null = null;
let host: RelightHost | null = null;
export const setRelightHost = (h: RelightHost | null): void => { host = h; };

type Drag = { id: string; part: 'pos' | 'aim' | 'center' } | null;
let drag: Drag = null;

const frac = (p: Pt, s: { w: number; h: number }): { x: number; y: number } => ({ x: p.x / Math.max(1, s.w), y: p.y / Math.max(1, s.h) });
const docOf = (l: RelightLight, part: 'pos' | 'aim' | 'center', s: { w: number; h: number }): Pt => {
  const q = part === 'center' ? (l.pattern.center ?? l.aim) : l[part];
  return { x: q.x * s.w, y: q.y * s.h };
};

function hit(ctx: ToolContext, screen: Pt): Drag {
  if (!host?.active()) return null;
  const v = ctx.view(), s = host.size(), sel = host.selected();
  const order = [...host.lights()].sort((a, b) => (a.id === sel ? -1 : b.id === sel ? 1 : 0));
  for (const l of order) {
    if (!l.visible) continue;
    for (const part of ['pos', 'aim', 'center'] as const) {
      if (part === 'center' && (l.id !== sel || l.pattern.kind === 'none' || !l.pattern.center)) continue;
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
  group: 'relight',
  order: 69,
  icon: () => 'relight',
  hint: () => (host?.active() ? 'Drag a light on the image, Ctrl-click to add one, wheel over a light for intensity (Shift: diffusion), Delete removes, H hides the handles.' : 'Click the Relight tool to light the picture with virtual lights, or open Filter > Relight.'),
  cursor: (ctx, p) => (p && hit(ctx, p.screen) ? 'grab' : 'crosshair'),
  down(ctx, p) {
    if (!host?.active()) return;
    drag = hit(ctx, p.screen);
    const sel = host.selected();
    if (!drag && p.mod) { host.add(frac(p.doc, host.size())); return; }
    if (!drag && sel) drag = { id: sel, part: p.alt ? 'aim' : p.shift ? 'center' : 'pos' };
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
  hover(_ctx, p) { over = p ? p.screen : null; },
  wheel(ctx, ev) {
    if (!host?.active() || !over || hidden) return false;
    const h = hit(ctx, over);
    if (!h) return false;
    host.adjust(h.id, ev.shiftKey ? 'diffusion' : 'intensity', ev.deltaY < 0 ? 3 : -3);
    ctx.engine.emit('overlay', null);
    return true;
  },
  keydown(ctx, ev) {
    if (!host?.active() || ev.metaKey || ev.ctrlKey) return false;
    if (ev.key === 'h' || ev.key === 'H') { hidden = !hidden; ctx.engine.emit('overlay', null); return true; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { host.remove(); return true; }
    if (ev.key === 'Enter') { host.commit(); return true; }
    if (ev.key === 'Escape') { host.cancel(); return true; }
    const step = ev.shiftKey ? 0.05 : 0.005, arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const a = arrows[ev.key];
    if (a) { host.nudge(a[0], a[1], ev.altKey); return true; }
    if (ev.key === 'Tab') { host.cycle(ev.shiftKey); return true; }
    return false;
  },
  cancel() { drag = null; },
  overlay(ctx, g) {
    if (!host?.active() || hidden) return;
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
        const k = l.pattern, unit = Math.max(s.w, s.h), rot = (k.rotation * Math.PI) / 180, cr = Math.cos(rot), sr = Math.sin(rot);
        const hw = k.kind === 'strip' ? 0.5 * k.width / 100 * 0.14 * k.scale / 100 * unit : (k.kind === 'blinds' ? 0.28 * k.scale / 100 * k.width / 100 : 0.32 * k.scale / 100) * unit;
        const hh = k.kind === 'strip' ? 0.58 * k.length / 100 * k.scale / 100 * unit : (k.kind === 'blinds' ? 0.28 * k.scale / 100 : 0.42 * k.scale / 100) * unit;
        const C = docOf(l, 'center', s), c = v.toScreen(C);
        g.beginPath();
        [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(([x, y], i) => { const p = v.toScreen({ x: C.x + x * cr - y * sr, y: C.y + x * sr + y * cr }); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
        g.closePath(); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.arc(c.x, c.y, 9, 0, Math.PI * 2); g.lineWidth = 1.5; g.strokeStyle = pal.antsB; g.stroke();
        g.beginPath(); g.arc(c.x, c.y, 2.5, 0, Math.PI * 2); g.fillStyle = pal.antsB; g.fill();
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
    const o = host.original();
    if (o) {
      const q = v.toScreen({ x: 0, y: 0 }), cx = Math.min(v.width - 34, Math.max(34, q.x + 34)), cy = Math.min(v.height - 34, Math.max(34, q.y + 34)), len = 8 + 12 * o.strength;
      g.setLineDash([]);
      g.lineWidth = 1.5;
      g.strokeStyle = pal.antsB;
      g.fillStyle = pal.handle;
      g.beginPath(); g.arc(cx, cy, 24, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath();
      for (let i = 0; i < 4; i++) { const t = (i * Math.PI) / 2; g.moveTo(cx + Math.cos(t) * 20, cy + Math.sin(t) * 20); g.lineTo(cx + Math.cos(t) * 24, cy + Math.sin(t) * 24); }
      g.stroke();
      const tx = cx + o.x * len, ty = cy + o.y * len, th = Math.atan2(o.y, o.x);
      g.strokeStyle = pal.accent;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - o.x * 6, cy - o.y * 6); g.lineTo(tx, ty); g.stroke();
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - Math.cos(th - 0.5) * 6, ty - Math.sin(th - 0.5) * 6); g.lineTo(tx - Math.cos(th + 0.5) * 6, ty - Math.sin(th + 0.5) * 6); g.closePath();
      g.fillStyle = pal.accent; g.fill();
    }
    g.restore();
  },
  options: () => [
    { kind: 'title', text: 'Relight' },
    { kind: 'button', label: 'Cancel', icon: 'close', compact: true, run: () => host?.cancel() },
    { kind: 'button', label: 'Done', icon: 'check', compact: true, run: () => host?.commit() },
  ],
};
