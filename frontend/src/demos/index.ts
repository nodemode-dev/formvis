import type { Engine } from '../engine';
import { buildDesignDemo } from './design';
import { shippedMedia, type DemoMedia } from './media';
import { buildPaintDemo } from './paint';
import { buildRetouchDemo } from './retouch';

/** The three demos the repository ships as browser pages (demo/, demos/retouch, demos/design), opened in the real window:
 *  each builds new, unsaved documents through the engine from the photographs under /demos/<id>/, so nothing open is
 *  replaced and nothing is written. Home > Start > Demos, Help > Demos and the demo-* commands open them. */
export interface DemoDef {
  id: 'paint' | 'retouch' | 'design';
  title: string;
  blurb: string;
  /** The photograph its card shows, from the demo's own media. */
  cover: string;
  build: (e: Engine, m: DemoMedia) => Promise<void>;
}

export const DEMOS: readonly DemoDef[] = [
  { id: 'paint', title: 'Painting and photo editing', blurb: 'A landscape painted with the brush over masks, adjustment layers and type, and a finished poster.', cover: 'tray-night.jpg', build: buildPaintDemo },
  { id: 'retouch', title: 'Selections and retouching', blurb: 'A portrait retouched with Spot Healing, Clone Stamp and Selection-Aware Fill, with a refined subject selection.', cover: 'golden-portrait.jpg', build: buildRetouchDemo },
  { id: 'design', title: 'Type and design', blurb: 'An event kit on three artboards with live type, shape layers, layer styles and Smart Filters.', cover: 'bokeh.jpg', build: buildDesignDemo },
];

export const demoCover = (d: DemoDef): string => `${import.meta.env.BASE_URL}demos/${d.id}/${d.cover}`;

export function buildDemo(id: string, e: Engine): Promise<void> | null {
  const d = DEMOS.find((x) => x.id === id);
  return d ? d.build(e, shippedMedia(d.id)) : null;
}
