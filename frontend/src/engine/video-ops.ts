// Video timeline (DEV_PLAN 36.13): the Engine's video timeline methods (create and delete, edit, fades, split, the
// playhead, Interpret Footage, video layers and their frame steps, render, convert), moved out of index.ts. The state they
// share (the open drag, and the raster version each video layer's shown frame had) lives in a VideoStore the Engine holds;
// each function takes a VideoHost, the few Engine members it uses, so this file never imports the Engine class. The frame
// animation (frame-ops.ts) and the timelines map stay in index.ts.
import type { Project } from './project';
import { Raster, type Surface } from './surface';
import { Renderer, renderDoc } from './renderer';
import { frameLayers, type Timeline } from './timeline';
import { newVideoTimeline, sampleToFrames, stateAt, type FadeColor, type VideoTimeline } from './video-timeline';
import type { FootageInterpretation, ID, Layer } from './types';

/** The video state the Engine keeps. */
export class VideoStore {
  /** A drag in the timeline (a clip moved or trimmed, a keyframe moved) as one step, from press to release. */
  gesture: { p: Project } | null = null;
  /** The raster version each video layer's shown frame had when it was put on the layer, to tell a painted frame. */
  readonly shown = new WeakMap<Raster, number>();
}

/** What the video timeline methods need of the Engine. `current` is read live. */
export interface VideoHost {
  readonly current: Project | null;
  store: VideoStore;
  work: Renderer;
  timelineOf(p: Project): Timeline;
  setTimeline(p: Project, t: Timeline): void;
  /** True while a stroke is open or the Engine is busy (the busy case tells the person to wait). */
  blocked(): boolean;
  settle(): void;
  refresh(): void;
  emit(what: 'timeline' | 'render'): void;
  insertRasterLayer(raster: Raster, name: string, x: number | null, y: number | null, extra?: Partial<Layer>, undoName?: string): void;
  selectLayer(id: ID): void;
  duplicateLayers(): void;
}

/** The current document's video timeline (1.59.2, DEV_PLAN 25.1), or null. */
export function video(host: VideoHost): VideoTimeline | null { const p = host.current; return p ? host.timelineOf(p).video ?? null : null; }

/** Timeline > Create Video Timeline: `fps` frames a second for `seconds`, a track per layer; refused while the
 *  document has a frame animation or a video timeline already (Photoshop's two modes are one or the other). */
export function createVideoTimeline(host: VideoHost, fps = 30, seconds = 5): boolean {
  const p = host.current;
  if (!p) return false;
  const t = host.timelineOf(p);
  if (t.frames.length || t.video) return false;
  const v = newVideoTimeline(p.doc, fps, seconds);
  p.history.begin('Create Video Timeline', { ...p.snapshot(), video: null });   // a step (1.59.5)
  host.setTimeline(p, { ...t, video: v });
  p.history.end({ ...p.snapshot(), video: structuredClone(v) });
  host.refresh();
  host.emit('timeline');
  return true;
}

/** Delete Timeline (the video one), a step. */
export function deleteVideoTimeline(host: VideoHost): boolean {
  const p = host.current, v = p ? host.timelineOf(p).video : null;
  if (!p || !v) return false;
  p.history.begin('Delete Timeline', { ...p.snapshot(), video: structuredClone(v) });
  host.setTimeline(p, { ...host.timelineOf(p), video: null });
  p.history.end({ ...p.snapshot(), video: null });
  host.refresh();
  host.emit('timeline');
  return true;
}

/** The video timeline changed through `fn` on a copy, then put in place and shown. With a `name` it is one undoable
 *  step (1.59.5, carrying the timeline as path edits carry paths); inside a gesture (`beginVideoGesture`) it is live,
 *  the gesture being the step; without either it is live and no step at all (the playhead moving). */
export function editVideo(host: VideoHost, fn: (vt: VideoTimeline) => void, name?: string): boolean {
  const p = host.current, vt = video(host);
  if (!p || !vt) return false;
  const step = !!name && !host.store.gesture;
  if (step) p.history.begin(name as string, { ...p.snapshot(), video: structuredClone(vt) });
  const next = structuredClone(vt);
  fn(next);
  host.setTimeline(p, { ...host.timelineOf(p), video: next });
  if (step) { p.history.end({ ...p.snapshot(), video: structuredClone(next) }); host.refresh(); }
  host.emit('timeline');
  host.emit('render');   // the canvas shows the playhead's frame (1.59.3)
  return true;
}

