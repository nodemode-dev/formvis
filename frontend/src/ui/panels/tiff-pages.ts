import type { Engine } from '../../engine';
import { Raster } from '../../engine';
import { api, ApiError } from '../../io/api';
import { decodeImage } from '../../io/images';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';

type Page = { index: number; width: number; height: number; mode: string };

/** A TIFF with several pages (1.53.4): the largest page (a scan's full resolution, not its thumbnails), each page as a
 *  document, or every page as a layer of one document. BigTIFF opens the same way. */
export class TiffPagesDialog extends Dialog {
  private readonly info = el('<p class="cv-note"></p>');
  private readonly how = el<HTMLSelectElement>('<select class="cv-input" aria-label="Open pages as"><option value="largest">The largest page only</option><option value="documents">Each page as a document</option><option value="layers">Every page as a layer</option></select>');
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private file: File | null = null;
  private pages: Page[] = [];
  private busy = false;
  private ticket = 0;

  constructor(private readonly engine: Engine) {
    super('TIFF Pages', 420);
    const row = el('<label class="cv-dialog-row"><span>Open as</span></label>'); row.append(this.how);
    this.body.append(this.info, row, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Open', 'primary', () => void this.go());
    this.onClose = () => { this.ticket++; this.busy = false; };
    this.remember();   // how pages are opened (kept under TIFF Pages and Icon Sizes alike)
  }

  show(file: File, pages: Page[]): void {
    this.file = file; this.pages = pages;
    const icon = /\.(ico|cur)$/i.test(file.name);   // an icon's sizes are offered the way a TIFF's pages are (DEV_PLAN 34.1), largest first
    this.setTitle(icon ? 'Icon Sizes' : 'TIFF Pages');
    [`The largest ${icon ? 'size' : 'page'} only`, `Each ${icon ? 'size' : 'page'} as a document`, `Every ${icon ? 'size' : 'page'} as a layer`].forEach((t, i) => setText(this.how.options[i], t));
    setText(this.info, `${file.name} has ${pages.length} ${icon ? 'sizes' : 'pages'}: ${pages.map((p) => `${p.width} by ${p.height}`).join(', ')}.`);
    setText(this.note, '');
    this.how.value = 'largest';
    this.open();
  }

  private async page(p: Page): Promise<{ raster: Raster; width: number; height: number }> {
    const f = this.file as File, img = await decodeImage(await api.decode(f, f.name, p.index), `${f.name.replace(/\.[^.]+$/, '')}-${p.index + 1}.png`);
    const r = new Raster(img.width, img.height);
    r.ctx.drawImage(img.source as CanvasImageSource, 0, 0); r.touch();
    return { raster: r, width: img.width, height: img.height };
  }

  private async go(): Promise<void> {
    const f = this.file;
    if (!f || this.busy) return;
    this.busy = true;
    const base = f.name.replace(/\.[^.]+$/, ''), how = this.how.value, e = this.engine, t = this.ticket;
    try {
      if (how === 'largest') {
        const big = [...this.pages].sort((a, b) => b.width * b.height - a.width * a.height)[0];
        const img = await decodeImage(await api.decode(f, f.name, big.index), `${base}.png`);
        if (this.ticket !== t) return;
        e.openImage(img).name = base;
      } else if (how === 'documents') {
        for (const p of this.pages) {
          setText(this.note, `Opening page ${p.index + 1} of ${this.pages.length}...`);
          const img = await decodeImage(await api.decode(f, f.name, p.index), `${base} page ${p.index + 1}.png`);
          if (this.ticket !== t) return;
          e.openImage(img).name = `${base} page ${p.index + 1}`;
        }
      } else {
        const pages = [];
        for (const p of this.pages) {
          setText(this.note, `Adding page ${p.index + 1} of ${this.pages.length}...`);
          pages.push({ p, raster: (await this.page(p)).raster });
          if (this.ticket !== t) return;
        }
        const W = Math.max(...this.pages.map((p) => p.width)), H = Math.max(...this.pages.map((p) => p.height));
        e.newDocument(W, H, base, 'transparent');
        const empty = e.current?.doc.layers[0]?.id;   // the new document's empty layer: one layer per page is wanted
        for (const { p, raster } of pages) e.insertRasterLayer(raster, `Page ${p.index + 1}`, 0, 0, {}, 'Open Page');
        if (empty && e.current?.layer(empty)) { e.selectLayer(empty); e.deleteLayers(); }
      }
      this.close();
    } catch (err) { setText(this.note, err instanceof ApiError || err instanceof Error ? err.message : 'The pages could not be read.'); }
    finally { if (this.ticket === t) this.busy = false; }
  }
}
