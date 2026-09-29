import { Raster, docTransform, effectsActive, newLayer, uid, placement, createSurface, ctxOf, toBlob, type BlendMode, type Doc, type ID, type Layer, type Surface } from '../engine';
import { unzip, zipFiles } from './zip';

/** OpenRaster (.ora, 1.51.7, the capability plan): the open layered format of Krita, GIMP and MyPaint, written and read
 *  from its public specification. A ZIP: "mimetype" first and uncompressed, stack.xml (the layers, topmost first,
 *  groups as nested stacks), a PNG per layer, mergedimage.png and a thumbnail. formvis's groups are pass-through, as
 *  isolation="auto"; adjustment layers have no OpenRaster form and are left out, said so. */
export const isOraFile = (f: File): boolean => /\.ora$/i.test(f.name) || f.type === 'image/openraster';

const TO_ORA: Partial<Record<BlendMode, string>> = {
  normal: 'svg:src-over', multiply: 'svg:multiply', screen: 'svg:screen', overlay: 'svg:overlay', darken: 'svg:darken', lighten: 'svg:lighten',
  'color-dodge': 'svg:color-dodge', 'color-burn': 'svg:color-burn', 'hard-light': 'svg:hard-light', 'soft-light': 'svg:soft-light',
  difference: 'svg:difference', color: 'svg:color', luminosity: 'svg:luminosity', hue: 'svg:hue', saturation: 'svg:saturation', 'linear-dodge': 'svg:plus',
};
const FROM_ORA = new Map<string, BlendMode>(Object.entries(TO_ORA).map(([k, v]) => [v as string, k as BlendMode]));
const esc = (s: string): string => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));

/** The document as an OpenRaster file. `alone(layer)` draws a layer that is not plain pixels (text, a shape, a smart
 *  object, a rotated or scaled layer) at the document's size. */
export async function writeOra(doc: Doc, composite: Surface, alone: (l: Layer) => Surface): Promise<{ blob: Blob; notes: string[] }> {
  const files: Array<{ name: string; blob: Blob }> = [], notes = new Set<string>();
  let n = 0;
  const layerXml = async (l: Layer, depth: string): Promise<string> => {
    const common = `name="${esc(l.name)}" opacity="${l.opacity.toFixed(3)}" visibility="${l.visible === false ? 'hidden' : 'visible'}"`;
    if (l.isGroup) {
      const kids = await children(l.id, depth + '  ');
      return `${depth}<stack ${common} isolation="auto">\n${kids}${depth}</stack>\n`;
    }
    if (l.adjustment) { notes.add('Adjustment layers have no OpenRaster form and were left out.'); return ''; }
    const op = TO_ORA[l.blend ?? 'normal'];
    if (!op) notes.add(`${l.blend} has no OpenRaster blend mode; those layers were written as Normal.`);
    // Plain pixels when the layer's placement is an unscaled, unrotated move by whole pixels: written as they are.
    const m = l.raster ? placement(l.transform, l.raster.width, l.raster.height) : null;
    const plain = !!m && !l.text && !l.shape && !l.smart && !(l.mask && l.mask.enabled !== false) && !effectsActive(l.effects) && Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Number.isInteger(Math.round(m[4] * 1e6) / 1e6) && Number.isInteger(Math.round(m[5] * 1e6) / 1e6);
    const img: Surface = plain && l.raster ? l.raster.canvas as Surface : alone(l), x = plain && m ? m[4] : 0, y = plain && m ? m[5] : 0;
    const src = `data/layer${n++}.png`;
    files.push({ name: src, blob: await toBlob(img) });
    return `${depth}<layer ${common} src="${src}" x="${Math.round(x)}" y="${Math.round(y)}" composite-op="${op ?? 'svg:src-over'}"/>\n`;
  };
  const children = async (parent: ID | null, depth: string): Promise<string> => {
    const kids = doc.layers.filter((l) => (l.parentId ?? null) === parent).reverse();   // topmost first
    let xml = '';
    for (const k of kids) xml += await layerXml(k, depth);
    return xml;
  };
  const body = await children(null, '    ');
  const dpi = Math.round(doc.resolution ?? 72);
  const stack = `<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.5" w="${doc.width}" h="${doc.height}" xres="${dpi}" yres="${dpi}">\n  <stack isolation="isolate">\n${body}  </stack>\n</image>\n`;
  const k = Math.min(1, 256 / Math.max(doc.width, doc.height)), thumb = createSurface(Math.max(1, Math.round(doc.width * k)), Math.max(1, Math.round(doc.height * k)));
  ctxOf(thumb).drawImage(composite as CanvasImageSource, 0, 0, thumb.width, thumb.height);
  const blob = await zipFiles([{ name: 'mimetype', blob: new Blob(['image/openraster']) }, { name: 'stack.xml', blob: new Blob([stack]) }, ...files,
    { name: 'mergedimage.png', blob: await toBlob(composite) }, { name: 'Thumbnails/thumbnail.png', blob: await toBlob(thumb) }]);
  return { blob, notes: [...notes] };
}

