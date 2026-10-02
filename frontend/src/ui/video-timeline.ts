import type { Engine } from '../engine';
import { VIDEO_PROPS, valueAt, type FadeColor, type VideoProp, type VideoTimeline } from '../engine/video-timeline';
import { el, setText } from './dom';

const HEAD_W = 180, ROW_H = 30, RULER_H = 24;

/** The video timeline's panel (1.59.3, DEV_PLAN 25.2), under the canvas as Photoshop's and Photon Studio's: a bar
 *  (first frame, previous, play, next, Split at Playhead; the timecode; the frame rate and length; Convert to Frame
 *  Animation; Delete Timeline), a ruler of seconds with frame ticks where a click or a drag moves the playhead (the
 *  canvas shows that frame), a track per layer with its clip (drag it to move it, drag an end to trim it), the
 *  playhead's line, and a foot (frames to render, zoom, Fit). Shown while the document has a video timeline. The
 *  structure is built once; tracks are kept by layer and only moved and resized. */
export class VideoTimelinePanel {
  private readonly heads = el('<div class="cv-vtl-heads"></div>');
  private readonly lanes = el('<div class="cv-vtl-lanes"></div>');
  private readonly ruler = el<HTMLCanvasElement>('<canvas class="cv-vtl-ruler" aria-label="Time ruler"></canvas>');
  private readonly rows = el('<div class="cv-vtl-rows"></div>');
  private readonly playhead = el('<div class="cv-vtl-playhead" aria-hidden="true"></div>');
  private readonly time = el<HTMLButtonElement>('<button class="cv-vtl-time" type="button" title="Go to Time" aria-label="Go to Time"></button>');
  private readonly rate = el<HTMLButtonElement>('<button class="cv-vtl-rate" type="button" title="Frame rate and length" aria-label="Frame rate and length"></button>');
  private readonly render = el('<span class="cv-vtl-render"></span>');
  private readonly zoom = el<HTMLInputElement>('<input type="range" min="1" max="40" step="0.5" value="8" aria-label="Timeline zoom">');
  private readonly heads$ = new Map<string, HTMLElement>();
  private readonly clips = new Map<string, HTMLElement>();
  private pxPerFrame = 8;
  private playing = 0;

  /** Shown by choice (1.59.8): null follows the document (open while it has a video timeline); true or false is the
   *  person's Window > Timeline or Close. A video timeline appearing resets it. */
  private shown: boolean | null = null;
  private had = false;

