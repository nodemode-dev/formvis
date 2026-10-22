/** Preferences > Generative (1.96.2): the model each generative task starts with, and which layers its picture is made
 *  from. A model value is the Generative Fill dialog's own (`fal` for FLUX.1 Fill, `falcat:<id>` for a catalogue model,
 *  `local:lama`, a local model id, `comfy:<recipe>`); empty means the model last used in the dialog, as before. */

import type { Highres } from './fal-size';

export type GenSource = 'visible' | 'current' | 'below';
/** match: how strongly the result's colour is matched to the picture around the selection, 0 to 100 (1.96.3). */
export interface GenPrefs { fill: string; remove: string; expand: string; source: GenSource; highres: Highres; match: number }

const KEY = 'formvis.generative';
export const GEN_CHANGED = 'formvis:generative';
/** The owner's defaults (1.96.2): FLUX 3 edit for Generative Fill, Bria's eraser for a fill with no words. */
export const DEFAULT_GEN: GenPrefs = { fill: 'falcat:blackforestlabs/flux-3/edit-image', remove: 'falcat:fal-ai/bria/eraser', expand: '', source: 'visible', highres: 'max', match: 100 };
const SOURCES: readonly GenSource[] = ['visible', 'current', 'below'];
const HIGHRES: readonly Highres[] = ['off', 'target', '2x', '4x', 'max'];

const text = (v: unknown, fallback: string): string => (typeof v === 'string' ? v.slice(0, 300) : fallback);

export function genPrefs(): GenPrefs {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof GenPrefs, unknown>>;
    return { fill: text(r.fill, DEFAULT_GEN.fill), remove: text(r.remove, DEFAULT_GEN.remove), expand: text(r.expand, DEFAULT_GEN.expand), source: SOURCES.includes(r.source as GenSource) ? (r.source as GenSource) : 'visible',
      highres: HIGHRES.includes(r.highres as Highres) ? (r.highres as Highres) : DEFAULT_GEN.highres,
      match: typeof r.match === 'number' && Number.isFinite(r.match) ? Math.min(100, Math.max(0, Math.round(r.match))) : DEFAULT_GEN.match };
  } catch { return { ...DEFAULT_GEN }; }
}

export function saveGenPrefs(patch: Partial<GenPrefs>): GenPrefs {
  const next = { ...genPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept for this session only */ }
  window.dispatchEvent(new CustomEvent(GEN_CHANGED, { detail: next }));
  return next;
}

/** The model a run starts with: Expand's for expand, Remove's for a fill with no words (when one is set), else Fill's. */
export function preferredModel(mode: 'fill' | 'expand' | 'upscale', prompt: string): string {
  const g = genPrefs();
  if (mode === 'expand') return g.expand;
  if (mode === 'fill') return (!prompt.trim() && g.remove) || g.fill;
  return '';
}
