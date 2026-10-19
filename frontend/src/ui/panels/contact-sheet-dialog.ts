import { ensureBundledFont, type Engine, type ImportedImage } from '../../engine';
import { fitInCell, fromPixels, sheetCells, sheetName, sheetPages, toPixels, type SheetSettings, type SheetUnit } from '../../engine/contact-sheet';
import { decodeImage, IMAGE_ACCEPT, isImageFile } from '../../io/images';
import { Dialog } from '../dialogs';
import { el, setText } from '../dom';
import { fontFamilies } from '../fonts';
import { checkRow, numberRow, selectRow } from './controls';

/** File > Automate > Contact Sheet II (DEV_PLAN 30.3 part a): the chosen images laid out on new documents, a page each time
 *  the grid fills, every picture fitted to its cell on its own layer named after the file, with an optional caption. */
export class ContactSheetDialog extends Dialog {
  private files: File[] = [];
  private auto = true;
  private rotate = false;
  private flatten = false;
  private captions = true;
  private readonly source = el('<p class="cv-note"></p>');
  private readonly picker = document.createElement('input');
  private unit: SheetUnit = 'px';
  private order: 'across' | 'down' = 'across';
  private family = 'Inter';
  private useOpen = false;
  private readonly units = selectRow('Page units', [['px', 'Pixels'], ['in', 'Inches'], ['cm', 'Centimeters'], ['mm', 'Millimeters']], (v) => this.setUnit(v as SheetUnit));
  private readonly width = numberRow('Width', 0.01, 30000, 1, () => undefined);
  private readonly height = numberRow('Height', 0.01, 30000, 1, () => undefined);
  private readonly place = selectRow('Place', [['across', 'Across first'], ['down', 'Down first']], (v) => { this.order = v === 'down' ? 'down' : 'across'; });
  private readonly fontPick = selectRow('Caption font', [...new Set(['Inter', ...fontFamilies().filter((f) => /^[\w .-]{1,40}$/.test(f))])].map((f) => [f, f] as const), (v) => { this.family = v; });
  private mode: 'rgb' | 'grayscale' = 'rgb';
  private depth: 8 | 16 = 8;
  private readonly modeRow = selectRow('Mode', [['rgb', 'RGB Color'], ['grayscale', 'Grayscale']], (v) => { this.mode = v === 'grayscale' ? 'grayscale' : 'rgb'; });
  private readonly depthRow = selectRow('Bit depth', [['8', '8 bit'], ['16', '16 bit']], (v) => { this.depth = v === '16' ? 16 : 8; });
  private readonly openImages = checkRow('Use Open Images', (v) => { this.useOpen = v; this.sync(); });
  private readonly ppi = numberRow('Resolution (ppi)', 1, 3000, 1, () => undefined);
  private readonly flat = checkRow('Flatten All Layers', (v) => { this.flatten = v; });
  private readonly columns = numberRow('Columns', 1, 100, 1, () => undefined);
  private readonly rows = numberRow('Rows', 1, 100, 1, () => undefined);
  private readonly spacing = checkRow('Use Auto-Spacing', (v) => { this.auto = v; this.sync(); });
  private readonly vertical = numberRow('Vertical (px)', 0, 1000, 1, () => undefined);
  private readonly horizontal = numberRow('Horizontal (px)', 0, 1000, 1, () => undefined);
  private readonly turn = checkRow('Rotate For Best Fit', (v) => { this.rotate = v; });
  private readonly caption = checkRow('Use Filename As Caption', (v) => { this.captions = v; this.sync(); });
  private readonly font = numberRow('Font Size (px)', 6, 400, 1, () => undefined);