/** Fade In, Fade Out or both on layer `id`'s clip over `frames` (0 removes them), one step (1.59.7: from the panel
 *  into the engine, which the MCP tools share). False when the layer has no clip. */
export function fadeClip(host: VideoHost, id: ID, frames: number, inn: boolean, out: boolean, color: FadeColor | null = null): boolean {
  if (!video(host)?.tracks[id]) return false;
  return editVideo(host, (v) => {
    const t = v.tracks[id];
    if (!t) return;
    const f = Math.max(0, Math.min(Math.round(frames), t.length)), c = color ? { color } : {};   // with a colour: 1.60.1
    if (inn) t.fadeIn = f > 0 ? { frames: f, ...c } : null;
    if (out) t.fadeOut = f > 0 ? { frames: f, ...c } : null;
  }, frames > 0 ? 'Add Transition' : 'Remove Transition');
}

/** Cross Fade, as Photoshop's: layer `id`'s clip with the clip that starts or ends within it and overlaps it most
 *  (one covering it whole, a background, is no partner), over their overlap, fading only the upper of the two (in
 *  when it starts later, out when it ends first) so the picture never dips. Null when done, else why not. */
export function crossFade(host: VideoHost, id: ID): string | null {
  const p = host.current, vt = video(host), a = vt?.tracks[id];
  if (!p || !vt || !a) return 'Select a layer with a clip in the timeline.';
  let best: { id: ID; len: number } | null = null;
  for (const [other, b] of Object.entries(vt.tracks)) {
    if (other === id) continue;
    const covers = b.start <= a.start && b.start + b.length >= a.start + a.length;
    const len = Math.min(a.start + a.length, b.start + b.length) - Math.max(a.start, b.start);
    if (len > 0 && !covers && (!best || len > best.len)) best = { id: other, len };
  }
  if (!best) return 'Cross Fade needs another clip that starts or ends within this one.';
  const order = p.doc.layers.map((l) => l.id), upper = order.indexOf(id) > order.indexOf(best.id) ? id : best.id, lower = upper === id ? best.id : id, len = best.len;
  editVideo(host, (v) => {
    const u = v.tracks[upper], l = v.tracks[lower];
    if (!u || !l) return;
    if (u.start >= l.start) u.fadeIn = { frames: len }; else u.fadeOut = { frames: len };
  }, 'Add Transition');
  return null;
}

/** Split at a frame, as Photoshop's Split at Playhead: layer `id`'s clip ends at `frame`, and a copy of the layer
 *  carries on from it with the rest of the clip and the same keyframes. The copy's id, or null when `frame` is not
 *  inside the clip. */
export function splitClip(host: VideoHost, id: ID, frame: number): ID | null {
  const p = host.current, tr = video(host)?.tracks[id];
  if (!p || !tr || frame <= tr.start || frame >= tr.start + tr.length) return null;
  const before = new Set(p.doc.layers.map((l) => l.id));
  host.selectLayer(id);
  // One step (1.59.8): the copy and the split nest inside it, so one undo takes back both.
  p.history.begin('Split at Playhead', { ...p.snapshot(), video: structuredClone(video(host)) });
  let copy: Layer | undefined;
  try {
    host.duplicateLayers();
    copy = host.current?.doc.layers.find((l) => !before.has(l.id));
    if (copy) { const c = copy; editVideo(host, (v) => { const t = v.tracks[id]; if (!t) return; v.tracks[c.id] = { ...structuredClone(t), start: frame, length: t.start + t.length - frame }; t.length = frame - t.start; }, 'Split at Playhead'); }
  } finally {
    p.history.end({ ...p.snapshot(), video: structuredClone(video(host)) });
    host.refresh();
  }
  return copy?.id ?? null;
}