  constructor(private readonly root: HTMLElement, private readonly engine: Engine, private readonly renderVideo: () => void = () => {}, private readonly openFrames: () => void = () => {}) {
    // The empty state (1.59.8), as Photon's: the two kinds of timeline offered while the document has neither.
    const empty = el('<div class="cv-vtl-empty"><p class="cv-vtl-empty-title">Timeline</p><p class="cv-vtl-empty-note">Animate this document with a video timeline (clips, keyframes and transitions over time) or a frame animation (frame by frame).</p><div class="cv-vtl-empty-acts"></div></div>');
    const act = (label: string, kind: string, run: () => void): HTMLButtonElement => { const b = el<HTMLButtonElement>(`<button class="cv-btn ${kind}" type="button">${label}</button>`); b.addEventListener('click', run); return b; };
    (empty.querySelector('.cv-vtl-empty-acts') as HTMLElement).append(
      act('Create Video Timeline', 'cv-btn-primary', () => { this.shown = null; engine.createVideoTimeline(); }),
      act('Create Frame Animation', '', () => { this.shown = null; engine.startFrameAnimation(); this.sync(); this.openFrames(); }),
      act('Close', 'cv-btn-ghost', () => { this.shown = false; this.sync(); }));
    root.append(empty);
    const bar = el('<div class="cv-vtl-bar"></div>');
    // Add Transition (1.59.6, DEV_PLAN 25.4): a small menu, built once, acting on the selected layer's clip.
    const pop = el('<div class="cv-vtl-pop" role="menu" aria-label="Transitions" hidden></div>');
    const secs = el<HTMLInputElement>('<input class="cv-vtl-lane-val" type="number" min="0.1" max="60" step="0.1" value="1" aria-label="Transition length in seconds">');
    const pick = (label: string, run: () => void): HTMLButtonElement => { const b = el<HTMLButtonElement>(`<button class="cv-btn cv-btn-ghost" type="button" role="menuitem">${label}</button>`); b.addEventListener('click', () => { pop.hidden = true; run(); }); return b; };
    const len = (): number => { const vt = engine.video; return vt ? Math.max(1, Math.round((Number(secs.value) || 1) * vt.fps)) : 1; };
    const lenRow = el('<label class="cv-vtl-pop-row"><span>Length (seconds)</span></label>'); lenRow.append(secs);
    // Fade to (1.60.1): transparent as before, or Photoshop's Fade With Black and Fade With White.
    const to = el<HTMLSelectElement>('<select class="cv-vtl-lane-val cv-vtl-fade-to" aria-label="Fade to"><option value="">Transparent</option><option value="black">Black</option><option value="white">White</option></select>');
    const toRow = el('<label class="cv-vtl-pop-row"><span>Fade to</span></label>'); toRow.append(to);
    const col = (): FadeColor | null => (to.value === 'black' || to.value === 'white' ? to.value : null);
    pop.append(pick('Fade In', () => this.fade(len(), true, false, col())), pick('Fade Out', () => this.fade(len(), false, true, col())), pick('Fade In and Out', () => this.fade(len(), true, true, col())), pick('Cross Fade', () => this.crossFade()), pick('Remove Transitions', () => this.fade(0, true, true)), lenRow, toRow);
    const addTr = el<HTMLButtonElement>('<button class="cv-icon-btn cv-vtl-btn" type="button" title="Add transition" aria-label="Add transition" aria-haspopup="menu">&#9698;</button>');
    addTr.addEventListener('click', () => { pop.hidden = !pop.hidden; });
    root.append(pop);
    const btn = (label: string, glyph: string, run: () => void): HTMLButtonElement => { const b = el<HTMLButtonElement>(`<button class="cv-icon-btn cv-vtl-btn" type="button" title="${label}" aria-label="${label}">${glyph}</button>`); b.addEventListener('click', run); return b; };
    const go = (f: (vt: VideoTimeline) => number): void => { const vt = engine.video; if (vt) engine.setVideoTime(f(vt)); };
    const playBtn = btn('Play', '&#9654;', () => this.toggle(playBtn));
    bar.append(btn('First frame', '&#9198;', () => go((v) => v.workIn)), btn('Previous frame', '&#9664;', () => go((v) => v.current - 1)), playBtn, btn('Next frame', '&#9654;&#124;', () => go((v) => v.current + 1)),
      btn('Split at Playhead', '&#9986;', () => this.split()), addTr, el('<span class="cv-vtl-gap"></span>'), this.time, this.rate,
      btn('Convert to Frame Animation', '&#9638;', () => { this.stop(playBtn); engine.convertVideoToFrames(); }), btn('Delete Timeline', '&#215;', () => { this.stop(playBtn); engine.deleteVideoTimeline(); }));
    this.time.addEventListener('click', () => { const vt = engine.video; if (!vt) return; const v = window.prompt('Go to frame', String(vt.current)); if (v !== null && v.trim() !== '' && Number.isFinite(Number(v))) engine.setVideoTime(Number(v)); });
    this.rate.addEventListener('click', () => this.setRate());
    const body = el('<div class="cv-vtl-body"></div>');
    this.lanes.append(this.ruler, this.rows, this.playhead);
    body.append(this.heads, this.lanes);
    const fit = el<HTMLButtonElement>('<button class="cv-btn cv-btn-ghost cv-vtl-fit" type="button">Fit</button>');
    fit.addEventListener('click', () => this.fit());
    this.zoom.addEventListener('input', () => { this.pxPerFrame = Number(this.zoom.value); this.sync(); });
    const foot = el('<div class="cv-vtl-foot"></div>');
    const renderBtn = el<HTMLButtonElement>('<button class="cv-btn cv-vtl-go" type="button" aria-label="Render Video">Render</button>');
    renderBtn.addEventListener('click', () => this.renderVideo());
    foot.append(this.render, fit, this.zoom, renderBtn);
    root.append(bar, body, foot);
    this.lanes.addEventListener('scroll', () => { this.heads.scrollTop = this.lanes.scrollTop; });   // names beside their clips
    this.ruler.addEventListener('pointerdown', (e) => { this.ruler.setPointerCapture(e.pointerId); this.scrub(e); });
    this.ruler.addEventListener('pointermove', (e) => { if (this.ruler.hasPointerCapture(e.pointerId)) this.scrub(e); });
    for (const ev of ['timeline', 'doc', 'projects', 'active'] as const) engine.on(ev, () => this.sync());
    this.sync();
  }

