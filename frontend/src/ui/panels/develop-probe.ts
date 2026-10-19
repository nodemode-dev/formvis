import { applyMat, invert, placement, type Mat, type Pt, type Transform } from '../../engine';
import type { Tool, ToolContext, ToolPointer } from '../../extensions/registry';

/** What Develop's on-image tools need from the Filter dialog: the mode showing, the layer being developed and where the picked
 *  colour or drawn guide goes. 'pick' reads a colour on click, 'drag' reads it on press and reports the vertical drag
 *  (the colour mixer's targeted adjustment), 'guides' draws straight lines for Upright. Points are layer pixels. */
export type ProbeMode = 'pick' | 'drag' | 'guides';
export interface ProbeHost {
  mode(): ProbeMode | null;
  layer(): { t: Transform; w: number; h: number; img: ImageData } | null;
  pick(r: number, g: number, b: number): void;
  drag(up: number): void;
  guide(a: Pt, b: Pt): void;
  guides(): ReadonlyArray<readonly [Pt, Pt]>;
}

/** The colour under layer pixel (x, y): the mean of the 3 by 3 pixels around it, or null outside the layer or on a clear pixel. */
export function sampleAt(img: ImageData, x: number, y: number): [number, number, number] | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= img.width || cy >= img.height) return null;
  let r = 0, g = 0, b = 0, n = 0;
  for (let j = Math.max(0, cy - 1); j <= Math.min(img.height - 1, cy + 1); j++) for (let i = Math.max(0, cx - 1); i <= Math.min(img.width - 1, cx + 1); i++) {
    const k = (j * img.width + i) * 4;
    if (img.data[k + 3] < 8) continue;
    r += img.data[k]; g += img.data[k + 1]; b += img.data[k + 2]; n++;
  }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null;
}

export function createDevelopProbe(host: ProbeHost): Tool {
  let down: { local: Pt; sy: number } | null = null, now: Pt | null = null;
  const geo = (): { M: Mat; W: Mat; l: NonNullable<ReturnType<ProbeHost['layer']>> } | null => {
    const l = host.layer();
    if (!l) return null;
    const M = placement(l.t, l.w, l.h);
    return { M, W: invert(M), l };
  };
  return {
    id: 'idle', label: 'Develop on image', key: '', order: 0, hidden: true,
    icon: () => 'move',
    hint: () => (host.mode() === 'guides' ? 'Drag along a vertical or horizontal edge to draw a guide; two guides on a side straighten it.' : host.mode() === 'drag' ? 'Press on a colour, then drag up or down to change it.' : 'Click a colour in the picture.'),
    cursor: () => 'crosshair',
    down(ctx, p: ToolPointer) {
      const g = geo(), mode = host.mode();
      if (!g || !mode || p.button !== 0) return;
      const q = applyMat(g.W, p.doc.x, p.doc.y);
      down = { local: q, sy: p.screen.y };
      now = q;
      if (mode === 'guides') { ctx.engine.emit('overlay', null); return; }
      const c = sampleAt(g.l.img, q.x, q.y);
      if (c) host.pick(c[0], c[1], c[2]); else down = null;
    },
    move(ctx, p: ToolPointer) {
      const g = geo(), mode = host.mode();
      if (!down || !g || !mode) return;
      if (mode === 'drag') host.drag(down.sy - p.screen.y);
      if (mode === 'guides') { now = applyMat(g.W, p.doc.x, p.doc.y); ctx.engine.emit('overlay', null); }
    },
    up(ctx, p: ToolPointer) {
      const d = down, g = geo();
      down = null;
      if (!d || !g || host.mode() !== 'guides') { now = null; return; }
      const q = applyMat(g.W, p.doc.x, p.doc.y), v = ctx.view();
      const a = v.toScreen(applyMat(g.M, d.local.x, d.local.y)), b = v.toScreen(applyMat(g.M, q.x, q.y));
      now = null;
      if (Math.hypot(a.x - b.x, a.y - b.y) >= 12) host.guide(d.local, q);
      ctx.engine.emit('overlay', null);
    },
    cancel(ctx: ToolContext) { down = null; now = null; ctx.engine.emit('overlay', null); },
    overlay(ctx, c) {
      const g = geo();
      if (!g || host.mode() !== 'guides') return;
      const v = ctx.view(), pal = ctx.paint(), scr = (p: Pt): Pt => v.toScreen(applyMat(g.M, p.x, p.y));
      const line = (a: Pt, b: Pt, color: string): void => {
        const s = scr(a), e = scr(b);
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(e.x, e.y);
        c.lineWidth = 3; c.strokeStyle = pal.antsB; c.stroke();
        c.lineWidth = 1.5; c.strokeStyle = color; c.stroke();
      };
      c.save();
      c.lineJoin = 'round';
      for (const [a, b] of host.guides()) line(a, b, pal.accent);
      if (down && now) line(down.local, now, pal.antsA);
      c.restore();
    },
  };
}
