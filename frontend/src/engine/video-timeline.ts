import type { Frame, FrameLayer } from './timeline';
import { defaultEffects, uid, type Doc, type ID, type LayerEffects } from './types';

/** The video timeline (1.59.2, DEV_PLAN 25.1), as Photoshop's and Photon Studio's: time counted in frames at a frame
 *  rate, a work area, and per layer a track: its clip (where it starts on the timeline and how long it lasts; outside
 *  it the layer does not show), keyframes of Position X and Y, Opacity, Fill Opacity and Style (each linear or hold),
 *  and fades at the clip's ends. The picture at any frame is the layers in the state `stateAt` gives them, rendered
 *  as a frame of the frame animation is. Pure functions only. */

export type Interp = 'linear' | 'hold';
export interface Keyframe { t: number; v: number; interp: Interp }
export type VideoProp = 'x' | 'y' | 'opacity' | 'fill' | 'style';
export const VIDEO_PROPS: readonly VideoProp[] = ['x', 'y', 'opacity', 'fill', 'style'];
/** `color` (1.60.1): absent fades to transparent; black or white fades the layer to that colour. */
export type FadeColor = 'black' | 'white';
export interface Fade { frames: number; color?: FadeColor }
export interface Track { start: number; length: number; keys: Partial<Record<VideoProp, Keyframe[]>>; fadeIn?: Fade | null; fadeOut?: Fade | null; muted?: boolean }
export interface VideoTimeline { fps: number; duration: number; current: number; workIn: number; workOut: number; loops: number; tracks: Record<ID, Track> }

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A new video timeline for `doc`: `fps` frames a second for `seconds`, a track per layer across the whole of it,
 *  the work area the whole length (30 frames a second and 5 seconds, as Photoshop and Photon start). */
export function newVideoTimeline(doc: Doc, fps = 30, seconds = 5): VideoTimeline {
  const duration = Math.max(1, Math.round(fps * seconds)), tracks: Record<ID, Track> = {};
  for (const l of doc.layers) tracks[l.id] = { start: 0, length: duration, keys: {} };
  return { fps, duration, current: 0, workIn: 0, workOut: duration, loops: 0, tracks };
}

/** A property's value at frame `f`: before the first keyframe its value, after the last the last's; between two, by
 *  the earlier one's interpolation (linear, or hold until the next); `fallback` without keyframes. */
export function valueAt(keys: readonly Keyframe[] | undefined, f: number, fallback: number): number {
  if (!keys || !keys.length) return fallback;
  if (f <= keys[0].t) return keys[0].v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f < b.t) return a.interp === 'hold' || b.t === a.t ? a.v : a.v + ((b.v - a.v) * (f - a.t)) / (b.t - a.t);
  }
  return keys[keys.length - 1].v;
}

/** Every layer's state at frame `f`: shown only inside its clip (and when visible at all), its position, opacity and
 *  fill from its keyframes or its own, its opacity eased by the clip's fades, its style kept or set aside by the Style
 *  keyframes (hold: 1 keeps it, 0 hides it). Layers without a track keep their own state. */
export function stateAt(doc: Doc, vt: VideoTimeline, f: number): Record<ID, FrameLayer> {
  const out: Record<ID, FrameLayer> = {};
  for (const l of doc.layers) {
    const tr = vt.tracks[l.id];
    if (!tr) continue;
    const inside = f >= tr.start && f < tr.start + tr.length, k = tr.keys;
    let opacity = clamp(valueAt(k.opacity, f, l.opacity), 0, 1);
    // A fade without a colour fades the layer out of sight; with one (1.60.1, Photoshop's Fade With Black and Fade With
    // White) the layer turns to that colour at the clip's edge instead, through a colour overlay on top of its style.
    let tint: { color: FadeColor; amount: number } | null = null;
    const ease = (fade: Fade | null | undefined, m: number): void => {
      if (!inside || !fade || fade.frames <= 0) return;
      const a = clamp(m / fade.frames, 0, 1);
      if (!fade.color) opacity *= a;
      else if (1 - a > (tint?.amount ?? 0)) tint = { color: fade.color, amount: 1 - a };
    };
    ease(tr.fadeIn, f - tr.start + 1);
    ease(tr.fadeOut, tr.start + tr.length - f);
    const styled = !k.style?.length || valueAt(k.style, f, 1) >= 0.5;
    let fx: LayerEffects | null = styled ? (l.effects ?? null) : null;
    const t = tint as { color: FadeColor; amount: number } | null;
    if (t && t.amount > 0) {
      const ov = { enabled: true, color: t.color === 'white' ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, opacity: t.amount, blend: 'normal' as const };
      const e = fx ? structuredClone(fx) : defaultEffects();
      if (!e.colorOverlay.enabled) e.colorOverlay = ov; else e.extra = { ...(e.extra ?? {}), colorOverlay: [...(e.extra?.colorOverlay ?? []), ov] };
      fx = e;
    }
    out[l.id] = { visible: l.visible && inside, opacity, x: valueAt(k.x, f, l.transform.x), y: valueAt(k.y, f, l.transform.y), fill: clamp(valueAt(k.fill, f, l.fill ?? 1), 0, 1), fx };
  }
  return out;
}

