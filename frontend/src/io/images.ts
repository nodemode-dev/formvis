import { headerResolution, headerSize } from './image-size';
import { FORMER_PROJECT_EXTENSIONS } from './legacy';
import { LIMITS, type ImportedImage } from '../engine';
import { deepFromU16, deepToLinear, rasterFromDeep } from '../engine/deep';
import type { DeepPixels } from '../engine/types';
import { api, serviceReady, type RawWhiteBalance } from './api';
import { readFileMeta } from './xmp';

const NATIVE = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;
/** Camera RAW (decoded by the engine's LibRaw, then opened into Develop). */
export const RAW_FILE = /\.(dng|cr2|cr3|crw|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|srw|x3f|3fr|iiq|rwl|mrw|kdc|dcr|erf|mef|mos)$/i;
const SERVER = /\.(heic|heif|hif|tiff?|dpx|qoi|tga|icb|vda|vst|ico|pbm|pgm|ppm|pnm|pam|fits|fit|fts)$/i;   // QOI, TGA, ICO, the Netpbm family and FITS (DEV_PLAN 34.7) are read by the engine (DEV_PLAN 34.1); ICO leaves the browser so the largest size opens
const RAW_ACCEPT = '.dng,.cr2,.cr3,.crw,.nef,.nrw,.arw,.srf,.sr2,.raf,.orf,.rw2,.pef,.srw,.x3f,.3fr,.iiq,.rwl,.mrw,.kdc,.dcr,.erf,.mef,.mos';
export const IMAGE_ACCEPT = `.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.svg,.heic,.heif,.tif,.tiff,.hdr,.exr,.dpx,.qoi,.tga,.ico,.pbm,.pgm,.ppm,.pnm,.pam,.fits,.fit,.fts,${RAW_ACCEPT},image/*`;   // .hdr, .exr: 32 bits (1.53.9); .dpx: film scans, 16 bits from the engine
export const PROJECT_ACCEPT = ['.fvd', '.fmv', ...FORMER_PROJECT_EXTENSIONS, '.canvasor', '.comp', '.zip', '.psd', '.psb', '.ora', '.kra', '.pdn', '.af', '.afphoto', '.afdesign', '.afpub'].join(',');   // OpenRaster (1.51.7)

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
