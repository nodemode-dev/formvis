import type { Engine } from '../../engine';
import { api } from '../../io/api';
import { PAPERS, printedImage, printLayout, printRegion, printSettings, renderPage, type PrintSettings } from '../../io/print';
import { cmykChoices, INTENTS, rgbChoices } from './colour-dialogs';
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
  private readonly corner = checkRow('Corner Crop Marks', (v) => { this.s.cornerMarks = v; });
  private readonly centre = checkRow('Center Crop Marks', (v) => { this.s.centerMarks = v; });
  private readonly reg = checkRow('Registration Marks', (v) => { this.s.regMarks = v; });
  private readonly desc = checkRow('Description', (v) => { this.s.description = v; });
  private readonly labels = checkRow('Labels', (v) => { this.s.labels = v; });
  private readonly handling = selectRow('Color Handling', [['printer', 'Printer Manages Colors'], ['formvis', 'formvis Manages Colors']], (v) => { this.s.handling = v === 'formvis' ? 'formvis' : 'printer'; this.refresh(); });
  private readonly profile = selectRow('Printer Profile', [['', 'Choose a profile']], (v) => { this.s.profile = v; });
  private readonly intent = selectRow('Rendering Intent', INTENTS.map(([v, t]) => [v, t] as const), (v) => { this.s.intent = v; });
  private readonly bpc = checkRow('Black Point Compensation', (v) => { this.s.bpc = v; });
  private readonly printBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine, private readonly onPrint: (s: PrintSettings) => void, private readonly onPdf: (pdf: Blob, name: string) => void = () => undefined) {
    super('Print', 440);
    this.sheet.appendChild(this.mark);
    this.body.append(this.sheet, this.paper.el, this.orient.el, this.center.el, this.top.el, this.left.el, this.fit.el, this.scale.el, this.area.el,
      el('<p class="cv-note">Printing Marks</p>'), this.corner.el, this.centre.el, this.reg.el, this.desc.el, this.labels.el,
      el('<p class="cv-note">Color Management</p>'), this.handling.el, this.profile.el, this.intent.el, this.bpc.el, this.note);
    void this.fillProfiles();
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Save as PDF', 'ghost', () => void this.savePdf());
    this.printBtn = this.button('Print', 'primary', () => { this.close(); this.onPrint({ ...this.s, selectedArea: this.s.selectedArea && this.hasSelection() }); }) as HTMLButtonElement;
    this.remember();   // the settings stay for the next print, and Print One Copy uses them
  }

  /** The profiles Convert to Profile lists, RGB then CMYK; values carry the kind so printing knows how to convert. */
  private async fillProfiles(): Promise<void> {
    const list: Array<[string, string]> = [['', 'Choose a profile'], ...(await rgbChoices()).map(([v, t]) => [`rgb:${v}`, t] as [string, string]), ...(await cmykChoices()).map(([v, t]) => [`cmyk:${v}`, t] as [string, string])];
    const sel = q(this.profile.el, 'select') as HTMLSelectElement, keep = this.s.profile;
    sel.replaceChildren(...list.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
    if (list.some(([v]) => v === keep)) sel.value = keep;
  }

  /** A PDF of exactly what would print: the page at 300 dpi on white, through the engine's PDF encoder. */
  private async savePdf(): Promise<void> {
    const eff = { ...this.s, selectedArea: this.s.selectedArea && this.hasSelection() };
    try {
      setText(this.note, 'Making the PDF...');
      const r = await printedImage(this.engine, eff);
      if (!r) return;
      const page = renderPage(this.engine, eff, r.image, r.layout, 300);
      const png = await new Promise<Blob | null>((res) => page.toBlob(res, 'image/png'));
      if (!png) throw new Error('The page could not be drawn.');
      const pdf = await api.encode(png, 'pdf', 90, 300);
      const name = ((this.engine.current as unknown as { name?: string } | null)?.name ?? 'print').replace(/\.[^.]+$/, '') || 'print';
      this.onPdf(pdf, `${name}.pdf`);
      this.refresh();
    } catch (err) { setText(this.note, err instanceof Error ? err.message : 'The PDF could not be made.'); }
  }

  private hasSelection(): boolean { return !!this.engine.current?.selection; }

  show(): void {
    if (!this.engine.current || this.isOpen) return;
    this.paper.set(this.s.paper);
    this.orient.set(this.s.landscape ? 'landscape' : 'portrait');
    this.center.set(this.s.center); this.top.set(this.s.top); this.left.set(this.s.left);
    this.scale.set(this.s.scale); this.fit.set(this.s.fit); this.area.set(this.s.selectedArea);
    this.corner.set(this.s.cornerMarks); this.centre.set(this.s.centerMarks); this.reg.set(this.s.regMarks); this.desc.set(this.s.description); this.labels.set(this.s.labels);
    this.handling.set(this.s.handling); this.profile.set(this.s.profile); this.intent.set(this.s.intent); this.bpc.set(this.s.bpc);
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
    for (const r of [this.profile, this.intent, this.bpc]) for (const i of Array.from(r.el.querySelectorAll('select, input'))) (i as HTMLInputElement).disabled = this.s.handling !== 'formvis';
    const eff = { ...this.s, selectedArea: this.s.selectedArea && sel };
    const reg = printRegion(this.engine, eff) ?? { x: 0, y: 0, w: d.width, h: d.height };
    const L = printLayout(eff, reg.w, reg.h, d.resolution || 72);
    setText(this.note, `Print size: ${L.width.toFixed(2)} in wide by ${L.height.toFixed(2)} in high (${Math.round(L.scale * 100)}% at ${d.resolution || 72} dpi)`);
    const k = 160 / Math.max(L.paperW, L.paperH);
    this.sheet.style.width = `${L.paperW * k}px`; this.sheet.style.height = `${L.paperH * k}px`;
    Object.assign(this.mark.style, { left: `${L.x * k}px`, top: `${L.y * k}px`, width: `${L.width * k}px`, height: `${L.height * k}px` });
  }
}