  /** Window > Timeline (1.59.8): shows the panel (its empty state when there is no timeline) or hides it. */
  toggleOpen(): void { this.shown = this.root.hidden !== false; this.sync(); }   // toggle is Play's
  get isOpen(): boolean { return !this.root.hidden; }

  private frameAt(clientX: number): number { const r = this.lanes.getBoundingClientRect(); return Math.round((clientX - r.left + this.lanes.scrollLeft) / this.pxPerFrame); }
  private scrub(e: PointerEvent): void { this.engine.setVideoTime(this.frameAt(e.clientX)); }

  private fit(): void { const vt = this.engine.video; if (!vt) return; this.pxPerFrame = Math.max(1, Math.min(40, (this.lanes.clientWidth - 8) / vt.duration)); this.zoom.value = String(this.pxPerFrame); this.sync(); }

  private setRate(): void {
    const vt = this.engine.video;
    if (!vt) return;
    const fps = window.prompt('Frame rate (frames a second)', String(vt.fps));
    if (fps === null) return;
    const secs = window.prompt('Length (seconds)', String(vt.duration / vt.fps));
    if (secs === null) return;
    const f = Number(fps), s = Number(secs);
    if (!(f >= 1 && f <= 240) || !(s > 0 && s <= 3600)) return;
    this.engine.editVideo((v) => { const d = Math.max(1, Math.round(f * s)); v.fps = f; v.duration = d; v.workOut = Math.min(Math.max(v.workOut, 1), d); v.workIn = Math.min(v.workIn, v.workOut - 1); v.current = Math.min(v.current, d - 1); }, 'Set Timeline Frame Rate');
  }

  /** Split at Playhead, as Photoshop's: the active layer's clip ends at the playhead, and a copy of the layer carries
   *  on from it with the rest of the clip and the same keyframes. */
  private split(): void {
    const e = this.engine, vt = e.video, id = e.current?.activeId;   // the engine's since 1.59.7
    if (vt && id) e.splitClip(id, vt.current);
  }

  private toggle(b: HTMLButtonElement): void { if (this.playing) this.stop(b); else this.play(b); }
  private stop(b: HTMLButtonElement): void { if (this.playing) cancelAnimationFrame(this.playing); this.playing = 0; b.innerHTML = '&#9654;'; b.setAttribute('aria-label', 'Play'); }
  private play(b: HTMLButtonElement): void {
    const vt = this.engine.video;
    if (!vt) return;
    b.innerHTML = '&#10073;&#10073;'; b.setAttribute('aria-label', 'Pause');
    const t0 = performance.now(), f0 = vt.current >= vt.workOut - 1 ? vt.workIn : vt.current;
    const tick = (now: number): void => {
      const v = this.engine.video;
      if (!v) { this.stop(b); return; }
      const span = Math.max(1, v.workOut - v.workIn), f = v.workIn + ((f0 - v.workIn + Math.floor(((now - t0) / 1000) * v.fps)) % span);
      this.engine.setVideoTime(f);
      this.playing = requestAnimationFrame(tick);
    };
    this.playing = requestAnimationFrame(tick);
  }

