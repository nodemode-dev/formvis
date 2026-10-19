import type { Pt } from '../../engine';
import type { OptionSpec, Tool } from '../registry';

let drag: 'a' | 'b' | 'new' | 'arm' | null = null;
const NEAR = 8;

/** The line's angle (counter-clockwise positive), its length and extent. */
function measures(r: { a: Pt; b: Pt }): { angle: number; length: number; w: number; h: number } {
  const dx = r.b.x - r.a.x, dy = r.b.y - r.a.y;
  return { angle: (-Math.atan2(dy, dx) * 180) / Math.PI, length: Math.hypot(dx, dy), w: dx, h: dy };
}

/** The protractor: the second arm's length and the angle between the arms, both seen from the end they turn about. */
export function armMeasures(r: { a: Pt; b: Pt }, arm: { v: 'a' | 'b'; to: Pt }): { length: number; between: number } {
  const v = arm.v === 'a' ? r.a : r.b, o = arm.v === 'a' ? r.b : r.a;
  const a1 = Math.atan2(o.y - v.y, o.x - v.x), a2 = Math.atan2(arm.to.y - v.y, arm.to.x - v.x);
  let d = Math.abs(a1 - a2) * 180 / Math.PI;
  if (d > 180) d = 360 - d;
  return { length: Math.hypot(arm.to.x - v.x, arm.to.y - v.y), between: d };
}

/** The Ruler (I, the owner's tool list): drag to measure, drag an end to adjust; the bar and the Info
 *  panel give its angle and length; Straighten Layer turns the layer so the line lies level; Clear removes it. */
