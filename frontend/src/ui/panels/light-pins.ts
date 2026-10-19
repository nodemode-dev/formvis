import { applyMat, invert, placement, type Mat, type Pt, type Rect, type Transform } from '../../engine';
import type { Tool, ToolContext, ToolPointer } from '../../extensions/registry';

/** What the Lighting Effects handles need from the Filter dialog: the settings of the filter showing and where the layer sits. */
export interface LightHost {
  active(): boolean;
  get(key: string): unknown;
  put(patch: Record<string, number | boolean>): void;
  /** The layer's box, its pixel size and the rectangle its percentages refer to (the selection, else the canvas). */
  layer(): { t: Transform; w: number; h: number; ref: Rect } | null;
}

type Part = 'pos' | 'target';
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const name = (n: number, key: string): string => (n === 1 ? key : `l${n}${key[0]!.toUpperCase()}${key.slice(1)}`);

export interface LightPins extends Tool { select(n: number): void; selected(): number }

/** On-canvas handles for Lighting Effects while its Filter dialog is open: a dot for each light's place, a ring for where a
 *  spot aims; drag either, Ctrl-click empty image to switch on the next free light there, Delete switches the selected
 *  light off (the first stays), the wheel over a light changes its intensity. Every change goes through the dialog's own
 *  settings, so the sliders and the preview follow. */
export function createLightPins(host: LightHost): LightPins {
  let sel = 1, drag: { n: number; part: Part; dx: number; dy: number } | null = null, over: Pt | null = null;

  const geo = (): { M: Mat; W: Mat; ref: Rect } | null => {
    const l = host.layer();
    if (!l) return null;
    const M = placement(l.t, l.w, l.h);
    return { M, W: invert(M), ref: l.ref };
  };
  const num = (n: number, key: string): number => Number(host.get(name(n, key)));
  const on = (n: number): boolean => n === 1 || host.get(`l${n}On`) === true;
  const at = (g: { ref: Rect }, n: number, part: Part): Pt => ({
    x: g.ref.x + (num(n, part === 'pos' ? 'x' : 'targetX') / 100) * g.ref.w,
    y: g.ref.y + (num(n, part === 'pos' ? 'y' : 'targetY') / 100) * g.ref.h,
  });
  const aims = (n: number): boolean => host.get(name(n, 'type')) === 'spot';

  function hit(ctx: ToolContext, g: { M: Mat; ref: Rect }, s: Pt): { n: number; part: Part } | null {
    const v = ctx.view(), scr = (p: Pt): Pt => v.toScreen(applyMat(g.M, p.x, p.y));
    const near = (p: Pt, r: number): boolean => Math.hypot(p.x - s.x, p.y - s.y) <= r;
    for (const n of [sel, 1, 2, 3]) {
      if (!on(n)) continue;
      if (aims(n) && near(scr(at(g, n, 'target')), 9)) return { n, part: 'target' };
      if (near(scr(at(g, n, 'pos')), 11)) return { n, part: 'pos' };
    }
    return null;
  }

  const store = (n: number, part: Part, local: Pt, g: { ref: Rect }): void => {
    const px = clamp(((local.x - g.ref.x) / g.ref.w) * 100, 0, 100), py = clamp(((local.y - g.ref.y) / g.ref.h) * 100, 0, 100);
    host.put(part === 'pos' ? { [name(n, 'x')]: Math.round(px), [name(n, 'y')]: Math.round(py) } : { [name(n, 'targetX')]: Math.round(px), [name(n, 'targetY')]: Math.round(py) });
  };

  return {
    id: 'idle', label: 'Light handles', key: '', order: 0, hidden: true,
    icon: () => 'move', hint: () => 'Drag a light or its target, Ctrl-click empty image to add a light, Delete switches the selected light off.',
    select: (n) => { sel = n; },
    selected: () => sel,
    cursor(ctx, p) {
      const g = geo();
      if (!host.active() || !g || !p) return 'default';
      return hit(ctx, g, p.screen) ? 'move' : 'crosshair';
    },
    hover(_ctx, p) { over = p ? p.screen : null; },
    down(ctx, p) {
      const g = geo();
      if (!host.active() || !g) return;
      const h = hit(ctx, g, p.screen), q = applyMat(g.W, p.doc.x, p.doc.y);
      if (h) {
        sel = h.n;
        const c = at(g, h.n, h.part);
        drag = { n: h.n, part: h.part, dx: c.x - q.x, dy: c.y - q.y };
      } else {
        drag = null;
        const free = [2, 3].find((n) => !on(n));
        if (p.mod && free) { host.put({ [`l${free}On`]: true }); sel = free; store(free, 'pos', q, g); }
      }
      ctx.engine.emit('overlay', null);
    },
    move(ctx, p: ToolPointer) {
      const g = geo();
      if (!drag || !g) return;
      const q = applyMat(g.W, p.doc.x, p.doc.y);
      store(drag.n, drag.part, { x: q.x + drag.dx, y: q.y + drag.dy }, g);
      ctx.engine.emit('overlay', null);
    },
    up() { drag = null; },
    cancel() { drag = null; },
    wheel(ctx, e) {
      const g = geo();
      if (!host.active() || !g || !over) return false;
      const h = hit(ctx, g, over);
      if (!h) return false;
      host.put({ [name(h.n, 'intensity')]: Math.round(clamp(num(h.n, 'intensity') + (e.deltaY < 0 ? 4 : -4), -100, 100)) });
      ctx.engine.emit('overlay', null);
      return true;
    },
    keydown(ctx, e) {
      if (!host.active() || (e.key !== 'Delete' && e.key !== 'Backspace') || sel === 1) return false;
      host.put({ [`l${sel}On`]: false });
      sel = 1;
      ctx.engine.emit('overlay', null);
      return true;
    },
    overlay(ctx, g) {
      const geom = geo();
      if (!host.active() || !geom) return;
      const v = ctx.view(), pal = ctx.paint(), scr = (p: Pt): Pt => v.toScreen(applyMat(geom.M, p.x, p.y));
      g.save();
      g.lineJoin = 'round';
      for (const n of [1, 2, 3]) {
        if (!on(n)) continue;
        const sl = n === sel, a = scr(at(geom, n, 'pos'));
        if (aims(n)) {
          const b = scr(at(geom, n, 'target'));
          g.setLineDash([5, 4]);
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
          g.lineWidth = 3; g.strokeStyle = pal.antsB; g.stroke();
          g.lineWidth = 1.5; g.strokeStyle = sl ? pal.accent : pal.antsA; g.stroke();
          g.setLineDash([]);
          g.beginPath(); g.arc(b.x, b.y, 7, 0, Math.PI * 2);
          g.lineWidth = 3; g.strokeStyle = pal.antsB; g.stroke();
          g.lineWidth = 1.5; g.strokeStyle = sl ? pal.accent : pal.antsA; g.stroke();
        }
        g.beginPath(); g.arc(a.x, a.y, sl ? 8 : 6, 0, Math.PI * 2);
        g.fillStyle = sl ? pal.accent : pal.handle; g.fill();
        g.lineWidth = 1.5; g.strokeStyle = pal.antsB; g.stroke();
      }
      g.restore();
    },
  };
}