  /** The panel kept in step: shown while there is a video timeline; tracks made once per layer, then moved and sized. */
  sync(): void {
    const vt = this.engine.video, p = this.engine.current, frames = !!p && this.engine.timeline.frames.length > 0;
    if (!!vt !== this.had) { this.had = !!vt; if (vt) this.shown = null; }   // a timeline appearing shows it
    const open = !!p && !frames && (this.shown ?? !!vt);
    this.root.hidden = !open;
    this.root.classList.toggle('is-empty', open && !vt);
    if (!vt || !p) return;
    const fr = (n: number): string => String(Math.floor(n)).padStart(2, '0');
    const s = vt.current / vt.fps;
    setText(this.time, `${fr(s / 3600)}:${fr((s / 60) % 60)}:${fr(s % 60)}:${fr(vt.current % Math.round(vt.fps))}`);
    setText(this.rate, `${vt.fps} fps · ${vt.duration} frames`);
    setText(this.render, `${vt.workOut - vt.workIn} frames to render`);
    const width = Math.ceil(vt.duration * this.pxPerFrame) + 40, layers = [...p.doc.layers].reverse().filter((l) => vt.tracks[l.id]);
    const rowsUsed = layers.reduce((n, l) => n + 1 + (this.open.has(l.id) ? VIDEO_PROPS.length : 0), 0);
    this.rows.style.width = `${width}px`;
    this.rows.style.height = `${rowsUsed * ROW_H}px`;
    const live = new Set(layers.map((l) => l.id)), liveLanes = new Set<string>();
    for (const [id, n] of this.clips) if (!live.has(id)) { n.remove(); this.clips.delete(id); this.heads$.get(id)?.remove(); this.heads$.delete(id); }
    let r = 0;
    for (const l of layers) {
      const tr = vt.tracks[l.id];
      let head = this.heads$.get(l.id), clip = this.clips.get(l.id);
      if (!head) { head = this.makeHead(l.id); this.heads$.set(l.id, head); this.heads.append(head); }
      if (!clip) { clip = this.makeClip(l.id); this.clips.set(l.id, clip); this.rows.append(clip); }
      setText(head.querySelector('.cv-vtl-head-name') as HTMLElement, l.name);
      const chev = head.querySelector('.cv-vtl-chev') as HTMLElement, isOpen = this.open.has(l.id);
      chev.setAttribute('aria-expanded', String(isOpen)); chev.setAttribute('aria-label', isOpen ? 'Collapse track' : 'Expand track');
      head.style.transform = `translateY(${RULER_H + r * ROW_H}px)`;
      head.classList.toggle('is-active', p.activeId === l.id);
      clip.style.transform = `translate(${tr.start * this.pxPerFrame}px, ${r * ROW_H + 3}px)`;
      clip.style.width = `${Math.max(4, tr.length * this.pxPerFrame)}px`;
      setText(clip.querySelector('.cv-vtl-clip-name') as HTMLElement, l.name);
      for (const [sel, fd] of [['.cv-vtl-fade.is-in', tr.fadeIn], ['.cv-vtl-fade.is-out', tr.fadeOut]] as const) {   // 1.59.6; colours 1.60.1
        const ramp = clip.querySelector(sel) as HTMLElement;
        ramp.style.width = `${(fd?.frames ?? 0) * this.pxPerFrame}px`;
        ramp.classList.toggle('is-white', fd?.color === 'white');
        ramp.classList.toggle('is-black', fd?.color === 'black');
      }
      r++;
      if (!isOpen) continue;
      // The keyframe lanes (1.59.4, DEV_PLAN 25.3), as Photon's: a lane per property under the clip.
      for (const prop of VIDEO_PROPS) {
        const key = `${l.id}:${prop}`, keys = tr.keys[prop] ?? [], base = prop === 'x' ? l.transform.x : prop === 'y' ? l.transform.y : prop === 'opacity' ? l.opacity : prop === 'fill' ? l.fill ?? 1 : 1;
        liveLanes.add(key);
        let lh = this.laneHeads.get(key), strip = this.strips.get(key);
        if (!lh) { lh = this.makeLaneHead(l.id, prop); this.laneHeads.set(key, lh); this.heads.append(lh); }
        if (!strip) { strip = this.makeStrip(l.id, prop); this.strips.set(key, strip); this.rows.append(strip); }
        lh.style.transform = `translateY(${RULER_H + r * ROW_H}px)`;
        strip.style.transform = `translateY(${r * ROW_H}px)`;
        strip.style.width = `${width}px`;
        const watch = lh.querySelector('.cv-vtl-watch') as HTMLElement, input = lh.querySelector('input') as HTMLInputElement, on = keys.length > 0;
        watch.setAttribute('aria-pressed', String(on)); watch.classList.toggle('is-on', on);
        const v = valueAt(keys, vt.current, base), shown = prop === 'opacity' || prop === 'fill' ? Math.round(v * 100) : prop === 'style' ? Math.round(v) : Math.round(v * 10) / 10;
        if (document.activeElement !== input) input.value = String(shown);
        (lh.querySelector('.cv-vtl-key') as HTMLElement).classList.toggle('is-on', keys.some((k) => k.t === vt.current));
        // Diamonds: made or dropped to match the keyframes, then placed.
        const dots = Array.from(strip.children) as HTMLElement[];
        while (dots.length > keys.length) (dots.pop() as HTMLElement).remove();
        while (dots.length < keys.length) { const d = this.makeDiamond(l.id, prop); strip.append(d); dots.push(d); }
        keys.forEach((k, i) => { const d = dots[i]; d.dataset.index = String(i); d.style.transform = `translateX(${k.t * this.pxPerFrame - 5}px) rotate(45deg)`; d.classList.toggle('is-hold', k.interp === 'hold'); d.title = `Frame ${k.t}, ${k.interp === 'hold' ? 'hold' : 'linear'} (right-click to switch)`; });
        r++;
      }
    }
    for (const [key, n] of this.laneHeads) if (!liveLanes.has(key)) { n.remove(); this.laneHeads.delete(key); this.strips.get(key)?.remove(); this.strips.delete(key); }
    this.playhead.style.transform = `translateX(${vt.current * this.pxPerFrame}px)`;
    this.drawRuler(vt, width);
  }

