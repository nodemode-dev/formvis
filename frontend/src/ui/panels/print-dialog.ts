import type { Engine } from '../../engine';
import { PAPERS, printLayout, printRegion, printSettings, type PrintSettings } from '../../io/print';
import { Dialog } from '../dialogs';
import { el, q, setText } from '../dom';
import { checkRow, numberRow, selectRow } from './controls';

/** File > Print...: paper, orientation, position and scaled size, with a small drawing of the paper and the image on it. */
export class PrintDialog extends Dialog {
  private readonly s: PrintSettings = printSettings;
  private readonly note = el('<p class="cv-note"></p>');
  private readonly sheet = el<HTMLElement>('<div class="cv-print-sheet" style="position:relative;margin:6px auto;background:#fff;border:1px solid currentColor;box-sizing:content-box"></div>');
  private readonly mark = el<HTMLElement>('<div style="position:absolute;background:#7a8aa0;opacity:.85"></div>');
  private readonly paper = selectRow('Paper size', PAPERS.map((p) => [p[0], p[1]] as const), (v) => { this.s.paper = v; this.refresh(); });
  private readonly orient = selectRow('Orientation', [['portrait', 'Portrait'], ['landscape', 'Landscape']], (v) => { this.s.landscape = v === 'landscape'; this.refresh(); });
  private readonly center = checkRow('Center Image', (v) => { this.s.center = v; this.refresh(); });
  private readonly top = numberRow('Top (in)', -100, 100, 0.1, (v) => { this.s.top = v; this.refresh(); });
  private readonly left = numberRow('Left (in)', -100, 100, 0.1, (v) => { this.s.left = v; this.refresh(); });
  private readonly scale = numberRow('Scale (%)', 1, 10000, 1, (v) => { this.s.scale = v; this.refresh(); });
  private readonly fit = checkRow('Scale to Fit Media', (v) => { this.s.fit = v; this.refresh(); });
  private readonly area = checkRow('Print Selected Area', (v) => { this.s.selectedArea = v; this.refresh(); });
  private readonly printBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine, private readonly onPrint: (s: PrintSettings) => void) {
    super('Print', 440);
    this.sheet.appendChild(this.mark);
    this.body.append(this.sheet, this.paper.el, this.orient.el, this.center.el, this.top.el, this.left.el, this.fit.el, this.scale.el, this.area.el, this.note);
    this.button('Cancel', 'ghost', () => this.close());
    this.printBtn = this.button('Print', 'primary', () => { this.close(); this.onPrint({ ...this.s, selectedArea: this.s.selectedArea && this.hasSelection() }); }) as HTMLButtonElement;
    this.remember();   // the settings stay for the next print, and Print One Copy uses them
  }

  private hasSelection(): boolean { return !!this.engine.current?.selection; }

  show(): void {
    if (!this.engine.current || this.isOpen) return;
    this.paper.set(this.s.paper);
    this.orient.set(this.s.landscape ? 'landscape' : 'portrait');
    this.center.set(this.s.center); this.top.set(this.s.top); this.left.set(this.s.left);
    this.scale.set(this.s.scale); this.fit.set(this.s.fit); this.area.set(this.s.selectedArea);
    this.open(this.printBtn);
    this.refresh();
  }

  private refresh(): void {
    const d = this.engine.current?.doc;
    if (!d) return;
    const sel = this.hasSelection();
    const areaBox = q(this.area.el, 'input') as HTMLInputElement;
    areaBox.disabled = !sel;
    (q(this.top.el, 'input') as HTMLInputElement).disabled = this.s.center;
    (q(this.left.el, 'input') as HTMLInputElement).disabled = this.s.center;
    this.scale.input.disabled = this.s.fit;
    const eff = { ...this.s, selectedArea: this.s.selectedArea && sel };
    const reg = printRegion(this.engine, eff) ?? { x: 0, y: 0, w: d.width, h: d.height };
    const L = printLayout(eff, reg.w, reg.h, d.resolution || 72);
    setText(this.note, `Print size: ${L.width.toFixed(2)} in wide by ${L.height.toFixed(2)} in high (${Math.round(L.scale * 100)}% at ${d.resolution || 72} dpi)`);
    const k = 160 / Math.max(L.paperW, L.paperH);
    this.sheet.style.width = `${L.paperW * k}px`; this.sheet.style.height = `${L.paperH * k}px`;
    Object.assign(this.mark.style, { left: `${L.x * k}px`, top: `${L.y * k}px`, width: `${L.width * k}px`, height: `${L.height * k}px` });
  }
}
