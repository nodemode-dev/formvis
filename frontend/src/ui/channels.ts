import { SelectionMask, type Engine } from '../engine';
import { composeChannels } from '../engine/channels';
import { composeFloat } from '../engine/compose-float';
import { el, setHidden, setText } from './dom';
import { icon } from './icons';

/** Channels, as Photoshop's and the target's tab (Phase 21, the owner's walkthrough): RGB, Red, Green and Blue, each
 *  with an eye and its own greyscale thumbnail. A click on a channel shows it alone in grey, on RGB the composite; an
 *  eye hides a channel from the composite. Only the view changes, never the pixels: the document's canvases are
 *  filtered (selection outlines and guides are drawn apart and keep their colours). Cmd- or Ctrl-click loads the
 *  channel's brightness (for RGB, its luminosity) as a selection, one undo step. The Native GPU renderer draws outside
 *  the page, where a filter cannot reach, so there the panel says the view cannot change. */
type Ch = 'rgb' | 'r' | 'g' | 'b' | 'cmyk' | 'c' | 'm' | 'y' | 'k' | 'lab' | 'll' | 'la' | 'lb';
const ROWS: ReadonlyArray<{ id: Ch; label: string }> = [{ id: 'rgb', label: 'RGB' }, { id: 'r', label: 'Red' }, { id: 'g', label: 'Green' }, { id: 'b', label: 'Blue' },
  { id: 'cmyk', label: 'CMYK' }, { id: 'c', label: 'Cyan' }, { id: 'm', label: 'Magenta' }, { id: 'y', label: 'Yellow' }, { id: 'k', label: 'Black' },
  { id: 'lab', label: 'Lab' }, { id: 'll', label: 'Lightness' }, { id: 'la', label: 'a' }, { id: 'lb', label: 'b' }];
/** The Lab rows (1.56.4): Lightness, a and b as greys, a and b mid-grey where neutral, as Photoshop shows them. */
const LAB_CH: Record<'ll' | 'la' | 'lb', 0 | 1 | 2> = { ll: 0, la: 1, lb: 2 };
const isLabRow = (id: Ch): id is 'lab' | 'll' | 'la' | 'lb' => id === 'lab' || id in LAB_CH;
const INK: Record<'c' | 'm' | 'y' | 'k', 0 | 1 | 2 | 3> = { c: 0, m: 1, y: 2, k: 3 };
const isInk = (id: Ch): id is 'c' | 'm' | 'y' | 'k' => id in INK;

