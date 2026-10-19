import type { OptionSpec, Tool } from '../registry';

const settings = { tolerance: 32, contiguous: true, sampleAll: false };

/** The Magic Eraser (E, the owner's tool list): a click makes the area of similar colour transparent
 *  on the active layer, by its own Tolerance, Contiguous and Sample All Layers (the Magic Wand's are left alone). */
export const magicEraserTool: Tool = {
  id: 'magicEraser', label: 'Magic Eraser', key: 'E', order: 62.2,
  icon: () => 'tMagicEraser',
  hint: () => 'Click an area to erase it and the colours like it · Tolerance widens the match · Contiguous keeps to the connected area',
  cursor: () => 'crosshair',
  down(ctx, p) { if (p.button === 0) ctx.engine.magicErase(p.doc, { ...settings }); },
  options: (e): OptionSpec[] => [
    { kind: 'title', text: 'Magic Eraser' },
    { kind: 'range', label: 'Tolerance', priority: 90, min: 0, max: 255, get: () => settings.tolerance, set: (v: number) => { settings.tolerance = Math.max(0, Math.min(255, Math.round(v))); e.emit('options', null); } },
    { kind: 'toggle', label: 'Contiguous', priority: 60, get: () => settings.contiguous, set: (v) => { settings.contiguous = v; e.emit('options', null); } },
    { kind: 'toggle', label: 'Sample All Layers', priority: 40, get: () => settings.sampleAll, set: (v) => { settings.sampleAll = v; e.emit('options', null); } },
  ],
};
