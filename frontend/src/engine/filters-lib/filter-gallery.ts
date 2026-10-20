import type { LibEffect, LibFilter, LibParam, LibValue, LibValues } from '../filter-library';
import { FX_CATEGORIES, galleryReach, runEffects, type FxCategory, type FxDef, type FxRun } from './gallery-fx';
import { ARTISTIC_FX } from './fx-artistic';
import { BRUSH_FX } from './fx-brush';
import { DISTORT_FX } from './fx-distort';
import { SKETCH_FX } from './fx-sketch';
import { TEXTURE_FX } from './fx-texture';

export const GALLERY_FX: readonly FxDef[] = [...ARTISTIC_FX, ...BRUSH_FX, ...DISTORT_FX, ...SKETCH_FX, ...TEXTURE_FX];

const byKey = new Map<string, FxDef>(GALLERY_FX.map((fx) => [fx.key, fx]));

/** An effect by its key, or by its label as a recorded action or an agent may name it. */
const named = (name: string): FxDef | undefined => byKey.get(name) ?? GALLERY_FX.find((fx) => fx.label.toLowerCase() === name.toLowerCase());

export const galleryFx = (key: string): FxDef | undefined => byKey.get(key);

/** The effects by category, in the gallery's order, empty categories left out. */
export function galleryCategories(): Array<{ category: FxCategory; effects: FxDef[] }> {
  const out: Array<{ category: FxCategory; effects: FxDef[] }> = [];
  for (const category of FX_CATEGORIES) {
    const effects = GALLERY_FX.filter((fx) => fx.category === category);
    if (effects.length) out.push({ category, effects });
  }
  return out;
}

export const fxDefaults = (fx: FxDef): LibValues => Object.fromEntries(fx.params.map((p) => [p.key, p.def as LibValue]));

export function newEffect(key: string): LibEffect {
  const fx = byKey.get(key) ?? GALLERY_FX[0];
  return { filter: fx.key, values: fxDefaults(fx), visible: true };
}

/** Stored effect layers made safe: at most 64, unknown effects dropped, each value held to its control (read from the
 *  layer's `values`, its `params` or the layer itself), a layer shown unless it says otherwise. */
function cleanEffects(v: unknown, sane: (p: LibParam, v: unknown) => LibValue): LibEffect[] {
  if (!Array.isArray(v)) return [newEffect(GALLERY_FX[0].key)];
  const out: LibEffect[] = [];
  for (const raw of v.slice(0, 64)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const layer = raw as Record<string, unknown>, fx = typeof layer.filter === 'string' ? named(layer.filter) : undefined;
    if (!fx) continue;
    const given = [layer.values, layer.params].find((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)) ?? layer, values: LibValues = {};
    for (const p of fx.params) values[p.key] = sane(p, given[p.key]);
    out.push({ filter: fx.key, values, visible: layer.visible !== false });
  }
  return out;
}

export const shown = (v: LibValues): FxRun[] => (v.effects as readonly LibEffect[]).flatMap((e) => { const fx = e.visible ? byKey.get(e.filter) : undefined; return fx ? [{ fx, values: e.values }] : []; });

export const FILTER_GALLERY: readonly LibFilter[] = [
  {
    id: 'filterGallery', label: 'Filter Gallery', group: 'Filter Gallery', width: 1060, ownPreview: true, grows: false,
    params: [{ key: 'effects', label: 'Effect layers', kind: 'effects', def: [newEffect(GALLERY_FX[0].key)], clean: cleanEffects }],
    reach: (v, scale) => galleryReach(shown(v), scale),
    invalid: (v) => {
      if (!(v.effects as readonly LibEffect[]).length) return `The Filter Gallery needs an effect layer, one of: ${GALLERY_FX.map((fx) => fx.key).join(', ')}.`;
      return shown(v).length ? null : 'The Filter Gallery has no effect layer shown: show one, or add one.';
    },
    run: (src, v, ctx) => runEffects(src, shown(v), ctx),
  },
];