  // The keyframe lanes (1.59.4, DEV_PLAN 25.3): which tracks are open, and each lane's head and strip by layer and property.
  private readonly open = new Set<string>();
  private readonly laneHeads = new Map<string, HTMLElement>();
  private readonly strips = new Map<string, HTMLElement>();

  private makeHead(id: string): HTMLElement {
    const h = el('<div class="cv-vtl-head"><button class="cv-vtl-chev" type="button" aria-expanded="false" aria-label="Expand track">&#8250;</button><span class="cv-vtl-head-name"></span></div>');
    (h.querySelector('.cv-vtl-chev') as HTMLElement).addEventListener('click', () => { if (this.open.has(id)) this.open.delete(id); else this.open.add(id); this.sync(); });
    return h;
  }

  /** The value a lane shows and keys: px for position, percent for the opacities, 1 or 0 for style. */
  private current(id: string, prop: VideoProp): number {
    const vt = this.engine.video, l = this.engine.current?.doc.layers.find((x) => x.id === id);
    if (!vt || !l) return 0;
    const base = prop === 'x' ? l.transform.x : prop === 'y' ? l.transform.y : prop === 'opacity' ? l.opacity : prop === 'fill' ? l.fill ?? 1 : 1;
    return valueAt(vt.tracks[id]?.keys[prop], vt.current, base);
  }

  /** A keyframe set at the playhead (a keyframe already there takes the value). */
  private key(id: string, prop: VideoProp, v: number): void {
    this.engine.editVideo((vt) => {
      const tr = vt.tracks[id];
      if (!tr) return;
      const ks = (tr.keys[prop] ??= []), at = ks.find((k) => k.t === vt.current);
      if (at) at.v = v; else { ks.push({ t: vt.current, v, interp: 'linear' }); ks.sort((a, b) => a.t - b.t); }
    }, 'Make Keyframe');
  }

