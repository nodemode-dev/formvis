import { LIMITS, type ImportedImage } from '../engine';
import { api } from './api';

const NATIVE = /\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i;
const SERVER = /\.(heic|heif|hif|tiff?)$/i;
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.svg,.heic,.heif,.tif,.tiff,image/*';
export const PROJECT_ACCEPT = '.sonny,.ref,.zip';

export const isImageFile = (f: File): boolean => f.type.startsWith('image/') || NATIVE.test(f.name) || SERVER.test(f.name);
export const isProjectFile = (f: File): boolean => /\.(sonny|ref|zip)$/i.test(f.name);

function viaElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

async function bitmapOf(blob: Blob): Promise<ImportedImage['source'] & { width: number; height: number }> {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch {
    const img = await viaElement(blob);
    if (!img.naturalWidth || !img.naturalHeight) { img.width = 1024; img.height = 1024; }
    return img;
  }
}

export async function decodeImage(file: Blob, name: string): Promise<ImportedImage> {
  const server = SERVER.test(name) || /image\/(heic|heif|tiff)/.test(file.type);
  let source: ImportedImage['source'] & { width: number; height: number };
  try { source = await bitmapOf(server ? await api.decode(file, name) : file); } catch (err) {
    if (server) throw err;
    source = await bitmapOf(await api.decode(file, name));
  }
  if (source.width > LIMITS.side || source.height > LIMITS.side || source.width * source.height > LIMITS.pixels) {
    throw new Error(`${name} exceeds the 30,000 px side or 100-megapixel limit.`);
  }
  return { source, width: source.width, height: source.height, name };
}
