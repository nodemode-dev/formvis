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
  private readonly preview = el<HTMLCanvasElement>('<canvas aria-label="Page preview" style="position:absolute;left:0;top:0;width:100%;height:100%"></canvas>');
  private thumb: { key: string; canvas: HTMLCanvasElement } | null = null;
  private readonly customW = numberRow('Paper width (in)', 1, 100, 0.1, (v) => { this.s.customW = v; this.refresh(); });
  private readonly customH = numberRow('Paper height (in)', 1, 100, 0.1, (v) => { this.s.customH = v; this.refresh(); });
  private readonly emulsion = checkRow('Emulsion Down', (v) => { this.s.emulsionDown = v; this.refresh(); });
  private readonly negative = checkRow('Negative', (v) => { this.s.negative = v; this.refresh(); });
  private readonly paper = selectRow('Paper size', PAPERS.map((p) => [p[0], p[1]] as const), (v) => { this.s.paper = v; this.refresh(); });
  private readonly orient = selectRow('Orientation', [['portrait', 'Portrait'], ['landscape', 'Landscape']], (v) => { this.s.landscape = v === 'landscape'; this.refresh(); });
  private readonly center = checkRow('Center Image', (v) => { this.s.center = v; this.refresh(); });
  private readonly top = numberRow('Top (in)', -100, 100, 0.1, (v) => { this.s.top = v; this.refresh(); });
  private readonly left = numberRow('Left (in)', -100, 100, 0.1, (v) => { this.s.left = v; this.refresh(); });
  private readonly scale = numberRow('Scale (%)', 1, 10000, 1, (v) => { this.s.scale = v; this.refresh(); });
  private readonly fit = checkRow('Scale to Fit Media', (v) => { this.s.fit = v; this.refresh(); });
  private readonly area = checkRow('Print Selected Area', (v) => { this.s.selectedArea = v; this.refresh(); });
  private readonly corner = checkRow('Corner Crop Marks', (v) => { this.s.cornerMarks = v; this.refresh(); });
  private readonly centre = checkRow('Center Crop Marks', (v) => { this.s.centerMarks = v; this.refresh(); });
  private readonly reg = checkRow('Registration Marks', (v) => { this.s.regMarks = v; this.refresh(); });
  private readonly desc = checkRow('Description', (v) => { this.s.description = v; this.refresh(); });
  private readonly labels = checkRow('Labels', (v) => { this.s.labels = v; this.refresh(); });
  private readonly handling = selectRow('Color Handling', [['printer', 'Printer Manages Colors'], ['formvis', 'formvis Manages Colors'], ['none', 'No Color Management']], (v) => { this.s.handling = v === 'formvis' ? 'formvis' : v === 'none' ? 'none' : 'printer'; this.refresh(); });
  private readonly profile = selectRow('Printer Profile', [['', 'Choose a profile']], (v) => { this.s.profile = v; });
  private readonly intent = selectRow('Rendering Intent', INTENTS.map(([v, t]) => [v, t] as const), (v) => { this.s.intent = v; });
  private readonly bpc = checkRow('Black Point Compensation', (v) => { this.s.bpc = v; });
  private readonly printBtn: HTMLButtonElement;

  constructor(private readonly engine: Engine, private readonly onPrint: (s: PrintSettings) => void, private readonly onPdf: (pdf: Blob, name: string) => void = () => undefined) {
    super('Print', 440);
    this.sheet.appendChild(this.preview);
    this.body.append(this.sheet, this.paper.el, this.customW.el, this.customH.el, this.orient.el, this.center.el, this.top.el, this.left.el, this.fit.el, this.scale.el, this.area.el,
      el('<p class="cv-note">Printing Marks</p>'), this.corner.el, this.centre.el, this.reg.el, this.desc.el, this.labels.el,
      el('<p class="cv-note">Functions</p>'), this.emulsion.el, this.negative.el,
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
    this.customW.set(this.s.customW); this.customH.set(this.s.customH); this.emulsion.set(this.s.emulsionDown); this.negative.set(this.s.negative);
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
    const k = 220 / Math.max(L.paperW, L.paperH);
    this.sheet.style.width = `${L.paperW * k}px`; this.sheet.style.height = `${L.paperH * k}px`;
    this.customW.el.hidden = this.customH.el.hidden = this.s.paper !== 'custom';
    renderPage(this.engine, eff, this.thumbFor(reg), L, 40, this.preview);
  }

  /** The printed region as a small picture for the page preview, kept while the region is the same and redrawn when the document changes. */
  private thumbFor(reg: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
    const p = this.engine.current, key = `${p?.id}:${reg.x},${reg.y},${reg.w},${reg.h}:${p?.history.revision ?? 0}`;
    if (this.thumb?.key === key) return this.thumb.canvas;
    const f = Math.min(1, 480 / Math.max(reg.w, reg.h)), c = this.thumb?.canvas ?? document.createElement('canvas');
    c.width = Math.max(1, Math.round(reg.w * f)); c.height = Math.max(1, Math.round(reg.h * f));
    const flat = this.engine.flattened(), g = c.getContext('2d');
    if (flat && g) { g.imageSmoothingQuality = 'high'; g.drawImage(flat as CanvasImageSource, reg.x, reg.y, reg.w, reg.h, 0, 0, c.width, c.height); }
    this.thumb = { key, canvas: c };
    return c;
  }
}
