import { FRAME_DELAYS, type Doc, type Engine, type Frame } from '../engine';
import { el, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';

const TW = 128, TH = 96;
export const delayLabel = (ms: number): string => (ms === 0 ? 'No delay' : `${ms / 1000} s`);

/** The Timeline, below Paths: the document's animation frames left to right, each with its thumbnail, number and
 *  delay. Clicking a frame selects it, showing its layers; changes to layer visibility, opacity or position while a
 *  frame is selected belong to that frame. Collapsed until opened; its strip keeps a fixed height and scrolls sideways,
 *  so frames coming and going never move the layout. */
export class TimelinePanel {
  private readonly frames: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly body: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly loops: HTMLSelectElement;
  private readonly drawn = new Map<string, { doc: Doc; state: string }>();
  private timer = 0;

  constructor(root: HTMLElement, private readonly engine: Engine) {
    root.insertAdjacentHTML('beforeend',
      `<section class="cv-timeline" aria-label="Timeline">` +
      `<div class="cv-panel-head"><button class="cv-paths-toggle cv-timeline-toggle" type="button" aria-expanded="false"><span class="cv-paths-chevron">${icon('chevronDown', 12)}</span>${icon('image', 14)}<span>Timeline</span></button><span></span>` +
      `<select class="cv-select cv-timeline-loops" title="Repeat" aria-label="Repeat"><option value="0">Forever</option><option value="1">Once</option><option value="3">3 times</option></select></div>` +
      `<div class="cv-timeline-body" hidden><div class="cv-frame-strip"><div class="cv-frames" role="listbox" aria-label="Frames" aria-orientation="horizontal"></div>` +
      `<div class="cv-frames-empty">No frames. New Frame starts an animation from the layers as they are.</div></div>` +
      `<div class="cv-panel-foot"><button class="cv-icon-btn" type="button" data-cmd="play-animation" title="Play" aria-label="Play">${icon('play', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="export-gif" title="Export GIF" aria-label="Export GIF">${icon('download', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="tween-frames" title="Tween" aria-label="Tween">${icon('tween', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="new-frame" title="New frame" aria-label="New frame">${icon('add', 16)}</button>` +
      `<button class="cv-icon-btn" type="button" data-cmd="delete-frame" title="Delete frame" aria-label="Delete frame">${icon('delete', 16)}</button></div></div></section>`);
    const section = q(root, '.cv-timeline');
    this.frames = q(section, '.cv-frames');
    this.empty = q(section, '.cv-frames-empty');
    this.body = q(section, '.cv-timeline-body');
    this.toggle = q<HTMLButtonElement>(section, '.cv-timeline-toggle');
    this.loops = q<HTMLSelectElement>(section, '.cv-timeline-loops');
    this.toggle.addEventListener('click', () => {
      const open = this.toggle.getAttribute('aria-expanded') !== 'true';
      this.toggle.setAttribute('aria-expanded', String(open));
      setHidden(this.body, !open);
      if (open) this.sync();
    });
    this.frames.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('select')) return;
      const id = t.closest<HTMLElement>('.cv-frame')?.dataset.key;
      if (id) this.engine.selectFrame(id);
    });
    this.frames.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement, id = t.closest<HTMLElement>('.cv-frame')?.dataset.key;
      if (id && t.classList.contains('cv-frame-delay')) this.engine.setFrameDelay(id, Number(t.value));
    });
    this.loops.addEventListener('change', () => this.engine.setLoops(Number(this.loops.value)));
    // Dragging a frame to a new place: an accent edge marks where it will land.
    let dragId: string | null = null;
    const clearMarks = (): void => { for (const r of this.frames.querySelectorAll('.drop-before, .drop-after, .is-dragging')) r.classList.remove('drop-before', 'drop-after', 'is-dragging'); };
    const landing = (e: DragEvent): { row: HTMLElement; before: boolean } | null => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-frame');
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { row, before: e.clientX < r.left + r.width / 2 };
    };
    this.frames.addEventListener('dragstart', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.cv-frame');
      if (!row || (e.target as HTMLElement).closest('select')) { e.preventDefault(); return; }
      dragId = row.dataset.key ?? null;
      e.dataTransfer?.setData('text/plain', dragId ?? '');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
    });
    this.frames.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const at = landing(e);
      for (const r of this.frames.querySelectorAll('.drop-before, .drop-after')) if (r !== at?.row) r.classList.remove('drop-before', 'drop-after');
      if (at) { at.row.classList.toggle('drop-before', at.before); at.row.classList.toggle('drop-after', !at.before); }
    });
    this.frames.addEventListener('drop', (e) => {
      e.preventDefault();
      const at = landing(e), id = dragId, rows = [...this.frames.children] as HTMLElement[];
      clearMarks();
      dragId = null;
      if (!id || !at) return;
      const from = rows.findIndex((r) => r.dataset.key === id);
      let to = rows.indexOf(at.row) + (at.before ? 0 : 1);
      if (from < to) to -= 1;
      if (from >= 0 && to !== from) this.engine.moveFrame(id, to);
    });
    this.frames.addEventListener('dragend', () => { clearMarks(); dragId = null; });
    for (const ev of ['timeline', 'doc', 'projects'] as const) engine.on(ev, () => this.sync());
  }

  private sync(): void {
    if (this.body.hidden) return;
    const t = this.engine.timeline;
    patchList<Frame>(this.frames, t.frames, {
      key: (f) => f.id,
      create: (f) => {
        const row = el(`<div class="cv-frame" role="option" draggable="true"><canvas class="cv-frame-thumb" width="${TW}" height="${TH}"></canvas><div class="cv-frame-meta"><span class="cv-frame-num"></span>` +
          `<select class="cv-frame-delay" aria-label="Frame delay">${FRAME_DELAYS.map((d) => `<option value="${d}">${delayLabel(d)}</option>`).join('')}</select></div></div>`);
        row.dataset.key = f.id;
        this.fill(row, f, t.frames.indexOf(f) + 1, t.current);
        return row;
      },
      update: (row, f) => this.fill(row, f, t.frames.indexOf(f) + 1, t.current),
    });
    setHidden(this.empty, t.frames.length > 0);
    const lv = String(t.loops);
    if (![...this.loops.options].some((o) => o.value === lv)) { const o = document.createElement('option'); o.value = lv; o.textContent = `${lv} times`; this.loops.appendChild(o); }
    if (this.loops.value !== lv) this.loops.value = lv;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.thumbs(), 150);
  }

  private fill(row: HTMLElement, f: Frame, n: number, current: string | null): void {
    setText(q(row, '.cv-frame-num'), String(n));
    const sel = q<HTMLSelectElement>(row, '.cv-frame-delay'), v = String(f.delay);
    if (![...sel.options].some((o) => o.value === v)) { const o = document.createElement('option'); o.value = v; o.textContent = delayLabel(f.delay); sel.appendChild(o); }
    if (sel.value !== v) sel.value = v;
    row.classList.toggle('is-active', f.id === current);
    row.setAttribute('aria-selected', String(f.id === current));
  }

  /** Redraws the thumbnails whose frame or document changed since they were drawn. */
  private thumbs(): void {
    const p = this.engine.current;
    if (!p || this.body.hidden) return;
    for (const f of this.engine.timeline.frames) {
      const state = JSON.stringify(f.state), last = this.drawn.get(f.id);
      if (last && last.doc === p.doc && last.state === state) continue;
      const cv = this.frames.querySelector<HTMLElement>(`[data-key="${CSS.escape(f.id)}"]`)?.querySelector('canvas'), s = this.engine.renderFrame(f);
      if (!cv || !s) continue;
      const c = cv.getContext('2d') as CanvasRenderingContext2D, k = Math.min(TW / s.width, TH / s.height), w = s.width * k, h = s.height * k;
      c.clearRect(0, 0, TW, TH);
      c.imageSmoothingQuality = 'high';
      c.drawImage(s as CanvasImageSource, (TW - w) / 2, (TH - h) / 2, w, h);
      this.drawn.set(f.id, { doc: p.doc, state });
    }
  }
}