  private makeLaneHead(id: string, prop: VideoProp): HTMLElement {
    const names: Record<VideoProp, string> = { x: 'Position X', y: 'Position Y', opacity: 'Opacity', fill: 'Fill Opacity', style: 'Style' };
    const h = el(`<div class="cv-vtl-lane-head"><button class="cv-vtl-watch" type="button" aria-pressed="false" aria-label="Keyframes for ${names[prop]}" title="Keyframes for ${names[prop]}">&#9201;</button><span class="cv-vtl-lane-name">${names[prop]}</span><input class="cv-vtl-lane-val" type="number" step="${prop === 'style' ? 1 : prop === 'x' || prop === 'y' ? 1 : 1}" aria-label="${names[prop]} at the playhead"><button class="cv-vtl-nav" type="button" aria-label="Previous keyframe">&#8249;</button><button class="cv-vtl-key" type="button" aria-label="Add or delete keyframe">&#9670;</button><button class="cv-vtl-nav" type="button" aria-label="Next keyframe">&#8250;</button></div>`);
    const [watch, prev, add, next] = ['.cv-vtl-watch', '[aria-label="Previous keyframe"]', '.cv-vtl-key', '[aria-label="Next keyframe"]'].map((s) => h.querySelector(s) as HTMLElement);
    const input = h.querySelector('input') as HTMLInputElement;
    const scale = prop === 'opacity' || prop === 'fill' ? 100 : 1;
    watch.addEventListener('click', () => {
      const v = this.current(id, prop);
      this.engine.editVideo((vt) => { const tr = vt.tracks[id]; if (!tr) return; if (tr.keys[prop]?.length) delete tr.keys[prop]; else tr.keys[prop] = [{ t: vt.current, v, interp: 'linear' }]; }, 'Keyframe Animation');
    });
    input.addEventListener('change', () => {
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      const v = prop === 'style' ? (n >= 0.5 ? 1 : 0) : prop === 'opacity' || prop === 'fill' ? Math.min(1, Math.max(0, n / scale)) : n;
      const keyed = !!this.engine.video?.tracks[id]?.keys[prop]?.length;
      // With the stopwatch on, a value keys the playhead; off, it changes the layer itself (Style always keys).
      if (keyed || prop === 'style') { this.key(id, prop, v); return; }
      this.engine.edit(prop === 'x' || prop === 'y' ? 'Move' : prop === 'opacity' ? 'Opacity' : 'Fill Opacity', (q) => {
        const l = q.doc.layers.find((x) => x.id === id);
        if (!l) return false;
        q.updateLayer(id, prop === 'x' ? { transform: { ...l.transform, x: v } } : prop === 'y' ? { transform: { ...l.transform, y: v } } : prop === 'opacity' ? { opacity: v } : { fill: v });
        return true;
      });
    });
    const hop = (dir: 1 | -1): void => {
      const vt = this.engine.video, ks = vt?.tracks[id]?.keys[prop] ?? [];
      if (!vt || !ks.length) return;
      const k = dir > 0 ? ks.find((x) => x.t > vt.current) : [...ks].reverse().find((x) => x.t < vt.current);
      if (k) this.engine.setVideoTime(k.t);
    };
    prev.addEventListener('click', () => hop(-1));
    next.addEventListener('click', () => hop(1));
    add.addEventListener('click', () => {
      const vt = this.engine.video, ks = vt?.tracks[id]?.keys[prop] ?? [];
      if (!vt) return;
      if (ks.some((k) => k.t === vt.current)) this.engine.editVideo((v) => { const tr = v.tracks[id]; if (!tr) return; tr.keys[prop] = (tr.keys[prop] ?? []).filter((k) => k.t !== v.current); if (!tr.keys[prop]?.length) delete tr.keys[prop]; }, 'Delete Keyframe');
      else this.key(id, prop, this.current(id, prop));
    });
    return h;
  }

  private makeStrip(id: string, prop: VideoProp): HTMLElement {
    const s = el('<div class="cv-vtl-strip"></div>');
    s.dataset.layer = id; s.dataset.prop = prop;
    return s;
  }

