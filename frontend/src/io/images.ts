import { headerSize } from './image-size';
import { FORMER_PROJECT_EXTENSIONS } from './legacy';
import { LIMITS, type ImportedImage } from '../engine';
import { api } from './api';

const NATIVE = /\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i;
/** Camera RAW (decoded by the engine's LibRaw, then opened into Develop, as Photoshop opens them into Camera Raw). */
export const RAW_FILE = /\.(dng|cr2|cr3|crw|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|srw|x3f|3fr|iiq|rwl|mrw|kdc|dcr|erf|mef|mos)$/i;
const SERVER = /\.(heic|heif|hif|tiff?)$/i;
const RAW_ACCEPT = '.dng,.cr2,.cr3,.crw,.nef,.nrw,.arw,.srf,.sr2,.raf,.orf,.rw2,.pef,.srw,.x3f,.3fr,.iiq,.rwl,.mrw,.kdc,.dcr,.erf,.mef,.mos';
export const IMAGE_ACCEPT = `.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.svg,.heic,.heif,.tif,.tiff,.hdr,.exr,${RAW_ACCEPT},image/*`;   // .hdr, .exr: 32 bits (1.53.9)
export const PROJECT_ACCEPT = ['.fmv', ...FORMER_PROJECT_EXTENSIONS, '.canvasor', '.comp', '.zip', '.psd', '.psb', '.ora'].join(',');   // OpenRaster (1.51.7)

export const isImageFile = (f: File): boolean => f.type.startsWith('image/') || NATIVE.test(f.name) || SERVER.test(f.name) || RAW_FILE.test(f.name) || /\.(hdr|exr)$/i.test(f.name);
/** `.comp` is opened so its owners can move their work to formvis; formvis never writes it (the owner's decision, 2026-09-25). */
export const isProjectFile = (f: File): boolean => PROJECT_ACCEPT.split(',').some((x) => f.name.toLowerCase().endsWith(x));

function viaElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

async function bitmapOf(blob: Blob, raw = false): Promise<ImportedImage['source'] & { width: number; height: number }> {
  if (raw) return createImageBitmap(blob, { colorSpaceConversion: 'none' });   // the numbers as stored, for a kept profile (1.53.5)
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch {
    const img = await viaElement(blob);
    if (!img.naturalWidth || !img.naturalHeight) { img.width = 1024; img.height = 1024; }
    return img;
  }
}

/** A picture larger than formvis edits in one piece (1.52.7), found from its header before anything is decoded. */
export class LargePictureError extends Error {
  constructor(readonly file: Blob, readonly picture: string, readonly width: number, readonly height: number) { super(`${picture} is ${width} by ${height}, larger than formvis edits in one piece.`); }
}

export async function decodeImage(file: Blob, name: string, raw = false): Promise<ImportedImage> {
  const size = await headerSize(file);
  if (size && (size.width > LIMITS.side || size.height > LIMITS.side || size.width * size.height > LIMITS.pixels)) throw new LargePictureError(file, name, size.width, size.height);
  const server = SERVER.test(name) || RAW_FILE.test(name) || /image\/(heic|heif|tiff)/.test(file.type);
  let source: ImportedImage['source'] & { width: number; height: number };
  try { source = await bitmapOf(server ? await api.decode(file, name) : file, raw && !server); } catch (err) {
    if (server) throw err;
    source = await bitmapOf(await api.decode(file, name));
  }
  if (source.width > LIMITS.side || source.height > LIMITS.side || source.width * source.height > LIMITS.pixels) {
    throw new Error(`${name} exceeds the 30,000 px side or ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel limit.`);
  }
  return { source, width: source.width, height: source.height, name };
}