export function beginVideoGesture(host: VideoHost, name: string): void {
  const p = host.current, vt = video(host);
  if (!p || !vt || host.store.gesture) return;
  p.history.begin(name, { ...p.snapshot(), video: structuredClone(vt) });
  host.store.gesture = { p };
}
export function endVideoGesture(host: VideoHost): void {
  const g = host.store.gesture;
  if (!g) return;
  host.store.gesture = null;
  const v = host.timelineOf(g.p).video ?? null;
  g.p.history.end({ ...g.p.snapshot(), video: v ? structuredClone(v) : null });
  host.refresh();
}

/** The playhead moved to frame `f` (kept within the timeline); the canvas shows that frame. */
export function setVideoTime(host: VideoHost, f: number): void {
  const vt = video(host);
  if (!vt) return;
  const t = Math.round(Math.min(vt.duration - 1, Math.max(0, f)));
  if (t === vt.current) return;
  const p = host.current;
  if (p) { videoStore(host, p, vt, vt.current); videoShow(host, p, vt, t); }   // video layers: keep the painted frame, show the next
  editVideo(host, (v) => { v.current = t; });
}

/** The footage frame video layer `v` shows at timeline frame `t`, by Interpret Footage's rate and loop count
 *  (DEV_PLAN 33.4), or -1 outside the clip. Without an interpretation it is the frame `t - start`, as before. */
export function footageFrame(v: NonNullable<Layer['video']>, tr: { start: number }, vt: VideoTimeline, t: number): number {
  const local = t - tr.start, n = v.frames.length, it = v.interpret;
  if (local < 0 || !n) return -1;
  const src = it?.fps && vt.fps > 0 ? Math.floor(local * it.fps / vt.fps + 1e-9) : local;
  const loops = Math.max(1, Math.round(it?.loop ?? 1));
  return src < n * loops ? src % n : -1;
}

/** A footage frame as Interpret Footage's alpha setting reads it: `ignore` makes it opaque, `premultiplied` takes the
 *  matte back out of the colour. A new raster when anything changes, else `r` itself. */
export function footagePixels(r: Raster, it: FootageInterpretation | undefined): Raster {
  if (!it?.alpha || it.alpha === 'straight') return r;
  const out = r.clone(), img = out.read(), d = img.data, m = it.matte ?? { r: 0, g: 0, b: 0 };
  for (let i = 0; i < d.length; i += 4) {
    if (it.alpha === 'ignore') { d[i + 3] = 255; continue; }
    const a = d[i + 3] / 255;
    if (a <= 0 || a >= 1) continue;
    d[i] = (d[i] - m.r * (1 - a)) / a; d[i + 1] = (d[i + 1] - m.g * (1 - a)) / a; d[i + 2] = (d[i + 2] - m.b * (1 - a)) / a;
  }
  out.write(img);
  return out;
}

/** The inverse of `footagePixels` for premultiplied footage: the matte put back into the colour (c a + m (1 - a)). */
export function footageStored(r: Raster, it: FootageInterpretation): Raster {
  const out = r.clone(), img = out.read(), d = img.data, m = it.matte ?? { r: 0, g: 0, b: 0 };
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a <= 0 || a >= 1) continue;
    d[i] = d[i] * a + m.r * (1 - a); d[i + 1] = d[i + 1] * a + m.g * (1 - a); d[i + 2] = d[i + 2] * a + m.b * (1 - a);
  }
  out.write(img);
  return out;
}

/** Interpret Footage: the active video layer's rate, loop count and alpha reading, its clip made as long as the
 *  footage now plays. One undo step. */
