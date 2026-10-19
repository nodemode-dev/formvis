import { applyMat, invert, placement, type Mat, type Pt, type Rect, type Transform } from '../../engine';
import type { Tool, ToolContext, ToolPointer } from '../../extensions/registry';

export type PinKind = 'fieldBlur' | 'irisBlur' | 'spinBlur' | 'pathBlur';
export const PIN_KINDS: readonly string[] = ['fieldBlur', 'irisBlur', 'spinBlur', 'pathBlur'];

/** What the Blur Gallery pins need from the Filter dialog: the settings of the filter showing and where the layer sits. */
export interface PinHost {
  kind(): PinKind | null;
  get(key: string): number;
  put(patch: Record<string, number>): void;
  /** The layer's box, its pixel size, and the rectangle of its pixels that percentages refer to (grown by the blur's margin, or the selection for Spin Blur). */
  layer(): { t: Transform; w: number; h: number; ref: Rect } | null;
}

type Part = 'c' | 'x' | 'y' | 'f' | 'd' | 'r';
interface Slot { x: string; y: string; rx?: string; ry?: string; angle?: string; amount?: string; feather?: string; round?: string }

const SETUP: Record<PinKind, { count: string; max: number; slots: (n: number) => Slot; amountMax: number }> = {
  fieldBlur: { count: 'pins', max: 4, amountMax: 100, slots: (n) => ({ x: `pin${n}x`, y: `pin${n}y`, amount: `pin${n}blur` }) },
  irisBlur: {
    count: 'irisPins', max: 3, amountMax: 100,
    slots: (n) => (n === 1 ? { x: 'irisX', y: 'irisY', rx: 'irisRx', ry: 'irisRy', angle: 'irisAngle', feather: 'irisFeather', amount: 'irisBlur', round: 'irisRound' }
      : { x: `iris${n}x`, y: `iris${n}y`, rx: `iris${n}rx`, ry: `iris${n}ry`, angle: `iris${n}angle`, feather: `iris${n}feather`, amount: `iris${n}blur`, round: `iris${n}round` }),
  },
  spinBlur: {
    count: 'spins', max: 3, amountMax: 360,
    slots: (n) => { const k = n === 1 ? '' : String(n); return { x: `x${k}`, y: `y${k}`, rx: `radiusX${k}`, ry: `radiusY${k}`, angle: `angle${k}`, amount: `blurAngle${k}` }; },
  },
  pathBlur: { count: '', max: 3, amountMax: 0, slots: (n) => (n === 1 ? { x: 'pathSx', y: 'pathSy' } : n === 2 ? { x: 'pathBx', y: 'pathBy' } : { x: 'pathEx', y: 'pathEy' }) },
};

const DIAL = 26;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const fresh = (kind: PinKind, at: Pt): Record<string, number> => (kind === 'fieldBlur' ? { blur: 15 } : kind === 'irisBlur' ? { rx: 15, ry: 15, angle: 0, feather: 50 } : kind === 'spinBlur' ? { rx: 20, ry: 20, angle: 0, amount: 15 } : { x: at.x });

export interface BlurPins extends Tool { select(n: number): void; selected(): number; removeSelected(): boolean }

/** On-canvas pins for Field, Iris, Spin and Path Blur, drawn on the stage overlay while the Filter dialog is open: click empty
 *  image to add a pin, drag a pin to move it, drag its handles to size, turn or feather it, drag the ring knob for its amount,
 *  Delete (or Alt-click) to remove it. Every change goes through the dialog's own settings, so the sliders and the preview follow. */
