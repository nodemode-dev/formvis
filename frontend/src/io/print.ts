import type { Engine } from '../engine';
import { applyLut } from '../engine/colour-lut';
import { iccProfile } from '../engine/icc';
import { api } from './api';
import { toBase64 } from './icc-read';

/** Paper sizes in inches, portrait. */
export const PAPERS: ReadonlyArray<readonly [id: string, label: string, w: number, h: number]> = [
  ['letter', 'Letter', 8.5, 11], ['legal', 'Legal', 8.5, 14], ['a4', 'A4', 8.27, 11.69], ['a3', 'A3', 11.69, 16.54], ['tabloid', 'Tabloid', 11, 17],
  ['a5', 'A5', 5.83, 8.27], ['4x6', '4 x 6 in', 4, 6], ['5x7', '5 x 7 in', 5, 7], ['8x10', '8 x 10 in', 8, 10], ['custom', 'Custom', 0, 0],
];

/** What File > Print... asks for. Position and sizes are in inches; scale is a percentage. */
export interface PrintSettings {
  paper: string; landscape: boolean; center: boolean; top: number; left: number; scale: number; fit: boolean; selectedArea: boolean;
  cornerMarks: boolean; centerMarks: boolean; regMarks: boolean; description: boolean; labels: boolean;
  /** Functions: the page mirrored (Emulsion Down) and the picture inverted (Negative); the Custom paper's size in inches. */
  emulsionDown: boolean; negative: boolean; customW: number; customH: number;
  handling: 'printer' | 'formvis' | 'none'; profile: string; intent: string; bpc: boolean;
}

/** The settings Print... last used, which Print One Copy prints with; the dialog keeps this current. */
export const printSettings: PrintSettings = {
  paper: 'letter', landscape: false, center: true, top: 0, left: 0, scale: 100, fit: false, selectedArea: false,
  cornerMarks: false, centerMarks: false, regMarks: false, description: false, labels: false,
  emulsionDown: false, negative: false, customW: 8.5, customH: 11,
  handling: 'printer', profile: '', intent: 'relative', bpc: true,
};

/** Printing Marks (DEV_PLAN 29.3): black hairlines (0.25 pt) around the image, `k` pixels to the inch. Registration targets
 *  sit at the middle of each side, 0.25 in outside the image; the description and the name are set below it. */
export function drawMarks(ctx: CanvasRenderingContext2D, k: number, L: PrintLayout, s: PrintSettings, name: string, desc: string): void {
  const hair = Math.max(1, 0.25 / 72 * k), gap = 0.25 * k, len = 0.25 * k;
  const x0 = L.x * k, y0 = L.y * k, x1 = (L.x + L.width) * k, y1 = (L.y + L.height) * k, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  ctx.save();
  ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; ctx.lineWidth = hair;
  const line = (ax: number, ay: number, bx: number, by: number): void => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); };
  if (s.cornerMarks) for (const [cx, sx] of [[x0, -1], [x1, 1]] as const) for (const [cy, sy] of [[y0, -1], [y1, 1]] as const) {
    line(cx + sx * gap, cy, cx + sx * (gap + len), cy);
    line(cx, cy + sy * gap, cx, cy + sy * (gap + len));
  }
  if (s.centerMarks) {
    line(mx, y0 - gap - len, mx, y0 - gap); line(mx, y1 + gap, mx, y1 + gap + len);
    line(x0 - gap - len, my, x0 - gap, my); line(x1 + gap, my, x1 + gap + len, my);
  }
  if (s.regMarks) {
    const r = 0.08 * k, c = 0.125 * k;
    for (const [cx, cy] of [[mx, y0 - gap - c], [mx, y1 + gap + c], [x0 - gap - c, my], [x1 + gap + c, my]]) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      line(cx - c, cy, cx + c, cy); line(cx, cy - c, cx, cy + c);
    }
  }
  const text = [s.labels ? name : '', s.description ? desc : ''].filter(Boolean);
  if (text.length) {
    ctx.font = `${0.11 * k}px sans-serif`; ctx.textBaseline = 'top';
    text.forEach((t, i) => ctx.fillText(t.length > 160 ? `${t.slice(0, 160)}...` : t, x0, y1 + gap + len + 0.1 * k + i * 0.16 * k, Math.max(10, x1 - x0)));
  }
  ctx.restore();
}

/** The whole page, image and marks, on white at `k` pixels to the inch: what Save as PDF encodes. */
export function renderPage(engine: Engine, s: PrintSettings, image: CanvasImageSource, L: PrintLayout, k = 300, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? document.createElement('canvas'), pw = Math.round(L.paperW * k), ph = Math.round(L.paperH * k);
  if (c.width !== pw) c.width = pw;
  if (c.height !== ph) c.height = ph;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (s.emulsionDown) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.negative ? inverted(image as CanvasImageSource & { width: number; height: number }) : image, L.x * k, L.y * k, L.width * k, L.height * k);
  drawMarks(ctx, k, L, s, docName(engine), engine.current?.doc.meta?.description ?? '');
  ctx.restore();
  return c;
}

/** The picture inverted, on a new canvas (Negative). */
function inverted(src: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'difference';
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  return c;
}

function docName(engine: Engine): string { return (engine.current as unknown as { name?: string } | null)?.name ?? ''; }

