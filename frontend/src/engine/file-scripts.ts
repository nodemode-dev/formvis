import type { Doc, ID, Layer } from './types';
import { docTransform, effectsActive } from './types';
import { Raster } from './surface';
import { invert, mul, placement, setMat } from './geometry';
import { visibleBounds } from './distort';
import { renderDoc, type Renderer } from './renderer';
import { vectorCoverage } from './vector-mask';

/** File > Scripts (DEV_PLAN 30.1): Delete All Empty Layers, Flatten All Layer Effects and Flatten All
 *  Masks as pure planners over a document. Each returns the layer changes; the engine applies them as one step. */

/** The patch that turns a live type, shape, fill or smart-object layer into plain pixels, looking as it does now. */
const PLAIN = { smart: null, text: null, vector: null, shape: null, fillContent: null } as const;

/** Whether a layer is plain pixels with nothing left in them: no raster, or a raster with every pixel transparent.
 *  Adjustment, fill, type, shape and smart-object layers, tiled layers and the Background are never empty. */
function emptyPixels(l: Layer, background: ID | null): boolean {
  if (l.isGroup || l.adjustment || l.fillContent || l.text || l.vector || l.shape || l.smart || l.tiled || l.id === background) return false;
  return !l.raster || !visibleBounds(l.raster);
}

/** The ids to delete for Delete All Empty Layers: empty pixel layers, then every group left with nothing in it
 *  (found again after each round, so a group emptied by the first round goes too). Artboards and frames stay, as
 *  they are deliberate. Counts the layers and groups separately. */
export function emptyLayerIds(doc: Doc, background: ID | null): { ids: Set<ID>; layers: number; groups: number } {
  const gone = new Set<ID>();
  let layers = 0, groups = 0;
  for (const l of doc.layers) if (emptyPixels(l, background)) { gone.add(l.id); layers++; }
  for (let again = true; again;) {
    again = false;
    for (const g of doc.layers) {
      if (!g.isGroup || gone.has(g.id) || g.artboard || g.frame) continue;
      if (doc.layers.some((c) => c.parentId === g.id && !gone.has(c.id))) continue;
      gone.add(g.id); groups++; again = true;
    }
  }
  return { ids: gone, layers, groups };
}

/** The layers a bake changes pixels of: a pixel layer, or a type, shape or fill layer that is rasterized by it.
 *  Groups, adjustment layers, smart objects and tiled layers are left as they are. */
function bakeable(l: Layer): boolean {
  return !l.isGroup && !l.adjustment && !l.smart && !l.tiled && !!l.raster;
}

/** Flatten All Layer Effects: each styled layer drawn alone at the document's size with its effects (its mask, clip
 *  and group left out, the mask staying on the layer to cut the baked pixels as it cut the style), the effects then
 *  cleared. The layer's fill and opacity stay on it, so the look is unchanged. Returns the patches by id and how many
 *  type, shape or fill layers were rasterized on the way. */
export function bakeEffects(doc: Doc, work: Renderer, only?: ReadonlySet<ID>): { patches: Map<ID, Partial<Layer>>; rasterized: number } {
  const patches = new Map<ID, Partial<Layer>>();
  let rasterized = 0;
  for (const l of doc.layers) {
    if (!bakeable(l) || !effectsActive(l.effects) || (only && !only.has(l.id))) continue;
    const alone: Layer = { ...l, parentId: null, clipId: null, visible: true, opacity: 1, blend: 'normal', blendIf: null, knockout: 'none', mask: null, vectorMask: null };
    const out = renderDoc(work, { ...doc, layers: [alone] });
    const r = new Raster(out.width, out.height);
    r.ctx.drawImage(out as CanvasImageSource, 0, 0);
    r.touch();
    if (l.text || l.vector || l.shape || l.fillContent) rasterized++;
    patches.set(l.id, { ...PLAIN, raster: r, transform: docTransform(r.width, r.height), effects: null, fill: 1 });
  }
  return { patches, rasterized };
}

/** Flatten All Masks: each layer mask (when on) and vector mask (when on) multiplied into the layer's pixels and
 *  removed; a mask that is off is dropped unchanged, as Apply Layer Mask does. Returns the patches by id, the number
 *  of masks applied and how many type, shape or fill layers were rasterized on the way. */
export function bakeMasks(doc: Doc): { patches: Map<ID, Partial<Layer>>; masks: number; rasterized: number } {
  const patches = new Map<ID, Partial<Layer>>();
  let masks = 0, rasterized = 0;
  for (const l of doc.layers) {
    if (!bakeable(l) || (!l.mask && !l.vectorMask)) continue;
    const src = l.raster as Raster, out = src.clone(), ctx = out.ctx, toLayer = invert(placement(l.transform, out.width, out.height));
    const m = l.mask, v = l.vectorMask;
    if (m?.raster && m.enabled) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      setMat(ctx, mul(toLayer, placement(m.placement ?? l.transform, m.raster.width, m.raster.height)));
      ctx.drawImage(m.raster.canvas, 0, 0);
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (v?.enabled) {
      const cov = vectorCoverage(v, doc.width, doc.height);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      setMat(ctx, toLayer);
      if (cov) ctx.drawImage(cov.surface as CanvasImageSource, 0, 0);
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    out.touch();
    masks += (m ? 1 : 0) + (v ? 1 : 0);
    if (l.text || l.vector || l.shape || l.fillContent) rasterized++;
    patches.set(l.id, { ...PLAIN, raster: out, mask: null, vectorMask: null });
  }
  return { patches, masks, rasterized };
}
