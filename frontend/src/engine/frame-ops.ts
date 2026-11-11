// Frame animation (DEV_PLAN 36.13): the Engine's frame animation methods (new, select, delete, move, tween, delay,
// loops, render), moved out of index.ts. Each takes a FrameHost, the few Engine members they use, so this file never
// imports the Engine class. The video timeline stays in index.ts.
import type { Project } from './project';
import { Renderer, renderDoc } from './renderer';
import type { Surface } from './surface';
import { captureFrame, frameLayers, type Frame, type FrameLayer, type Timeline } from './timeline';
import { uid, type ID } from './types';
import { followVector } from './vector-mask';

/** What the frame animation methods need of the Engine. */
export interface FrameHost {
  current: Project | null;
  work: Renderer;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  notice(message: string): void;
  timelineOf(p: Project): Timeline;
  syncFrame(p: Project): void;
  /** Tells the Timeline panel the frames changed. */
  timelineChanged(): void;
}

export function startFrameAnimation(host: FrameHost): boolean {
  const p = host.current;
  if (!p) return false;
  const t = host.timelineOf(p);
  if (t.frames.length || t.video) return false;
  const first: Frame = { id: uid(), delay: 100, state: captureFrame(p.doc) };
  t.frames.push(first);
  t.current = first.id;
  host.timelineChanged();
  return true;
}

export function newFrame(host: FrameHost): void {
  const p = host.current;
  if (!p) return;
  const t = host.timelineOf(p);
  host.syncFrame(p);
  if (!t.frames.length) { const first: Frame = { id: uid(), delay: 100, state: captureFrame(p.doc) }; t.frames.push(first); t.current = first.id; }
  const i = Math.max(0, t.frames.findIndex((f) => f.id === t.current)), src = t.frames[i];
  const copy: Frame = { id: uid(), delay: src.delay, state: structuredClone(src.state) };
  t.frames.splice(i + 1, 0, copy);
  t.current = copy.id;
  host.timelineChanged();
}

export function selectFrame(host: FrameHost, id: ID): void {
  const p = host.current;
  if (!p) return;
  const t = host.timelineOf(p), f = t.frames.find((x) => x.id === id);
  if (!f) return;
  host.syncFrame(p);
  t.current = id;
  const target = frameLayers(p.doc.layers, f.state);
  host.edit('Select Frame', (q) => {
    target.forEach((l, i) => {
      const now = q.doc.layers[i];
      if (l === now || now?.id !== l.id) return;
      const dx = l.transform.x - now.transform.x, dy = l.transform.y - now.transform.y, m = now.mask, moved = dx !== 0 || dy !== 0;
      q.updateLayer(l.id, {
        visible: l.visible, opacity: l.opacity, transform: l.transform, effects: l.effects,
        ...(moved && m?.linked && m.placement ? { mask: { ...m, placement: { ...m.placement, x: m.placement.x + dx, y: m.placement.y + dy } } } : {}),
        ...(moved && now.vectorMask?.linked ? { vectorMask: followVector(now, l.transform) } : {}),
      });
    });
  });
  host.timelineChanged();
}

export function deleteFrame(host: FrameHost, id?: ID): void {
  const p = host.current;
  if (!p) return;
  const t = host.timelineOf(p), target = id ?? t.current, i = t.frames.findIndex((f) => f.id === target);
  if (i < 0) return;
  const wasCurrent = t.current === target;
  t.frames.splice(i, 1);
  if (!t.frames.length) t.current = null;
  else if (wasCurrent) { t.current = null; selectFrame(host, t.frames[Math.min(i, t.frames.length - 1)].id); }
  host.timelineChanged();
}

export function moveFrame(host: FrameHost, id: ID, to: number): void {
  const p = host.current;
  if (!p) return;
  const t = host.timelineOf(p), i = t.frames.findIndex((f) => f.id === id);
  if (i < 0) return;
  const [f] = t.frames.splice(i, 1);
  t.frames.splice(Math.max(0, Math.min(t.frames.length, Math.round(to))), 0, f);
  host.timelineChanged();
}

export function tween(host: FrameHost, id: ID, count: number, opts: { position: boolean; opacity: boolean; easing?: 'linear' | 'in' | 'out' | 'inOut' }): boolean {
  const p = host.current;
  if (!p) return false;
  host.syncFrame(p);
  const t = host.timelineOf(p), i = t.frames.findIndex((f) => f.id === id);
  if (i < 0 || i + 1 >= t.frames.length) { host.notice('Select a frame with another after it to tween towards.'); return false; }
  const a = t.frames[i], b = t.frames[i + 1], n = Math.min(50, Math.max(1, Math.round(count))), made: Frame[] = [];
  for (let k = 1; k <= n; k++) {
    // Easing shapes the steps: in starts slow (the square), out ends slow (its mirror), in and out does both.
    const t0 = k / (n + 1), e = opts.easing ?? 'linear';
    const u = e === 'in' ? t0 * t0 : e === 'out' ? 1 - (1 - t0) * (1 - t0) : e === 'inOut' ? (t0 < 0.5 ? 2 * t0 * t0 : 1 - 2 * (1 - t0) * (1 - t0)) : t0;
    const state: Record<ID, FrameLayer> = {};
    for (const lid of new Set([...Object.keys(a.state), ...Object.keys(b.state)])) {
      const sa = a.state[lid], sb = b.state[lid];
      if (!sa || !sb) { state[lid] = { ...(sa ?? sb) }; continue; }
      const fades = opts.opacity && sa.visible !== sb.visible, oa = sa.visible ? sa.opacity : 0, ob = sb.visible ? sb.opacity : 0;
      state[lid] = {
        fx: sa.fx,
        visible: fades ? true : sa.visible,
        opacity: !opts.opacity ? sa.opacity : fades ? oa + (ob - oa) * u : sa.opacity + (sb.opacity - sa.opacity) * u,
        x: opts.position ? sa.x + (sb.x - sa.x) * u : sa.x,
        y: opts.position ? sa.y + (sb.y - sa.y) * u : sa.y,
      };
    }
    made.push({ id: uid(), delay: a.delay, state });
  }
  t.frames.splice(i + 1, 0, ...made);
  host.timelineChanged();
  return true;
}

export function setFrameDelay(host: FrameHost, id: ID, ms: number): void {
  const p = host.current, f = p ? host.timelineOf(p).frames.find((x) => x.id === id) : null;
  if (!f) return;
  f.delay = Math.min(60000, Math.max(0, Math.round(ms)));
  host.timelineChanged();
}

export function setLoops(host: FrameHost, n: number): void {
  const p = host.current;
  if (!p) return;
  host.timelineOf(p).loops = Math.min(65535, Math.max(0, Math.round(n)));
  host.timelineChanged();
}

export function renderFrame(host: FrameHost, f: Frame | null): Surface | null {
  const p = host.current;
  if (!p) return null;
  return renderDoc(host.work, f ? { ...p.doc, layers: frameLayers(p.doc.layers, f.state) } : p.doc);
}