/** The frame animation `vt` becomes (Convert to Frame Animation): a frame for each of its frames in the work area,
 *  at most `max`, each lasting one frame's time. */
export function sampleToFrames(doc: Doc, vt: VideoTimeline, max = 500): Frame[] {
  const out: Frame[] = [], delay = Math.round(1000 / vt.fps);
  for (let f = vt.workIn; f < vt.workOut && out.length < max; f++) out.push({ id: uid(), delay, state: stateAt(doc, vt, f) });
  return out;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A video timeline read back from a project file, checked field by field and bounded; null when it is not one. */
export function videoFrom(raw: unknown): VideoTimeline | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!finite(o.fps) || !finite(o.duration)) return null;
  const fps = clamp(o.fps, 1, 240), duration = Math.round(clamp(o.duration, 1, 240 * 3600)), tracks: Record<ID, Track> = {};
  const keysOf = (v: unknown): Keyframe[] => (Array.isArray(v) ? v.slice(0, 2000) : []).flatMap((k) => (k && typeof k === 'object' && finite((k as Keyframe).t) && finite((k as Keyframe).v) ? [{ t: Math.round(clamp((k as Keyframe).t, 0, duration)), v: (k as Keyframe).v, interp: (k as Keyframe).interp === 'hold' ? 'hold' as const : 'linear' as const }] : [])).sort((a, b) => a.t - b.t);
  const fade = (v: unknown): Fade | null => {
    if (!v || typeof v !== 'object' || !finite((v as Fade).frames) || (v as Fade).frames <= 0) return null;
    const c = (v as Fade).color;   // 1.60.1
    return { frames: Math.round(clamp((v as Fade).frames, 1, duration)), ...(c === 'black' || c === 'white' ? { color: c } : {}) };
  };
  for (const [id, t] of Object.entries(o.tracks && typeof o.tracks === 'object' ? (o.tracks as Record<string, unknown>) : {}).slice(0, 5000)) {
    const r = t as Record<string, unknown> | null;
    if (!r || !finite(r.start) || !finite(r.length)) continue;
    const keys: Track['keys'] = {}, raw = r.keys && typeof r.keys === 'object' ? (r.keys as Record<string, unknown>) : {};
    for (const p of VIDEO_PROPS) { const ks = keysOf(raw[p]); if (ks.length) keys[p] = ks; }
    tracks[id] = { start: Math.round(clamp(r.start, -duration, duration)), length: Math.round(clamp(r.length, 1, 240 * 3600)), keys, fadeIn: fade(r.fadeIn), fadeOut: fade(r.fadeOut), muted: r.muted === true };
  }
  const workIn = finite(o.workIn) ? Math.round(clamp(o.workIn, 0, duration - 1)) : 0, workOut = finite(o.workOut) ? Math.round(clamp(o.workOut, workIn + 1, duration)) : duration;
  return { fps, duration, current: finite(o.current) ? Math.round(clamp(o.current, 0, duration - 1)) : 0, workIn, workOut, loops: finite(o.loops) ? Math.round(clamp(o.loops, 0, 65535)) : 0, tracks };
}