export function interpretFootage(host: VideoHost, it: FootageInterpretation): boolean {
  const p = host.current, vt = video(host), l = p?.activeLayer;
  if (!p || !vt || !l?.video || !vt.tracks[l.id] || host.blocked()) return false;
  host.settle();
  videoStore(host, p, vt, vt.current);
  const clean: FootageInterpretation = {
    ...(it.fps && it.fps > 0 && Math.abs(it.fps - vt.fps) > 1e-6 ? { fps: Math.min(240, it.fps) } : {}),
    ...(it.loop && it.loop > 1 ? { loop: Math.min(100, Math.round(it.loop)) } : {}),
    ...(it.alpha && it.alpha !== 'straight' ? { alpha: it.alpha } : {}),
    ...(it.alpha === 'premultiplied' && it.matte ? { matte: it.matte } : {}),
  };
  p.history.begin('Interpret Footage', { ...p.snapshot(), video: structuredClone(vt) });
  const next = structuredClone(vt), nt = next.tracks[l.id], n = l.video.frames.length;
  nt.length = Math.max(1, Math.ceil(n * (clean.loop ?? 1) * (clean.fps ? next.fps / clean.fps : 1) - 1e-9));
  if (nt.start + nt.length > next.duration) { if (next.workOut === next.duration) next.workOut = nt.start + nt.length; next.duration = nt.start + nt.length; }
  const v = l.video, interpret = Object.keys(clean).length ? clean : undefined;
  p.doc = { ...p.doc, layers: p.doc.layers.map((x) => (x.id === l.id ? { ...x, video: { frames: v.frames, original: v.original, name: v.name, ...(interpret ? { interpret } : {}) } } : x)) };
  host.setTimeline(p, { ...host.timelineOf(p), video: next });
  videoShow(host, p, next, next.current);
  p.history.end({ ...p.snapshot(), video: structuredClone(next) });
  host.refresh();
  host.emit('timeline');
  host.emit('render');
  return true;
}

/** Before the playhead leaves frame `t`: each video layer's raster goes back into its `frames` if it was painted. */
export function videoStore(host: VideoHost, p: Project, vt: VideoTimeline, t: number): void {
  for (const l of p.doc.layers) {
    const v = l.video, tr = vt.tracks[l.id];
    if (!v || !tr) continue;
    const ras = l.raster;
    if (!ras) continue;
    const i = footageFrame(v, tr, vt, t), seen = host.store.shown.get(ras);
    // Never seen (a project just opened shows its own copy of the frame): kept when it is not the stored frame itself.
    if (i < 0 || i >= v.frames.length || (seen === undefined ? ras === v.frames[i] : ras.version === seen)) continue;
    // A painted frame of premultiplied footage is shown with the matte taken out; it is stored with the matte put
    // back, so showing it again does not take the matte out twice (33.4 open note, closed at 1.70.9).
    v.frames[i] = v.interpret?.alpha === 'premultiplied' ? footageStored(ras, v.interpret) : ras;
    host.store.shown.set(ras, ras.version);
  }
}

/** Puts frame `t`'s picture on each video layer whose clip holds it (a copy, so painting leaves `frames` alone until stored). */
export function videoShow(host: VideoHost, p: Project, vt: VideoTimeline, t: number): void {
  if (!p.doc.layers.some((l) => l.video)) return;
  p.doc = {
    ...p.doc,
    layers: p.doc.layers.map((l) => {
      const v = l.video, tr = vt.tracks[l.id];
      if (!v || !tr) return l;
      const i = footageFrame(v, tr, vt, t);
      if (i < 0 || i >= v.frames.length) return l;
      const shown = footagePixels(v.frames[i], v.interpret), r = shown === v.frames[i] ? shown.clone() : shown;
      host.store.shown.set(r, r.version);
      return { ...l, raster: r };
    }),
  };
}

/** New Video Layer: `frames` become a pixel layer whose clip starts at `start` (the playhead) and lasts as many frames;
 *  a video timeline is made if there is none. One undo step. */
