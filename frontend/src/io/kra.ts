import { Raster, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer } from '../engine';
import { unzip } from './zip';

/** .kra files (DEV_PLAN 34.5 part a): a ZIP holding maindoc.xml (the layer tree, topmost first), a tiled pixel file per
 *  paint layer and mergedimage.png. Read in TypeScript from the format's public layout; 8-bit and 16-bit RGBA are decoded (16 bit reduced to 8),
 *  anything else opens as the merged image. .krz is the same package. */
export const isKraFile = (f: File): boolean => /\.(kra|krz)$/i.test(f.name) || f.type === 'application/x-krita';

const FROM_KRA = new Map<string, BlendMode>([
  ['normal', 'normal'], ['multiply', 'multiply'], ['screen', 'screen'], ['overlay', 'overlay'], ['darken', 'darken'], ['lighten', 'lighten'],
  ['dodge', 'color-dodge'], ['burn', 'color-burn'], ['diff', 'difference'], ['hard_light', 'hard-light'], ['soft_light', 'soft-light'],
  ['soft_light_svg', 'soft-light'], ['soft_light_pegtop_delphi', 'soft-light'], ['hue', 'hue'], ['saturation', 'saturation'], ['color', 'color'],
  ['luminize', 'luminosity'], ['luminosity', 'luminosity'], ['linear_dodge', 'linear-dodge'], ['add', 'linear-dodge'], ['linear_burn', 'linear-burn'],
  ['dissolve', 'dissolve'], ['divide', 'divide'], ['subtract', 'subtract'], ['exclusion', 'exclusion'], ['vivid_light', 'vivid-light'],
  ['linear_light', 'linear-light'], ['pin_light', 'pin-light'], ['hard_mix', 'hard-mix'], ['darker color', 'darker-color'], ['lighter color', 'lighter-color'],
]);

const TILE_PIXELS = 64 * 64;

/** The format's LZF: a control byte under 32 copies that many plus one literals; otherwise a back reference. */
function lzfDecompress(src: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let i = 0, o = 0;
  while (i < src.length && o < expected) {
    const c = src[i++];
    if (c < 32) {
      const n = c + 1;
      if (i + n > src.length || o + n > expected) throw new Error('a tile is damaged');
      out.set(src.subarray(i, i + n), o);
      i += n; o += n;
    } else {
      let len = c >> 5;
      if (len === 7) len += src[i++];
      len += 2;
      const ref = o - ((c & 31) << 8) - src[i++] - 1;
      if (ref < 0 || o + len > expected) throw new Error('a tile is damaged');
      for (let k = 0; k < len; k++) out[o++] = out[ref + k];
    }
  }
  return out;
}

interface Tile { x: number; y: number; px: Uint8Array }

/** The tiles of one .kra paint-layer file, each as 64 by 64 planar B, G, R, A channels of one byte (8 bit) or two
 *  little-endian bytes (16 bit); `bytes` is 1 or 2 per channel. */
