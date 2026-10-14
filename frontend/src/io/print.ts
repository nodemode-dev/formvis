import type { Engine } from '../engine';

/** Paper sizes in inches, portrait. */
export const PAPERS: ReadonlyArray<readonly [id: string, label: string, w: number, h: number]> = [
  ['letter', 'Letter', 8.5, 11], ['legal', 'Legal', 8.5, 14], ['a4', 'A4', 8.27, 11.69], ['a3', 'A3', 11.69, 16.54], ['tabloid', 'Tabloid', 11, 17],
];

/** What File > Print... asks for. Position and sizes are in inches; scale is a percentage. */
export interface PrintSettings { paper: string; landscape: boolean; center: boolean; top: number; left: number; scale: number; fit: boolean; selectedArea: boolean }

/** The settings Print... last used, which Print One Copy prints with; the dialog keeps this current. */
export const printSettings: PrintSettings = { paper: 'letter', landscape: false, center: true, top: 0, left: 0, scale: 100, fit: false, selectedArea: false };

export interface PrintLayout { paperW: number; paperH: number; width: number; height: number; x: number; y: number; scale: number }

/** The paper, the printed image's size (its pixels over the document's dpi, times the scale) and where it sits, all in inches. */
export function printLayout(s: PrintSettings, pxW: number, pxH: number, dpi: number): PrintLayout {
  const paper = PAPERS.find((p) => p[0] === s.paper) ?? PAPERS[0];
  const paperW = s.landscape ? paper[3] : paper[2], paperH = s.landscape ? paper[2] : paper[3];
  const inW = pxW / Math.max(1, dpi), inH = pxH / Math.max(1, dpi);
  const scale = s.fit ? Math.min(paperW / inW, paperH / inH) : Math.max(0.01, s.scale / 100);
  const width = inW * scale, height = inH * scale;
  return { paperW, paperH, width, height, scale, x: s.center ? (paperW - width) / 2 : s.left, y: s.center ? (paperH - height) / 2 : s.top };
}

/** The pixel region a print covers: the selection's bounds within the document when asked and present, else the whole document. */
export function printRegion(engine: Engine, s: PrintSettings): { x: number; y: number; w: number; h: number } | null {
  const p = engine.current;
  if (!p) return null;
  const sel = s.selectedArea ? p.selection?.rect : null;
  if (!sel) return { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
  const x = Math.max(0, sel.x), y = Math.max(0, sel.y), r = Math.min(p.doc.width, sel.x + sel.w), b = Math.min(p.doc.height, sel.y + sel.h);
  return r > x && b > y ? { x, y, w: r - x, h: b - y } : { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
}

/** Prints the flattened document: a print-only element at the computed size and position, `@page` set to the paper,
 *  the system print dialog through window.print(), then the element is removed. Nothing on screen changes: the element
 *  is display:none except in print media. */
export function printDocument(engine: Engine, s: PrintSettings): boolean {
  const p = engine.current, flat = engine.flattened(), reg = printRegion(engine, s);
  if (!p || !flat || !reg) return false;
  const L = printLayout(s, reg.w, reg.h, p.doc.resolution || 72);
  const canvas = document.createElement('canvas');
  canvas.width = reg.w; canvas.height = reg.h;
  canvas.getContext('2d')?.drawImage(flat as CanvasImageSource, reg.x, reg.y, reg.w, reg.h, 0, 0, reg.w, reg.h);
  canvas.style.cssText = `position:absolute;left:${L.x}in;top:${L.y}in;width:${L.width}in;height:${L.height}in;`;
  const host = document.createElement('div');
  host.id = 'fv-print';
  host.setAttribute('aria-hidden', 'true');
  host.dataset.widthIn = String(L.width); host.dataset.heightIn = String(L.height); host.dataset.paperW = String(L.paperW); host.dataset.paperH = String(L.paperH);
  host.appendChild(canvas);
  const style = document.createElement('style');
  style.textContent = `#fv-print{display:none}@page{size:${L.paperW}in ${L.paperH}in;margin:0}` +
    `@media print{html,body{margin:0!important;padding:0!important;background:#fff!important;overflow:visible!important}` +
    `body>*:not(#fv-print):not(style){display:none!important}` +
    `#fv-print{display:block!important;position:relative;width:${L.paperW}in;height:${L.paperH}in;overflow:hidden}}`;
  document.head.appendChild(style);
  document.body.appendChild(host);
  try { window.print(); } finally { host.remove(); style.remove(); }
  return true;
}
