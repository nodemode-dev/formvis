import type { Engine } from '../../engine';
import { encodeGif } from '../../io/gif';
import { zipFiles } from '../../io/zip';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { selectRow, sliderRow } from './controls';

const BOX_W = 280, BOX_H = 200;

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
  private fmt: Fmt = 'jpeg';
  private quality = 80;
  private scope: 'whole' | 'slices' = 'whole';
  private timer = 0;
  private token = 0;
  private readonly orig = el<HTMLCanvasElement>(`<canvas width="${BOX_W}" height="${BOX_H}" aria-label="Original preview" style="width: ${BOX_W}px; height: ${BOX_H}px"></canvas>`);
  private readonly opt = el<HTMLCanvasElement>(`<canvas width="${BOX_W}" height="${BOX_H}" aria-label="Optimized preview" style="width: ${BOX_W}px; height: ${BOX_H}px"></canvas>`);
  private readonly origCap = el<HTMLElement>('<p class="cv-note"></p>');
  private readonly optCap = el<HTMLElement>('<p class="cv-note"></p>');
  private readonly status = el<HTMLElement>('<p class="cv-note"></p>');
  private readonly format = selectRow('Format', [['jpeg', 'JPEG'], ['png24', 'PNG-24'], ['png8', 'PNG-8'], ['gif', 'GIF'], ['webp', 'WebP']], (v) => { this.fmt = v as Fmt; this.sync(); this.schedule(); });
  private readonly qRow = sliderRow('Quality', 0, 100, 1, (v) => { this.quality = v; this.schedule(); });
  private readonly scopeRow = selectRow('Export', [['whole', 'Whole image'], ['slices', 'All slices']], (v) => { this.scope = v as 'whole' | 'slices'; });

  constructor(private readonly engine: Engine, private readonly deliver: (blob: Blob, name: string) => Promise<void>) {
    super('Save for Web (Legacy)', 620);
    const grid = el('<div style="display: flex; gap: 12px; justify-content: space-between"></div>');
    const left = el('<div></div>'), right = el('<div></div>');
    left.append(el('<p class="cv-note">Original</p>'), this.orig, this.origCap);
    right.append(el('<p class="cv-note">Optimized</p>'), this.opt, this.optCap);
    grid.append(left, right);
    this.body.append(grid, this.format.el, this.qRow.el, this.scopeRow.el, this.status);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Save...', 'primary', () => { void this.save(); });
  }

  show(): void {
    const p = this.engine.current;
    if (this.isOpen || !p) return;
    this.format.set(this.fmt);
    this.qRow.set(this.quality);
    const has = (p.doc.slices?.length ?? 0) > 0;
    const opt = this.scopeRow.el.querySelector('option[value="slices"]') as HTMLOptionElement | null;
    if (opt) opt.disabled = !has;
    if (!has) this.scope = 'whole';
    this.scopeRow.set(this.scope);
    this.sync();
    const flat = flatCanvas(this.engine);
    if (flat) this.drawBox(this.orig, flat);
    const ctx = this.opt.getContext('2d');
    ctx?.clearRect(0, 0, BOX_W, BOX_H);
    setText(this.origCap, '');
    setText(this.optCap, '');
    this.open();
    this.schedule();
  }

  close(): void {
    window.clearTimeout(this.timer);
    this.token++;
    super.close();
  }

  private sync(): void { this.qRow.el.hidden = this.fmt !== 'jpeg' && this.fmt !== 'webp'; }

  private drawBox(c: HTMLCanvasElement, src: CanvasImageSource & { width: number; height: number }): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, BOX_W, BOX_H);
    ctx.drawImage(src, Math.round((BOX_W - src.width) / 2), Math.round((BOX_H - src.height) / 2));
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    setText(this.status, 'Updating preview...');
    const token = ++this.token;
    this.timer = window.setTimeout(() => { void this.refresh(token); }, 150);
  }

  /** Encodes a canvas in the chosen format. PNG-8 is written as a normal PNG for now: a true 8-bit palette is not built yet. */
  private async encode(c: HTMLCanvasElement): Promise<Blob | null> {
    switch (this.fmt) {
      case 'jpeg': return toBlob(c, 'image/jpeg', this.quality / 100);
      case 'webp': return toBlob(c, 'image/webp', this.quality / 100);
      case 'gif': {
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        const data = ctx.getImageData(0, 0, c.width, c.height);
        const bytes = encodeGif([{ data, delayMs: 0 }], c.width, c.height);
        return new Blob([bytes as BlobPart], { type: 'image/gif' });
      }
      default: return toBlob(c, 'image/png');
    }
  }

  private async refresh(token: number): Promise<void> {
    const flat = flatCanvas(this.engine);
    if (!flat || flat.width < 1 || flat.height < 1) return;
    const blob = await this.encode(flat);
    if (token !== this.token || !blob) return;
    const bmp = await createImageBitmap(blob);
    if (token !== this.token) { bmp.close(); return; }
    this.drawBox(this.opt, bmp);
    bmp.close();
    setText(this.optCap, `${LABEL[this.fmt]} · ${size(blob.size)}`);
    const png = await toBlob(flat, 'image/png');
    if (token !== this.token) return;
    setText(this.origCap, `Original · ${png ? size(png.size) : ''}`);
    setText(this.status, 'Encoded preview at 100 percent, centre of the image.');
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
