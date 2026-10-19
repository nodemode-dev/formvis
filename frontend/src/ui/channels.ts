import { SelectionMask, type AlphaChannel, type Engine, type SelectionMode } from '../engine';
import { composeChannels } from '../engine/channels';
import { composeFloat } from '../engine/compose-float';
import { el, isMac, patchList, q, setHidden, setText } from './dom';
import { icon } from './icons';

/** Channels, the panel's tab (Phase 21, the owner's walkthrough): RGB, Red, Green and Blue, each
 *  with an eye and its own greyscale thumbnail. A click on a channel shows it alone in grey, on RGB the composite; an
 *  eye hides a channel from the composite. The view is a filter on the document's canvases (selection outlines and
 *  guides are drawn apart and keep their colours); in an 8-bit RGB document the channel clicked is also the target, so
 *  strokes, fills and filters change only that channel (the engine's rgbTarget). Cmd- or Ctrl-click loads the
 *  channel's brightness (for RGB, its luminosity) as a selection, one undo step. The Native GPU renderer draws outside
 *  the page, where a filter cannot reach, so there the panel says the view cannot change. */
type Ch = 'rgb' | 'r' | 'g' | 'b' | 'cmyk' | 'c' | 'm' | 'y' | 'k' | 'lab' | 'll' | 'la' | 'lb';
const ROWS: ReadonlyArray<{ id: Ch; label: string }> = [{ id: 'rgb', label: 'RGB' }, { id: 'r', label: 'Red' }, { id: 'g', label: 'Green' }, { id: 'b', label: 'Blue' },
  { id: 'cmyk', label: 'CMYK' }, { id: 'c', label: 'Cyan' }, { id: 'm', label: 'Magenta' }, { id: 'y', label: 'Yellow' }, { id: 'k', label: 'Black' },
  { id: 'lab', label: 'Lab' }, { id: 'll', label: 'Lightness' }, { id: 'la', label: 'a' }, { id: 'lb', label: 'b' }];