  private makeDiamond(id: string, prop: VideoProp): HTMLElement {
    const d = el('<span class="cv-vtl-dia" role="button" aria-label="Keyframe"></span>');
    d.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); d.setPointerCapture(e.pointerId);
      const i = Number(d.dataset.index), vt = this.engine.video, k = vt?.tracks[id]?.keys[prop]?.[i];
      if (!vt || !k) return;
      const x0 = e.clientX, t0 = k.t;
      let moved = false;
      const move = (ev: PointerEvent): void => {
        const t = Math.max(0, Math.min(vt.duration - 1, t0 + Math.round((ev.clientX - x0) / this.pxPerFrame)));
        if (t === t0 && !moved) return;
        if (!moved) this.engine.beginVideoGesture('Move Keyframe');   // one step (1.59.5)
        moved = true;
        this.engine.editVideo((v) => { const ks = v.tracks[id]?.keys[prop]; if (!ks) return; const kk = ks.find((x) => x.t === (moved ? Number(d.dataset.t ?? t0) : t0)) ?? ks[i]; kk.t = t; ks.sort((a, b) => a.t - b.t); });
        d.dataset.t = String(t);
      };
      const up = (): void => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); delete d.dataset.t; if (moved) this.engine.endVideoGesture(); else this.engine.setVideoTime(t0); };
      d.addEventListener('pointermove', move); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    });
    d.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const i = Number(d.dataset.index);
      this.engine.editVideo((v) => { const k = v.tracks[id]?.keys[prop]?.[i]; if (k) k.interp = k.interp === 'hold' ? 'linear' : 'hold'; }, 'Keyframe Interpolation');
    });
    return d;
  }

  /** Fade In, Fade Out or both on the selected layer's clip, over `frames` (0 removes them), as one step. */
  private fade(frames: number, inn: boolean, out: boolean, color: FadeColor | null = null): void {
    const id = this.engine.current?.activeId;   // the engine's since 1.59.7, which the MCP tools share
    if (!id || !this.engine.fadeClip(id, frames, inn, out, color)) this.engine.notice('Select a layer with a clip in the timeline.');
  }

  /** Cross Fade, as Photoshop's: with the clip overlapping the selected one most, over their overlap. Only the upper of
   *  the two fades (in when it starts later, out when it ends first), so the lower shows through and the picture never
   *  dips. */
  private crossFade(): void {
    const id = this.engine.current?.activeId;   // the engine's since 1.59.7, which the MCP tools share
    const why = id ? this.engine.crossFade(id) : 'Select a layer with a clip in the timeline.';
    if (why) this.engine.notice(why);
  }

  private makeClip(id: string): HTMLElement {
    const c = el('<div class="cv-vtl-clip" role="group" aria-label="Clip"><span class="cv-vtl-fade is-in" aria-hidden="true"></span><span class="cv-vtl-fade is-out" aria-hidden="true"></span><span class="cv-vtl-trim is-in" aria-label="Trim start"></span><span class="cv-vtl-clip-name"></span><span class="cv-vtl-trim is-out" aria-label="Trim end"></span></div>');
    c.addEventListener('pointerdown', (e) => {
      const vt = this.engine.video, tr = vt?.tracks[id];
      if (!vt || !tr) return;
      e.preventDefault(); c.setPointerCapture(e.pointerId);
      const target = e.target as HTMLElement, kind = target.classList.contains('is-in') ? 'in' : target.classList.contains('is-out') ? 'out' : 'move';
      const x0 = e.clientX, s0 = tr.start, l0 = tr.length;
      this.engine.beginVideoGesture(kind === 'move' ? 'Move Clip' : kind === 'in' ? 'Trim Layer Start' : 'Trim Layer End');   // one step (1.59.5)
      const move = (ev: PointerEvent): void => {
        const d = Math.round((ev.clientX - x0) / this.pxPerFrame);
        this.engine.editVideo((v) => {
          const t = v.tracks[id];
          if (!t) return;
          if (kind === 'move') t.start = Math.max(-l0 + 1, Math.min(v.duration - 1, s0 + d));
          else if (kind === 'in') { const dd = Math.max(-s0, Math.min(l0 - 1, d)); t.start = s0 + dd; t.length = l0 - dd; }
          else t.length = Math.max(1, l0 + d);
        });
      };
      const up = (): void => { c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); this.engine.endVideoGesture(); };
      c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    });
    return c;
  }

  private drawRuler(vt: VideoTimeline, width: number): void {
    const dpr = window.devicePixelRatio || 1, c = this.ruler;
    if (c.width !== Math.round(width * dpr) || c.height !== Math.round(RULER_H * dpr)) { c.width = Math.round(width * dpr); c.height = Math.round(RULER_H * dpr); c.style.width = `${width}px`; c.style.height = `${RULER_H}px`; }
    const g = c.getContext('2d') as CanvasRenderingContext2D, css = getComputedStyle(this.root);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, width, RULER_H);
    g.fillStyle = css.getPropertyValue('--text-muted').trim() || '#888'; g.strokeStyle = g.fillStyle; g.font = '10px system-ui, sans-serif';
    const fps = Math.max(1, Math.round(vt.fps)), step = this.pxPerFrame * fps < 60 ? fps * 2 : fps, minor = Math.max(1, Math.round(fps / (this.pxPerFrame * fps > 200 ? 10 : 3)));
    g.beginPath();
    for (let f = 0; f <= vt.duration; f += minor) { const x = f * this.pxPerFrame + 0.5, major = f % step === 0; g.moveTo(x, major ? 6 : 16); g.lineTo(x, RULER_H); if (major) g.fillText(`${Math.floor(f / fps / 60)}:${String(Math.floor(f / fps) % 60).padStart(2, '0')}`, x + 3, 12); }
    g.stroke();
    g.fillStyle = 'rgba(128, 128, 128, 0.18)'; g.fillRect(0, RULER_H - 4, vt.workIn * this.pxPerFrame, 4); g.fillRect(vt.workOut * this.pxPerFrame, RULER_H - 4, width, 4);
  }
}

export const VTL_GEOMETRY = { HEAD_W, ROW_H, RULER_H };
