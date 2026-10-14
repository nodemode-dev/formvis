import type { Engine } from '../../engine';
import type { RGB } from '../../engine/types';
import { Dialog } from '../dialogs';
import { selectRow, type Row } from './controls';

const COLS = 16, CELLS = 256, SWATCH = 20;
const hex = (c: RGB): string => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** Black Body: black through red and yellow to white, 256 steps. */
function blackBody(): RGB[] {
  return Array.from({ length: CELLS }, (_, i) => {
    const t = i / 255;
    return { r: clamp(t * 3 * 255), g: clamp((t * 3 - 1) * 255), b: clamp((t * 3 - 2) * 255) };
  });
}
const grayscale = (): RGB[] => Array.from({ length: CELLS }, (_, i) => ({ r: i, g: i, b: i }));
/** Spectrum: hue sweep at full saturation, 256 steps. */
function spectrum(): RGB[] {
  return Array.from({ length: CELLS }, (_, i) => {
    const h = (i / 256) * 6, k = Math.floor(h), f = h - k, up = clamp(f * 255), down = clamp((1 - f) * 255);
    return ([{ r: 255, g: up, b: 0 }, { r: down, g: 255, b: 0 }, { r: 0, g: 255, b: up }, { r: 0, g: down, b: 255 }, { r: up, g: 0, b: 255 }, { r: 255, g: 0, b: down }] as RGB[])[k % 6];
  });
}
const cube = (): RGB[] => { const o: RGB[] = []; for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) o.push({ r: r * 51, g: g * 51, b: b * 51 }); return o; };
/** System (Mac OS): the 6 by 6 by 6 colour cube then 40 greys, an approximation of the classic 8-bit system table. */
function systemMac(): RGB[] {
  const o = cube();
  for (let i = 0; o.length < CELLS; i++) { const v = clamp(((i + 1) / 41) * 255); o.push({ r: v, g: v, b: v }); }
  return o;
}
/** System (Windows): the 16 VGA colours, the 6 by 6 by 6 colour cube and 24 greys, an approximation of the Windows 8-bit table. */
function systemWindows(): RGB[] {
  const vga = [0x000000, 0x800000, 0x008000, 0x808000, 0x000080, 0x800080, 0x008080, 0xc0c0c0, 0x808080, 0xff0000, 0x00ff00, 0xffff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xffffff];
  const o: RGB[] = vga.map((n) => ({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }));
  o.push(...cube());
  for (let i = 0; o.length < CELLS; i++) { const v = clamp(((i + 1) / 25) * 255); o.push({ r: v, g: v, b: v }); }
  return o;
}
const TABLES: Record<string, () => RGB[]> = { black: blackBody, gray: grayscale, spectrum, mac: systemMac, windows: systemWindows };

/** Reads an Adobe Color Table: 768 bytes of RGB, optionally a 16-bit count and a 16-bit transparent index (772 bytes). */
export function parseAct(buf: ArrayBuffer): RGB[] | null {
  const b = new Uint8Array(buf);
  if (b.length !== 768 && b.length !== 772) return null;
  let n = 256;
  if (b.length === 772) { n = (b[768] << 8) | b[769]; if (n < 1 || n > 256) n = 256; }
  return Array.from({ length: n }, (_, i) => ({ r: b[i * 3], g: b[i * 3 + 1], b: b[i * 3 + 2] }));
}
/** Writes an Adobe Color Table of 772 bytes: the palette padded with black to 256, then the count and no transparent index. */
export function writeAct(pal: readonly RGB[]): Uint8Array {
  const b = new Uint8Array(772);
  pal.slice(0, 256).forEach((c, i) => { b[i * 3] = c.r; b[i * 3 + 1] = c.g; b[i * 3 + 2] = c.b; });
  const n = Math.min(256, pal.length);
  b[768] = n >> 8; b[769] = n & 255; b[770] = 0xff; b[771] = 0xff;
  return b;
}

/** Image > Mode > Color Table... (DEV_PLAN 31.4): the Indexed Color document's palette as a fixed 16 by 16 grid of swatches. */
export class ColorTableDialog extends Dialog {
  private pal: RGB[] = [];
  private readonly tableRow: Row<string>;
  private readonly okBtn: HTMLButtonElement;
  private readonly grid: HTMLElement;
  private readonly cells: HTMLButtonElement[] = [];
  private readonly picker: HTMLInputElement;
  private readonly file: HTMLInputElement;
  private readonly note: HTMLElement;
  private editing = -1;