/** The Lab rows (1.56.4): Lightness, a and b as greys, a and b mid-grey where neutral. */
const LAB_CH: Record<'ll' | 'la' | 'lb', 0 | 1 | 2> = { ll: 0, la: 1, lb: 2 };
const isLabRow = (id: Ch): id is 'lab' | 'll' | 'la' | 'lb' => id === 'lab' || id in LAB_CH;
const INK: Record<'c' | 'm' | 'y' | 'k', 0 | 1 | 2 | 3> = { c: 0, m: 1, y: 2, k: 3 };
const isInk = (id: Ch): id is 'c' | 'm' | 'y' | 'k' => id in INK;
/** A Cmd- or Ctrl-click's selection mode: Shift adds, Alt subtracts, both intersect. */
const clickMode = (e: MouseEvent): SelectionMode => (e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace');

export class ChannelsPanel {
  readonly root = el(`<section class="cv-channels" aria-label="Channels" hidden><div class="cv-ch-rows"></div><div class="cv-ch-rows cv-ch-alphas" aria-label="Alpha channels"></div><div class="cv-ch-rows cv-ch-specials" aria-label="Layer mask and Quick Mask">` +
    `<div class="cv-ch-row" data-special="mask" role="button" tabindex="0" hidden><button class="cv-ch-eye" type="button" aria-label="Show Layer Mask">${icon('eye', 15)}</button><canvas class="cv-ch-thumb" width="44" height="30"></canvas><span class="cv-ch-name">Layer Mask</span></div>` +
    `<div class="cv-ch-row" data-special="quick" role="button" tabindex="0" hidden><button class="cv-ch-eye" type="button" aria-label="Quick Mask">${icon('eye', 15)}</button><canvas class="cv-ch-thumb" width="44" height="30"></canvas><span class="cv-ch-name">Quick Mask</span></div></div><p class="cv-ch-note"></p>` +
    `<div class="cv-ch-foot"><button class="cv-icon-btn" type="button" data-cmd="load-selection" aria-label="Load Selection">${icon('marquee', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="save-selection-channel" aria-label="Save Selection as Channel">${icon('mask', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="duplicate-channel" aria-label="Duplicate Channel">${icon('duplicate', 16)}</button><button class="cv-icon-btn" type="button" data-cmd="new-channel" aria-label="New Channel">${icon('add', 16)}</button></div></section>`);
  private readonly alphaRows = this.root.querySelector('.cv-ch-alphas') as HTMLElement;
  private readonly drawn = new WeakMap<HTMLElement, { mask: SelectionMask | null; w: number; h: number }>();
  private readonly shown = { r: true, g: true, b: true };
  private solo: 'r' | 'g' | 'b' | null = null;
  private inkSolo: 'c' | 'm' | 'y' | 'k' | null = null;
  private labSolo: 'll' | 'la' | 'lb' | null = null;   // the Lab channel viewed alone (1.57.9)
  private readonly thumbs = new Map<Ch, HTMLCanvasElement>();
  private timer = 0;
  private seenProject: unknown = null;
  private seenLayer = '';
  private readonly maskRow: HTMLElement;
  private readonly quickRow: HTMLElement;
  private maskDrawn = '';

  constructor(private readonly engine: Engine, private readonly stage: HTMLElement, private readonly onOptions: (id: string) => void = () => undefined) {
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
        if (!(e.metaKey || e.ctrlKey)) this.engine.setAlphaTarget(null);
        if (isLabRow(r.id)) { if (r.id === 'lab') this.engine.showAlpha(null, false); this.labSolo = r.id === 'lab' ? null : r.id; this.engine.paintLab = this.labSolo ? LAB_CH[this.labSolo] : null; this.engine.setChannelView(this.labSolo ? LAB_CH[this.labSolo] : null); this.apply(); return; }
        if (e.metaKey || e.ctrlKey) { this.loadSelection(r.id, clickMode(e)); return; }
        if (r.id === 'rgb' || r.id === 'cmyk') this.engine.showAlpha(null, false);
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
    this.maskRow = q(this.root, '[data-special="mask"]');
    this.quickRow = q(this.root, '[data-special="quick"]');
    q(this.maskRow, '.cv-ch-eye').addEventListener('click', (e) => { e.stopPropagation(); if (this.engine.current?.activeLayer?.mask) this.engine.toggleMaskEnabled(); });
    this.maskRow.addEventListener('click', () => { if (this.engine.current?.activeLayer?.mask) this.engine.setMaskTarget(true); });
    q(this.quickRow, '.cv-ch-eye').addEventListener('click', (e) => { e.stopPropagation(); this.engine.toggleQuickMask(); });
    this.quickRow.addEventListener('click', () => this.engine.toggleQuickMask());
    engine.on('options', () => this.syncSpecials());
    // The view's filter, one for the page; the document's canvases use it while a channel view is on.
    if (!document.getElementById('cv-channel-view-svg')) {
      document.body.appendChild(el('<svg id="cv-channel-view-svg" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="cv-channel-view" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter></svg>'));
    }
    for (const ev of ['history', 'doc', 'active', 'projects'] as const) engine.on(ev, () => {
      const p = engine.current, id = p?.activeLayer?.id ?? '';
      if (p === this.seenProject && id !== this.seenLayer) engine.setAlphaTarget(null);
      this.seenProject = p;
      this.seenLayer = id;
      this.apply();
      this.schedule();
    });
    // Thumbnails whenever the tab is shown, in whichever group it is (tabs move between groups).
    new ResizeObserver(() => { if (this.root.clientWidth) this.schedule(); }).observe(this.root);
    // Mod+2 or Mod+` the composite, Mod+3 to Mod+9 the next channels in the list, the alpha channels after the colours.
    document.addEventListener('keydown', (e) => {
      if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey || !this.engine.current) return;
      const n = e.key === '`' || e.key === '2' ? 0 : /^[3-9]$/.test(e.key) ? Number(e.key) - 2 : -1;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (n < 0 || tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
      const rows = [...this.root.querySelectorAll<HTMLElement>('.cv-ch-row:not([hidden])')], composite = rows[0], channels = rows.slice(1);
      const row = n === 0 ? composite : channels[n - 1];
      if (!row) return;
      e.preventDefault();
      row.click();
    });
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
    if (!lab && this.labSolo) { this.labSolo = null; this.engine.paintLab = null; this.engine.setChannelView(null); }
    const m = this.solo && !cmyk && !lab
      ? (() => { const k = { r: [1, 0, 0], g: [0, 1, 0], b: [0, 0, 1] }[this.solo]; return [...k, 0, 0, ...k, 0, 0, ...k, 0, 0, 0, 0, 0, 1, 0]; })()
      : [this.shown.r || cmyk ? 1 : 0, 0, 0, 0, 0, 0, this.shown.g || cmyk ? 1 : 0, 0, 0, 0, 0, 0, this.shown.b || cmyk ? 1 : 0, 0, 0, 0, 0, 0, 1, 0];
    document.querySelector('#cv-channel-view feColorMatrix')?.setAttribute('values', m.join(' '));
    this.engine.rgbTarget = this.solo && !cmyk && !lab ? [this.solo === 'r', this.solo === 'g', this.solo === 'b'] : null;
    const plain = cmyk || lab || (!this.solo && this.shown.r && this.shown.g && this.shown.b);
    this.stage.classList.toggle('has-channel-view', !plain);
    for (const row of this.root.querySelectorAll<HTMLElement>('.cv-ch-row[data-ch]')) {
      const id = row.dataset.ch as Ch, inkRow = id === 'cmyk' || isInk(id), labRow = isLabRow(id);
      setHidden(row, cmyk ? !inkRow : lab ? !labRow : inkRow || labRow);
      if (labRow) { row.classList.toggle('is-on', this.labSolo ? id === this.labSolo : true); row.querySelector('.cv-ch-eye')?.classList.toggle('is-off', !!this.labSolo && id !== this.labSolo); continue; }
      if (inkRow) { row.classList.toggle('is-on', id === 'cmyk' ? !this.inkSolo : this.inkSolo === id); row.querySelector('.cv-ch-eye')?.classList.toggle('is-off', false); continue; }
      const visible = id === 'rgb' ? plain : this.solo ? this.solo === id : this.shown[id as 'r' | 'g' | 'b'];
      row.classList.toggle('is-on', id === 'rgb' ? !this.solo : this.solo === id);
      row.querySelector('.cv-ch-eye')?.classList.toggle('is-off', !visible);
    }
    const native = !!this.stage.querySelector('.cv-scene-native:not([hidden])');
    setText(this.root.querySelector('.cv-ch-note') as HTMLElement, lab ? (this.labSolo ? `The canvas shows ${ROWS.find((r) => r.id === this.labSolo)?.label} alone, as grey (a and b mid-grey where neutral); click Lab to see the colours again. The Brush, Pencil and Eraser paint it alone.` : 'Lab: Lightness, a and b as greys (a and b mid-grey where neutral). Click one to see it alone on the canvas.') : cmyk ? (this.inkSolo ? `The canvas shows ${ROWS.find((r) => r.id === this.inkSolo)?.label} alone (paper white, full ink black); the Brush, Pencil and Eraser paint it alone.` : 'Click an ink to paint it alone; ⌘- or Ctrl-click loads its light areas as a selection.')
      : native && !plain ? 'The Native GPU renderer draws outside the page: switch the renderer in Preferences to view single channels.' : this.solo ? `${ROWS.find((r) => r.id === this.solo)?.label} is the target: strokes, fills and filters change only this channel. Click RGB to edit all three.` : '⌘- or Ctrl-click a channel to load it as a selection.');
    this.syncAlphas();
    this.syncSpecials();
  }

  /** The active layer's mask and the Quick Mask as rows after the alpha channels: shown when they exist, patched in place. */
  private syncSpecials(): void {
    const p = this.engine.current, l = p?.activeLayer, m = l?.mask ?? null;
    setHidden(this.maskRow, !m);
    setHidden(this.quickRow, !p || !this.engine.quickMask);
    this.maskRow.classList.toggle('is-on', !!m && !!p?.maskTarget && !this.engine.quickMask);
    q(this.maskRow, '.cv-ch-eye').classList.toggle('is-off', !!m && !m.enabled);
    this.quickRow.classList.toggle('is-on', this.engine.quickMask);
    const key = m ? `${l?.id}:${m.raster?.id ?? 'full'}:${m.raster?.version ?? 0}` : '';
    if (key === this.maskDrawn) return;
    this.maskDrawn = key;
    const c = q<HTMLCanvasElement>(this.maskRow, '.cv-ch-thumb'), g = c.getContext('2d') as CanvasRenderingContext2D;
    g.clearRect(0, 0, c.width, c.height);
    if (!m) return;
    g.fillStyle = m.raster ? '#000' : '#fff';
    g.fillRect(0, 0, c.width, c.height);
    const r = m.raster;
    if (r) {
      const s = Math.min(c.width / r.width, c.height / r.height), w = Math.max(1, r.width * s), h = Math.max(1, r.height * s);
      g.drawImage(r.canvas as CanvasImageSource, (c.width - w) / 2, (c.height - h) / 2, w, h);
    }
  }

  /** The document's alpha channels (1.65.1), one row each, patched in place. */
  private syncAlphas(): void {
    const p = this.engine.current, shown = new Set(p ? this.engine.shownAlphas(p).map((a) => a.id) : []);
    patchList<AlphaChannel>(this.alphaRows, p ? [...(p.doc.alphas ?? [])] : [], {
      key: (a) => a.id,
      create: (a) => { const row = this.alphaRow(); this.fillAlpha(row, a, shown.has(a.id)); return row; },
      update: (row, a) => this.fillAlpha(row, a, shown.has(a.id)),
    });
  }

  private alphaRow(): HTMLElement {
    const row = el(`<div class="cv-ch-row cv-ch-alpha" role="button" tabindex="0"><button class="cv-ch-eye" type="button">${icon('eye', 15)}</button><canvas class="cv-ch-thumb" width="44" height="30"></canvas><span class="cv-ch-name"></span><button class="cv-icon-btn cv-ch-options" type="button" title="Channel Options" aria-label="Channel Options">${icon('settings', 14)}</button><button class="cv-icon-btn cv-ch-delete" type="button" title="Delete channel" aria-label="Delete channel">${icon('delete', 14)}</button></div>`);
    const id = (): string => row.dataset.key ?? '';
    q(row, '.cv-ch-options').addEventListener('click', (e) => { e.stopPropagation(); this.onOptions(id()); });
    row.draggable = true;
    row.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/x-formvis-channel', id()); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/x-formvis-channel')) { e.preventDefault(); row.classList.add('is-drop'); } });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop'));
    row.addEventListener('drop', (e) => {
      row.classList.remove('is-drop');
      const from = e.dataTransfer?.getData('text/x-formvis-channel');
      const list = this.engine.current?.doc.alphas ?? [], to = list.findIndex((a) => a.id === id());
      if (!from || to < 0) return;
      e.preventDefault();
      this.engine.moveAlpha(from, to);
    });
    q(row, '.cv-ch-eye').addEventListener('click', (e) => { e.stopPropagation(); this.engine.showAlpha(id(), !row.classList.contains('is-on')); this.syncAlphas(); });
    q(row, '.cv-ch-delete').addEventListener('click', (e) => { e.stopPropagation(); this.engine.deleteAlpha(id()); });
    q(row, '.cv-ch-name').addEventListener('dblclick', () => this.rename(row));
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('input')) return;
      if (e.metaKey || e.ctrlKey) { this.engine.loadSelection({ channel: id() }, false, clickMode(e)); return; }
      this.engine.showAlpha(id(), true);
      this.engine.setAlphaTarget(id());
      this.syncAlphas();
    });
    return row;
  }

  private fillAlpha(row: HTMLElement, a: AlphaChannel, on: boolean): void {
    const name = q(row, '.cv-ch-name'), eye = q(row, '.cv-ch-eye'), p = this.engine.current;
    if (!name.querySelector('input')) setText(name, a.name);
    row.classList.toggle('is-on', on);
    row.classList.toggle('is-spot', !!a.spot);
    row.classList.toggle('is-target', this.engine.alphaTargeted()?.id === a.id);
    const ink = a.spot && a.color ? `rgb(${a.color.r}, ${a.color.g}, ${a.color.b})` : '';
    if (row.style.getPropertyValue('--ink') !== ink) { if (ink) row.style.setProperty('--ink', ink); else row.style.removeProperty('--ink'); }
    eye.classList.toggle('is-off', !on);
    if (eye.getAttribute('aria-label') !== `Show ${a.name}`) eye.setAttribute('aria-label', `Show ${a.name}`);
    const was = this.drawn.get(row);
    if (!p || (was && was.mask === a.mask && was.w === p.doc.width && was.h === p.doc.height)) return;
    this.drawn.set(row, { mask: a.mask, w: p.doc.width, h: p.doc.height });
    const c = q<HTMLCanvasElement>(row, '.cv-ch-thumb'), g = c.getContext('2d') as CanvasRenderingContext2D;
    const s = Math.min(c.width / p.doc.width, c.height / p.doc.height), w = Math.max(1, Math.round(p.doc.width * s)), h = Math.max(1, Math.round(p.doc.height * s)), x = (c.width - w) / 2, y = (c.height - h) / 2;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.fillRect(x, y, w, h);
    if (a.mask) g.drawImage(a.mask.surface() as CanvasImageSource, x + a.mask.x * s, y + a.mask.y * s, a.mask.w * s, a.mask.h * s);
  }

  /** Inline renaming in place of the name; Enter or leaving the field keeps it, Escape cancels. */
  private rename(row: HTMLElement): void {
    const p = this.engine.current, a = p?.doc.alphas?.find((x) => x.id === row.dataset.key), name = q(row, '.cv-ch-name');
    if (!a || name.querySelector('input')) return;
    const input = el<HTMLInputElement>('<input class="cv-input cv-ch-rename" type="text" maxlength="200" spellcheck="false">');
    input.value = a.name;
    name.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      name.replaceChildren();
      setText(name, a.name);
      if (keep && value) this.engine.renameAlpha(a.id, value);
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }

  /** The channel's brightness as a selection (RGB: luminosity), weighted by coverage, one undo step. */
  private loadSelection(id: Ch, mode: SelectionMode = 'replace'): void {
    const e = this.engine;
    if (!e.current) return;
    if (isInk(id)) {
      const ink = composeChannels(e.current.doc, e.current.cmykTables);
      if ('error' in ink) { e.notice(ink.error); return; }
      const mask = new Uint8Array(ink.width * ink.height), k = INK[id];
      for (let i = 0, j = 0; j < mask.length; i += 5, j++) mask[j] = Math.round((1 - Math.min(1, Math.max(0, ink.data[i + k]))) * Math.min(1, ink.data[i + 4]) * 255);
      e.applySelection(SelectionMask.cropped(0, 0, ink.width, ink.height, mask), mode, 'Load Selection');
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
    e.applySelection(SelectionMask.cropped(0, 0, W, H, mask), mode, 'Load Selection');
  }
}
