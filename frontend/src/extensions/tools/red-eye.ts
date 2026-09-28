import type { OptionSpec, Tool } from '../registry';

const opts = { pupil: 50, darken: 50 };

/** Red Eye (J), as Photoshop's (the owner's tool list): click the red of a pupil to darken it to a neutral; Pupil Size
 *  bounds how far the red is followed, Darken Amount how dark it goes. One step per click. */
export const redEyeTool: Tool = {
  id: 'redEye', label: 'Red Eye', key: 'J', order: 57.8,
  icon: () => 'tRedEye',
  hint: () => 'Click the red of a pupil',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button === 0) ctx.engine.redEye(p.doc, opts.pupil, opts.darken); },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Red Eye' },
    { kind: 'range', label: 'Pupil Size', min: 1, max: 100, unit: '%', get: () => opts.pupil, set: (v: number) => { opts.pupil = Math.max(1, Math.min(100, Math.round(v))); e.emit('options', null); } },
    { kind: 'range', label: 'Darken Amount', min: 1, max: 100, unit: '%', get: () => opts.darken, set: (v: number) => { opts.darken = Math.max(1, Math.min(100, Math.round(v))); e.emit('options', null); } },
  ],
};
