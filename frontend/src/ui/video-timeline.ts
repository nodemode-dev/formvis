import type { Engine } from '../engine';
import type { VideoTimeline } from '../engine/video-timeline';
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

  constructor(private readonly root: HTMLElement, private readonly engine: Engine) {
    const bar = el('<div class="cv-vtl-bar"></div>');
    const btn = (label: string, glyph: string, run: () => void): HTMLButtonElement => { const b = el<HTMLButtonElement>(`<button class="cv-icon-btn cv-vtl-btn" type="button" title="${label}" aria-label="${label}">${glyph}</button>`); b.addEventListener('click', run); return b; };
    const go = (f: (vt: VideoTimeline) => number): void => { const vt = engine.video; if (vt) engine.setVideoTime(f(vt)); };
    const playBtn = btn('Play', '&#9654;', () => this.toggle(playBtn));
    bar.append(btn('First frame', '&#9198;', () => go((v) => v.workIn)), btn('Previous frame', '&#9664;', () => go((v) => v.current - 1)), playBtn, btn('Next frame', '&#9654;&#124;', () => go((v) => v.current + 1)),
      btn('Split at Playhead', '&#9986;', () => this.split()), el('<span class="cv-vtl-gap"></span>'), this.time, this.rate,
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
    foot.append(this.render, fit, this.zoom);
    root.append(bar, body, foot);
    this.lanes.addEventListener('scroll', () => { this.heads.scrollTop = this.lanes.scrollTop; });   // names beside their clips
    this.ruler.addEventListener('pointerdown', (e) => { this.ruler.setPointerCapture(e.pointerId); this.scrub(e); });
    this.ruler.addEventListener('pointermove', (e) => { if (this.ruler.hasPointerCapture(e.pointerId)) this.scrub(e); });
    for (const ev of ['timeline', 'doc', 'projects', 'active'] as const) engine.on(ev, () => this.sync());
    this.sync();
  }

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
    this.engine.editVideo((v) => { const d = Math.max(1, Math.round(f * s)); v.fps = f; v.duration = d; v.workOut = Math.min(Math.max(v.workOut, 1), d); v.workIn = Math.min(v.workIn, v.workOut - 1); v.current = Math.min(v.current, d - 1); });
  }

  /** Split at Playhead, as Photoshop's: the active layer's clip ends at the playhead, and a copy of the layer carries
   *  on from it with the rest of the clip and the same keyframes. */
  private split(): void {
    const e = this.engine, vt = e.video, p = e.current, id = p?.activeId;
    if (!vt || !p || !id) return;
    const tr = vt.tracks[id], ph = vt.current;
    if (!tr || ph <= tr.start || ph >= tr.start + tr.length) return;
    const before = new Set(p.doc.layers.map((l) => l.id));
    e.duplicateLayers();
    const copy = e.current?.doc.layers.find((l) => !before.has(l.id));
    if (!copy) return;
    e.editVideo((v) => { const t = v.tracks[id]; v.tracks[copy.id] = { ...structuredClone(t), start: ph, length: t.start + t.length - ph }; t.length = ph - t.start; });
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
    const vt = this.engine.video, p = this.engine.current;
    this.root.hidden = !vt || !p;
    if (!vt || !p) return;
    const fr = (n: number): string => String(Math.floor(n)).padStart(2, '0');
    const s = vt.current / vt.fps;
    setText(this.time, `${fr(s / 3600)}:${fr((s / 60) % 60)}:${fr(s % 60)}:${fr(vt.current % Math.round(vt.fps))}`);
    setText(this.rate, `${vt.fps} fps · ${vt.duration} frames`);
    setText(this.render, `${vt.workOut - vt.workIn} frames to render`);
    const width = Math.ceil(vt.duration * this.pxPerFrame) + 40, layers = [...p.doc.layers].reverse().filter((l) => vt.tracks[l.id]);
    this.rows.style.width = `${width}px`;
    this.rows.style.height = `${layers.length * ROW_H}px`;
    const live = new Set(layers.map((l) => l.id));
    for (const [id, n] of this.clips) if (!live.has(id)) { n.remove(); this.clips.delete(id); this.heads$.get(id)?.remove(); this.heads$.delete(id); }
    layers.forEach((l, i) => {
      const tr = vt.tracks[l.id];
      let head = this.heads$.get(l.id), clip = this.clips.get(l.id);
      if (!head) { head = el('<div class="cv-vtl-head"></div>'); this.heads$.set(l.id, head); this.heads.append(head); }
      if (!clip) { clip = this.makeClip(l.id); this.clips.set(l.id, clip); this.rows.append(clip); }
      setText(head, l.name);
      head.style.top = `${RULER_H + i * ROW_H}px`;
      head.classList.toggle('is-active', p.activeId === l.id);
      clip.style.transform = `translate(${tr.start * this.pxPerFrame}px, ${i * ROW_H + 3}px)`;
      clip.style.width = `${Math.max(4, tr.length * this.pxPerFrame)}px`;
      setText(clip.querySelector('.cv-vtl-clip-name') as HTMLElement, l.name);
    });
    this.playhead.style.transform = `translateX(${vt.current * this.pxPerFrame}px)`;
    this.drawRuler(vt, width);
  }

  private makeClip(id: string): HTMLElement {
    const c = el('<div class="cv-vtl-clip" role="group" aria-label="Clip"><span class="cv-vtl-trim is-in" aria-label="Trim start"></span><span class="cv-vtl-clip-name"></span><span class="cv-vtl-trim is-out" aria-label="Trim end"></span></div>');
    c.addEventListener('pointerdown', (e) => {
      const vt = this.engine.video, tr = vt?.tracks[id];
      if (!vt || !tr) return;
      e.preventDefault(); c.setPointerCapture(e.pointerId);
      const target = e.target as HTMLElement, kind = target.classList.contains('is-in') ? 'in' : target.classList.contains('is-out') ? 'out' : 'move';
      const x0 = e.clientX, s0 = tr.start, l0 = tr.length;
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
      const up = (): void => { c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); };
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
