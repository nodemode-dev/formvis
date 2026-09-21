import type { BlendMode as PsdBlend, Layer as PsdLayer, Psd } from 'ag-psd';
import {
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid,
  type BlendMode, type Doc, type ID, type Layer, type Surface,
} from '../engine';
import { maskEdgeTone } from '../engine/distort';

/** Layered PSD files, read and written with ag-psd (MIT). Pixel layers keep their position, opacity, blend mode and
 *  visibility, folders become groups and back, layer masks and clipping carry across, and the flattened image goes in
 *  as the composite for readers that ignore layers. What PSD stores in forms sonny does not write yet, layer styles,
 *  adjustment layers and editable type, is reported in the notes. The library loads on first use, keeping it out of
 *  the start-up bundle. */

const TO_PSD: Record<BlendMode, PsdBlend> = {
  normal: 'normal', darken: 'darken', multiply: 'multiply', 'color-burn': 'color burn', lighten: 'lighten', screen: 'screen',
  'color-dodge': 'color dodge', 'linear-dodge': 'linear dodge', overlay: 'overlay', 'soft-light': 'soft light', 'hard-light': 'hard light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
};
const FROM_PSD = new Map<PsdBlend, BlendMode>(Object.entries(TO_PSD).map(([k, v]) => [v, k as BlendMode]));

export const isPsdFile = (f: File): boolean => /\.psd$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop';

const canvas = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

/** A PSD's layers as a sonny document, bottom to top as in the file, with notes on anything left out. */
export async function readPsdFile(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null }> {
  const { readPsd } = await import('ag-psd');
  const psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true });
  const doc: Doc = { id: uid(), width: psd.width, height: psd.height, resolution: 72, layers: [] };
  const layers: Layer[] = [], notes: string[] = [];
  const walk = (children: PsdLayer[] | undefined, parentId: ID | null): void => {
    let base: Layer | null = null;
    for (const pl of children ?? []) {
      const name = pl.name || 'Layer', blend = (pl.blendMode && FROM_PSD.get(pl.blendMode)) ?? 'normal';
      if (pl.children) {
        const group = newLayer(name, doc, { isGroup: true, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1 });
        walk(pl.children, group.id);
        layers.push(group); // after its children, where sonny keeps a folder's entry
        base = null;
        continue;
      }
      if (pl.blendMode && !FROM_PSD.has(pl.blendMode) && pl.blendMode !== 'pass through') notes.push(`"${name}" uses ${pl.blendMode}, which sonny does not have; it opened as Normal.`);
      if (!pl.canvas || !pl.canvas.width || !pl.canvas.height) {
        if (pl.adjustment) notes.push(`"${name}" is an adjustment layer; sonny left it out.`);
        continue;
      }
      const w = pl.canvas.width, h = pl.canvas.height, raster = Raster.from(pl.canvas, w, h);
      const layer = newLayer(name, doc, { raster, parentId, transform: { ...docTransform(w, h), x: pl.left ?? 0, y: pl.top ?? 0 }, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend });
      const mk = pl.mask;
      if (mk?.canvas && mk.canvas.width && mk.canvas.height) {
        // PSD masks are grey; sonny's are white with the level in alpha.
        const mw = mk.canvas.width, mh = mk.canvas.height, grey = mk.canvas.getContext('2d')?.getImageData(0, 0, mw, mh);
        if (grey) {
          const img = new ImageData(mw, mh);
          for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = grey.data[i]; }
          const mr = new Raster(mw, mh);
          mr.write(img);
          layer.mask = { raster: mr, enabled: !mk.disabled, linked: true, placement: { ...docTransform(mw, mh), x: mk.left ?? 0, y: mk.top ?? 0 } };
        }
      }
      if (pl.text) notes.push(`"${name}" is type in Photoshop; it opened as pixels.`);
      if (pl.effects) notes.push(`"${name}" has a Photoshop layer style; it opened without it.`);
      if (pl.clipping && base) layer.clipId = base.id;
      else base = layer;
      layers.push(layer);
    }
  };
  walk(psd.children, null);
  if (!layers.length && psd.canvas) {
    layers.push(newLayer('Background', doc, { raster: Raster.from(psd.canvas, psd.width, psd.height) }));
    notes.push('This PSD has no layers; it opened as a single one.');
  }
  return { doc: { ...doc, layers }, notes, activeId: layers.at(-1)?.id ?? null };
}

/** The document as a layered PSD, with notes on what it could not carry. */
export async function writePsdFile(doc: Doc, composite: Surface): Promise<{ bytes: ArrayBuffer; notes: string[] }> {
  const { writePsd } = await import('ag-psd');
  const notes: string[] = [];
  /** A raster drawn through `t` into a box aligned to the canvas; null when it covers nothing. */
  const placed = (r: Raster, t: Layer['transform']): { c: HTMLCanvasElement; x: number; y: number } | null => {
    const m = placement(t, r.width, r.height);
    const box = integral(boundsOf([applyMat(m, 0, 0), applyMat(m, r.width, 0), applyMat(m, r.width, r.height), applyMat(m, 0, r.height)]));
    if (box.w < 1 || box.h < 1) return null;
    const c = canvas(box.w, box.h), g = c.getContext('2d') as CanvasRenderingContext2D;
    g.imageSmoothingEnabled = t.sampling !== 'nearest';
    g.setTransform(m[0], m[1], m[2], m[3], m[4] - box.x, m[5] - box.y);
    g.drawImage(r.canvas as CanvasImageSource, 0, 0);
    return { c, x: box.x, y: box.y };
  };
  const toPsd = (l: Layer): PsdLayer | null => {
    if (l.isGroup) return { name: l.name, hidden: !l.visible, opacity: l.opacity, blendMode: 'pass through', opened: true, children: build(l.id) };
    if (l.adjustment) { notes.push(`"${l.name}" is an adjustment layer; it is left out of the PSD.`); return null; }
    if (!l.raster) return null;
    const px = placed(l.raster, l.transform);
    if (!px) return null;
    if (effectsActive(l.effects)) notes.push(`"${l.name}" loses its layer style; the PSD holds its pixels only.`);
    if (liveText(l)) notes.push(`"${l.name}" goes as pixels; the PSD does not hold it as editable type.`);
    const out: PsdLayer = { name: l.name, left: px.x, top: px.y, canvas: px.c, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId };
    const mk = l.mask;
    if (mk?.raster) {
      const mp = placed(mk.raster, mk.placement ?? l.transform);
      if (mp) {
        const g = mp.c.getContext('2d') as CanvasRenderingContext2D, img = g.getImageData(0, 0, mp.c.width, mp.c.height);
        for (let i = 0; i < img.data.length; i += 4) { const a = img.data[i + 3]; img.data[i] = img.data[i + 1] = img.data[i + 2] = a; img.data[i + 3] = 255; }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.putImageData(img, 0, 0);
        out.mask = { canvas: mp.c, left: mp.x, top: mp.y, defaultColor: maskEdgeTone(mk.raster), disabled: !mk.enabled };
      }
    }
    return out;
  };
  const build = (parentId: ID | null): PsdLayer[] => doc.layers.filter((l) => l.parentId === parentId).map(toPsd).filter((x): x is PsdLayer => x !== null);
  const flat = canvas(doc.width, doc.height);
  (flat.getContext('2d') as CanvasRenderingContext2D).drawImage(composite as CanvasImageSource, 0, 0);
  const psd: Psd = { width: doc.width, height: doc.height, children: build(null), canvas: flat };
  return { bytes: writePsd(psd, { generateThumbnail: false }), notes };
}