export interface PrintLayout { paperW: number; paperH: number; width: number; height: number; x: number; y: number; scale: number }

/** The paper, the printed image's size (its pixels over the document's dpi, times the scale) and where it sits, all in inches. */
export function printLayout(s: PrintSettings, pxW: number, pxH: number, dpi: number): PrintLayout {
  const paper = PAPERS.find((p) => p[0] === s.paper) ?? PAPERS[0];
  const pw = paper[0] === 'custom' ? Math.max(1, s.customW) : paper[2], ph = paper[0] === 'custom' ? Math.max(1, s.customH) : paper[3];
  const paperW = s.landscape ? ph : pw, paperH = s.landscape ? pw : ph;
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
  if (s.handling === 'formvis' && s.profile) { void managedImage(engine, canvas, s).then((c) => placePage(engine, s, c, L)).catch(() => placePage(engine, s, canvas, L)); return true; }
  placePage(engine, s, canvas, L);
  return true;
}

/** The page image as the print would show it, for Save as PDF: the region, converted when formvis manages colours. */
export async function printedImage(engine: Engine, s: PrintSettings): Promise<{ image: HTMLCanvasElement; layout: PrintLayout } | null> {
  const p = engine.current, flat = engine.flattened(), reg = printRegion(engine, s);
  if (!p || !flat || !reg) return null;
  const L = printLayout(s, reg.w, reg.h, p.doc.resolution || 72);
  let canvas = document.createElement('canvas');
  canvas.width = reg.w; canvas.height = reg.h;
  canvas.getContext('2d')?.drawImage(flat as CanvasImageSource, reg.x, reg.y, reg.w, reg.h, 0, 0, reg.w, reg.h);
  if (s.handling === 'formvis' && s.profile) { try { canvas = await managedImage(engine, canvas, s); } catch { /* unconverted */ } }
  return { image: canvas, layout: L };
}

/** Color Management: the flattened pixels through the engine's profile conversion (LittleCMS) to the printer profile. A
 *  profile value is `rgb:` or `cmyk:` then the Convert to Profile choice; RGB goes through the colour table, CMYK to ink and back. */
async function managedImage(engine: Engine, src: HTMLCanvasElement, s: PrintSettings): Promise<HTMLCanvasElement> {
  const [space, choice] = [s.profile.slice(0, s.profile.indexOf(':')), s.profile.slice(s.profile.indexOf(':') + 1)];
  const icc = choice === 'srgb' ? '' : choice === 'display-p3' || choice === 'adobe-rgb' ? toBase64(iccProfile(choice)) : toBase64(await api.colourProfileBytes(choice.slice(3)));
  const source = engine.current?.doc.profile?.icc ?? '';
  const ctx = src.getContext('2d') as CanvasRenderingContext2D, img = ctx.getImageData(0, 0, src.width, src.height);
  if (space === 'cmyk') {
    const ink = await api.convertPixels(new Uint8Array(img.data.buffer.slice(0)), src.width, src.height, 'cmyk', icc, source, s.intent, s.bpc);
    const back = await api.convertPixels(ink, src.width, src.height, 'rgb', icc, '', s.intent, s.bpc);
    img.data.set(back.subarray(0, img.data.length));
  } else if (icc) {
    applyLut(img.data, await api.colourLut({ source: source ? { icc: source } : null, dest: { icc }, intent: s.intent, bpc: s.bpc }));
  }
  ctx.putImageData(img, 0, 0);
  return src;
}

function placePage(engine: Engine, s: PrintSettings, picture: HTMLCanvasElement, L: PrintLayout): void {
  const canvas = s.negative ? inverted(picture) : picture;
  canvas.style.cssText = `position:absolute;left:${L.x}in;top:${L.y}in;width:${L.width}in;height:${L.height}in;`;
  const marks = document.createElement('canvas'), k = 300;
  marks.width = Math.round(L.paperW * k); marks.height = Math.round(L.paperH * k);
  drawMarks(marks.getContext('2d') as CanvasRenderingContext2D, k, L, s, docName(engine), engine.current?.doc.meta?.description ?? '');
  marks.style.cssText = `position:absolute;left:0;top:0;width:${L.paperW}in;height:${L.paperH}in;`;
  const host = document.createElement('div');
  host.id = 'fv-print';
  host.setAttribute('aria-hidden', 'true');
  host.dataset.widthIn = String(L.width); host.dataset.heightIn = String(L.height); host.dataset.paperW = String(L.paperW); host.dataset.paperH = String(L.paperH);
  host.append(canvas, marks);
  const style = document.createElement('style');
  style.textContent = `#fv-print{display:none}@page{size:${L.paperW}in ${L.paperH}in;margin:0}` +
    `@media print{html,body{margin:0!important;padding:0!important;background:#fff!important;overflow:visible!important}` +
    `body>*:not(#fv-print):not(style){display:none!important}` +
    `#fv-print{display:block!important;position:relative;width:${L.paperW}in;height:${L.paperH}in;overflow:hidden${s.emulsionDown ? ';transform:scaleX(-1)' : ''}}}`;
  document.head.appendChild(style);
  document.body.appendChild(host);
  try { window.print(); } finally { host.remove(); style.remove(); }
}