export function addVideoLayer(host: VideoHost, name: string, frames: Raster[], start?: number): boolean {
  const p = host.current;
  if (!p || !frames.length || frames.length > 300 || host.blocked()) return false;
  const had = host.timelineOf(p).video ?? null;
  if (!had && host.timelineOf(p).frames.length) return false;
  host.settle();
  if (had) videoStore(host, p, had, had.current);
  const from = start ?? had?.current ?? 0, before = new Set(p.doc.layers.map((l) => l.id));
  let made: Layer | undefined;
  p.history.begin('New Video Layer', { ...p.snapshot(), video: had ? structuredClone(had) : null });
  try {
    host.insertRasterLayer(frames[0].clone(), name, null, null, { video: { frames, original: frames.slice(), name } }, 'New Video Layer');
    made = p.doc.layers.find((l) => !before.has(l.id));
    if (made) {
      const id = made.id, v = had ? structuredClone(had) : newVideoTimeline(p.doc, 30, Math.max(1, frames.length / 30));
      v.tracks[id] = { start: from, length: frames.length, keys: {} };
      if (from + frames.length > v.duration) { if (v.workOut === v.duration) v.workOut = from + frames.length; v.duration = from + frames.length; }
      v.current = Math.min(v.duration - 1, from);
      host.setTimeline(p, { ...host.timelineOf(p), video: v });
      videoShow(host, p, v, v.current);
    }
  } finally {
    const v = host.timelineOf(p).video ?? null;
    p.history.end({ ...p.snapshot(), video: v ? structuredClone(v) : null });
    host.refresh();
    host.emit('timeline');
    host.emit('render');
  }
  return !!made;
}

/** New Blank Video Layer: an empty document-size frame for every frame of the timeline (150 when there is none). */
export function newBlankVideoLayer(host: VideoHost): boolean {
  const p = host.current;
  if (!p) return false;
  const n = Math.min(300, video(host)?.duration ?? 150), frames: Raster[] = [];
  for (let i = 0; i < n; i++) frames.push(new Raster(p.doc.width, p.doc.height));
  return addVideoLayer(host, 'Video Layer', frames, 0);
}

/** One undoable change to the active video layer's frames at the playhead; `change` returns the new frame lists
 *  (`at` the frame to show after, `drop` to end the video layer) and must not alter the old ones. */
export function videoStep(host: VideoHost, name: string, change: (v: NonNullable<Layer['video']>, i: number) => { frames: Raster[]; original: Raster[]; at?: number; drop?: boolean } | null): boolean {
  const p = host.current, vt = video(host), l = p?.activeLayer;
  if (!p || !vt || !l?.video || host.blocked()) return false;
  const tr = vt.tracks[l.id], i = tr ? footageFrame(l.video, tr, vt, vt.current) : -1;
  if (!tr || i < 0 || i >= l.video.frames.length) return false;
  host.settle();
  videoStore(host, p, vt, vt.current);
  const out = change(l.video, i);
  if (!out) return false;
  p.history.begin(name, { ...p.snapshot(), video: structuredClone(vt) });
  const next = structuredClone(vt), nt = next.tracks[l.id], label = l.video.name, it = l.video.interpret;
  // Footage frames to timeline frames through Interpret Footage's rate and loops (1:1 without one).
  const k = it?.fps ? next.fps / it.fps : 1;
  nt.length = Math.max(1, Math.ceil(out.frames.length * (it?.loop ?? 1) * k - 1e-9));
  if (nt.start + nt.length > next.duration) { if (next.workOut === next.duration) next.workOut = nt.start + nt.length; next.duration = nt.start + nt.length; }
  next.current = Math.min(next.duration - 1, nt.start + Math.min(Math.ceil((out.at ?? i) * k - 1e-9), nt.length - 1));
  p.doc = { ...p.doc, layers: p.doc.layers.map((x) => (x.id === l.id ? { ...x, video: out.drop ? null : { frames: out.frames, original: out.original, name: label, ...(it ? { interpret: it } : {}) } } : x)) };
  host.setTimeline(p, { ...host.timelineOf(p), video: next });
  videoShow(host, p, next, next.current);
  p.history.end({ ...p.snapshot(), video: structuredClone(next) });
  host.refresh();
  host.emit('timeline');
  host.emit('render');
  return true;
}

/** Insert Blank Frame: an empty frame after the playhead's, which moves onto it. The clip grows by one. */
export function insertBlankFrame(host: VideoHost): boolean {
  return videoStep(host, 'Insert Blank Frame', (v, i) => {
    const w = host.current?.doc.width ?? 1, h = host.current?.doc.height ?? 1, blank = new Raster(w, h), f = v.frames.slice(), o = v.original.slice();
    f.splice(i + 1, 0, blank); o.splice(i + 1, 0, blank);
    return { frames: f, original: o, at: i + 1 };
  });
}

