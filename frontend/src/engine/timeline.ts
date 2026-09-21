import { effectsFromData, uid, type Doc, type ID, type Layer, type LayerEffects } from './types';

/** Frame animation, as in Photoshop's frame timeline: each frame keeps every layer's visibility, opacity and
 *  position, and a delay. The pixels are shared by all frames. */
/** `fx`: the layer's style in this frame, so frames can differ in style too; absent in frames saved before 0.59. */
export interface FrameLayer { visible: boolean; opacity: number; x: number; y: number; fx?: LayerEffects | null }
export interface Frame { id: ID; delay: number; state: Record<ID, FrameLayer> }
/** `loops`: 0 repeats forever. */
export interface Timeline { frames: Frame[]; current: ID | null; loops: number }

/** Frame delays offered in the Timeline, in milliseconds. */
export const FRAME_DELAYS = [0, 100, 200, 500, 1000, 2000, 5000, 10000];

/** Every layer's visibility, opacity and position, as a frame keeps them. */
export function captureFrame(doc: Doc): Record<ID, FrameLayer> {
  const out: Record<ID, FrameLayer> = {};
  for (const l of doc.layers) out[l.id] = { visible: l.visible, opacity: l.opacity, x: l.transform.x, y: l.transform.y, fx: l.effects ? structuredClone(l.effects) : null };
  return out;
}

/** The layers as frame `state` shows them; a layer the frame does not know keeps its own state, so layers added later
 *  show in every frame. */
export function frameLayers(layers: readonly Layer[], state: Record<ID, FrameLayer>): Layer[] {
  return layers.map((l) => {
    const s = state[l.id];
    if (!s) return l;
    const styled = s.fx !== undefined && JSON.stringify(s.fx) !== JSON.stringify(l.effects ?? null);
    if (!styled && s.visible === l.visible && s.opacity === l.opacity && s.x === l.transform.x && s.y === l.transform.y) return l;
    return { ...l, visible: s.visible, opacity: s.opacity, transform: { ...l.transform, x: s.x, y: s.y }, ...(styled ? { effects: s.fx ? structuredClone(s.fx) : null } : {}) };
  });
}

/** The timeline as project-file data; null when it has no frames. */
export function timelineData(t: Timeline | null): { loops: number; current: ID | null; frames: Frame[] } | null {
  return t && t.frames.length ? { loops: t.loops, current: t.current, frames: t.frames.map((f) => ({ id: f.id, delay: f.delay, state: f.state })) } : null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A timeline read back from a project file, checked field by field and bounded. */
export function timelineFrom(raw: unknown): Timeline | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, frames: Frame[] = [];
  for (const f of Array.isArray(o.frames) ? o.frames.slice(0, 500) : []) {
    if (!f || typeof f !== 'object') continue;
    const r = f as Record<string, unknown>, state: Record<ID, FrameLayer> = {};
    const entries = r.state && typeof r.state === 'object' ? Object.entries(r.state as Record<string, unknown>).slice(0, 5000) : [];
    for (const [id, v] of entries) {
      const s = v as Record<string, unknown> | null;
      if (s && typeof s.visible === 'boolean' && finite(s.opacity) && finite(s.x) && finite(s.y)) state[id] = { visible: s.visible, opacity: Math.min(1, Math.max(0, s.opacity)), x: s.x, y: s.y, ...('fx' in s ? { fx: s.fx ? effectsFromData(s.fx) : null } : {}) };
    }
    const id = typeof r.id === 'string' && r.id && !frames.some((x) => x.id === r.id) ? r.id.slice(0, 64) : uid();
    frames.push({ id, delay: finite(r.delay) ? Math.min(60000, Math.max(0, Math.round(r.delay))) : 100, state });
  }
  if (!frames.length) return null;
  const loops = finite(o.loops) ? Math.min(65535, Math.max(0, Math.round(o.loops))) : 0;
  return { frames, loops, current: typeof o.current === 'string' && frames.some((f) => f.id === o.current) ? o.current : frames[0].id };
}