function readTiles(data: Uint8Array): { tiles: Tile[]; tw: number; th: number; bytes: number; gray: boolean } | null {
  let pos = 0;
  const line = (): string => {
    let end = pos;
    while (end < data.length && data[end] !== 10) end++;
    const s = new TextDecoder().decode(data.subarray(pos, end));
    pos = end + 1;
    return s;
  };
  let tw = 64, th = 64, pixelSize = 4, count = 0;
  for (let n = 0; n < 16 && pos < data.length; n++) {
    const [key, val] = line().trim().split(/\s+/);
    if (key === 'TILEWIDTH') tw = Number(val);
    else if (key === 'TILEHEIGHT') th = Number(val);
    else if (key === 'PIXELSIZE') pixelSize = Number(val);
    else if (key === 'DATA') { count = Number(val); break; }
  }
  if (tw !== 64 || th !== 64 || (pixelSize !== 1 && pixelSize !== 4 && pixelSize !== 8)) return null;
  const bytes = pixelSize === 1 ? 1 : pixelSize / 4, tileBytes = TILE_PIXELS * pixelSize;
  const tiles: Tile[] = [];
  for (let t = 0; t < count && pos < data.length; t++) {
    const head = line().trim().split(',');
    const x = Number(head[0]), y = Number(head[1]), size = Number(head[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size < 1 || pos + size > data.length) throw new Error('a tile is damaged');
    const body = data.subarray(pos, pos + size);
    pos += size;
    const px = body[0] === 1 ? lzfDecompress(body.subarray(1), tileBytes) : body.slice(1, 1 + tileBytes);
    if (px.length < tileBytes) throw new Error('a tile is damaged');
    tiles.push({ x, y, px });
  }
  return { tiles, tw, th, bytes, gray: pixelSize === 1 };
}

export async function readKra(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null; paths: null }> {
  const parts = await unzip(await file.arrayBuffer());
  const text = (name: string): string => new TextDecoder().decode(parts.get(name) ?? new Uint8Array());
  const xml = new DOMParser().parseFromString(text('maindoc.xml'), 'application/xml'), image = xml.querySelector('IMAGE');
  if (!image || xml.querySelector('parsererror')) throw new Error('its maindoc.xml cannot be read');
  const W = Math.round(Number(image.getAttribute('width'))), H = Math.round(Number(image.getAttribute('height')));
  if (!Number.isFinite(W) || !Number.isFinite(H) || W < 1 || H < 1 || W > 30000 || H > 30000) throw new Error('its size is not one formvis can open');
  const docName = image.getAttribute('name') ?? '';
  const dpi = Number(image.getAttribute('x-res')) || 72;
  const doc: Doc = { id: uid(), width: W, height: H, resolution: dpi > 1 && dpi < 10000 ? dpi : 72, layers: [] };
  const notes = new Set<string>(), layers: Layer[] = [];
  const num = (e: Element, a: string, d: number): number => { const v = Number(e.getAttribute(a)); return e.hasAttribute(a) && Number.isFinite(v) ? v : d; };
  const picture = async (name: string): Promise<ImageBitmap | null> => { const b = parts.get(name); return b ? createImageBitmap(new Blob([new Uint8Array(b)], { type: 'image/png' })) : null; };
  const childLayers = (e: Element): Element[] => {
    const holder = [...e.children].find((c) => c.tagName === 'layers');
    return holder ? [...holder.children].filter((c) => c.tagName === 'layer') : [];
  };
  const READABLE = new Set(['RGBA', 'RGBA16']);
  let notRgba8 = !READABLE.has(image.getAttribute('colorspacename') ?? 'RGBA');

  // A paint layer's transparency mask: its 8-bit tiles over the level the file stores for the rest of the canvas (255 when none).
  const maskOf = (e: Element): Layer['mask'] => {
    const holder = [...e.children].find((c) => c.tagName === 'masks'), m = holder ? [...holder.children].find((c) => c.getAttribute('nodetype') === 'transparencymask') : undefined;
    if (!m) return null;
    try {
      const file = m.getAttribute('filename') ?? '', data = parts.get(`${docName}/layers/${file}`), read = data ? readTiles(data) : null;
      if (!read || !read.gray) { notes.add('A transparency mask could not be read and was left out.'); return null; }
      const outside = parts.get(`${docName}/layers/${file}.defaultpixel`)?.[0] ?? 255, ox = num(m, 'x', 0), oy = num(m, 'y', 0), img = new ImageData(W, H);
      for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = outside; }
      for (const t of read.tiles) {
        for (let ty = 0; ty < read.th; ty++) {
          const py = t.y + oy + ty;
          if (py < 0 || py >= H) continue;
          for (let tx = 0; tx < read.tw; tx++) { const px = t.x + ox + tx; if (px >= 0 && px < W) img.data[(py * W + px) * 4 + 3] = t.px[ty * read.tw + tx]; }
        }
      }
      const raster = new Raster(W, H);
      raster.write(img);
      return { raster, enabled: m.getAttribute('visible') !== '0', linked: true, placement: { ...docTransform(W, H), x: 0, y: 0 } };
    } catch { notes.add('A transparency mask could not be read and was left out.'); return null; }
  };

  const walk = (list: Element[], parentId: ID | null): void => {
    for (const e of [...list].reverse()) {   // the file lists the top first; formvis keeps the bottom first
      const kind = e.getAttribute('nodetype') ?? '', name = e.getAttribute('name') || (kind === 'grouplayer' ? 'Group' : 'Layer');
      const opacity = Math.min(1, Math.max(0, num(e, 'opacity', 255) / 255)), visible = e.getAttribute('visible') !== '0';
      if (kind === 'grouplayer') {
        const group = newLayer(name, doc, { isGroup: true, parentId, visible, opacity });
        walk(childLayers(e), group.id);
        layers.push(group);   // after its children
        continue;
      }
      if (kind !== 'paintlayer') { const k = kind.replace(/layer$/, '') || 'unknown'; notes.add(`"${name}" is ${/^[aeiou]/.test(k) ? 'an' : 'a'} ${k} layer, which formvis does not read from .kra files; it was left out.`); continue; }
      if (!READABLE.has(e.getAttribute('colorspacename') ?? 'RGBA')) { notRgba8 = true; continue; }
      const data = parts.get(`${docName}/layers/${e.getAttribute('filename') ?? ''}`);
      if (!data) { notes.add('Some layers named pixel files the file does not hold, and were left out.'); continue; }
      const read = readTiles(data);
      if (!read || read.gray) { notRgba8 = true; continue; }
      if (!read.tiles.length) continue;
      const op = e.getAttribute('compositeop') ?? 'normal', blend = FROM_KRA.get(op) ?? 'normal';
      if (!FROM_KRA.has(op)) notes.add(`${op} is not a blend mode formvis has; those layers open as Normal.`);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const t of read.tiles) { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x + read.tw); y1 = Math.max(y1, t.y + read.th); }
      const w = x1 - x0, h = y1 - y0;
      if (w * h > 400_000_000) { notes.add('A layer is too large to open and was left out.'); continue; }
      if (read.bytes === 2) notes.add('16-bit layers were reduced to 8 bits per channel.');
      const img = new ImageData(w, h), plane = TILE_PIXELS * read.bytes, hi = read.bytes - 1;
      for (const t of read.tiles) {
        for (let ty = 0; ty < read.th; ty++) {
          for (let tx = 0; tx < read.tw; tx++) {
            const s = (ty * read.tw + tx) * read.bytes + hi, d = ((t.y - y0 + ty) * w + (t.x - x0 + tx)) * 4;
            img.data[d] = t.px[2 * plane + s]; img.data[d + 1] = t.px[plane + s]; img.data[d + 2] = t.px[s]; img.data[d + 3] = t.px[3 * plane + s];
          }
        }
      }
      const raster = new Raster(w, h);
      raster.write(img);
      const mask = maskOf(e);
      layers.push(newLayer(name, doc, { raster, parentId, visible, opacity, blend, ...(mask ? { mask } : {}), ...(e.getAttribute('locked') === '1' ? { locks: { all: true } } : {}), transform: { ...docTransform(w, h), x: num(e, 'x', 0) + x0, y: num(e, 'y', 0) + y0 } }));
    }
  };
  const top = [...image.children].find((c) => c.tagName === 'layers');
  walk(top ? [...top.children].filter((c) => c.tagName === 'layer') : [], null);

  if (notRgba8 || !layers.some((l) => !l.isGroup)) {
    const merged = await picture('mergedimage.png');
    if (!merged) throw new Error('it holds no readable layers and no merged image');
    const raster = new Raster(merged.width, merged.height);
    raster.ctx.drawImage(merged, 0, 0); merged.close(); raster.touch();
    layers.length = 0;
    layers.push(newLayer('Background', doc, { raster }));
    notes.add(notRgba8 ? 'This .kra file is not 8-bit RGBA; it opened as its merged image, one layer.' : 'This .kra file has no pixel layers; it opened as its merged image.');
  }
  doc.layers = layers;
  return { doc, notes: [...notes], activeId: layers.at(-1)?.id ?? null, paths: null };
}