export const rulerTool: Tool = {
  id: 'ruler', label: 'Ruler', key: 'I', order: 80.6,
  icon: () => 'tRuler',
  hint: () => 'Drag to measure · Drag an end to adjust · Alt-drag from an end for a second arm and the angle between · Straighten Layer levels the layer along the line',
  cursor: () => 'crosshair',
  down(ctx, p) {
    const m = ctx.engine.measure;
    if (p.button !== 0 || !m) return;
    const v = ctx.view(), at = v.toScreen(p.doc), near = (q: Pt): boolean => { const s = v.toScreen(q); return Math.hypot(s.x - at.x, s.y - at.y) <= NEAR; };
    if (p.alt && m.ruler && (near(m.ruler.b) || near(m.ruler.a))) { ctx.engine.setRulerArm({ v: near(m.ruler.b) ? 'b' : 'a', to: p.doc }); drag = 'arm'; return; }
    if (m.ruler && near(m.ruler.b)) drag = 'b';
    else if (m.ruler && near(m.ruler.a)) drag = 'a';
    else { m.ruler = { a: p.doc, b: p.doc }; drag = 'new'; ctx.engine.setRulerArm(null); }
    ctx.engine.measureChanged();
  },
  move(ctx, p) {
    const m = ctx.engine.measure;
    if (!drag || !m?.ruler) return;
    let q = p.doc;
    const arm = ctx.engine.rulerArm;
    if (drag === 'arm' && arm) {
      const v = arm.v === 'a' ? m.ruler.a : m.ruler.b;
      if (p.shift) { const a = Math.round(Math.atan2(q.y - v.y, q.x - v.x) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(q.x - v.x, q.y - v.y); q = { x: v.x + Math.cos(a) * l, y: v.y + Math.sin(a) * l }; }
      ctx.engine.setRulerArm({ v: arm.v, to: q });
      return;
    }
    const from = drag === 'a' ? m.ruler.b : m.ruler.a;
    if (p.shift) { const a = Math.round(Math.atan2(q.y - from.y, q.x - from.x) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(q.x - from.x, q.y - from.y); q = { x: from.x + Math.cos(a) * l, y: from.y + Math.sin(a) * l }; }
    if (drag === 'a') m.ruler.a = q; else m.ruler.b = q;
    ctx.engine.measureChanged();
  },
  up(ctx) {
    const m = ctx.engine.measure, arm = ctx.engine.rulerArm;
    if (drag === 'new' && m?.ruler && Math.hypot(m.ruler.b.x - m.ruler.a.x, m.ruler.b.y - m.ruler.a.y) < 0.5) { m.ruler = null; ctx.engine.measureChanged(); }
    if (drag === 'arm' && arm && m?.ruler && Math.hypot(arm.to.x - (arm.v === 'a' ? m.ruler.a : m.ruler.b).x, arm.to.y - (arm.v === 'a' ? m.ruler.a : m.ruler.b).y) < 0.5) ctx.engine.setRulerArm(null);
    drag = null;
  },
  cancel() { drag = null; },
  overlay(ctx, g) {
    const r = ctx.engine.measure?.ruler;
    if (!r) return;
    const v = ctx.view(), pal = ctx.paint(), a = v.toScreen(r.a), b = v.toScreen(r.b), arm = ctx.engine.rulerArm;
    g.save();
    for (const [color, w] of [[pal.antsB, 3], [pal.antsA, 1.2]] as const) {
      g.strokeStyle = color; g.lineWidth = w;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
      for (const q of [a, b]) { g.moveTo(q.x - 5, q.y); g.lineTo(q.x + 5, q.y); g.moveTo(q.x, q.y - 5); g.lineTo(q.x, q.y + 5); }
      if (arm) { const s = arm.v === 'a' ? a : b, t = v.toScreen(arm.to); g.moveTo(s.x, s.y); g.lineTo(t.x, t.y); }
      g.stroke();
    }
    g.restore();
  },
  options: (e): OptionSpec[] => {
    const r = () => e.measure?.ruler ?? null, f = (n: number): string => n.toFixed(1);
    const u = (n: number): string => { const s = e.rulerUnit(); return s.units === 'px' ? f(n) : `${f(n * s.k)} ${s.units}`; };
    return [
      { kind: 'title', text: 'Ruler' },
      { kind: 'toggle', label: 'Use Measurement Scale', get: () => e.measureOpts.useScale, set: (v) => { e.measureOpts.useScale = v; e.measureChanged(); } },
      { kind: 'readout', label: 'X', get: () => (r() ? f((r() as { a: Pt }).a.x * e.rulerUnit().k) : '-') },
      { kind: 'readout', label: 'Y', get: () => (r() ? f((r() as { a: Pt }).a.y * e.rulerUnit().k) : '-') },
      { kind: 'readout', label: 'W', get: () => { const x = r(); return x ? f(measures(x).w * e.rulerUnit().k) : '-'; } },
      { kind: 'readout', label: 'H', get: () => { const x = r(); return x ? f(measures(x).h * e.rulerUnit().k) : '-'; } },
      { kind: 'readout', label: 'A', get: () => { const x = r(); return x ? `${f(measures(x).angle)}\u00b0` : '-'; } },
      { kind: 'readout', label: 'L', get: () => { const x = r(); return x ? u(measures(x).length) : '-'; } },
      { kind: 'readout', label: 'L2', when: () => !!e.rulerArm, get: () => { const x = r(), a = e.rulerArm; return x && a ? u(armMeasures(x, a).length) : '-'; } },
      { kind: 'readout', label: 'Between', when: () => !!e.rulerArm, get: () => { const x = r(), a = e.rulerArm; return x && a ? `${f(armMeasures(x, a).between)}\u00b0` : '-'; } },
      { kind: 'button', label: 'Straighten Layer', run: () => {
        const x = r(), l = e.activeLayer;
        if (!x || !l) { e.notice('Draw a line with the Ruler along what should be level.'); return; }
        let turn = measures(x).angle;           // the line's angle, counter-clockwise; the layer turns back by it
        while (turn > 90) turn -= 180;
        while (turn <= -90) turn += 180;
        e.setLayerTransform({ rotation: l.transform.rotation + turn }, 'Straighten Layer');
        const m = e.measure; if (m) { m.ruler = null; e.setRulerArm(null); }
      } },
      { kind: 'button', label: 'Clear', run: () => { const m = e.measure; if (m) { m.ruler = null; e.setRulerArm(null); } } },
    ];
  },
};
