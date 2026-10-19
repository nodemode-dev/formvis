import { headerResolution, headerSize, implausibleSize } from './image-size';
import { headerPalette } from './palette-header';
import { jpegExtras } from './jpeg-resources';
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
const SERVER = /\.(heic|heif|hif|tiff?|dpx|cin|dds|wbmp|qoi|tga|icb|vda|vst|ico|pcx|xpm|pbm|pgm|ppm|pnm|pam|pfm|fits|fit|fts)$/i;   // QOI, TGA, ICO, the Netpbm family and FITS (DEV_PLAN 34.7) are read by the engine (DEV_PLAN 34.1); ICO leaves the browser so the largest size opens
const RAW_ACCEPT = '.dng,.cr2,.cr3,.crw,.nef,.nrw,.arw,.srf,.sr2,.raf,.orf,.rw2,.pef,.srw,.x3f,.3fr,.iiq,.rwl,.mrw,.kdc,.dcr,.erf,.mef,.mos';
export const IMAGE_ACCEPT = `.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.svg,.heic,.heif,.tif,.tiff,.hdr,.exr,.dpx,.cin,.dds,.wbmp,.qoi,.tga,.ico,.pcx,.xpm,.pbm,.pgm,.ppm,.pnm,.pam,.pfm,.fits,.fit,.fts,${RAW_ACCEPT},image/*`;   // .hdr, .exr: 32 bits (1.53.9); .dpx: film scans, 16 bits from the engine
export const PROJECT_ACCEPT = ['.fvd', '.fmv', ...FORMER_PROJECT_EXTENSIONS, '.canvasor', '.comp', '.zip', '.psd', '.psb', '.psdt', '.ora', '.kra', '.krz', '.pdn', '.af', '.afphoto', '.afdesign', '.afpub'].join(',');   // OpenRaster (1.51.7)

const FRONT_MAGIC: Array<[string, number, string]> = [['FUJIFILMCCD-RAW', 0, 'raf'], ['IIRO', 0, 'orf'], ['IIRS', 0, 'orf'], ['MMOR', 0, 'orf'], ['IIU\0', 0, 'rw2'], ['\0MRM', 0, 'mrw'], ['FOVb', 0, 'x3f'], ['HEAPCCDR', 6, 'crw'], ['ftypcrx ', 4, 'cr3']];

/** The raw family a file's first bytes show ("dng", "cr2", "raf" and so on), or null. A DNG is a TIFF with the DNGVersion tag in
 *  its first directory; a CR2 is a TIFF with "CR" at byte 8. */
export async function sniffRaw(file: Blob): Promise<string | null> {
  const buf = new Uint8Array(await file.slice(0, 1 << 16).arrayBuffer());
  const text = (at: number, n: number): string => String.fromCharCode(...buf.subarray(at, at + n));
  for (const [magic, at, kind] of FRONT_MAGIC) if (text(at, magic.length) === magic) return kind;
  const le = text(0, 2) === 'II';
  if (!le && text(0, 2) !== 'MM') return null;
  const v = new DataView(buf.buffer);
  if (v.byteLength < 16 || v.getUint16(2, le) !== 42) return null;
  if (text(8, 2) === 'CR') return 'cr2';
  const at = v.getUint32(4, le);
  if (at + 2 > v.byteLength) return null;
  const n = Math.min(v.getUint16(at, le), 512);
  for (let i = 0; i < n && at + 14 + i * 12 <= v.byteLength; i++) if (v.getUint16(at + 2 + i * 12, le) === 50706) return 'dng';
  return null;
}

/** A file that is a camera RAW by its bytes but not by its name (a TIFF, a file with no extension) comes back renamed with the
 *  right extension, so the rest of the open path treats it as a RAW; any other file comes back as it was. */
export async function nameRawByContent(file: File): Promise<File> {
  if (RAW_FILE.test(file.name) || !/(\.(tiff?|bin|dat|raw)|^[^.]*)$/i.test(file.name)) return file;
  const kind = await sniffRaw(file).catch(() => null);
  return kind ? new File([file], `${file.name.replace(/\.[^.]*$/, '')}.${kind}`, { type: file.type, lastModified: file.lastModified }) : file;
}

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
export async function decodeHdr(file: Blob, name: string, got?: Awaited<ReturnType<typeof api.decodeDeep>>): Promise<ImportedImage> {
  const d = got ?? await api.decodeDeep(file, name);
  const deep: DeepPixels = d.depth === 32 ? { mode: 'rgb', n: 3, width: d.width, height: d.height, data: d.data as Float32Array } : deepToLinear(deepFromU16(d.data as Uint16Array, d.width, d.height));
  if (d.width > LIMITS.side || d.height > LIMITS.side || d.width * d.height > LIMITS.pixels) throw new Error(`${name} exceeds the 30,000 px side or ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel limit.`);
  return { source: rasterFromDeep(deep, true).canvas as CanvasImageSource, width: d.width, height: d.height, name, deep };
}

const DEEP_PLACE = /\.(png|tiff?|heic|heif|hif|dpx|cin|pbm|pgm|ppm|pnm|pam|pfm|fits?|fts)$/i;

