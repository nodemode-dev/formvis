/** Layer Comps: pure capture and apply over a Doc. Layers a comp does not mention are left as they are. */
import type { BlendMode, Doc, ID, Layer, LayerComp, LayerEffects } from './types';

type Entry = LayerComp['layers'][ID];
export type CompOptions = { name?: string; comment?: string; useVisibility?: boolean; usePosition?: boolean; useAppearance?: boolean };

const clone = <T>(v: T): T => (v === undefined || v === null ? v : (JSON.parse(JSON.stringify(v)) as T));

/** What one layer contributes to a comp under the three switches. */
export function captureEntry(l: Layer, useVisibility: boolean, usePosition: boolean, useAppearance: boolean): Entry {
  const e: Entry = {};
  if (useVisibility) e.visible = l.visible;
  if (usePosition) { e.x = l.transform.x; e.y = l.transform.y; }
  if (useAppearance) {
    e.opacity = l.opacity; e.blend = l.blend;
    if (l.fill !== undefined) e.fill = l.fill;
    if (l.effects) { e.effects = clone(l.effects); e.effectsHidden = !!l.effects.hidden; }
  }
  return e;
}

export function captureComp(doc: Doc, id: ID, opts: CompOptions = {}, base?: LayerComp): LayerComp {
  const n = (doc.comps?.length ?? 0) + 1;
  const useVisibility = opts.useVisibility ?? base?.useVisibility ?? true, usePosition = opts.usePosition ?? base?.usePosition ?? true, useAppearance = opts.useAppearance ?? base?.useAppearance ?? true;
  const layers: LayerComp['layers'] = {};
  for (const l of doc.layers) layers[l.id] = captureEntry(l, useVisibility, usePosition, useAppearance);
  return { id, name: opts.name?.trim() || base?.name || `Layer Comp ${n}`, comment: opts.comment ?? base?.comment ?? '', useVisibility, usePosition, useAppearance, layers };
}

/** The doc's layers with a comp applied; the same array entries are kept for layers that do not change. */
export function applyComp(doc: Doc, comp: LayerComp): Layer[] {
  return doc.layers.map((l) => {
    const e = comp.layers[l.id];
    if (!e) return l;
    const patch: Partial<Layer> = {};
    if (comp.useVisibility && e.visible !== undefined && e.visible !== l.visible) patch.visible = e.visible;
    if (comp.usePosition && e.x !== undefined && e.y !== undefined && (e.x !== l.transform.x || e.y !== l.transform.y)) patch.transform = { ...l.transform, x: e.x, y: e.y };
    if (comp.useAppearance) {
      if (e.opacity !== undefined && e.opacity !== l.opacity) patch.opacity = e.opacity;
      if (e.blend !== undefined && e.blend !== l.blend) patch.blend = e.blend as BlendMode;
      if (e.fill !== l.fill && (e.fill !== undefined || l.fill !== undefined)) patch.fill = e.fill;
      if (e.effects !== undefined || l.effects) {
        const fx = e.effects ? { ...(clone(e.effects) as LayerEffects), hidden: e.effectsHidden || undefined } : null;
        if (JSON.stringify(fx) !== JSON.stringify(l.effects ?? null)) patch.effects = fx;
      }
    }
    return Object.keys(patch).length ? ({ ...l, ...patch } as Layer) : l;
  });
}

/** Reads comps from a saved manifest; anything malformed is dropped, so older projects open unchanged. */
export function parseComps(raw: unknown): LayerComp[] {
  if (!Array.isArray(raw)) return [];
  const out: LayerComp[] = [];
  for (const r of raw.slice(0, 200)) {
    if (!r || typeof r !== 'object' || typeof (r as LayerComp).id !== 'string') continue;
    const c = r as LayerComp;
    const layers = c.layers && typeof c.layers === 'object' ? clone(c.layers) : {};
    out.push({ id: c.id, name: typeof c.name === 'string' ? c.name : 'Layer Comp', comment: typeof c.comment === 'string' ? c.comment : '', useVisibility: c.useVisibility !== false, usePosition: c.usePosition !== false, useAppearance: c.useAppearance !== false, layers });
  }
  return out;
}
