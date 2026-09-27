import { SelectionMask, type Engine } from '../engine';
import { el, setHidden, setText } from './dom';
import { icon } from './icons';

/** Channels, as Photoshop's and the target's tab (Phase 21, the owner's walkthrough): RGB, Red, Green and Blue, each
 *  with an eye and its own greyscale thumbnail. A click on a channel shows it alone in grey, on RGB the composite; an
 *  eye hides a channel from the composite. Only the view changes, never the pixels: the document's canvases are
 *  filtered (selection outlines and guides are drawn apart and keep their colours). Cmd- or Ctrl-click loads the
 *  channel's brightness (for RGB, its luminosity) as a selection, one undo step. The Native GPU renderer draws outside
 *  the page, where a filter cannot reach, so there the panel says the view cannot change. */
type Ch = 'rgb' | 'r' | 'g' | 'b';
const ROWS: ReadonlyArray<{ id: Ch; label: string }> = [{ id: 'rgb', label: 'RGB' }, { id: 'r', label: 'Red' }, { id: 'g', label: 'Green' }, { id: 'b', label: 'Blue' }];

export class ChannelsPanel {
  readonly root = el('<section class="cv-channels" aria-label="Channels" hidden><div class="cv-ch-rows"></div><p class="cv-ch-note"></p></section>');
  private readonly shown = { r: true, g: true, b: true };
  private solo: 'r' | 'g' | 'b' | null = null;
  private readonly thumbs = new Map<Ch, HTMLCanvasElement>();
  private timer = 0;

  constructor(private readonly engine: Engine, private readonly stage: HTMLElement) {
    const rows = this.root.querySelector('.cv-ch-rows') as HTMLElement;
    for (const r of ROWS) {
      const row = el<HTMLDivElement>(`<div class="cv-ch-row" role="button" tabindex="0"><button class="cv-ch-eye" type="button">${icon('eye', 15)}</button><canvas class="cv-ch-thumb" width="44" height="30"></canvas><span class="cv-ch-name"></span></div>`);
      row.dataset.ch = r.id;
      setText(row.querySelector('.cv-ch-name') as HTMLElement, r.label);
      const eye = row.querySelector('.cv-ch-eye') as HTMLButtonElement;
      eye.setAttribute('aria-label', `Show ${r.label}`);
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        if (r.id === 'rgb') { this.shown.r = this.shown.g = this.shown.b = true; this.solo = null; }
        else { this.shown[r.id] = !this.shown[r.id]; if (this.solo === r.id && !this.shown[r.id]) this.solo = null; }
        this.apply();
      });
      row.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey) { this.loadSelection(r.id); return; }
        if (r.id === 'rgb') { this.solo = null; this.shown.r = this.shown.g = this.shown.b = true; } else { this.solo = r.id; }
        this.apply();
      });
      this.thumbs.set(r.id, row.querySelector('.cv-ch-thumb') as HTMLCanvasElement);
      rows.appendChild(row);
    }
    // The view's filter, one for the page; the document's canvases use it while a channel view is on.
    if (!document.getElementById('cv-channel-view-svg')) {
      document.body.appendChild(el('<svg id="cv-channel-view-svg" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="cv-channel-view" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter></svg>'));
    }
    for (const ev of ['history', 'doc', 'active', 'projects'] as const) engine.on(ev, () => this.schedule());
    // Thumbnails whenever the tab is shown, in whichever group it is (tabs move between groups).
    new ResizeObserver(() => { if (this.root.clientWidth) this.schedule(); }).observe(this.root);
    this.apply();
  }

  /** Shown or hidden with the tab; thumbnails are drawn only while it shows. */
  setVisible(on: boolean): void { setHidden(this.root, !on); if (on) this.schedule(); }

  private schedule(): void {
    if (!this.root.clientWidth || this.timer) return;
    this.timer = window.setTimeout(() => { this.timer = 0; this.drawThumbs(); }, 250);
  }

  private drawThumbs(): void {
    const src = this.engine.current ? this.engine.flattened() : null;
    for (const [id, c] of this.thumbs) {
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      g.clearRect(0, 0, c.width, c.height);
      if (!src) continue;
      const s = Math.min(c.width / src.width, c.height / src.height), w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
      g.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
      if (id === 'rgb') continue;
      const img = g.getImageData(0, 0, c.width, c.height), d = img.data, k = id === 'r' ? 0 : id === 'g' ? 1 : 2;
      for (let i = 0; i < d.length; i += 4) { const v = d[i + k]; d[i] = d[i + 1] = d[i + 2] = v; }
      g.putImageData(img, 0, 0);
    }
  }

  /** The view: one channel alone in grey, or the composite of the shown channels (a hidden one contributes nothing). */
  private apply(): void {
    const m = this.solo
      ? (() => { const k = { r: [1, 0, 0], g: [0, 1, 0], b: [0, 0, 1] }[this.solo]; return [...k, 0, 0, ...k, 0, 0, ...k, 0, 0, 0, 0, 0, 1, 0]; })()
      : [this.shown.r ? 1 : 0, 0, 0, 0, 0, 0, this.shown.g ? 1 : 0, 0, 0, 0, 0, 0, this.shown.b ? 1 : 0, 0, 0, 0, 0, 0, 1, 0];
    document.querySelector('#cv-channel-view feColorMatrix')?.setAttribute('values', m.join(' '));
    const plain = !this.solo && this.shown.r && this.shown.g && this.shown.b;
    this.stage.classList.toggle('has-channel-view', !plain);
    for (const row of this.root.querySelectorAll<HTMLElement>('.cv-ch-row')) {
      const id = row.dataset.ch as Ch;
      const visible = id === 'rgb' ? plain : this.solo ? this.solo === id : this.shown[id as 'r' | 'g' | 'b'];
      row.classList.toggle('is-on', id === 'rgb' ? !this.solo : this.solo === id);
      row.querySelector('.cv-ch-eye')?.classList.toggle('is-off', !visible);
    }
    const native = !!this.stage.querySelector('.cv-scene-native:not([hidden])');
    setText(this.root.querySelector('.cv-ch-note') as HTMLElement, native && !plain ? 'The Native GPU renderer draws outside the page: switch the renderer in Preferences to view single channels.' : '⌘- or Ctrl-click a channel to load it as a selection.');
  }

  /** The channel's brightness as a selection (RGB: luminosity), weighted by coverage, one undo step. */
  private loadSelection(id: Ch): void {
    const e = this.engine;
    if (!e.current) return;
    const src = e.flattened();
    if (!src) return;
    const W = src.width, H = src.height, d = (src.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0, j = 0; j < mask.length; i += 4, j++) {
      const v = id === 'rgb' ? 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] : d[i + (id === 'r' ? 0 : id === 'g' ? 1 : 2)];
      mask[j] = Math.round((v * d[i + 3]) / 255);
    }
    e.applySelection(SelectionMask.cropped(0, 0, W, H, mask), 'replace', 'Load Selection');
  }
}
