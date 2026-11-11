import type { Engine } from '../../engine';
import { LIMITS } from '../../engine/types';
import { api, ApiError } from '../../io/api';
import { decodeImage, type LargePictureError } from '../../io/images';
import { Dialog } from '../dialogs';
import { el, setHidden, setText } from '../dom';

/** A picture larger than formvis edits in one piece (1.52.7): its size and the memory the engine needs to decode it
 *  once, then a reduced copy that fits, a region at full size, or tiles at full size, each tile its own document that
 *  remembers where it sits, for Assemble Tiles. */
export class LargePictureDialog extends Dialog {
  private readonly info = el('<p class="cv-note cv-large-info"></p>');
  private readonly how = el<HTMLSelectElement>('<select class="cv-input" aria-label="Open as"><option value="reduced">A reduced copy that fits</option><option value="region">A region at full size</option><option value="tiles">Tiles at full size, each a document</option></select>');
  private readonly side = el<HTMLSelectElement>('<select class="cv-input" aria-label="Longer side"><option>4000</option><option selected>8000</option><option>16000</option><option>30000</option></select>');
  private readonly rx = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" aria-label="Region x">');
  private readonly ry = el<HTMLInputElement>('<input class="cv-input" type="number" min="0" aria-label="Region y">');
  private readonly rw = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" aria-label="Region width">');
  private readonly rh = el<HTMLInputElement>('<input class="cv-input" type="number" min="1" aria-label="Region height">');
  private readonly tile = el<HTMLSelectElement>('<select class="cv-input" aria-label="Tile size"><option>2048</option><option selected>4096</option><option>8192</option></select>');
  private readonly rows: Record<string, HTMLElement>;
  private readonly note = el('<p class="cv-note" role="status"></p>');
  private pic: LargePictureError | null = null;

  constructor(private readonly engine: Engine) {
    super('Large Picture', 460);
    const row = (label: string, ...c: HTMLElement[]): HTMLElement => { const r = el(`<label class="cv-dialog-row"><span>${label}</span></label>`); r.append(...c); return r; };
    this.rows = { reduced: row('Longer side (px)', this.side), region: row('x, y, width, height', this.rx, this.ry, this.rw, this.rh), tiles: row('Tile size (px)', this.tile) };
    this.body.append(this.info, row('Open as', this.how), this.rows.reduced, this.rows.region, this.rows.tiles, this.note);
    for (const c of [this.how, this.tile]) c.addEventListener('change', () => this.sync());
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Open', 'primary', () => void this.go());
    this.onClose = () => { this.ticket++; this.busy = false; };
    this.remember([this.rx, this.ry, this.rw, this.rh]);   // the region is placed in this picture
  }

  private busy = false;
  private ticket = 0;

  show(pic: LargePictureError): void {
    this.pic = pic;
    const gb = (pic.width * pic.height * 4) / 1024 ** 3;
    setText(this.info, `${pic.picture} is ${pic.width.toLocaleString()} by ${pic.height.toLocaleString()} pixels, larger than formvis edits in one piece (30,000 a side, ${Math.round(LIMITS.pixels / 1_000_000)} megapixels on this computer). The engine decodes it once to open it, which needs about ${gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`} of memory.`);
    const w = Math.min(8000, pic.width), h = Math.min(8000, pic.height);
    this.rx.value = String(Math.floor((pic.width - w) / 2)); this.ry.value = String(Math.floor((pic.height - h) / 2)); this.rw.value = String(w); this.rh.value = String(h);
    setText(this.note, '');
    this.sync();
    this.open();
  }

  private sync(): void {
    for (const [k, r] of Object.entries(this.rows)) setHidden(r, this.how.value !== k);
    if (this.how.value === 'tiles' && this.pic) { const s = Number(this.tile.value); setText(this.note, `${Math.ceil(this.pic.width / s) * Math.ceil(this.pic.height / s)} tiles, each its own document; File > Export > Assemble Tiles puts them back together.`); }
    else setText(this.note, '');
  }

  private async go(): Promise<void> {
    const pic = this.pic;
    if (!pic || this.busy) return;
    this.busy = true;
    const base = pic.picture.replace(/\.[a-z0-9]+$/i, ''), how = this.how.value, t = this.ticket;
    setText(this.note, 'The engine is opening it...');
    let id = '';
    try {
      id = (await api.largeKeep(pic.file, pic.picture)).id;
      if (this.ticket !== t) return;
      if (how === 'reduced') { const img = await decodeImage(await api.largeReduced(id, Number(this.side.value)), `${base} (reduced)`); if (this.ticket !== t) return; this.engine.openImage(img); }
      else if (how === 'region') {
        const [x, y, w, h] = [this.rx, this.ry, this.rw, this.rh].map((i) => Math.round(Number(i.value)));
        const img = await decodeImage(await api.largeRegion(id, x, y, w, h), `${base} region`);
        if (this.ticket !== t) return;
        this.engine.openImage(img);
      } else {
        const grid = await api.largeTiles(id, Number(this.tile.value));
        for (const [n, g] of grid.entries()) {
          if (this.ticket !== t) return;
          setText(this.note, `Opening tile ${n + 1} of ${grid.length}...`);
          const img = await decodeImage(await api.largeRegion(id, g.x, g.y, g.width, g.height), `${base} r${g.row + 1}c${g.col + 1}`);
          if (this.ticket !== t) return;
          const p = this.engine.openImage(img);
          p.tile = { source: base, width: pic.width, height: pic.height, x: g.x, y: g.y, row: g.row, col: g.col };
        }
      }
      this.close();
    } catch (err) {
      setText(this.note, err instanceof ApiError || err instanceof Error ? err.message : 'The formvis engine is offline (./formvis boot).');
    } finally { if (id) void api.largeForget(id); if (this.ticket === t) this.busy = false; }
  }
}
