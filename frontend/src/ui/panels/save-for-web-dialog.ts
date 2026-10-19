import type { Engine } from '../../engine';
import { encodeGif } from '../../io/gif';
import { zipFiles } from '../../io/zip';
import { encodePng8 } from '../../io/png8';
import { withXmp } from '../../io/xmp';
import { SFW_METADATA, sfwMeta, type SfwMetadata } from '../../io/export-presets';
import { metaWritable } from '../../engine';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { checkRow, selectRow, sliderRow } from './controls';

const BOX_W = 280, BOX_H = 200;
type View = 'original' | 'optimized' | '2up' | '4up';
const VIEWS: ReadonlyArray<readonly [View, string]> = [['original', 'Original'], ['optimized', 'Optimized'], ['2up', '2-Up'], ['4up', '4-Up']];
/** Download speeds in kilobits a second. */
const SPEEDS: ReadonlyArray<readonly [string, string]> = [['28.8', '28.8 Kbps Modem'], ['56.6', '56.6 Kbps Dial-up'], ['128', '128 Kbps Dual ISDN'], ['256', '256 Kbps Cable'], ['512', '512 Kbps Cable'], ['1500', '1.5 Mbps T1'], ['10000', '10 Mbps Broadband']];
/** The settings one optimized pane encodes with. */
interface Cfg { fmt: Fmt; quality: number; colors: number; dither: 'none' | 'diffusion'; transparency: boolean }

type Fmt = 'jpeg' | 'png24' | 'png8' | 'gif' | 'webp';
const EXT: Record<Fmt, string> = { jpeg: 'jpg', png24: 'png', png8: 'png', gif: 'gif', webp: 'webp' };
const LABEL: Record<Fmt, string> = { jpeg: 'JPEG', png24: 'PNG-24', png8: 'PNG-8', gif: 'GIF', webp: 'WebP' };

const size = (bytes: number): string => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** The flattened surface may be an OffscreenCanvas; copy it to a canvas element so toBlob is available. */
function flatCanvas(engine: Engine): HTMLCanvasElement | null {
  const s = engine.flattened();
  if (!s) return null;
  const c = document.createElement('canvas');
  c.width = s.width; c.height = s.height;
  c.getContext('2d')?.drawImage(s, 0, 0);
  return c;
}

function toBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((res) => c.toBlob((b) => res(b), type, quality));
}

/** File > Export > Save for Web (Legacy), with slices: two fixed-size 100 percent previews (the original and the
 *  really encoded result, decoded again), a format and quality, and an export of the whole image or of every slice
 *  into a zip. All the DOM is built once; changes only touch text, values, canvas pixels and the hidden flag. */
export class SaveForWebDialog extends Dialog {
  private cfg: Cfg = { fmt: 'jpeg', quality: 80, colors: 256, dither: 'diffusion', transparency: true };
  private get fmt(): Fmt { return this.cfg.fmt; }
  private scope: 'whole' | 'slices' = 'whole';
  private view: View = 'optimized';
  private metaMode: SfwMetadata = 'copyright';
  private kbps = 56.6;
  private timer = 0;
  private token = 0;
  /** The pan shared by every pane, in pixels from the centred position, and the settings each optimized pane last showed. */
  private pan = { x: 0, y: 0 };
  private shown: Cfg[] = [];
  private readonly srcs: Array<(CanvasImageSource & { width: number; height: number }) | null> = [null, null, null, null];
  private readonly canvases = [0, 1, 2, 3].map((i) => el<HTMLCanvasElement>(`<canvas width="${BOX_W}" height="${BOX_H}" aria-label="${i === 0 ? 'Original preview' : `Optimized preview ${i}`}" style="width: ${BOX_W}px; height: ${BOX_H}px; cursor: grab; touch-action: none"></canvas>`));
  private readonly caps = [0, 1, 2, 3].map(() => el<HTMLElement>('<p class="cv-note"></p>'));
  private readonly details = [0, 1, 2, 3].map(() => el<HTMLElement>('<p class="cv-note"></p>'));
  private readonly panes = [0, 1, 2, 3].map((i) => el<HTMLElement>(`<div style="border: 2px solid transparent; border-radius: 4px; padding: 2px"><p class="cv-note">${i === 0 ? 'Original' : i === 1 ? 'Optimized' : `Variant ${i}`}</p></div>`));
  private readonly tabs = VIEWS.map(([v, t]) => { const b = el<HTMLButtonElement>('<button class="cv-prefs-tab" type="button" role="tab"></button>'); b.textContent = t; b.addEventListener('click', () => { this.view = v; this.layout(); this.schedule(); }); return b; });
  private readonly status = el<HTMLElement>('<p class="cv-note"></p>');
  private readonly format = selectRow('Format', [['jpeg', 'JPEG'], ['png24', 'PNG-24'], ['png8', 'PNG-8'], ['gif', 'GIF'], ['webp', 'WebP']], (v) => { this.cfg = { ...this.cfg, fmt: v as Fmt }; this.sync(); this.schedule(); });
  private readonly qRow = sliderRow('Quality', 0, 100, 1, (v) => { this.cfg = { ...this.cfg, quality: v }; this.schedule(); });
  private readonly colorsRow = sliderRow('Colors', 2, 256, 1, (v) => { this.cfg = { ...this.cfg, colors: Math.round(v) }; this.schedule(); });
  private readonly ditherRow = selectRow('Dither', [['none', 'No Dither'], ['diffusion', 'Diffusion']], (v) => { this.cfg = { ...this.cfg, dither: v as Cfg['dither'] }; this.schedule(); });
  private readonly transRow = checkRow('Transparency', (v) => { this.cfg = { ...this.cfg, transparency: v }; this.schedule(); });
  private readonly metaRow = selectRow('Metadata', SFW_METADATA, (v) => { this.metaMode = v as SfwMetadata; this.sync(); this.schedule(); });
  private readonly speedRow = selectRow('Download speed', SPEEDS, (v) => { this.kbps = Number(v); this.schedule(); });
  private readonly scopeRow = selectRow('Export', [['whole', 'Whole image'], ['slices', 'All slices']], (v) => { this.scope = v as 'whole' | 'slices'; });

