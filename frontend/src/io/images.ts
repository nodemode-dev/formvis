import { headerResolution, headerSize } from './image-size';
import { FORMER_PROJECT_EXTENSIONS } from './legacy';
import { LIMITS, type ImportedImage } from '../engine';
import { deepFromU16, deepToLinear, rasterFromDeep } from '../engine/deep';
import type { DeepPixels } from '../engine/types';
import { createSurface, ctxOf } from '../engine/surface';
import { api, serviceReady, type RawWhiteBalance } from './api';
import { readFileMeta } from './xmp';

const NATIVE = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;
/** Camera RAW (decoded by the engine's LibRaw, then opened into Develop). */
export const RAW_FILE = /\.(dng|cr2|cr3|crw|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|srw|x3f|3fr|iiq|rwl|mrw|kdc|dcr|erf|mef|mos)$/i;
const SERVER = /\.(heic|heif|hif|tiff?|dpx|cin|dds|wbmp|qoi|tga|icb|vda|vst|ico|pcx|xpm|pbm|pgm|ppm|pnm|pam|fits|fit|fts)$/i;   // QOI, TGA, ICO, the Netpbm family and FITS (DEV_PLAN 34.7) are read by the engine (DEV_PLAN 34.1); ICO leaves the browser so the largest size opens
const RAW_ACCEPT = '.dng,.cr2,.cr3,.crw,.nef,.nrw,.arw,.srf,.sr2,.raf,.orf,.rw2,.pef,.srw,.x3f,.3fr,.iiq,.rwl,.mrw,.kdc,.dcr,.erf,.mef,.mos';
export const IMAGE_ACCEPT = `.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.svg,.heic,.heif,.tif,.tiff,.hdr,.exr,.dpx,.cin,.dds,.wbmp,.qoi,.tga,.ico,.pcx,.xpm,.pbm,.pgm,.ppm,.pnm,.pam,.fits,.fit,.fts,${RAW_ACCEPT},image/*`;   // .hdr, .exr: 32 bits (1.53.9); .dpx: film scans, 16 bits from the engine
export const PROJECT_ACCEPT = ['.fvd', '.fmv', ...FORMER_PROJECT_EXTENSIONS, '.canvasor', '.comp', '.zip', '.psd', '.psb', '.psdt', '.ora', '.kra', '.pdn', '.af', '.afphoto', '.afdesign', '.afpub'].join(',');   // OpenRaster (1.51.7)

export const isImageFile = (f: File): boolean => f.type.startsWith('image/') || NATIVE.test(f.name) || SERVER.test(f.name) || RAW_FILE.test(f.name) || /\.(hdr|exr)$/i.test(f.name);
/** `.comp` is opened so its owners can move their work to formvis; formvis never writes it (the owner's decision, 2026-09-25). */
export const isProjectFile = (f: File): boolean => PROJECT_ACCEPT.split(',').some((x) => f.name.toLowerCase().endsWith(x));

function viaElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const settle = (finish: () => void): void => { URL.revokeObjectURL(url); finish(); };
    img.onload = () => settle(() => resolve(img));
    img.onerror = () => settle(() => reject(new Error('decode failed')));
    img.src = url;
  });
}

async function bitmapOf(blob: Blob, raw = false): Promise<ImportedImage['source'] & { width: number; height: number }> {
  if (raw) return createImageBitmap(blob, { colorSpaceConversion: 'none' });   // the numbers as stored, for a kept profile (1.53.5)
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    const img = await viaElement(blob);
    if (!img.naturalWidth || !img.naturalHeight) { img.width = 1024; img.height = 1024; }
    return img;
  }
}

/** A picture larger than formvis edits in one piece (1.52.7), found from its header before anything is decoded. */
export class LargePictureError extends Error {
  constructor(readonly file: Blob, readonly picture: string, readonly width: number, readonly height: number) { super(`${picture} is ${width} by ${height}, larger than formvis edits in one piece.`); }
}

const HDR_FILE = /\.(hdr|exr)$/i;

/** An OpenEXR or Radiance HDR from the engine as linear floats (`deep`) with the 8-bit rendition clipped as converting the
 *  opened picture to 8 bits does (no exposure change), so it can be placed at the depth of any document. */
export async function decodeHdr(file: Blob, name: string): Promise<ImportedImage> {
  const d = await api.decodeDeep(file, name);
  const deep: DeepPixels = d.depth === 32 ? { mode: 'rgb', n: 3, width: d.width, height: d.height, data: d.data as Float32Array } : deepToLinear(deepFromU16(d.data as Uint16Array, d.width, d.height));
  if (d.width > LIMITS.side || d.height > LIMITS.side || d.width * d.height > LIMITS.pixels) throw new Error(`${name} exceeds the 30,000 px side or ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel limit.`);
  return { source: rasterFromDeep(deep, true).canvas as CanvasImageSource, width: d.width, height: d.height, name, deep };
}

