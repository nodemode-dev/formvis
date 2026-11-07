import { readPsd, writePsd, type Layer as PsdLayer, type Psd } from 'ag-psd';
import { decodeTiffInBrowser } from '../../frontend/src/io/tiff-browser';
import { LAYER_BLEND_MODES, type BlendMode } from '../../frontend/src/engine/types';
import { detached } from './compose';
import { makeCanvas, pixelLayer, type Doc, type PixelLayer } from './model';

export const MAX_SIDE = 3200;
const EXTRA = new Set<string>(['negation', 'reflect', 'glow', 'xor']);
const KNOWN = new Set<string>(LAYER_BLEND_MODES.map((m) => m.id));

export interface Opened { doc: Doc; note: string }

const stem = (name: string): string => name.replace(/\.[^.]+$/, '') || 'Untitled';

function bitmapCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const s = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const c = makeCanvas(bitmap.width * s, bitmap.height * s);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

async function decodeToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const isTiff = /tiff?$/i.test((file as File).name ?? '') || file.type === 'image/tiff';
  const source = isTiff ? await decodeTiffInBrowser(file) : file;
  const bitmap = await createImageBitmap(source);
  try { return bitmapCanvas(bitmap); } finally { bitmap.close(); }
}

function flattenPsd(children: PsdLayer[] | undefined, hiddenAbove: boolean, out: PixelLayer[]): void {
  for (const c of children ?? []) {
    const hidden = hiddenAbove || c.hidden === true;
    if (c.children) { flattenPsd(c.children, hidden, out); continue; }
    if (!c.canvas || !c.canvas.width || !c.canvas.height) continue;
    const l = pixelLayer(c.name || 'Layer', c.canvas as HTMLCanvasElement, c.left ?? 0, c.top ?? 0);
    l.visible = !hidden;
    l.opacity = c.opacity ?? 1;
    const mode = (c.blendMode ?? 'normal').replace(/ /g, '-');
    l.blend = (KNOWN.has(mode) ? mode : 'normal') as BlendMode;
    out.push(l);
  }
}

export async function openFile(file: File): Promise<Opened> {
  const name = stem(file.name);
  if (/\.psd$/i.test(file.name)) {
    const psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true });
    const layers: PixelLayer[] = [];
    flattenPsd(psd.children, false, layers);
    if (!layers.length && psd.canvas) layers.push(pixelLayer('Background', psd.canvas as HTMLCanvasElement));
    if (!layers.length) throw new Error('This PSD has no pixel layers the demo can read.');
    const doc: Doc = { name, w: psd.width, h: psd.height, layers, active: layers[layers.length - 1].id };
    return { doc, note: `Opened ${layers.length} layer${layers.length === 1 ? '' : 's'} from the PSD.` };
  }
  const canvas = await decodeToCanvas(file);
  const l = pixelLayer('Background', canvas);
  return { doc: { name, w: canvas.width, h: canvas.height, layers: [l], active: l.id }, note: `Opened ${file.name} at ${canvas.width} by ${canvas.height}.` };
}

export async function placeFile(file: File, docW: number, docH: number): Promise<PixelLayer> {
  const canvas = await decodeToCanvas(file);
  const l = pixelLayer(stem(file.name), canvas);
  l.x = Math.round((docW - canvas.width) / 2);
  l.y = Math.round((docH - canvas.height) / 2);
  return l;
}

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'psd';
export const FORMAT_INFO: Record<ExportFormat, { mime: string; ext: string; label: string }> = {
  png: { mime: 'image/png', ext: 'png', label: 'PNG' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG' },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP' },
  psd: { mime: 'image/vnd.adobe.photoshop', ext: 'psd', label: 'PSD (layers)' },
};

export async function encode(doc: Doc, format: ExportFormat, quality: number): Promise<Blob> {
  const flat = detached(doc);
  if (format === 'psd') {
    const kept = doc.layers.filter((l): l is PixelLayer => l.kind === 'pixel');
    const children: PsdLayer[] = kept.map((l) => ({
      name: l.name, left: l.x, top: l.y, opacity: l.opacity, hidden: !l.visible,
      blendMode: (EXTRA.has(l.blend) ? 'normal' : l.blend.replace(/-/g, ' ')) as PsdLayer['blendMode'],
      canvas: l.canvas,
    }));
    const psd: Psd = { width: doc.w, height: doc.h, canvas: flat, children };
    const bytes = writePsd(psd, { generateThumbnail: false, compress: true });
    return new Blob([bytes], { type: FORMAT_INFO.psd.mime });
  }
  let source = flat;
  if (format === 'jpeg') {
    source = makeCanvas(flat.width, flat.height);
    const g = source.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, source.width, source.height);
    g.drawImage(flat, 0, 0);
  }
  return await new Promise<Blob>((done, fail) => source.toBlob((b) => (b ? done(b) : fail(new Error('This browser could not encode that format.'))), FORMAT_INFO[format].mime, quality));
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