export function createBlurPins(host: PinHost): BlurPins {
  let sel = 1, drag: { n: number; part: Part; dx: number; dy: number } | null = null;

  const geo = (): { M: Mat; W: Mat; ref: Rect } | null => {
    const l = host.layer();
    if (!l) return null;
    const M = placement(l.t, l.w, l.h);
    return { M, W: invert(M), ref: l.ref };
  };
  const val = (key: string, fallback: string, last: number): number => { const v = host.get(key); if (Number.isFinite(v)) return v; const f = host.get(fallback); return Number.isFinite(f) ? f : last; };
  const count = (kind: PinKind): number => (kind === 'pathBlur' ? 3 : clamp(Math.round(host.get(SETUP[kind].count)), 1, SETUP[kind].max));
  const loc = (g: { ref: Rect }, x: number, y: number): Pt => ({ x: g.ref.x + (x / 100) * g.ref.w, y: g.ref.y + (y / 100) * g.ref.h });
  const pct = (g: { ref: Rect }, p: Pt): Pt => ({ x: ((p.x - g.ref.x) / g.ref.w) * 100, y: ((p.y - g.ref.y) / g.ref.h) * 100 });

  interface Pin { n: number; c: Pt; px?: Pt; py?: Pt; pf?: Pt; pr?: Pt; ux: number; uy: number; RX: number; RY: number; amount: number; pw: number }
  /** The superellipse power of a roundness percent (the engine's: 2 for an ellipse, up to 8 for a near square), and the reach of its diagonal point as a share of the radii. */
  const powOf = (round: number): number => 2 + (1 - clamp(round, 0, 100) / 100) * 6;
  const pins = (kind: PinKind, g: { M: Mat; ref: Rect }): Pin[] => {
    const out: Pin[] = [];
    for (let n = 1; n <= count(kind); n++) {
      const k = SETUP[kind].slots(n), c = loc(g, host.get(k.x), host.get(k.y));
      const a = k.angle ? (host.get(k.angle) * Math.PI) / 180 : 0, ux = Math.cos(a), uy = Math.sin(a);
      const RX = k.rx ? (host.get(k.rx) / 100) * g.ref.w : 0, RY = k.ry ? (host.get(k.ry) / 100) * g.ref.h : 0;
      const pin: Pin = { n, c, ux, uy, RX, RY, amount: k.amount ? (kind === 'irisBlur' ? val(k.amount, 'irisBlur', 0) : host.get(k.amount)) : 0, pw: k.round ? powOf(val(k.round, 'irisRound', 100)) : 2 };
      if (k.rx) { pin.px = { x: c.x + ux * RX, y: c.y + uy * RX }; pin.py = { x: c.x - uy * RY, y: c.y + ux * RY }; }
      if (k.round) {
        const d = Math.pow(2, -1 / pin.pw), a = RX * d, b = RY * d;
        pin.pr = { x: c.x + ux * a - uy * b, y: c.y + uy * a + ux * b };
      }
      if (k.feather) { const f = host.get(k.feather) / 100; pin.pf = { x: c.x + uy * RY * f, y: c.y - ux * RY * f }; }
      out.push(pin);
    }
    return out;
  };

  const dialAt = (s: Pt, amount: number, max: number): Pt => { const th = (clamp(amount / max, 0, 1) || 0) * Math.PI * 2; return { x: s.x + Math.sin(th) * DIAL, y: s.y - Math.cos(th) * DIAL }; };

  function hit(ctx: ToolContext, kind: PinKind, g: { M: Mat; ref: Rect }, at: Pt): { n: number; part: Part } | null {
    const v = ctx.view(), list = pins(kind, g), max = SETUP[kind].amountMax;
    const scr = (p: Pt): Pt => v.toScreen(applyMat(g.M, p.x, p.y));
    const near = (p: Pt, r: number): boolean => Math.hypot(p.x - at.x, p.y - at.y) <= r;
    const order = [...list].sort((a, b) => (a.n === sel ? -1 : b.n === sel ? 1 : 0));
    for (const p of order) {
      if (p.n !== sel) continue;
      if (SETUP[kind].amountMax && near(dialAt(scr(p.c), p.amount, max), 8)) return { n: p.n, part: 'd' };
      if (p.px && near(scr(p.px), 8)) return { n: p.n, part: 'x' };
      if (p.py && near(scr(p.py), 8)) return { n: p.n, part: 'y' };
      if (p.pf && near(scr(p.pf), 8)) return { n: p.n, part: 'f' };
      if (p.pr && near(scr(p.pr), 8)) return { n: p.n, part: 'r' };
    }
    for (const p of order) if (near(scr(p.c), 11)) return { n: p.n, part: 'c' };
    return null;
  }

  const store = (kind: PinKind, n: number, patch: Partial<Record<keyof Slot, number>>): void => {
    const k = SETUP[kind].slots(n), out: Record<string, number> = {};
    for (const [role, val] of Object.entries(patch)) { const key = k[role as keyof Slot]; if (typeof key === 'string' && val !== undefined) out[key] = val; }
    host.put(out);
  };

  function remove(kind: PinKind, n: number): void {
    const c = count(kind);
    if (kind === 'pathBlur' || c <= 1) return;
    const out: Record<string, number> = {};
    for (let j = n; j < c; j++) {
      const a = SETUP[kind].slots(j), b = SETUP[kind].slots(j + 1);
      for (const role of Object.keys(a) as Array<keyof Slot>) {
        const ka = a[role], kb = b[role];
        if (typeof ka !== 'string' || typeof kb !== 'string') continue;
        const v = kind === 'irisBlur' && role === 'amount' ? val(kb, 'irisBlur', 0) : kind === 'irisBlur' && role === 'round' ? val(kb, 'irisRound', 100) : host.get(kb);
        if (Number.isFinite(v)) out[ka] = v;
      }
    }
    out[SETUP[kind].count] = c - 1;
    host.put(out);
    sel = Math.min(sel, c - 1);
  }

  function add(kind: PinKind, g: { ref: Rect }, local: Pt): void {
    const c = count(kind);
    if (kind === 'pathBlur' || c >= SETUP[kind].max) return;
    const at = pct(g, local), n = c + 1, f = fresh(kind, at), k = SETUP[kind].slots(n), out: Record<string, number> = { [SETUP[kind].count]: n, [k.x]: clamp(at.x, 0, 100), [k.y]: clamp(at.y, 0, 100) };
    if (k.amount) out[k.amount] = kind === 'irisBlur' ? val('irisBlur', 'irisBlur', 15) : f.blur ?? f.amount ?? 0;
    if (k.round) out[k.round] = 100;
    if (k.rx) { out[k.rx] = f.rx; out[k.ry as string] = f.ry; out[k.angle as string] = f.angle; }
    if (k.feather) out[k.feather] = f.feather;
    host.put(out);
    sel = n;
  }

  function move(ctx: ToolContext, p: ToolPointer, final: boolean): void {
    const kind = host.kind(), g = geo();
    if (!drag || !kind || !g) return;
    const q = applyMat(g.W, p.doc.x, p.doc.y), pin = pins(kind, g).find((x) => x.n === drag?.n);
    if (!pin) return;
    const k = SETUP[kind].slots(drag.n);
    if (drag.part === 'c') { const at = pct(g, { x: q.x + drag.dx, y: q.y + drag.dy }); store(kind, drag.n, { x: clamp(at.x, 0, 100), y: clamp(at.y, 0, 100) }); }
    else if (drag.part === 'x') {
      const dx = q.x - pin.c.x, dy = q.y - pin.c.y, len = Math.hypot(dx, dy);
      if (len < 2) return;
      const patch: Partial<Record<keyof Slot, number>> = { rx: clamp(Math.round((len / g.ref.w) * 100), 1, 100) };
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (kind === 'irisBlur') deg = deg > 90 ? deg - 180 : deg < -90 ? deg + 180 : deg;
      if (k.angle) patch.angle = Math.round(deg);
      store(kind, drag.n, patch);
    } else if (drag.part === 'y') {
      store(kind, drag.n, { ry: clamp(Math.round((Math.abs((q.x - pin.c.x) * -pin.uy + (q.y - pin.c.y) * pin.ux) / g.ref.h) * 100), 1, 100) });
    } else if (drag.part === 'r') {
      const dx = q.x - pin.c.x, dy = q.y - pin.c.y, u = (dx * pin.ux + dy * pin.uy) / Math.max(1, pin.RX), v = (-dx * pin.uy + dy * pin.ux) / Math.max(1, pin.RY);
      const kk = clamp((Math.abs(u) + Math.abs(v)) / 2, Math.SQRT1_2 + 0.001, 0.95), pw = clamp(-Math.LN2 / Math.log(kk), 2, 8);
      store(kind, drag.n, { round: Math.round((1 - (pw - 2) / 6) * 100) });
    } else if (drag.part === 'f') {
      const d = Math.abs((q.x - pin.c.x) * pin.uy - (q.y - pin.c.y) * pin.ux);
      store(kind, drag.n, { feather: clamp(Math.round((d / Math.max(1, pin.RY)) * 100), 0, 99) });
    } else {
      const s = ctx.view().toScreen(applyMat(g.M, pin.c.x, pin.c.y)), a = Math.atan2(p.screen.x - s.x, -(p.screen.y - s.y)), t = (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2);
      store(kind, drag.n, { amount: Math.round(clamp(t, 0, 1) * SETUP[kind].amountMax) });
    }
    if (final) drag = null;
    ctx.engine.emit('overlay', null);
  }

  return {
    id: 'idle', label: 'Blur pins', key: '', order: 0, hidden: true,
    icon: () => 'move', hint: () => 'Click the image to add a pin, drag a pin or its handles, Delete removes the selected pin.',
    select: (n) => { sel = n; },
    selected: () => sel,
    removeSelected() {
      const kind = host.kind();
      if (!kind || kind === 'pathBlur' || count(kind) <= 1) return false;
      remove(kind, sel);
      return true;
    },
    cursor(ctx, p) {
      const kind = host.kind(), g = geo();
      if (!kind || !g || !p) return 'default';
      const h = hit(ctx, kind, g, p.screen);
      return h ? (h.part === 'c' ? 'move' : 'pointer') : kind === 'pathBlur' ? 'default' : 'crosshair';
    },
    down(ctx, p) {
      const kind = host.kind(), g = geo();
      if (!kind || !g) return;
      const h = hit(ctx, kind, g, p.screen), q = applyMat(g.W, p.doc.x, p.doc.y);
      if (h) {
        if (h.part === 'c' && p.alt) { remove(kind, h.n); ctx.engine.emit('overlay', null); return; }
        sel = h.n;
        const pin = pins(kind, g).find((x) => x.n === h.n);
        drag = { n: h.n, part: h.part, dx: pin ? pin.c.x - q.x : 0, dy: pin ? pin.c.y - q.y : 0 };
        ctx.engine.emit('overlay', null);
        return;
      }
      add(kind, g, q);
      drag = null;
      ctx.engine.emit('overlay', null);
    },
    move(ctx, p) { move(ctx, p, false); },
    up(ctx, p) { move(ctx, p, true); drag = null; },
    cancel() { drag = null; },
    keydown(ctx, e) {
      const kind = host.kind();
      if (!kind || (e.key !== 'Delete' && e.key !== 'Backspace')) return false;
      remove(kind, sel);
      ctx.engine.emit('overlay', null);
      return true;
    },
    overlay(ctx, g) {
      const kind = host.kind(), geom = geo();
      if (!kind || !geom) return;
      const v = ctx.view(), pal = ctx.paint(), max = SETUP[kind].amountMax;
      const scr = (p: Pt): Pt => v.toScreen(applyMat(geom.M, p.x, p.y));
      const list = pins(kind, geom);
      g.save();
      g.lineJoin = 'round';
      const stroke = (on: boolean, fn: () => void): void => {
        fn();
        g.lineWidth = on ? 3 : 2.5; g.strokeStyle = pal.antsB; g.stroke();
        g.lineWidth = on ? 1.5 : 1; g.strokeStyle = on ? pal.accent : pal.antsA; g.stroke();
      };
      const dot = (p: Pt, r: number, on: boolean): void => { g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fillStyle = on ? pal.accent : pal.handle; g.fill(); g.lineWidth = 1; g.strokeStyle = pal.antsB; g.stroke(); };
      if (kind === 'pathBlur') {
        const [a, b, c] = list.map((p) => scr(p.c));
        stroke(true, () => { g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(b.x, b.y, c.x, c.y); });
        const ang = Math.atan2(c.y - b.y, c.x - b.x);
        stroke(true, () => { g.beginPath(); g.moveTo(c.x - Math.cos(ang - 0.45) * 14, c.y - Math.sin(ang - 0.45) * 14); g.lineTo(c.x, c.y); g.lineTo(c.x - Math.cos(ang + 0.45) * 14, c.y - Math.sin(ang + 0.45) * 14); });
        list.forEach((p, i) => dot([a, b, c][i], 6, p.n === sel));
        g.restore();
        return;
      }
      for (const p of list) {
        const on = p.n === sel, s = scr(p.c);
        if (p.px && p.py) {
          stroke(on, () => {
            g.beginPath();
            for (let i = 0; i <= 64; i++) {
              const t = (i / 64) * Math.PI * 2, ex = Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** (2 / p.pw), ey = Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** (2 / p.pw);
              const e = scr({ x: p.c.x + ex * p.RX * p.ux - ey * p.RY * p.uy, y: p.c.y + ex * p.RX * p.uy + ey * p.RY * p.ux });
              if (i) g.lineTo(e.x, e.y); else g.moveTo(e.x, e.y);
            }
          });
        }
        if (on && max) {
          stroke(true, () => { g.beginPath(); g.arc(s.x, s.y, DIAL, 0, Math.PI * 2); });
          dot(dialAt(s, p.amount, max), 5, true);
        }
        if (on && p.px && p.py) { dot(scr(p.px), 5, true); dot(scr(p.py), 5, true); if (p.pf) dot(scr(p.pf), 4, true); if (p.pr) dot(scr(p.pr), 4, true); }
        dot(s, on ? 7 : 5, on);
      }
      g.restore();
    },
  };
}