/** An OpenRaster file as a document: its layers and groups, their positions, opacity, visibility and blend modes. */
export async function readOraFile(file: File): Promise<{ doc: Doc; notes: string[] }> {
  const parts = await unzip(await file.arrayBuffer()), text = (name: string): string => new TextDecoder().decode(parts.get(name) ?? new Uint8Array());
  if (text('mimetype').trim() !== 'image/openraster') throw new Error('this is not an OpenRaster file');
  const xml = new DOMParser().parseFromString(text('stack.xml'), 'application/xml'), image = xml.querySelector('image');
  if (!image || xml.querySelector('parsererror')) throw new Error('its stack.xml cannot be read');
  const W = Math.max(1, Math.round(Number(image.getAttribute('w')))), H = Math.max(1, Math.round(Number(image.getAttribute('h'))));
  if (!Number.isFinite(W) || !Number.isFinite(H) || W > 30000 || H > 30000) throw new Error('its size is not one formvis can open');
  const doc: Doc = { id: uid(), width: W, height: H, resolution: Number(image.getAttribute('xres')) || 72, layers: [] }, notes = new Set<string>(), layers: Layer[] = [];
  const picture = async (name: string): Promise<ImageBitmap | null> => { const b = parts.get(name); return b ? createImageBitmap(new Blob([new Uint8Array(b)], { type: 'image/png' })) : null; };
  const num = (e: Element, a: string, d: number): number => { const v = Number(e.getAttribute(a)); return e.hasAttribute(a) && Number.isFinite(v) ? v : d; };
  const walk = async (stack: Element, parentId: ID | null): Promise<void> => {
    for (const e of [...stack.children].reverse()) {   // bottom first, as formvis keeps them
      const name = e.getAttribute('name') || (e.tagName === 'stack' ? 'Group' : 'Layer'), opacity = Math.min(1, Math.max(0, num(e, 'opacity', 1))), visible = e.getAttribute('visibility') !== 'hidden';
      if (e.tagName === 'stack') {
        const group = newLayer(name, doc, { isGroup: true, parentId, visible, opacity });
        await walk(e, group.id);
        layers.push(group);   // after its children
        if ((e.getAttribute('composite-op') ?? 'svg:src-over') !== 'svg:src-over' && e.getAttribute('isolation') === 'isolate') notes.add('Groups with their own blend mode open as pass-through groups.');
        continue;
      }
      if (e.tagName !== 'layer') continue;
      const bmp = await picture(e.getAttribute('src') ?? '');
      if (!bmp) { notes.add('Some layers named images the file does not hold, and were left out.'); continue; }
      const raster = new Raster(bmp.width, bmp.height);
      raster.ctx.drawImage(bmp, 0, 0); bmp.close(); raster.touch();
      const op = e.getAttribute('composite-op') ?? 'svg:src-over', blend = FROM_ORA.get(op) ?? 'normal';
      if (!FROM_ORA.has(op)) notes.add(`${op} is not a blend mode formvis has; those layers open as Normal.`);
      layers.push(newLayer(name, doc, { raster, parentId, visible, opacity, blend, transform: { ...docTransform(raster.width, raster.height), x: num(e, 'x', 0), y: num(e, 'y', 0) } }));
    }
  };
  const top = image.querySelector(':scope > stack');
  if (top) await walk(top, null);
  if (!layers.length) {
    const merged = await picture('mergedimage.png');
    if (!merged) throw new Error('it holds no layers and no merged image');
    const raster = new Raster(merged.width, merged.height); raster.ctx.drawImage(merged, 0, 0); merged.close(); raster.touch();
    layers.push(newLayer('Background', doc, { raster }));
  }
  doc.layers = layers;
  return { doc, notes: [...notes] };
}
