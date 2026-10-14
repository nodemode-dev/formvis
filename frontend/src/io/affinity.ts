import { Raster, newLayer, uid, type Doc, type ID } from '../engine';

/** Affinity (.af, .afphoto, .afdesign, .afpub; DEV_PLAN 34.6): a proprietary, undocumented container that starts with the
 *  bytes 00 FF 4B 41. Its layers sit in a compressed file system formvis does not read; what it can read is the preview
 *  image (a PNG, in some versions a JPEG) embedded in the file, which opens as one layer. */
export const isAffinityFile = (f: File): boolean => /\.(af|afphoto|afdesign|afpub)$/i.test(f.name);

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const matchesAt = (b: Uint8Array, at: number, sig: number[]): boolean => {
  if (at + sig.length > b.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig[i]) return false;
  return true;
};

/** The end offset of the PNG starting at `start`, found by walking its chunks to IEND; -1 if it is cut off. */
function pngEnd(b: Uint8Array, start: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = start + 8;
  while (p + 12 <= b.length) {
    const len = view.getUint32(p, false);
    const isEnd = b[p + 4] === 0x49 && b[p + 5] === 0x45 && b[p + 6] === 0x4e && b[p + 7] === 0x44;
    const next = p + 12 + len;
    if (next > b.length) return -1;
    if (isEnd) return next;
    p = next;
  }
  return -1;
}

/** Every embedded PNG and JPEG, as byte ranges. */
function findImages(b: Uint8Array): { blob: Blob }[] {
  const found: { blob: Blob }[] = [];
  for (let i = 0; i + 8 <= b.length; i++) {
    if (b[i] === 0x89 && matchesAt(b, i, PNG_SIG)) {
      const end = pngEnd(b, i);
      if (end > 0) { found.push({ blob: new Blob([b.slice(i, end)], { type: 'image/png' }) }); i = end - 1; }
    } else if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff) {
      let end = -1;
      for (let j = i + 3; j + 1 < b.length; j++) {
        if (b[j] === 0xff && b[j + 1] === 0xd9) { end = j + 2; break; }
      }
      if (end > 0) { found.push({ blob: new Blob([b.slice(i, end)], { type: 'image/jpeg' }) }); i = end - 1; }
    }
  }
  return found;
}

export async function readAffinity(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null; paths: null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesAt(bytes, 0, [0x00, 0xff, 0x4b, 0x41])) throw new Error('That is not an Affinity file.');
  let best: ImageBitmap | null = null;
  for (const c of findImages(bytes)) {
    let bmp: ImageBitmap;
    try { bmp = await createImageBitmap(c.blob); } catch { continue; }   // a stray signature inside other data
    if (!best || bmp.width * bmp.height > best.width * best.height) { best?.close(); best = bmp; } else bmp.close();
  }
  if (!best) throw new Error('This Affinity file carries no preview formvis can read.');
  const W = best.width, H = best.height;
  const doc: Doc = { id: uid(), width: W, height: H, resolution: 72, layers: [] };
  const raster = new Raster(W, H);
  raster.ctx.drawImage(best, 0, 0); best.close(); raster.touch();
  const name = file.name.replace(/\.(af|afphoto|afdesign|afpub)$/i, '') || 'Affinity';
  const layer = newLayer(name, doc, { raster });
  doc.layers = [layer];
  return { doc, notes: [`Affinity files cannot be read layer by layer; this is the preview the file carries, ${W} by ${H}.`], activeId: layer.id, paths: null };
}