/** The frame count an animated PNG declares in its acTL chunk (before the first IDAT), or 0 for a still PNG. */
export async function apngFrames(file: Blob): Promise<number> {
  const b = new Uint8Array(await file.slice(0, 65536).arrayBuffer()), v = new DataView(b.buffer);
  const type = (i: number): string => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  if (b.length < 16 || type(1) !== 'PNG\r') return 0;
  for (let i = 8; i + 12 <= b.length;) {
    const len = v.getUint32(i), t = type(i + 4);
    if (t === 'acTL') return i + 16 <= b.length ? v.getUint32(i + 8) : 0;
    if (t === 'IDAT' || t === 'IEND') return 0;
    i += len + 12;
  }
  return 0;
}

/** The size an SVG declares in its root tag (width and height, else the viewBox), or null when it declares none. */
export async function svgSize(file: Blob): Promise<{ width: number; height: number } | null> {
  const tag = /<svg\b[^>]*>/i.exec(await file.slice(0, 8192).text())?.[0] ?? '';
  const num = (n: string): number => { const m = new RegExp(`\\s${n}\\s*=\\s*["']\\s*([0-9.]+)\\s*(?:px)?\\s*["']`, 'i').exec(tag); return m ? Number(m[1]) : 0; };
  let width = num('width'), height = num('height');
  const vb = /\sviewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i.exec(tag);
  if (vb) {
    const vw = Number(vb[1]), vh = Number(vb[2]);
    if (!width && !height) { width = vw; height = vh; } else if (!width && vh) width = height * vw / vh; else if (!height && vw) height = width * vh / vw;
  }
  return width > 0 && height > 0 ? { width, height } : null;
}

/** An SVG drawn by the browser at `width` pixels across (the height follows its shape), so it is sharp at the size chosen. */
export async function rasteriseSvg(file: Blob, name: string, width: number): Promise<ImportedImage> {
  const size = (await svgSize(file)) ?? { width: 1024, height: 1024 };
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(width * size.height / size.width));
  if (w > LIMITS.side || h > LIMITS.side || w * h > LIMITS.pixels) throw new Error(`${name} at ${w} by ${h} exceeds the 30,000 px side or ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel limit.`);
  const img = await viaElement(new Blob([file], { type: 'image/svg+xml' }));
  const canvas = createSurface(w, h);
  ctxOf(canvas).drawImage(img, 0, 0, w, h);
  return { source: canvas as CanvasImageSource, width: w, height: h, name };
}

export interface DecodedFrames { width: number; height: number; plays: number; frames: Array<{ source: ImportedImage['source']; delay: number }> }

/** An animated GIF or WebP's frames from the engine, or null for a file of one frame or with the engine not running (it
 *  then opens as the browser shows it, frame 1). */
export async function decodeFrames(file: Blob, name: string): Promise<DecodedFrames | null> {
  let got: Awaited<ReturnType<typeof api.imageFrames>>;
  try { got = await api.imageFrames(file, name); } catch (err) {
    if (!(await serviceReady())) return null;
    throw err;
  }
  if (!got) return null;
  if (got.width > LIMITS.side || got.height > LIMITS.side || got.width * got.height * got.frames.length > LIMITS.pixels) throw new Error(`${name} exceeds the 30,000 px side or ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel limit.`);
  const frames: DecodedFrames['frames'] = [];
  for (const f of got.frames) frames.push({ source: await bitmapOf(f.blob), delay: f.delay });
  return { width: got.width, height: got.height, plays: got.plays, frames };
}

export async function decodeImage(file: Blob, name: string, raw = false, rawWb?: RawWhiteBalance): Promise<ImportedImage> {
  if (HDR_FILE.test(name)) { const { deep: _deep, ...flat } = await decodeHdr(file, name); return flat; }
  const size = await headerSize(file);
  if (size && (size.width > LIMITS.side || size.height > LIMITS.side || size.width * size.height > LIMITS.pixels)) throw new LargePictureError(file, name, size.width, size.height);
  const server = SERVER.test(name) || RAW_FILE.test(name) || /image\/(heic|heif|tiff)/.test(file.type);
  let source: ImportedImage['source'] & { width: number; height: number };
  // 36.19: with the engine service not running a TIFF is read in the browser (utif2); the rest of the engine's formats wait for it.
  const serverBlob = async (): Promise<Blob> => (/\.tiff?$/i.test(name) || file.type === 'image/tiff') && !(await serviceReady()) ? (await import('./tiff-browser')).decodeTiffInBrowser(file) : api.decode(file, name, 0, undefined, rawWb);
  try { source = await bitmapOf(server ? await serverBlob() : file, raw && !server); } catch (err) {
    if (server) throw err;
    source = await bitmapOf(await api.decode(file, name));
  }
  if (source.width > LIMITS.side || source.height > LIMITS.side || source.width * source.height > LIMITS.pixels) {
    throw new Error(`${name} exceeds the 30,000 px side or ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel limit.`);
  }
  const meta = await readFileMeta(file);   // File Info and the camera's record (29.2)
  const resolution = RAW_FILE.test(name) ? null : await headerResolution(file);
  return { source, width: source.width, height: source.height, name, ...(meta ? { meta } : {}), ...(resolution ? { resolution } : {}) };
}