  constructor(private readonly engine: Engine) {
    super('Contact Sheet II', 400);
    this.picker.type = 'file'; this.picker.multiple = true; this.picker.accept = IMAGE_ACCEPT; this.picker.hidden = true;
    this.picker.addEventListener('change', () => { this.files = Array.from(this.picker.files ?? []).filter(isImageFile); this.picker.value = ''; this.sync(); });
    const choose = el<HTMLElement>('<div class="cv-field"><span>Source Images</span></div>');
    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 'cv-btn'; pick.textContent = 'Choose Files...';
    pick.addEventListener('click', () => this.picker.click());
    const actions = el<HTMLElement>('<div class="cv-row-actions"></div>');
    actions.append(pick);
    choose.append(actions, this.picker);
    this.body.append(choose, this.openImages.el, this.source, el('<p class="cv-note">Document</p>'), this.units.el, this.width.el, this.height.el, this.ppi.el, this.modeRow.el, this.depthRow.el, this.flat.el,
      el('<p class="cv-note">Thumbnails</p>'), this.place.el, this.columns.el, this.rows.el, this.spacing.el, this.vertical.el, this.horizontal.el, this.turn.el, this.caption.el, this.fontPick.el, this.fontFileRow(), this.font.el);
    this.button('Cancel', 'ghost', () => this.close());
    this.button('OK', 'primary', () => { void this.apply(); });
    this.width.set(2480); this.height.set(3508); this.ppi.set(300); this.flat.set(false);
    this.columns.set(5); this.rows.set(6); this.spacing.set(true); this.vertical.set(10); this.horizontal.set(10);
    this.turn.set(false); this.caption.set(true); this.font.set(12);
    this.units.set('px'); this.place.set('across'); this.fontPick.set('Inter'); this.openImages.set(false); this.modeRow.set('rgb'); this.depthRow.set('8');
    this.remember();
    this.sync();
  }

