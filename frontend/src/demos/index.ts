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

export function buildDemo(id: string, e: Engine, made: Set<string> = new Set()): Promise<void> | null {
  const d = DEMOS.find((x) => x.id === id);
  return d ? d.build(pinned(e, made), shippedMedia(d.id)) : null;
}

function pinned(e: Engine, made: Set<string>): Engine {
  let mine: string | null = null;
  const pin = (): void => {
    if (!mine || e.current?.id === mine) return;
    if (!e.projects.some((p) => p.id === mine)) throw new Error('the demo document was closed while it was being built');
    e.switchTo(mine);
    if (e.current?.id !== mine) throw new Error('the demo could not go back to its own document');
  };
  return new Proxy(e, {
    get(t, k) {
      if (k === 'switchTo') return (id: string): void => { t.switchTo(id); if (t.current?.id !== id) throw new Error('the demo could not switch to its document'); mine = id; };
      if (k === 'projects') return t.projects;
      pin();
      const v = Reflect.get(t, k, t) as unknown;
      if (typeof v !== 'function') return v;
      return (...a: unknown[]): unknown => {
        pin();
        const before = new Set(t.projects.map((p) => p.id));
        const out = (v as (...x: unknown[]) => unknown).apply(t, a);
        for (const p of t.projects) if (!before.has(p.id)) { made.add(p.id); mine = p.id; }
        return out;
      };
    },
    set(t, k, v) { return Reflect.set(t, k, v, t); },
  });
}