  constructor(private readonly engine: Engine) {
    super('Color Table', 16 * SWATCH + 15 + 2 * 24 + 8);
    this.tableRow = selectRow('Table', [['custom', 'Custom'], ['black', 'Black Body'], ['gray', 'Grayscale'], ['spectrum', 'Spectrum'], ['mac', 'System (Mac OS)'], ['windows', 'System (Windows)']], (v) => {
      const make = TABLES[v];
      if (make) { this.pal = make(); this.draw(); }
    });
    this.grid = document.createElement('div');
    this.grid.style.cssText = `display:grid;grid-template-columns:repeat(${COLS},${SWATCH}px);grid-auto-rows:${SWATCH}px;gap:1px;margin:8px 0;width:max-content`;
    for (let i = 0; i < CELLS; i++) {
      const c = document.createElement('button');
      c.type = 'button'; c.style.cssText = `width:${SWATCH}px;height:${SWATCH}px;padding:0;border:1px solid var(--cv-border, #555);box-sizing:border-box;background:transparent`;
      c.addEventListener('click', () => this.pick(i));
      this.cells.push(c); this.grid.append(c);
    }
    this.picker = document.createElement('input'); this.picker.type = 'color';
    this.picker.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
    this.picker.setAttribute('aria-label', 'Entry colour');
    this.picker.addEventListener('input', () => { if (this.editing < 0) return; this.pal[this.editing] = fromHex(this.picker.value); this.tableRow.set('custom'); this.paint(this.editing); this.note.textContent = this.info(); });
    this.file = document.createElement('input'); this.file.type = 'file'; this.file.accept = '.act'; this.file.hidden = true;
    this.file.addEventListener('change', () => { const f = this.file.files?.[0]; this.file.value = ''; if (f) void this.load(f); });
    this.note = document.createElement('p'); this.note.className = 'cv-note'; this.note.style.cssText = 'min-height:1.4em;margin:0';
    this.body.append(this.tableRow.el, this.grid, this.note, this.picker, this.file);
    this.button('Load...', 'ghost', () => this.file.click());
    this.button('Save...', 'ghost', () => this.save());
    this.button('Cancel', 'ghost', () => this.close());
    this.okBtn = this.button('OK', 'primary', () => { const p = this.pal.map((c) => ({ ...c })); this.close(); this.engine.setPalette(p); });
  }

  show(): void {
    if (this.isOpen) return;
    const cur = this.engine.current?.doc.palette;
    if (!cur || this.engine.current?.doc.mode !== 'indexed') return;
    this.pal = cur.map((c) => ({ ...c }));
    this.tableRow.set('custom');
    this.draw();
    this.open(this.okBtn);
  }

  private info(): string { return `${this.pal.length} colors`; }
  private paint(i: number): void {
    const c = this.cells[i], e = this.pal[i];
    c.disabled = !e; c.style.background = e ? hex(e) : 'transparent'; c.style.cursor = e ? 'pointer' : 'default';
    c.title = e ? `${i}: ${hex(e)}` : ''; c.setAttribute('aria-label', e ? `Entry ${i}, ${hex(e)}` : `Entry ${i}, unused`);
  }
  private draw(): void { for (let i = 0; i < CELLS; i++) this.paint(i); this.note.textContent = this.info(); }
  private pick(i: number): void {
    if (!this.pal[i]) return;
    this.editing = i; this.picker.value = hex(this.pal[i]);
    this.picker.style.pointerEvents = 'auto'; this.picker.click(); this.picker.style.pointerEvents = 'none';
  }
  private async load(f: File): Promise<void> {
    const pal = parseAct(await f.arrayBuffer());
    if (!pal) { this.note.textContent = 'Not an Adobe Color Table (.act) file.'; return; }
    this.pal = pal; this.tableRow.set('custom'); this.draw();
  }
  private save(): void {
    const bytes = writeAct(this.pal), url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer],{ type: 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = 'palette.act'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