export class ChannelsPanel {
  readonly root = el('<section class="cv-channels" aria-label="Channels" hidden><div class="cv-ch-rows"></div><p class="cv-ch-note"></p></section>');
  private readonly shown = { r: true, g: true, b: true };
  private solo: 'r' | 'g' | 'b' | null = null;
  private inkSolo: 'c' | 'm' | 'y' | 'k' | null = null;
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
        if (r.id === 'cmyk' || isInk(r.id) || isLabRow(r.id)) return;
        if (r.id === 'rgb') { this.shown.r = this.shown.g = this.shown.b = true; this.solo = null; }
        else { this.shown[r.id] = !this.shown[r.id]; if (this.solo === r.id && !this.shown[r.id]) this.solo = null; }
        this.apply();
      });
      row.addEventListener('click', (e) => {
        if (isLabRow(r.id)) return;
        if (e.metaKey || e.ctrlKey) { this.loadSelection(r.id); return; }
        if (r.id === 'cmyk') this.inkSolo = null;
        else if (isInk(r.id)) this.inkSolo = r.id;
        else if (r.id === 'rgb') { this.solo = null; this.shown.r = this.shown.g = this.shown.b = true; } else { this.solo = r.id; }
        this.engine.paintChannel = this.inkSolo ? INK[this.inkSolo] : null;
        this.engine.setChannelView(this.inkSolo ? INK[this.inkSolo] : null);
        this.apply();
      });
      this.thumbs.set(r.id, row.querySelector('.cv-ch-thumb') as HTMLCanvasElement);
      rows.appendChild(row);
    }
    // The view's filter, one for the page; the document's canvases use it while a channel view is on.
    if (!document.getElementById('cv-channel-view-svg')) {
      document.body.appendChild(el('<svg id="cv-channel-view-svg" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="cv-channel-view" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter></svg>'));
    }
    for (const ev of ['history', 'doc', 'active', 'projects'] as const) engine.on(ev, () => { this.apply(); this.schedule(); });
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
    const p = this.engine.current, cmyk = p?.doc.mode === 'cmyk', lab = p?.doc.mode === 'lab';
    const src = p ? this.engine.flattened() : null;
    const ink = cmyk && p ? composeChannels(p.doc, p.cmykTables) : null, inkOk = ink && !('error' in ink) ? ink : null;
    const labC = lab && p ? composeFloat(p.doc, 3, false) : null, labOk = labC && !('error' in labC) ? labC : null;
    for (const [id, c] of this.thumbs) {
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      g.clearRect(0, 0, c.width, c.height);
      if (!src) continue;
      const rgbRow = id === 'rgb' || id === 'r' || id === 'g' || id === 'b';
      if ((rgbRow ? 'rgb' : isLabRow(id) ? 'lab' : 'cmyk') !== (cmyk ? 'cmyk' : lab ? 'lab' : 'rgb')) continue;
      const s = Math.min(c.width / src.width, c.height / src.height), w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
      if (id in LAB_CH) {
        if (!labOk) continue;
        const k = LAB_CH[id as 'll' | 'la' | 'lb'], full = new Uint8ClampedArray(labOk.width * labOk.height * 4);
        for (let i = 0, o = 0; i < labOk.data.length; i += 4, o += 4) { const a = labOk.data[i + 3], v = Math.round((labOk.data[i + k] * a + (k === 0 ? 1 : 0.5) * (1 - a)) * 255); full[o] = full[o + 1] = full[o + 2] = v; full[o + 3] = 255; }
        const tmp = document.createElement('canvas'); tmp.width = labOk.width; tmp.height = labOk.height;
        (tmp.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(full, labOk.width, labOk.height), 0, 0);
        g.drawImage(tmp, (c.width - w) / 2, (c.height - h) / 2, w, h);
        continue;
      }
      if (id === 'rgb' || id === 'cmyk' || !isInk(id) && !rgbRow) { g.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h); continue; }
      if (isInk(id)) {
        if (!inkOk) continue;
        const k = INK[id], full = new Uint8ClampedArray(inkOk.width * inkOk.height * 4);
        for (let i = 0, o = 0; i < inkOk.data.length; i += 5, o += 4) { const v = Math.round((1 - Math.min(1, inkOk.data[i + k] * inkOk.data[i + 4])) * 255); full[o] = full[o + 1] = full[o + 2] = v; full[o + 3] = 255; }
        const tmp = document.createElement('canvas'); tmp.width = inkOk.width; tmp.height = inkOk.height;
        (tmp.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(full, inkOk.width, inkOk.height), 0, 0);
        g.drawImage(tmp, (c.width - w) / 2, (c.height - h) / 2, w, h);
        continue;
      }
      g.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
      const img = g.getImageData(0, 0, c.width, c.height), d = img.data, k = id === 'r' ? 0 : id === 'g' ? 1 : 2;
      for (let i = 0; i < d.length; i += 4) { const v = d[i + k]; d[i] = d[i + 1] = d[i + 2] = v; }
      g.putImageData(img, 0, 0);
    }
  }

  /** The view: one channel alone in grey, or the composite of the shown channels (a hidden one contributes nothing). */
  private apply(): void {
    const cmyk = this.engine.current?.doc.mode === 'cmyk', lab = this.engine.current?.doc.mode === 'lab';
    if (!cmyk && this.inkSolo) { this.inkSolo = null; this.engine.paintChannel = null; this.engine.setChannelView(null); }
    const m = this.solo && !cmyk && !lab
      ? (() => { const k = { r: [1, 0, 0], g: [0, 1, 0], b: [0, 0, 1] }[this.solo]; return [...k, 0, 0, ...k, 0, 0, ...k, 0, 0, 0, 0, 0, 1, 0]; })()
      : [this.shown.r || cmyk ? 1 : 0, 0, 0, 0, 0, 0, this.shown.g || cmyk ? 1 : 0, 0, 0, 0, 0, 0, this.shown.b || cmyk ? 1 : 0, 0, 0, 0, 0, 0, 1, 0];
    document.querySelector('#cv-channel-view feColorMatrix')?.setAttribute('values', m.join(' '));
    const plain = cmyk || lab || (!this.solo && this.shown.r && this.shown.g && this.shown.b);
    this.stage.classList.toggle('has-channel-view', !plain);
    for (const row of this.root.querySelectorAll<HTMLElement>('.cv-ch-row')) {
      const id = row.dataset.ch as Ch, inkRow = id === 'cmyk' || isInk(id), labRow = isLabRow(id);
      setHidden(row, cmyk ? !inkRow : lab ? !labRow : inkRow || labRow);
      if (labRow) { row.classList.toggle('is-on', id === 'lab'); row.querySelector('.cv-ch-eye')?.classList.toggle('is-off', false); continue; }
      if (inkRow) { row.classList.toggle('is-on', id === 'cmyk' ? !this.inkSolo : this.inkSolo === id); row.querySelector('.cv-ch-eye')?.classList.toggle('is-off', false); continue; }
      const visible = id === 'rgb' ? plain : this.solo ? this.solo === id : this.shown[id as 'r' | 'g' | 'b'];
      row.classList.toggle('is-on', id === 'rgb' ? !this.solo : this.solo === id);
      row.querySelector('.cv-ch-eye')?.classList.toggle('is-off', !visible);
    }
    const native = !!this.stage.querySelector('.cv-scene-native:not([hidden])');
    setText(this.root.querySelector('.cv-ch-note') as HTMLElement, lab ? 'Lab: Lightness, a and b as greys (a and b mid-grey where neutral). Viewing or painting one Lab channel alone comes later.' : cmyk ? (this.inkSolo ? `The canvas shows ${ROWS.find((r) => r.id === this.inkSolo)?.label} alone (paper white, full ink black); the Brush, Pencil and Eraser paint it alone.` : 'Click an ink to paint it alone; ⌘- or Ctrl-click loads its light areas as a selection.')
      : native && !plain ? 'The Native GPU renderer draws outside the page: switch the renderer in Preferences to view single channels.' : '⌘- or Ctrl-click a channel to load it as a selection.');
  }

  /** The channel's brightness as a selection (RGB: luminosity), weighted by coverage, one undo step. */
  private loadSelection(id: Ch): void {
    const e = this.engine;
    if (!e.current) return;
    if (isInk(id)) {
      const ink = composeChannels(e.current.doc, e.current.cmykTables);
      if ('error' in ink) { e.notice(ink.error); return; }
      const mask = new Uint8Array(ink.width * ink.height), k = INK[id];
      for (let i = 0, j = 0; j < mask.length; i += 5, j++) mask[j] = Math.round((1 - Math.min(1, Math.max(0, ink.data[i + k]))) * Math.min(1, ink.data[i + 4]) * 255);
      e.applySelection(SelectionMask.cropped(0, 0, ink.width, ink.height, mask), 'replace', 'Load Selection');
      return;
    }
    const src = e.flattened();
    if (!src) return;
    const W = src.width, H = src.height, d = (src.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0, j = 0; j < mask.length; i += 4, j++) {
      const v = id === 'rgb' || id === 'cmyk' ? 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] : d[i + (id === 'r' ? 0 : id === 'g' ? 1 : 2)];
      mask[j] = Math.round((v * d[i + 3]) / 255);
    }
    e.applySelection(SelectionMask.cropped(0, 0, W, H, mask), 'replace', 'Load Selection');
  }
}