  constructor(private readonly engine: Engine, private readonly deliver: (blob: Blob, name: string) => Promise<void>) {
    super('Save for Web (Legacy)', 620);
    const strip = el('<div role="tablist" style="display: flex; gap: 4px"></div>');
    strip.append(...this.tabs);
    const grid = el('<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; justify-content: space-between"></div>');
    this.panes.forEach((pane, i) => {
      pane.append(this.canvases[i]!, this.caps[i]!, this.details[i]!);
      grid.append(pane);
      this.drag(i);
    });
    this.body.append(strip, grid, this.format.el, this.qRow.el, this.colorsRow.el, this.ditherRow.el, this.transRow.el, this.metaRow.el, this.speedRow.el, this.scopeRow.el, this.status);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Save...', 'primary', () => { void this.save(); });
  }

  /** Dragging any pane pans all of them; a click (no drag) on an optimized pane makes its settings the current ones. */
  private drag(i: number): void {
    const c = this.canvases[i]!;
    let from: { x: number; y: number; px: number; py: number } | null = null, moved = false;
    c.addEventListener('pointerdown', (e) => { from = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y }; moved = false; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!from) return;
      const dx = e.clientX - from.x, dy = e.clientY - from.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (moved) { this.pan = { x: from.px + dx, y: from.py + dy }; this.drawAll(); }
    });
    const end = (): void => {
      if (!from) return;
      from = null;
      if (!moved && i > 0 && this.shown[i - 1]) { this.cfg = { ...this.shown[i - 1]! }; this.sync(); this.schedule(); }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => { from = null; });
  }

  /** Which panes the view shows, fixed in place: only the hidden flag, the tab state and the selection outline change. */
  private layout(): void {
    const on = this.view === 'original' ? [0] : this.view === 'optimized' ? [1] : this.view === '2up' ? [0, 1] : [0, 1, 2, 3];
    this.panes.forEach((p, i) => {
      if (p.hidden !== !on.includes(i)) p.hidden = !on.includes(i);
      const edge = i === 1 ? 'var(--accent-color)' : 'transparent';
      if (p.style.borderColor !== edge) p.style.borderColor = edge;
    });
    this.tabs.forEach((t, i) => {
      const active = VIEWS[i]![0] === this.view;
      t.classList.toggle('is-active', active);
      if (t.getAttribute('aria-selected') !== String(active)) t.setAttribute('aria-selected', String(active));
    });
  }

  /** The current settings and two cheaper ones: lower quality for JPEG and WebP, fewer colours for GIF and PNG-8, and for
   *  PNG-24 (lossless) 256 and 64 colour PNG-8, as a 4-Up view shows. */
  private variants(): Cfg[] {
    const c = this.cfg;
    if (c.fmt === 'jpeg' || c.fmt === 'webp') return [c, { ...c, quality: Math.max(1, Math.round(c.quality * 0.6)) }, { ...c, quality: Math.max(1, Math.round(c.quality * 0.3)) }];
    if (c.fmt === 'png24') return [c, { ...c, fmt: 'png8', colors: 256 }, { ...c, fmt: 'png8', colors: 64 }];
    return [c, { ...c, colors: Math.max(2, Math.round(c.colors / 2)) }, { ...c, colors: Math.max(2, Math.round(c.colors / 4)) }];
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    this.speedRow.set(String(this.kbps));
    this.metaRow.set(this.metaMode);
    const has = (p.doc.slices?.length ?? 0) > 0;
    const opt = this.scopeRow.el.querySelector('option[value="slices"]') as HTMLOptionElement | null;
    if (opt) opt.disabled = !has;
    if (!has) this.scope = 'whole';
    this.scopeRow.set(this.scope);
    this.sync();
    this.layout();
    this.pan = { x: 0, y: 0 };
    this.shown = [];
    this.release();
    this.canvases.forEach((c) => c.getContext('2d')?.clearRect(0, 0, BOX_W, BOX_H));
    this.caps.forEach((c) => setText(c, ''));
    this.details.forEach((c) => setText(c, ''));
    this.open();
    this.schedule();
  }

  close(): void {
    window.clearTimeout(this.timer);
    this.token++;
    this.release();
    super.close();
  }

  private release(): void {
    this.srcs.forEach((s, i) => { if (s && 'close' in s) (s as ImageBitmap).close(); this.srcs[i] = null; });
  }

  /** Shows only the rows the format uses (and the metadata note); the rows themselves keep their place. */
  private sync(): void {
    this.format.set(this.cfg.fmt);
    this.qRow.set(this.cfg.quality);
    this.colorsRow.set(this.cfg.colors);
    this.ditherRow.set(this.cfg.dither);
    this.transRow.set(this.cfg.transparency);
    const lossy = this.fmt === 'jpeg' || this.fmt === 'webp', indexed = this.fmt === 'png8' || this.fmt === 'gif';
    this.qRow.el.hidden = !lossy;
    this.colorsRow.el.hidden = !indexed;
    this.ditherRow.el.hidden = !indexed;
    this.transRow.el.hidden = !(indexed || this.fmt === 'png24');
  }

  /** One pane's picture at 100 percent, offset by the shared pan (kept inside the picture's own overhang). */
  private drawBox(i: number): void {
    const c = this.canvases[i]!, src = this.srcs[i], ctx = c.getContext('2d');
    if (!ctx || !src) return;
    const mx = Math.max(0, (src.width - BOX_W) / 2), my = Math.max(0, (src.height - BOX_H) / 2);
    const px = Math.min(mx, Math.max(-mx, this.pan.x)), py = Math.min(my, Math.max(-my, this.pan.y));
    ctx.clearRect(0, 0, BOX_W, BOX_H);
    ctx.drawImage(src, Math.round((BOX_W - src.width) / 2 + px), Math.round((BOX_H - src.height) / 2 + py));
  }

  private drawAll(): void { for (let i = 0; i < 4; i++) if (!this.panes[i]!.hidden) this.drawBox(i); }

  private schedule(): void {
    window.clearTimeout(this.timer);
    setText(this.status, 'Updating preview...');
    const token = ++this.token;
    this.timer = window.setTimeout(() => { void this.refresh(token); }, 150);
  }

  /** Encodes a canvas with the given settings. PNG-8 is a true indexed PNG (io/png8.ts); the File Info chosen under
   *  Metadata is written as XMP into PNG, JPEG and WebP (GIF and a palette-free path carry none). */
  private async encode(c: HTMLCanvasElement, cfg: Cfg = this.cfg): Promise<Blob | null> {
    let blob: Blob | null;
    switch (cfg.fmt) {
      case 'jpeg': blob = await toBlob(c, 'image/jpeg', cfg.quality / 100); break;
      case 'webp': blob = await toBlob(c, 'image/webp', cfg.quality / 100); break;
      case 'gif': {
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        const data = ctx.getImageData(0, 0, c.width, c.height);
        const bytes = encodeGif([{ data, delayMs: 0 }], c.width, c.height);
        return new Blob([bytes as BlobPart], { type: 'image/gif' });
      }
      case 'png8': {
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        const d = ctx.getImageData(0, 0, c.width, c.height);
        blob = new Blob([(await encodePng8({ data: d.data, width: c.width, height: c.height }, { colors: cfg.colors, dither: cfg.dither, transparency: cfg.transparency })) as BlobPart], { type: 'image/png' });
        break;
      }
      default: {
        if (cfg.transparency) { blob = await toBlob(c, 'image/png'); break; }
        const m = document.createElement('canvas'), mc = m.getContext('2d');
        m.width = c.width; m.height = c.height;
        if (mc) { mc.fillStyle = '#ffffff'; mc.fillRect(0, 0, m.width, m.height); mc.drawImage(c, 0, 0); }
        blob = await toBlob(m, 'image/png');
      }
    }
    const meta = sfwMeta(this.metaMode, this.engine.current?.doc.meta);
    return blob && metaWritable(meta) ? withXmp(blob, cfg.fmt === 'jpeg' ? 'jpg' : cfg.fmt === 'png24' || cfg.fmt === 'png8' ? 'png' : cfg.fmt, meta) : blob;
  }

  private caption(i: number, cfg: Cfg, blob: Blob): void {
    const secs = (blob.size * 8) / (this.kbps * 1000), time = secs < 1 ? 'under 1 sec' : `${secs < 10 ? secs.toFixed(1) : Math.round(secs)} sec`;
    setText(this.caps[i]!, `${LABEL[cfg.fmt]} · ${size(blob.size)} · ${time} at ${this.kbps} Kbps`);
    setText(this.details[i]!, cfg.fmt === 'jpeg' || cfg.fmt === 'webp' ? `Quality ${cfg.quality}` : cfg.fmt === 'png24' ? 'Lossless' : `${cfg.colors} colors, ${cfg.dither === 'none' ? 'no dither' : 'diffusion dither'}${cfg.transparency ? ', transparency' : ''}`);
  }

  private async refresh(token: number): Promise<void> {
    const flat = flatCanvas(this.engine);
    if (!flat || flat.width < 1 || flat.height < 1) return;
    const vs = this.variants(), want = this.panes.map((p, i) => !p.hidden && (i > 0 || this.view !== 'optimized'));
    const blobs = await Promise.all(vs.map((v, k) => (want[k + 1] ? this.encode(flat, v) : Promise.resolve(null))));
    if (token !== this.token) return;
    const bmps = await Promise.all(blobs.map((b) => (b ? createImageBitmap(b) : Promise.resolve(null))));
    if (token !== this.token) { bmps.forEach((b) => b?.close()); return; }
    this.release();
    this.shown = vs;
    this.srcs[0] = flat;
    bmps.forEach((b, k) => { this.srcs[k + 1] = b; });
    this.drawAll();
    blobs.forEach((b, k) => { if (b) this.caption(k + 1, vs[k]!, b); });
    if (want[0]) {
      const png = await toBlob(flat, 'image/png');
      if (token !== this.token) return;
      setText(this.caps[0]!, `Original · ${png ? size(png.size) : ''}`);
    }
    const note = this.fmt === 'gif' && this.metaMode !== 'none' ? ' GIF files carry no metadata.' : '';
    setText(this.status, `Encoded preview at 100 percent. Drag to pan every pane; click an optimized pane to use its settings.${note}`);
  }

  private async save(): Promise<void> {
    const p = this.engine.current;
    const flat = flatCanvas(this.engine);
    if (!p || !flat) return;
    const base = p.name || 'image', ext = EXT[this.fmt];
    setText(this.status, 'Saving...');
    try {
      const slices = p.doc.slices ?? [];
      if (this.scope === 'slices' && slices.length) {
        const order = [...slices].sort((a, b) => a.y - b.y || a.x - b.x);
        const files: { name: string; blob: Blob }[] = [];
        for (let i = 0; i < order.length; i++) {
          const s = order[i]!, c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(s.w)); c.height = Math.max(1, Math.round(s.h));
          c.getContext('2d')?.drawImage(flat, s.x, s.y, s.w, s.h, 0, 0, c.width, c.height);
          const b = await this.encode(c);
          if (b) files.push({ name: `${base}_${String(i + 1).padStart(2, '0')}.${ext}`, blob: b });
        }
        await this.deliver(await zipFiles(files), `${base} slices.zip`);
      } else {
        const b = await this.encode(flat);
        if (!b) { setText(this.status, 'The image could not be encoded.'); return; }
        await this.deliver(b, `${base}.${ext}`);
      }
      this.close();
    } catch (err) { setText(this.status, err instanceof Error ? err.message : 'The export failed.'); }
  }
}