  /** Caption font from a file: a TTF, OTF, WOFF or WOFF2 loaded for this session and added to the caption fonts. */
  private fontFileRow(): HTMLElement {
    const row = el<HTMLElement>('<div class="cv-field"><span>Caption font file</span><div class="cv-row-actions"><button type="button" class="cv-btn">Choose Font File...</button><input type="file" accept=".ttf,.otf,.woff,.woff2" hidden></div></div>');
    const input = row.querySelector('input') as HTMLInputElement;
    (row.querySelector('button') as HTMLButtonElement).addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      const family = f.name.replace(/\.[^.]+$/, '').replace(/[^\w .-]/g, '').trim().slice(0, 40) || 'Sheet font';
      void f.arrayBuffer().then((buf) => new FontFace(family, buf).load()).then((face) => {
        document.fonts.add(face);
        const sel = this.fontPick.el.querySelector('select') as HTMLSelectElement;
        if (![...sel.options].some((o) => o.value === family)) sel.append(new Option(family, family));
        this.fontPick.set(family);
        this.family = family;
        setText(this.source, `Caption font ${family} loaded.`);
      }).catch(() => setText(this.source, `${f.name} is not a font file the browser can read.`));
    });
    return row;
  }

  /** Page units: the width and height keep their physical size and are shown in the new unit. */
  private setUnit(next: SheetUnit): void {
    const ppi = Math.max(1, Number(this.ppi.input.value) || 300), was = this.unit;
    for (const r of [this.width, this.height]) {
      const px = toPixels(Number(r.input.value) || 1, was, ppi);
      r.input.step = next === 'px' ? '1' : '0.01';
      r.set(fromPixels(px, next, ppi));
    }
    this.unit = next;
  }

  show(): void {
    if (this.isOpen) return;
    this.readControls();
    this.sync();
    this.open(this.width.input);
  }

  /** The command's way in: the choices set from `o`, the pictures given (else the open documents when `o.documents`), then the sheet is made. */
  async drive(files: File[], o: Record<string, unknown>): Promise<void> {
    const num = (v: unknown, r: { set(v: number): void }): boolean => { const ok = typeof v === 'number' && Number.isFinite(v); if (ok) r.set(v as number); return ok; };
    const unit = (['px', 'in', 'cm', 'mm'] as const).find((u) => u === o.unit) ?? 'px';
    this.unit = unit; this.units.set(unit);
    num(o.ppi, this.ppi);
    const ppi = Math.max(1, Number(this.ppi.input.value) || 300);
    if (!num(o.width, this.width)) this.width.set(fromPixels(2480, unit, ppi));
    if (!num(o.height, this.height)) this.height.set(fromPixels(3508, unit, ppi));
    num(o.columns, this.columns); num(o.rows, this.rows); num(o.font_size, this.font);
    const gap = typeof o.spacing === 'number' && Number.isFinite(o.spacing);
    this.auto = !gap; this.spacing.set(!gap);
    if (gap) { this.vertical.set(o.spacing as number); this.horizontal.set(o.spacing as number); }
    this.captions = o.captions !== false; this.caption.set(this.captions);
    this.rotate = o.rotate === true; this.turn.set(this.rotate);
    this.flatten = o.flatten === true; this.flat.set(this.flatten);
    this.place.set(o.order === 'down' ? 'down' : 'across');
    this.modeRow.set(o.mode === 'grayscale' ? 'grayscale' : 'rgb');
    this.depthRow.set(o.depth === 16 ? '16' : '8');
    if (typeof o.font === 'string' && /^[\w .-]{1,40}$/.test(o.font)) {
      const sel = this.fontPick.el.querySelector('select') as HTMLSelectElement;
      if (![...sel.options].some((p) => p.value === o.font)) sel.append(new Option(o.font, o.font));
      this.fontPick.set(o.font);
    }
    this.files = files;
    this.openImages.set(!files.length && o.documents === true);
    this.sync();
    try { await this.apply(); } finally { this.files = []; this.openImages.set(false); this.useOpen = false; this.sync(); }
  }

  /** The choices as the controls show them, which remembered values may have set without a change event. */
  private readControls(): void {
    const pick = (r: { el: HTMLElement }): string => (r.el.querySelector('select') as HTMLSelectElement).value;
    this.unit = pick(this.units) as SheetUnit;
    this.order = pick(this.place) === 'down' ? 'down' : 'across';
    this.family = pick(this.fontPick);
    this.mode = pick(this.modeRow) === 'grayscale' ? 'grayscale' : 'rgb';
    this.depth = pick(this.depthRow) === '16' ? 16 : 8;
    this.useOpen =(this.openImages.el.querySelector('input') as HTMLInputElement).checked;
  }

  private sync(): void {
    const open = this.engine.projects.length;
    setText(this.source, this.useOpen ? `${open} open image${open === 1 ? '' : 's'} will be used.` : this.files.length ? `${this.files.length} image${this.files.length === 1 ? '' : 's'} chosen.` : 'No images chosen yet.');
    this.vertical.input.disabled = this.auto; this.horizontal.input.disabled = this.auto;
    this.font.input.disabled = !this.captions;
  }

  private async apply(): Promise<void> {
    this.readControls();
    const n = (r: { input: HTMLInputElement }): number => Math.round(Number(r.input.value));
    const size = n(this.font), ppi = n(this.ppi);
    const s: SheetSettings = { width: toPixels(Number(this.width.input.value), this.unit, ppi), height: toPixels(Number(this.height.input.value), this.unit, ppi), columns: n(this.columns), rows: n(this.rows), auto: this.auto, vertical: n(this.vertical), horizontal: n(this.horizontal), caption: 0, order: this.order };
    const sources: Array<{ name: string; file?: File; canvas?: HTMLCanvasElement }> = this.files.map((f) => ({ name: f.name, file: f }));
    if (this.useOpen) {
      sources.length = 0;
      const keep = this.engine.current?.id;
      for (const q of [...this.engine.projects]) {
        this.engine.switchTo(q.id);
        this.engine.settle();
        const flat = this.engine.flattened();
        if (!flat) continue;
        const copy = Object.assign(document.createElement('canvas'), { width: flat.width, height: flat.height });
        copy.getContext('2d')?.drawImage(flat as CanvasImageSource, 0, 0);
        sources.push({ name: q.name, canvas: copy });
      }
      if (keep) this.engine.switchTo(keep);
    }
    if (!sources.length) { this.engine.notice(this.useOpen ? 'Open some images first.' : 'Choose the images for the sheet first.'); return; }
    if (!(s.width >= 1 && s.width <= 30000 && s.height >= 1 && s.height <= 30000 && s.columns >= 1 && s.rows >= 1 && ppi >= 1)) { this.engine.notice('Enter a size from 1 to 30,000 pixels, at least one column and row, and a resolution.'); return; }
    if (this.captions) s.caption = Math.round(size * 1.6);
    const cells = sheetCells(s);
    if (!cells.length) { this.engine.notice('The thumbnails do not fit the document: lower the columns, rows or spacing.'); return; }
    this.close();
    const files = sources, per = cells.length, pages = sheetPages(files.length, s);
    await this.engine.task(async () => {
      const problems: string[] = [];
      for (let page = 0; page < pages; page++) {
        const name = pages > 1 ? sheetName(page + 1) : sheetName(1);
        if (!this.engine.newDocument(s.width, s.height, name, 'white', ppi)) return;
        const page_canvas = this.flatten ? Object.assign(document.createElement('canvas'), { width: s.width, height: s.height }) : null;
        const pc = page_canvas?.getContext('2d') ?? null;
        for (let i = 0; i < per && page * per + i < files.length; i++) {
          const f = files[page * per + i], cell = cells[i];
          let img: ImportedImage;
          try { img = f.file ? await decodeImage(f.file, f.name) : { source: f.canvas as HTMLCanvasElement, width: (f.canvas as HTMLCanvasElement).width, height: (f.canvas as HTMLCanvasElement).height, name: f.name } as ImportedImage; } catch (err) { problems.push(`${f.name}: ${err instanceof Error ? err.message : 'could not be read'}`); continue; }
          const pl = fitInCell(cell, img.width, img.height, this.rotate), c = document.createElement('canvas');
          c.width = pl.w; c.height = pl.h;
          const cx = c.getContext('2d');
          if (!cx) continue;
          if (pl.rotate) { cx.translate(pl.w / 2, pl.h / 2); cx.rotate(Math.PI / 2); cx.drawImage(img.source, -pl.h / 2, -pl.w / 2, pl.h, pl.w); }
          else cx.drawImage(img.source, 0, 0, pl.w, pl.h);
          const label = f.name.replace(/\.[^.]+$/, '');
          if (pc) pc.drawImage(c, pl.x, pl.y);
          else this.engine.insertImages([{ source: c, width: pl.w, height: pl.h, name: f.name }], { x: pl.x + pl.w / 2, y: pl.y + pl.h / 2 });
          if (!this.captions) continue;
          const mid = cell.x + cell.w / 2, top = cell.y + cell.h;
          if (pc) { await ensureBundledFont(this.family); pc.fillStyle = '#000000'; pc.font =`${size}px "${this.family}", sans-serif`; pc.textAlign = 'center'; pc.textBaseline = 'alphabetic'; pc.fillText(label, mid, top + size * 1.2, cell.w); }
          else await this.engine.createTextLayer({ x: mid, y: top + size * 1.2 }, { content: label, family: this.family, size, color: { r: 0, g: 0, b: 0 }, align: 'center', bold: false, italic: false, lineHeight: 1.2, tracking: 0, kerning: 'metrics', antialias: 'smooth', box: null, direction: 'horizontal' });
        }
        if (page_canvas) this.engine.insertImages([{ source: page_canvas, width: s.width, height: s.height, name }], { x: s.width / 2, y: s.height / 2 });
        if (this.mode === 'grayscale' && !this.engine.convertMode('grayscale')) problems.push(`${name} stayed RGB`);
        if (this.depth === 16 && !this.engine.setDepth(16)) problems.push(`${name} stayed 8 bit`);
      }
      if (problems.length) this.engine.notice(`Contact sheet finished with skips. ${problems.join('. ')}.`, 'error');
    });
  }
}