/** Duplicate Frame: a copy of the playhead's frame after it, the playhead moving onto the copy. */
export function duplicateFrame(host: VideoHost): boolean {
  return videoStep(host, 'Duplicate Frame', (v, i) => {
    const f = v.frames.slice(), o = v.original.slice();
    f.splice(i + 1, 0, f[i].clone()); o.splice(i + 1, 0, o[i]);
    return { frames: f, original: o, at: i + 1 };
  });
}

/** Delete Frame: the playhead's frame goes and the clip shortens; the last frame of a clip stays. */
export function deleteVideoFrame(host: VideoHost): boolean {
  return videoStep(host, 'Delete Frame', (v, i) => {
    if (v.frames.length < 2) return null;
    const f = v.frames.slice(), o = v.original.slice();
    f.splice(i, 1); o.splice(i, 1);
    return { frames: f, original: o, at: i };
  });
}

/** Restore Frame: the playhead's frame back to the footage as loaded. */
export function restoreFrame(host: VideoHost): boolean {
  return videoStep(host, 'Restore Frame', (v, i) => {
    if (v.frames[i] === v.original[i]) return null;
    const f = v.frames.slice();
    f[i] = v.original[i];
    return { frames: f, original: v.original };
  });
}

/** Restore All Frames: every frame back to the footage as loaded. */
export function restoreAllFrames(host: VideoHost): boolean {
  return videoStep(host, 'Restore All Frames', (v) => (v.frames.every((r, k) => r === v.original[k]) ? null : { frames: v.original.slice(), original: v.original }));
}

/** Rasterize Video Layer: the layer becomes an ordinary pixel layer holding the frame at the playhead. */
export function rasterizeVideo(host: VideoHost): boolean {
  return videoStep(host, 'Rasterize Video Layer', (v) => ({ frames: v.frames, original: v.original, drop: true }));
}

/** The picture at video frame `f`: the layers in the state the timeline gives them there. */
export function renderVideoFrame(host: VideoHost, f: number): Surface | null {
  const p = host.current, vt = video(host);
  if (!p || !vt) return null;
  const t = Math.round(f);
  const layers = p.doc.layers.map((l) => {   // video layers show their own painted frame for `t`, not the one on the canvas
    const v = l.video, tr = vt.tracks[l.id];
    if (!v || !tr || t === vt.current) return l;
    const i = footageFrame(v, tr, vt, t);
    return i >= 0 && i < v.frames.length ? { ...l, raster: footagePixels(v.frames[i], v.interpret) } : l;
  });
  return renderDoc(host.work, { ...p.doc, layers: frameLayers(layers, stateAt(p.doc, vt, f)) });
}

/** Keeps the painted frame under the playhead in each video layer's `frames`, as saving and rendering read them. */
export function flushVideo(host: VideoHost): void {
  const p = host.current, vt = video(host);
  if (p && vt) videoStore(host, p, vt, vt.current);
}

/** Replace Footage: the active video layer's original and painted frames both become `frames`, and its clip as long as
 *  they are. One undo step. */
export function replaceFootage(host: VideoHost, frames: Raster[]): boolean {
  if (!frames.length || frames.length > 300) return false;
  return videoStep(host, 'Replace Footage', () => ({ frames, original: frames.slice() }));
}

/** Convert to Frame Animation: a frame for each frame of the work area (500 at most), the video timeline gone. */
export function convertVideoToFrames(host: VideoHost): boolean {
  const p = host.current, vt = video(host);
  if (!p || !vt) return false;
  const frames = sampleToFrames(p.doc, vt);
  if (!frames.length) return false;
  const was = host.timelineOf(p);   // one step (1.59.8), carrying both timelines so undo brings the video one back
  p.history.begin('Convert to Frame Animation', { ...p.snapshot(), video: structuredClone(vt), frames: structuredClone({ frames: was.frames, current: was.current, loops: was.loops }) });
  host.setTimeline(p, { frames, current: frames[0].id, loops: vt.loops, video: null });
  p.history.end({ ...p.snapshot(), video: null, frames: structuredClone({ frames, current: frames[0].id, loops: vt.loops }) });
  host.refresh();
  host.emit('timeline');
  return true;
}