/** The bits a channel a HEIF or HEIC declares in its HEVC configuration box; 8 where the file names none. */
export async function heifBits(file: Blob): Promise<number> {
  const b = new Uint8Array(await file.slice(0, 1 << 18).arrayBuffer());
  for (let i = 0; i + 26 < b.length; i++) if (b[i] === 0x68 && b[i + 1] === 0x76 && b[i + 2] === 0x63 && b[i + 3] === 0x43) return (b[i + 4 + 17] & 7) + 8;
  return 8;
}

/** A 16 or 32 bit picture (PNG, TIFF, HEIC, DPX, Netpbm, PFM, FITS) as a layer that keeps its depth, for a document deeper
 *  than 8 bits; null where the file holds 8 bits or the engine cannot read it deep, so it is placed the usual way. */
export async function decodeDeepLayer(file: Blob, name: string): Promise<ImportedImage | null> {
  if (!DEEP_PLACE.test(name)) return null;
  if (/\.png$/i.test(name)) { const head = new Uint8Array(await file.slice(0, 26).arrayBuffer()); if (head[24] !== 16) return null; }
  if (/\.(heic|heif|hif)$/i.test(name) && (await heifBits(file)) <= 8) return null;
  const d = await api.decodeDeep(file, name);
  if (d.depth === 8) return null;
  return decodeHdr(file, name, d);
}

/** A Targa that carries real alpha as an opaque picture (colours under zero alpha kept) plus its alpha plane as one byte a
 *  pixel; null for a Targa with no transparency or with the engine not running. */
export async function decodeTgaSplit(file: Blob, name: string): Promise<{ image: ImportedImage; alpha: Uint8Array } | null> {
  const s = await api.decodeSplit(file, name);
  if (!s) return null;
  const image = await decodeImage(s.rgb, name.replace(/\.[^.]+$/, '.png'));
  const plane = await bitmapOf(s.alpha), surface = createSurface(s.width, s.height), ctx = ctxOf(surface);
  ctx.drawImage(plane as CanvasImageSource, 0, 0);
  const rgba = ctx.getImageData(0, 0, s.width, s.height).data, alpha = new Uint8Array(s.width * s.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4];
  return { image: { ...image, name: name.replace(/\.[^.]+$/, '') }, alpha };
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

/** A failed allocation as the browser reports it: a RangeError, or words about memory or an allocation. */
export function outOfMemory(err: unknown): boolean {
  return err instanceof RangeError || (err instanceof Error && /out of memory|allocation failed|array buffer allocation/i.test(err.message));
}

export async function decodeImage(file: Blob, name: string, raw = false, rawWb?: RawWhiteBalance): Promise<ImportedImage> {
  if (HDR_FILE.test(name)) { const { deep: _deep, ...flat } = await decodeHdr(file, name); return flat; }
  const size = await headerSize(file);
  const bomb = size ? await implausibleSize(file, size) : null;
  if (bomb) throw new Error(`${name} was not opened. ${bomb}`);
  if (size && (size.width > LIMITS.side || size.height > LIMITS.side || size.width * size.height > LIMITS.pixels)) throw new LargePictureError(file, name, size.width, size.height);
  const server = SERVER.test(name) || RAW_FILE.test(name) || /image\/(heic|heif|tiff)/.test(file.type);
  let source: ImportedImage['source'] & { width: number; height: number };
  // 36.19: with the engine service not running a TIFF is read in the browser (utif2); the rest of the engine's formats wait for it.
  const serverBlob = async (): Promise<Blob> => (/\.tiff?$/i.test(name) || file.type === 'image/tiff') && !(await serviceReady()) ? (await import('./tiff-browser')).decodeTiffInBrowser(file) : api.decode(file, name, 0, undefined, rawWb);
  try { source = await bitmapOf(server ? await serverBlob() : file, raw && (!server || /\.tiff?$/i.test(name))); } catch (err) {
    if (outOfMemory(err)) throw new Error(`${name} could not be opened: this computer ran out of memory decoding${size ? ` a ${size.width} by ${size.height} picture` : ' it'}. Close other documents or pictures and try again, or open a smaller copy.`);
    if (server) throw err;
    try { source = await bitmapOf(await api.decode(file, name)); } catch (again) {
      if (outOfMemory(again)) throw new Error(`${name} could not be opened: this computer ran out of memory decoding${size ? ` a ${size.width} by ${size.height} picture` : ' it'}. Close other documents or pictures and try again, or open a smaller copy.`);
      throw again;
    }
  }
  if (source.width > LIMITS.side || source.height > LIMITS.side || source.width * source.height > LIMITS.pixels) {
    throw new Error(`${name} exceeds the 30,000 px side or ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel limit.`);
  }
  const meta = await readFileMeta(file);   // File Info and the camera's record (29.2)
  const resolution = RAW_FILE.test(name) ? null : await headerResolution(file);
  const table = /\.(png|bmp)$/i.test(name) && !server ? await headerPalette(file) : null;
  const jpeg = /\.jpe?g$/i.test(name) ? await jpegExtras(file) : null;
  return { source, width: source.width, height: source.height, name, ...(meta ? { meta } : {}), ...(resolution ? { resolution } : {}), ...(jpeg?.guides.length ? { guides: jpeg.guides } : {}), ...(jpeg?.truncated ? { warning: `${name} ends before its last data: the part that could be read opened, the rest is missing.` } : {}), ...(table ? { palette: table.colors, ...(table.transparent >= 0 ? { transparentIndex: table.transparent } : {}) } : {}) };
}
