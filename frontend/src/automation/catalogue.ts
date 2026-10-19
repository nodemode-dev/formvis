import { SelectionMask, type Engine } from '../engine';
import { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, defaultAdjustmentData } from '../engine';
import { PARAM_ADJUSTMENTS, PARAM_KINDS, paramValues, type ParamKind } from '../engine/adjust-params';
import { LIBRARY, type LibParam } from '../engine/filter-library';
import { BLEND_MODES } from '../engine/types';
import { RELIGHT_LOOKS, defaultRelight, kelvinToRgb, relightFrom, type RelightContent } from '../engine/relight';
import { getTool, toolList, type OptionSpec, type Tool, type ToolContext, type ToolPointer } from '../extensions/registry';
import type { Command, CommandParam, Commands } from '../ui/commands';
import { metaFor } from './command-meta';
import { serviceReady } from '../io/api';

export interface CatalogueEntry {
  id: string; label: string; kind: 'command' | 'tool' | 'option' | 'action'; group: string; description: string; when: string;
  params?: Record<string, CommandParam>; mutates: boolean; risky: boolean; keys?: string[]; enabled?: boolean; value?: unknown;
  variants?: Record<string, Record<string, CommandParam>>;
}
export interface RunResult { ok: boolean; result?: unknown; error?: string }
export interface CatalogueDeps {
  engine: Engine; commands: Commands;
  applyFilter(kind: string, settings: Record<string, unknown>): Promise<boolean> | boolean;
  applyAdjustment(kind: string, data: Record<string, unknown>, layer: boolean): boolean;
  applyRelight?(content: RelightContent): Promise<{ id: string; depth: 'model' | 'estimate'; split?: 'marigold' | 'classic' | null } | null>;
}

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const camel = (s: string): string => s.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('');
const hexOf = (c: { r: number; g: number; b: number }): string => `#${[c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (v: string): { r: number; g: number; b: number } | null => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v); return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null; };

const TOOL_WHEN: Record<string, string> = {
  relight: 'to light the picture with virtual lights: picking it starts Relight on an 8-bit RGB document',
  move: 'to move, align or transform layers by dragging', marquee: 'to select a rectangle, ellipse or single row or column', lasso: 'to select a freehand, polygon or magnetic outline',
  artboard: 'to draw, move or resize an artboard on the canvas, or add one beside another',
  objectSelect: 'to select an object by drawing a box around it', quickSelect: 'to select by painting over an area', wand: 'to select a region of similar colour with one click',
  selectionBrush: 'to paint a selection with a soft brush', crop: 'to crop, straighten or extend the canvas by dragging', slice: 'to mark rectangles of the picture as web slices by dragging',frame: 'to make a frame placeholder for a picture',
  brush: 'to paint soft strokes with the foreground colour', pencil: 'to draw hard-edged lines', mixer: 'to paint with colours that blend like wet paint',
  spotHealing: 'to remove small blemishes with one click', remove: 'to paint over an object and have it removed', healingBrush: 'to repair texture from a sampled source',
  patch: 'to repair a selected area with pixels from another area', contentAwareMove: 'to move or extend an object and heal the gap', redEye: 'to fix red eyes in a flash photo',
  cloneStamp: 'to copy pixels from a sampled source by painting', patternStamp: 'to paint with a pattern', colorReplace: 'to swap one colour for the foreground colour by painting over it', historyBrush: 'to paint back an earlier state of the picture',
  artHistory: 'to paint a stylised version of an earlier state', eraser: 'to erase pixels to transparency or background colour', backgroundEraser: 'to erase a background colour while keeping edges',
  magicEraser: 'to erase a region of similar colour with one click', smear: 'to smudge, blur or sharpen by painting', dodge: 'to lighten areas by painting',
  burn: 'to darken areas by painting', sponge: 'to raise or lower colour saturation by painting', gradient: 'to fill with a gradient by dragging',
  bucket: 'to fill a region of similar colour with the foreground colour', shape: 'to draw rectangles, ellipses, polygons and custom shapes', pathSelect: 'to select and move whole paths',
  directSelect: 'to edit single anchor points of a path', pen: 'to draw precise paths with anchor points', freeformPen: 'to draw a path by dragging freely',
  curvaturePen: 'to draw smooth curves with few clicks', convertPoint: 'to turn a path point between smooth and corner', type: 'to add or edit text',
  eyedropper: 'to pick a colour from the picture', colorSampler: 'to read colour values at fixed points', ruler: 'to measure distance and angle', note: 'to leave a written note on the picture',
  markup: 'to mark areas for redaction or review', count: 'to count items by clicking them', boxes: 'to draw layout boxes that say where things go in a generated picture', hand: 'to pan the picture', rotateView: 'to turn the view without changing the picture', zoom: 'to zoom in or out on an area',
};

const FILTER_NAMES: Record<string, string> = { gaussianBlur: 'Gaussian Blur', motionBlur: 'Motion Blur', addNoise: 'Add Noise', lensCorrection: 'Lens Correction', unsharpMask: 'Unsharp Mask', develop: 'Develop', lensBlur: 'Lens Blur', smartSharpen: 'Smart Sharpen', shakeReduction: 'Shake Reduction', radialBlur: 'Radial Blur', surfaceBlur: 'Surface Blur', fieldBlur: 'Field Blur', irisBlur: 'Iris Blur', tiltShift: 'Tilt-Shift', pathBlur: 'Path Blur', average: 'Average' };
const filterName = (kind: string): string => FILTER_NAMES[kind] ?? LIBRARY.find((f) => f.id === kind)?.label ?? kind;
interface FlatParam { path: string; type: 'number' | 'boolean' | 'string'; min?: number; max?: number; enum?: string[]; description: string }
const num = (path: string, min: number, max: number, description: string): FlatParam => ({ path, type: 'number', min, max, description });
const CORE: Record<string, Record<string, FlatParam>> = {
  gaussianBlur: { radius: num('radius', 0.1, 250, 'Blur radius in pixels') },
  motionBlur: { angle: num('angle', -90, 90, 'Direction in degrees'), distance: num('distance', 1, 2000, 'Length in pixels') },
  addNoise: { amount: num('amount', 0.1, 400, 'Noise strength in percent'), gaussian: { path: 'gaussian', type: 'boolean', description: 'Gaussian instead of uniform noise' }, monochromatic: { path: 'monochromatic', type: 'boolean', description: 'Noise without colour' } },
  lensCorrection: { distortion: num('distortion', -100, 100, 'Positive corrects barrel distortion, negative pincushion'), redCyan: num('lensFix.caRc', -100, 100, 'Red/cyan fringe correction'), blueYellow: num('lensFix.caBy', -100, 100, 'Blue/yellow fringe correction'),
    vignette: num('lensFix.vignette', -100, 100, 'Positive lightens the corners, negative darkens them'), midpoint: num('lensFix.midpoint', 0, 100, 'Where the vignette starts'), vertical: num('lensFix.vertical', -100, 100, 'Vertical perspective'), horizontal: num('lensFix.horizontal', -100, 100, 'Horizontal perspective'),
    edge: { path: 'lensFix.edge', type: 'string', enum: ['transparent', 'extend', 'black', 'white'], description: 'What the edges show' } },
  unsharpMask: { amount: num('usmAmount', 1, 500, 'Strength in percent'), radius: num('usmRadius', 0.1, 250, 'Radius in pixels'), threshold: num('threshold', 0, 255, 'Smallest difference sharpened, in levels') },
  lensBlur: { radius: num('lensRadius', 1, 100, 'Blur radius in pixels'), brightness: num('lensBrightness', 0, 100, 'Specular brightness'), threshold: num('lensThreshold', 0, 255, 'Specular threshold'),
    blades: num('lensIris.blades', 0, 8, 'Iris blades: 0 is round, 3 to 8 a polygon'), curvature: num('lensIris.curve', 0, 100, 'Blade curvature in percent'), rotation: num('lensIris.rotation', -180, 180, 'Iris rotation in degrees'),
    depthSource: { path: 'lensIris.source', type: 'string', enum: ['none', 'depthMap', 'channel', 'transparency'], description: 'Where the depth comes from: the Depth Map layer, alpha channel number channel, or the layer transparency' }, channel: num('lensIris.channel', 1, 16, 'Alpha channel number when depthSource is channel'),
    focalDistance: num('lensIris.focal', 0, 255, 'Depth kept sharp (bright is near)'), invertDepth: { path: 'lensIris.invert', type: 'boolean', description: 'Swap near and far' },
    noise: num('lensIris.noise', 0, 100, 'Noise added where blurred'), noiseGaussian: { path: 'lensIris.gaussian', type: 'boolean', description: 'Gaussian instead of uniform noise' }, noiseMonochromatic: { path: 'lensIris.mono', type: 'boolean', description: 'Noise without colour' } },
  smartSharpen: { amount: num('smart.amount', 1, 500, 'Strength in percent'), radius: num('smart.radius', 0.1, 64, 'Radius in pixels'), noise: num('smart.noise', 0, 100, 'Noise reduction in percent'),
    remove: { path: 'smart.remove', type: 'string', enum: ['gaussian', 'lens', 'motion'], description: 'Kind of blur to remove' }, angle: num('smart.angle', -90, 90, 'Motion blur angle'), shadows: num('smart.shadows', 0, 100, 'Shadows fade in percent'), highlights: num('smart.highlights', 0, 100, 'Highlights fade in percent') },
  shakeReduction: { angle: num('shake.angle', -90, 90, 'Trace angle'), length: num('shake.length', 1, 300, 'Trace length in pixels'), smoothing: num('shake.smoothing', 0, 100, 'Smoothing in percent'), amount: num('shake.amount', 1, 300, 'Strength in percent') },
  radialBlur: { amount: num('gallery.radialAmount', 1, 100, 'Blur amount'), method: { path: 'gallery.radialMethod', type: 'string', enum: ['spin', 'zoom'], description: 'Spin or zoom' }, quality: { path: 'gallery.radialQuality', type: 'string', enum: ['draft', 'good', 'best'], description: 'Render quality' }, centerX: num('gallery.radialX', 0, 100, 'Centre x in percent'), centerY: num('gallery.radialY', 0, 100, 'Centre y in percent') },
  surfaceBlur: { radius: num('gallery.surfaceRadius', 1, 100, 'Radius in pixels'), threshold: num('gallery.surfaceThreshold', 2, 255, 'Threshold in levels') },
  irisBlur: { irises: num('gallery.irisPins', 1, 3, 'How many irises (1 to 3); the others use the gallery.iris2 and iris3 settings'), blur: num('gallery.irisBlur', 0, 500, 'Blur in pixels'), centerX: num('gallery.irisX', 0, 100, 'Centre x in percent'), centerY: num('gallery.irisY', 0, 100, 'Centre y in percent'), radiusX: num('gallery.irisRx', 1, 100, 'Radius x in percent'), radiusY: num('gallery.irisRy', 1, 100, 'Radius y in percent'), angle: num('gallery.irisAngle', -90, 90, 'Angle in degrees'), sharpArea: num('gallery.irisFeather', 0, 99, 'Sharp area in percent'), roundness: num('gallery.irisRound', 0, 100, 'Roundness in percent, 100 for an ellipse') },
  tiltShift: { blur: num('gallery.tiltBlur', 0, 500, 'Blur in pixels'), centerX: num('gallery.tiltX', 0, 100, 'Centre x in percent'), centerY: num('gallery.tiltY', 0, 100, 'Centre y in percent'), angle: num('gallery.tiltAngle', -90, 90, 'Angle in degrees'), focus: num('gallery.tiltFocus', 0, 50, 'Sharp band in percent of height'), transition: num('gallery.tiltTransition', 1, 50, 'Transition in percent of height') },
  pathBlur: { speed: num('gallery.pathSpeed', 0, 500, 'Speed in pixels'), taper: num('gallery.pathTaper', 0, 100, 'Taper in percent'), drawnPath: { path: 'gallery.pathDrawn', type: 'boolean', description: 'Blur along the active drawn path (all its sub-paths) instead of the one curve' } },
  fieldBlur: { pins: num('gallery.pins', 1, 4, 'Number of pins in use'), blur1: num('gallery.pin1blur', 0, 500, 'Pin 1 blur'), blur2: num('gallery.pin2blur', 0, 500, 'Pin 2 blur'), blur3: num('gallery.pin3blur', 0, 500, 'Pin 3 blur'), blur4: num('gallery.pin4blur', 0, 500, 'Pin 4 blur') },
  develop: {}, average: {},
};
const rangeParam = (name: string, min: number, max: number, description: string, required = false): CommandParam => ({ type: 'number', min, max, description, ...(required ? { required } : {}) });

function libParams(p: readonly LibParam[]): Record<string, CommandParam> {
  const out: Record<string, CommandParam> = {};
  for (const x of p) {
    if (x.kind === 'range') out[x.key] = { type: 'number', min: x.min, max: x.max, description: x.label };
    else if (x.kind === 'select') out[x.key] = { type: 'string', enum: x.options.map(([v]) => v), description: x.label };
    else if (x.kind === 'check') out[x.key] = { type: 'boolean', description: x.label };
    else if (x.kind === 'seed') out[x.key] = { type: 'integer', min: 0, description: `${x.label}; the same seed gives the same result` };
    else if (x.kind === 'color') out[x.key] = { type: 'string', description: `${x.label} as #rrggbb` };
    else if (x.kind === 'matrix') out[x.key] = { type: 'array', description: `${x.label}: ${x.size * x.size} numbers from ${x.min} to ${x.max}` };
    else if (x.kind === 'image') out[x.key] = { type: 'string', description: `${x.label}: the name of an open document or of a layer in this one` };
    else if (x.kind === 'path') out[x.key] = { type: 'string', description: `${x.label}: the name of a path in this document` };
    else out[x.key] = { type: 'array', description: x.label };
  }
  return out;
}

function filterVariants(): Record<string, Record<string, CommandParam>> {
  const v: Record<string, Record<string, CommandParam>> = {};
  for (const [kind, flat] of Object.entries(CORE)) v[kind] = Object.fromEntries(Object.entries(flat).map(([n, f]) => [n, { type: f.type, ...(f.min !== undefined ? { min: f.min, max: f.max } : {}), ...(f.enum ? { enum: f.enum } : {}), description: f.description }]));
  for (const f of LIBRARY) v[f.id] = libParams(f.params);
  return v;
}

function adjustVariants(): Record<string, Record<string, CommandParam>> {
  const v: Record<string, Record<string, CommandParam>> = {
    hsv: { hue: rangeParam('hue', -180, 180, 'Hue shift'), saturation: rangeParam('saturation', -100, 100, 'Saturation'), lightness: rangeParam('lightness', -100, 100, 'Lightness'), colorize: { type: 'boolean', description: 'Colorize' } },
    levels: { black: rangeParam('black', 0, 253, 'Input black point'), gamma: rangeParam('gamma', 0.1, 9.99, 'Midtone gamma'), white: rangeParam('white', 2, 255, 'Input white point'), outputBlack: rangeParam('outputBlack', 0, 255, 'Output black'), outputWhite: rangeParam('outputWhite', 0, 255, 'Output white') },
    exposure: { exposure: rangeParam('exposure', -20, 20, 'Exposure in stops'), offset: rangeParam('offset', -0.5, 0.5, 'Offset'), gamma: rangeParam('gamma', 0.01, 9.99, 'Gamma') },
    grain: { amount: rangeParam('amount', 0, 100, 'Grain amount'), size: rangeParam('size', 0.5, 4, 'Grain size'), roughness: rangeParam('roughness', 0, 100, 'Roughness'), colour: rangeParam('colour', 0, 100, 'Share of the grain that differs per colour channel'), speckle: rangeParam('speckle', 0, 100, 'Sparse bright and dark specks'), seed: { type: 'integer', min: 0, description: 'Seed' } },
    curves: {}, gradientMap: {},
  };
  for (const k of PARAM_KINDS) {
    const m: Record<string, CommandParam> = {};
    for (const s of PARAM_ADJUSTMENTS[k].params) {
      if (s.kind === 'range') m[s.key] = { type: 'number', min: s.min, max: s.max, description: s.label };
      else if (s.kind === 'check') m[s.key] = { type: 'boolean', description: s.label };
      else if (s.kind === 'select') m[s.key] = { type: 'string', enum: s.options.map(([x]) => x), description: s.label };
      else if (s.kind === 'color') m[s.key] = { type: 'object', description: `${s.label} as {r,g,b} from 0 to 255` };
      else m[s.key] = { type: 'string', description: s.label };
    }
    v[k] = m;
  }
  return v;
}

const POINTS: CommandParam = { type: 'array', required: true, description: 'Points in document pixels: [{x, y, pressure?}] with pressure 0 to 1, or [x, y, pressure?] triples' };
const MODE: CommandParam = { type: 'string', enum: ['replace', 'add', 'subtract', 'intersect'], description: 'How the new selection combines with the current one; replace by default' };
const PAINT_TOOLS = ['brush', 'pencil', 'eraser', 'mixer', 'colorReplace', 'smear', 'dodge', 'burn', 'sponge'];

function actionEntries(): CatalogueEntry[] {
  const a = (id: string, label: string, group: string, description: string, when: string, params: Record<string, CommandParam>, extra: Partial<CatalogueEntry> = {}): CatalogueEntry =>
    ({ id, label, kind: 'action', group, description, when, params, mutates: true, risky: false, ...extra });
  const box = { x: rangeParam('x', -30000, 60000, 'Left edge in document pixels', true), y: rangeParam('y', -30000, 60000, 'Top edge in document pixels', true), width: rangeParam('width', 1, 60000, 'Width in pixels', true), height: rangeParam('height', 1, 60000, 'Height in pixels', true), mode: MODE };
  return [
    a('paint.stroke', 'Paint Stroke', 'Paint', 'Draws one stroke through the points with the active painting tool, its size, colour and dynamics, on the active layer; one history step.',
      'Use when you want to paint, erase, dodge or burn along an exact path; choose the tool first with tool.select.brush or pass tool.', { points: POINTS, tool: { type: 'string', enum: PAINT_TOOLS, description: 'Painting tool to use; the active tool when omitted' } }),
    a('select.rect', 'Rectangular Selection', 'Select', 'Selects a rectangle in document pixels.', 'Use when you know the pixel box to select.', box),
    a('select.ellipse', 'Elliptical Selection', 'Select', 'Selects the ellipse inside a box in document pixels.', 'Use when you know the pixel box of the oval to select.', box),
    a('select.lasso', 'Lasso Selection', 'Select', 'Selects the polygon through the points.', 'Use when the area to select is an outline you can list as points.', { points: { ...POINTS, description: 'Corners of the polygon, at least 3: [{x, y}] or [x, y] pairs' }, mode: MODE, antialias: { type: 'boolean', description: 'Smooth the edge; true by default' } }),
    a('layer.set', 'Set Layer', 'Layer', 'Changes a layer name, visibility, opacity or blend mode; the active layer when id is omitted.', 'Use when you want to rename, hide, fade or re-blend a layer.',
      { id: { type: 'string', description: 'Layer id from the document; the active layer when omitted' }, name: { type: 'string', description: 'New name' }, visible: { type: 'boolean', description: 'Show or hide' }, opacity: rangeParam('opacity', 0, 1, 'Opacity from 0 to 1'), blend: { type: 'string', enum: BLEND_MODES.map((m) => m.id), description: 'Blend mode' }, active: { type: 'boolean', description: 'Make it the active layer' } }),
    a('adjust.apply', 'Apply Adjustment', 'Image', 'Applies an adjustment with exact values, to the pixels of the active layer or as an adjustment layer.', 'Use when you want a tonal or colour change with chosen values and no dialog.',
      { kind: { type: 'string', required: true, enum: ADJUSTMENT_KINDS, description: 'Which adjustment' }, as: { type: 'string', enum: ['pixels', 'layer'], description: 'pixels bakes it in; layer adds an editable adjustment layer; pixels by default' }, data: { type: 'object', description: 'The adjustment data as its project file keeps it, merged over the defaults; for curves and gradientMap' } },
      { variants: adjustVariants() }),
    a('filter.apply', 'Apply Filter', 'Filter', 'Applies a filter with exact settings to the active layer, inside the selection if there is one.', 'Use when you want a blur, sharpen, noise or effect with chosen values and no dialog.',
      { kind: { type: 'string', required: true, enum: Object.keys(filterVariants()), description: 'Which filter' }, settings: { type: 'object', description: 'All settings as one object; the settings of the kind may also be given as plain parameters' } },
      { variants: filterVariants() }),
    a('relight.apply', 'Apply Relight', 'Layer', 'Adds a Relight layer above the active layer, lit by a Look or by the lights given, rendered at full size on this computer; one history step.',
      'Use when you want to change the direction, colour or mood of the light in a photo with chosen lights and no panel.', {
        look: { type: 'string', enum: RELIGHT_LOOKS.map((l) => l.id), description: 'A ready-made Look; its lights are used unless lights is given' },
        lights: { type: 'array', description: 'Up to 8 lights: [{type: point|spot|sun|area|strip|ring, kelvin (1000 to 12000) or color {r,g,b}, intensity, softness, diffusion, distance (0 close to 100 far), pos {x,y} and aim {x,y} as fractions of the canvas, near and far (0 to 100, the depth band lit), pattern {kind: none|blinds|strip|window|leaves|caustics|lattice|arch|dapple|circle, scale, width, slats, opening, length, feather, rotation, invert, center {x,y} where the pattern sits, the aim when omitted}}]' },
        original: rangeParam('original', 0, 100, 'Percent of the original lighting kept'), shine: rangeParam('shine', 0, 100, 'Highlights on glossy forms'),
        delight: rangeParam('delight', 0, 100, 'Percent of the original light and shade flattened before the new lights'), shadows: rangeParam('shadows', 0, 100, 'Strength of cast shadows (with the depth model)'),
        roomOriginal: rangeParam('roomOriginal', 0, 100, 'Room light: percent of the room\'s own light kept around the subject (Original lighting when omitted)'),
        roomLight: rangeParam('roomLight', 0, 200, 'Light on room: percent of the lights that reach the room around the subject'),
        roomShadows: rangeParam('roomShadows', 0, 100, 'Room shadows: strength of the subject\'s shadows on the room'),
        roomDepth: rangeParam('roomDepth', 25, 300, 'Room depth: percent of the solved distance between the subject and the room behind'),
        ambient: { type: 'string', description: 'Colour of the kept original light, like #ffe8d0' },
        split: { type: 'string', enum: ['auto', 'marigold', 'classic', 'off'], description: 'How the photo\'s own light is taken out before the new lights: auto or classic (per-material shading, the subject\'s own detail kept), marigold (learned albedo, repaints surfaces, only when asked), or off (add light on top)' },
      }),
  ];
}

async function relightApply(p: Record<string, unknown>): Promise<RunResult> {
  if (!deps!.applyRelight) return fail('Relight is not available in this window.');
  const look = typeof p.look === 'string' ? RELIGHT_LOOKS.find((l) => l.id === p.look) : undefined;
  if (p.look !== undefined && !look) return fail(`Unknown look "${String(p.look)}". Choose one of ${RELIGHT_LOOKS.map((l) => l.id).join(', ')}.`);
  const start = look ? look.make() : defaultRelight();
  const lights = Array.isArray(p.lights) ? p.lights.map((x) => {
    const o = isObj(x) ? { ...x } : {};
    if (typeof o.kelvin === 'number' && !o.color) o.color = kelvinToRgb(o.kelvin);
    if (o.color && o.kelvin === undefined) o.kelvin = null;
    return o;
  }) : start.lights;
  const ambient = typeof p.ambient === 'string' ? rgbOf(p.ambient) : null;
  if (p.ambient !== undefined && !ambient) return fail('ambient must be a colour like #ffe8d0.');
  const content = relightFrom({ ...start, lights, ...(['original', 'shine', 'delight', 'shadows', 'roomOriginal', 'roomLight', 'roomShadows', 'roomDepth'] as const).reduce((m, k) => (typeof p[k] === 'number' ? { ...m, [k]: p[k] } : m), {}), ...(ambient ? { ambient } : {}), ...(look ? { look: look.id } : {}), ...(typeof p.split === 'string' ? { split: p.split } : {}) });
  if (!content || !content.lights.length) return fail('Give at least one light, or a look.');
  const made = await deps!.applyRelight(content);
  if (!made) return fail('Relight could not run: it needs an 8-bit RGB document and no Relight session open in the window.');
  return { ok: true, result: { message: `Added a Relight layer with ${content.lights.length} light${content.lights.length > 1 ? 's' : ''}${made.depth === 'model' ? ', shaped by Depth Anything' : ', on an estimated shape (download Depth Anything for cast shadows)'}${made.split === 'marigold' ? ', the old light taken out with Marigold' : made.split === 'classic' ? ', the old light taken out with the subject\'s own detail kept' : ', light added on top of the old'}.`, layer: made.id, undoName: deps!.engine.current?.history.undoName } };
}

const describeParam = (n: string, s: CommandParam): string => `${n} (${s.enum ? `one of ${s.enum.join(', ')}` : s.min !== undefined && s.max !== undefined ? `${s.type} from ${s.min} to ${s.max}` : s.type})`;
const exampleOf = (s: CommandParam): string => (s.enum ? String(s.enum[0]) : s.type === 'boolean' ? 'true' : s.type === 'string' ? 'text' : s.type === 'array' ? '\'[{"x":10,"y":20}]\'' : s.type === 'object' ? '\'{}\'' : s.min !== undefined && s.max !== undefined ? String(Math.round((s.min + (s.max - s.min) * 0.02) * 10) / 10) : '1');

function coerce(name: string, spec: CommandParam, raw: unknown): { value?: unknown; error?: string } {
  const bad = (why: string): { error: string } => ({ error: `${name}: ${why} Give it as ${name}=${exampleOf(spec)}.` });
  let v = raw;
  if (spec.type === 'number' || spec.type === 'integer') {
    if (typeof v === 'string' && v.trim() !== '') v = Number(v);
    if (typeof v !== 'number' || !Number.isFinite(v)) return bad(`"${String(raw)}" is not a number.`);
    if (spec.type === 'integer' && !Number.isInteger(v)) return bad(`${v} is not a whole number.`);
    if (spec.min !== undefined && v < spec.min) return bad(`${v} is below the smallest value ${spec.min}.`);
    if (spec.max !== undefined && v > spec.max) return bad(`${v} is above the largest value ${spec.max}.`);
    return { value: v };
  }
  if (spec.type === 'boolean') {
    if (v === 'true' || v === '1' || v === 1) v = true;
    else if (v === 'false' || v === '0' || v === 0) v = false;
    return typeof v === 'boolean' ? { value: v } : bad(`"${String(raw)}" is not true or false.`);
  }
  if (spec.type === 'array' || spec.type === 'object') {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return bad('is not valid JSON.'); } }
    return (spec.type === 'array' ? Array.isArray(v) : isObj(v)) ? { value: v } : bad(`must be ${spec.type === 'array' ? 'a list' : 'an object'}.`);
  }
  if (typeof v !== 'string') v = String(v);
  if (spec.enum && !spec.enum.map(String).includes(v as string)) return bad(`"${String(raw)}" is not one of ${spec.enum.join(', ')}.`);
  return { value: v };
}

function validate(params: Record<string, unknown>, specs: Record<string, CommandParam>, open = false): { values?: Record<string, unknown>; error?: string } {
  const values: Record<string, unknown> = {};
  for (const [n, s] of Object.entries(specs)) {
    if (params[n] === undefined || params[n] === '') { if (s.required) return { error: `Missing ${describeParam(n, s)}. Run it again with ${n}=${exampleOf(s)}.` }; continue; }
    const c = coerce(n, s, params[n]);
    if (c.error) return { error: c.error };
    values[n] = c.value;
  }
  const extra = Object.keys(params).filter((k) => !(k in specs));
  if (extra.length && !open) return { error: `Unknown parameter ${extra.map((k) => `"${k}"`).join(', ')}. This command takes ${Object.keys(specs).length ? Object.keys(specs).join(', ') : 'no parameters'}.` };
  return { values };
}

let deps: CatalogueDeps | null = null;
let cache: { entries: CatalogueEntry[]; missing: string[] } | null = null;
let timer = 0;

function optionNames(specs: OptionSpec[]): Array<{ name: string; spec: OptionSpec; index: number }> {
  const seen = new Map<string, number>(), out: Array<{ name: string; spec: OptionSpec; index: number }> = [];
  specs.forEach((spec, index) => {
    if (spec.kind === 'title' || spec.kind === 'readout' || spec.kind === 'button') return;
    const base = camel('label' in spec && spec.label ? spec.label : 'option') || 'option', n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ name: n === 1 ? base : `${base}${n}`, spec, index });
  });
  return out;
}

function optionParam(spec: OptionSpec): CommandParam | null {
  if (spec.kind === 'range') return { type: 'number', required: true, min: spec.min, max: spec.max, description: `${spec.label}${spec.unit ? ` in ${spec.unit}` : ''}` };
  if (spec.kind === 'number') return { type: 'number', required: true, ...(spec.min !== undefined ? { min: spec.min } : {}), ...(spec.max !== undefined ? { max: spec.max } : {}), description: `${spec.label}${spec.unit ? ` in ${spec.unit}` : ''}` };
  if (spec.kind === 'toggle') return { type: 'boolean', required: true, description: spec.label };
  if (spec.kind === 'segment') return { type: 'string', required: true, enum: spec.choices.map((c) => c.id), description: spec.label ?? 'Choice' };
  if (spec.kind === 'select') return { type: 'string', required: true, ...(spec.live ? {} : { enum: spec.choices.map((c) => c.id) }), description: spec.label };
  if (spec.kind === 'color') return { type: 'string', required: true, description: `${spec.label} as #rrggbb` };
  return null;
}

const safe = <T>(f: () => T): T | undefined => { try { return f(); } catch { return undefined; } };

function toolEntries(d: CatalogueDeps): { entries: CatalogueEntry[]; missing: string[] } {
  const entries: CatalogueEntry[] = [], missing: string[] = [];
  for (const t of toolList()) {
    const phrase = TOOL_WHEN[t.id];
    if (!phrase) missing.push(`tool.select.${t.id}`);
    const hint = safe(() => t.hint(d.engine)) ?? '';
    entries.push({ id: `tool.select.${t.id}`, label: `${t.label} Tool`, kind: 'tool', group: 'Tools', description: `Makes the ${t.label} tool the active tool${t.key ? ` (key ${t.key})` : ''}.${hint ? ` ${hint}` : ''}`, when: `Use when you want ${phrase ?? `the ${t.label} tool`}.`, mutates: false, risky: false });
    for (const { name, spec } of optionNames(safe(() => t.options?.(d.engine)) ?? [])) {
      const p = optionParam(spec);
      if (!p) continue;
      const label = 'label' in spec && spec.label ? spec.label : name;
      entries.push({ id: `tool.options.${t.id}.${name}`, label: `${t.label}: ${label}`, kind: 'option', group: 'Tool options', description: `Sets ${label} for the ${t.label} tool.`, when: `Use when the ${t.label} tool needs its ${label.toLowerCase()} changed before you use it.`, params: { value: p }, mutates: false, risky: false });
    }
  }
  return { entries, missing };
}

function commandEntry(c: Command, label: string, miss: string[]): CatalogueEntry {
  const m = metaFor(c.id, label);
  const group = c.group ?? m?.group, description = c.description ?? m?.description, when = c.when ?? m?.when;
  if (!group || !description || !when) miss.push(c.id);
  return { id: c.id, label, kind: 'command', group: group ?? 'Other', description: description ?? label, when: when ?? '', ...(c.params ?? m?.params ? { params: c.params ?? m?.params } : {}), mutates: c.mutates ?? m?.mutates ?? false, risky: c.risky ?? m?.risky ?? false, ...(c.keys && c.keys.length ? { keys: [...c.keys] } : {}) };
}

function build(): { entries: CatalogueEntry[]; missing: string[] } {
  if (cache) return cache;
  if (!deps) return { entries: [], missing: [] };
  const miss: string[] = [], entries: CatalogueEntry[] = [];
  for (const c of deps.commands.all()) {
    if (c.id === 'recent-heading') continue;
    entries.push(commandEntry(c, deps.commands.label(c), miss));
  }
  const t = toolEntries(deps);
  entries.push(...t.entries, ...actionEntries());
  cache = { entries, missing: [...miss, ...t.missing] };
  return cache;
}

function live(e: CatalogueEntry): CatalogueEntry {
  if (!deps) return e;
  if (e.kind === 'command') { const c = deps.commands.get(e.id); return { ...e, enabled: c ? deps.commands.enabled(c) : false }; }
  if (e.kind === 'action') return { ...e, enabled: !!deps.engine.current };
  if (e.kind === 'option') {
    const [, , toolId, name] = e.id.split('.'), t = getTool(toolId as Tool['id']);
    const hit = optionNames(safe(() => t?.options?.(deps!.engine)) ?? []).find((x) => x.name === name);
    const spec = hit?.spec;
    const value = spec && 'get' in spec ? safe(() => spec.get()) : undefined;
    return { ...e, enabled: true, value: spec?.kind === 'color' && value && typeof value === 'object' ? hexOf(value as { r: number; g: number; b: number }) : value };
  }
  return { ...e, enabled: true };
}

export function listCommands(filter?: { group?: string; text?: string }): CatalogueEntry[] {
  const text = filter?.text?.trim().toLowerCase(), group = filter?.group?.trim().toLowerCase();
  return build().entries.filter((e) => (!group || e.group.toLowerCase() === group) && (!text || `${e.id} ${e.label} ${e.description} ${e.when}`.toLowerCase().includes(text))).map(live);
}

export function describeCommand(id: string): CatalogueEntry | null {
  const e = build().entries.find((x) => x.id === id);
  return e ? live(e) : null;
}

export function catalogueReport(): { size: number; missing: string[]; groups: Record<string, number> } {
  const { entries, missing } = build(), groups: Record<string, number> = {};
  for (const e of entries) groups[e.group] = (groups[e.group] ?? 0) + 1;
  return { size: entries.length, missing, groups };
}

const fail = (error: string): RunResult => ({ ok: false, error: error.replace(/\.+\s*$/, '') });
const unknown = (id: string): RunResult => {
  const tail = id.split(/[.:-]/).pop() ?? id, near = build().entries.filter((e) => e.id.includes(tail) || e.label.toLowerCase().includes(tail.toLowerCase())).slice(0, 5).map((e) => e.id);
  return fail(`No command has the id "${id}". ${near.length ? `Did you mean ${near.join(', ')}? ` : ''}Run listCommands with text set to a word from the label to find it.`);
};

async function settled(): Promise<void> {
  const e = deps!.engine;
  for (let i = 0; i < 2400 && e.busyWith; i++) await sleep(25);
}

const steps = (): number => deps!.engine.current?.history.steps.current ?? 0;

function pointsOf(raw: unknown, min: number): { pts: Array<{ x: number; y: number; pressure: number }>; error?: string } {
  const pts: Array<{ x: number; y: number; pressure: number }> = [];
  for (const r of raw as unknown[]) {
    const x = Array.isArray(r) ? Number(r[0]) : isObj(r) ? Number(r.x) : NaN, y = Array.isArray(r) ? Number(r[1]) : isObj(r) ? Number(r.y) : NaN;
    const pr = Array.isArray(r) ? r[2] : isObj(r) ? r.pressure : undefined, pressure = pr === undefined ? 1 : Number(pr);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(pressure)) return { pts, error: 'Every point needs numeric x and y (and pressure from 0 to 1 when given), for example [{"x":10,"y":20,"pressure":0.6}].' };
    pts.push({ x, y, pressure: Math.min(1, Math.max(0, pressure)) });
  }
  return pts.length >= min ? { pts } : { pts, error: `Give at least ${min} point${min === 1 ? '' : 's'}.` };
}

function toolContext(e: Engine): ToolContext {
  const view = { zoom: 1, dpr: 1, width: e.current?.doc.width ?? 1, height: e.current?.doc.height ?? 1, toScreen: (p: { x: number; y: number }) => ({ ...p }), toDoc: (p: { x: number; y: number }) => ({ ...p }) };
  return { engine: e, view: () => view, paint: () => ({ accent: '#4f8cff', handle: '#ffffff', antsA: '#000000', antsB: '#ffffff' }), antsPhase: () => 0 };
}

function stroke(v: Record<string, unknown>): RunResult {
  const e = deps!.engine, p = e.current!;
  if (typeof v.tool === 'string') e.setTool(v.tool as Tool['id']);
  const t = getTool(e.tool);
  if (!t?.down || !t.move || !t.up || !PAINT_TOOLS.includes(t.id)) return fail(`The ${t?.label ?? e.tool} tool does not paint. Run tool.select.brush first, or pass tool=brush.`);
  const { pts, error } = pointsOf(v.points, 1);
  if (error) return fail(error);
  const before = p.history.steps.current, ctx = toolContext(e);
  const ptr = (q: { x: number; y: number; pressure: number }): ToolPointer => ({ doc: { x: q.x, y: q.y }, screen: { x: q.x, y: q.y }, button: 0, shift: false, alt: false, mod: false, clicks: 1, pressure: q.pressure });
  try {
    t.down(ctx, ptr(pts[0]));
    for (const q of pts.slice(1)) t.move(ctx, ptr(q));
  } finally { t.up(ctx, ptr(pts[pts.length - 1])); }
  if (p.history.steps.current === before) return fail(`Nothing was painted. Check that the active layer is an unlocked, visible pixel layer (layer.set with active, or add a layer with new-layer) and that the points lie inside the document.`);
  return { ok: true, result: { message: `Stroked ${pts.length} point${pts.length === 1 ? '' : 's'} with the ${t.label} tool.`, undoName: p.history.undoName } };
}

function selectShape(shape: 'rect' | 'ellipse' | 'lasso', v: Record<string, unknown>): RunResult {
  const e = deps!.engine, mode = (v.mode ?? 'replace') as 'replace';
  if (shape === 'lasso') {
    const { pts, error } = pointsOf(v.points, 3);
    if (error) return fail(error);
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), x0 = Math.floor(Math.min(...xs)), y0 = Math.floor(Math.min(...ys)), x1 = Math.ceil(Math.max(...xs)), y1 = Math.ceil(Math.max(...ys));
    const doc = e.current!.doc;
    const mask = SelectionMask.fromPath(doc.width, doc.height, { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }, (c) => { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath(); c.fill(); }, v.antialias !== false);
    if (!mask) return fail('The outline lies outside the document. Give points inside 0 to the document width and height.');
    e.applySelection(mask, mode, 'Lasso');
  } else {
    const x = Math.round(v.x as number), y = Math.round(v.y as number), w = Math.max(1, Math.round(v.width as number)), h = Math.max(1, Math.round(v.height as number)), bits = new Uint8Array(w * h);
    if (shape === 'ellipse') { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const a = ((i + 0.5) / w) * 2 - 1, b = ((j + 0.5) / h) * 2 - 1; if (a * a + b * b <= 1) bits[j * w + i] = 255; } } else bits.fill(255);
    const mask = SelectionMask.cropped(x, y, w, h, bits);
    if (!mask) return fail('That box lies outside the document. Give x, y, width and height that overlap it.');
    e.applySelection(mask, mode, shape === 'ellipse' ? 'Elliptical Marquee' : 'Rectangular Marquee');
  }
  const s = e.current?.selection;
  return s ? { ok: true, result: { message: `The selection is now ${s.w} by ${s.h} at ${s.x}, ${s.y}.`, selection: { x: s.x, y: s.y, width: s.w, height: s.h } } } : fail('Nothing is selected: the shape lies outside the document.');
}

function layerSet(v: Record<string, unknown>): RunResult {
  const e = deps!.engine, p = e.current!, l = typeof v.id === 'string' ? p.layer(v.id) : p.activeLayer;
  if (!l) return fail(typeof v.id === 'string' ? `No layer has the id ${v.id}. Read the layer ids from the document (get_document) and retry.` : 'No layer is active. Pass id, or add a layer with new-layer.');
  e.selectLayer(l.id);
  p.history.begin('Layer Properties', p.snapshot());
  try {
    if (typeof v.name === 'string' && v.name !== l.name) e.renameLayer(l.id, v.name);
    if (typeof v.visible === 'boolean' && v.visible !== (l.visible !== false)) e.toggleVisibility(l.id);
    if (typeof v.opacity === 'number') e.setOpacity(v.opacity);
    if (typeof v.blend === 'string') e.setBlend(v.blend as Parameters<Engine['setBlend']>[0]);
  } finally { p.history.end(p.snapshot()); e.emit('history', null); }
  const now = p.layer(l.id);
  return { ok: true, result: { message: `Updated ${now?.name}.`, id: l.id, name: now?.name, visible: now?.visible !== false, opacity: now?.opacity, blend: now?.blend ?? 'normal' } };
}

function setPath(o: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let at = o;
  for (const k of parts.slice(0, -1)) { if (!isObj(at[k])) at[k] = {}; at = at[k] as Record<string, unknown>; }
  at[parts[parts.length - 1]] = value;
}

async function filterApply(params: Record<string, unknown>): Promise<RunResult> {
  const kinds = filterVariants(), kind = String(params.kind ?? '');
  if (!(kind in kinds)) return fail(`"${kind}" is not a filter formvis has. Use one of: ${Object.keys(kinds).join(', ')}.`);
  const { kind: _k, settings, ...flat } = params;
  const specs = kinds[kind], given = { ...(isObj(settings) ? settings : {}), ...flat };
  const nested = isObj(settings) && ('lib' in settings || 'develop' in settings || 'smart' in settings || 'gallery' in settings || 'shake' in settings);
  const v = nested ? { values: given } : validate(given, specs, kind === 'develop' || (specs && !Object.keys(specs).length && isObj(settings)));
  if (v.error) return fail(`${filterName(kind)}: ${v.error}`);
  let out: Record<string, unknown> = {};
  if (CORE[kind]) for (const [n, val] of Object.entries(v.values!)) { const f = CORE[kind][n]; if (f) setPath(out, f.path, val); else out[n] = val; }
  else out = v.values!;
  const e = deps!.engine;
  let said = '';
  const off = e.on('notice', (n) => { said = (n as { text?: string } | null)?.text ?? said; });
  let ok = false;
  try { ok = await deps!.applyFilter(kind, out); } finally { off?.(); }
  await settled();
  if (!ok) {
    const al = e.activeLayer;
    return fail(said || (al && (al.text || al.shape || al.smart) ? `${al.name} is a ${al.text ? 'text' : al.shape ? 'shape' : 'smart object'} layer. Run rasterize first, then apply the filter.` : `${kind} could not be applied to ${al?.name ?? 'the document'}. A visible, unlocked pixel layer is needed.`));
  }
  return { ok: true, result: { message: `Applied ${filterName(kind)} to ${e.activeLayer?.name}.`, undoName: e.current?.history.undoName } };
}

function adjustApply(params: Record<string, unknown>): RunResult {
  const kind = String(params.kind ?? ''), variants = adjustVariants();
  if (!(kind in variants)) return fail(`"${kind}" is not an adjustment formvis has. Use one of: ${ADJUSTMENT_KINDS.join(', ')}.`);
  const { kind: _k, as, data, ...flat } = params;
  const v = validate(flat, variants[kind]);
  if (v.error) return fail(`${ADJUSTMENT_LABELS[kind as keyof typeof ADJUSTMENT_LABELS]}: ${v.error}`);
  const vals = v.values!, base = defaultAdjustmentData(kind as Parameters<typeof defaultAdjustmentData>[0]) as Record<string, unknown>;
  if ((PARAM_KINDS as string[]).includes(kind)) base.params = paramValues(kind as ParamKind, vals);
  else if (kind === 'hsv') { delete base.hsvSettings; Object.assign(base, vals); }
  else if (kind === 'exposure') base.exposureSettings = { ...(base.exposureSettings as object), ...vals };
  else if (kind === 'grain') base.grainSettings = { ...(base.grainSettings as object), ...vals };
  else if (kind === 'levels') { const lv = base.levels as { ranges: object[] }; lv.ranges[0] = { ...lv.ranges[0], ...vals }; }
  if (isObj(data)) Object.assign(base, data);
  const layer = as === 'layer';
  if (!layer && !deps!.engine.activeLayer?.raster) return fail('The active layer has no pixels to adjust. Pick a pixel layer, rasterize a text or shape layer, or pass as=layer for an adjustment layer.');
  if (!deps!.applyAdjustment(kind, base, layer)) return fail('The adjustment could not run: a dialog may be open in the window. Close it, then retry.');
  return { ok: true, result: { message: `${layer ? 'Added' : 'Applied'} ${ADJUSTMENT_LABELS[kind as keyof typeof ADJUSTMENT_LABELS]}${layer ? ' as an adjustment layer' : ''}.`, undoName: deps!.engine.current?.history.undoName } };
}

function setOption(id: string, params: Record<string, unknown>): RunResult {
  const [, , toolId, name] = id.split('.'), e = deps!.engine, t = getTool(toolId as Tool['id']);
  const hit = optionNames(safe(() => t?.options?.(e)) ?? []).find((x) => x.name === name);
  if (!t || !hit) return fail(`The ${toolId} tool has no option "${name}" now. Read the options of the tool with describeCommand, then retry.`);
  const p = optionParam(hit.spec)!, s = hit.spec;
  const c = validate(params, { value: p });
  if (c.error) return fail(c.error);
  const val = c.values!.value;
  if (s.kind === 'select' && s.live && !s.live().some((x) => x.id === val)) return fail(`"${String(val)}" is not available now. Choose one of ${s.live().map((x) => x.id).join(', ')}.`);
  if (s.kind === 'color') { const rgb = rgbOf(String(val)); if (!rgb) return fail('value must be a colour like #ff8800.'); s.set(rgb); }
  else if (s.kind === 'range' || s.kind === 'number' || s.kind === 'toggle' || s.kind === 'segment' || s.kind === 'select') (s.set as (v: unknown) => void)(val);
  return { ok: true, result: { message: `Set ${t.label} ${'label' in s ? s.label : name} to ${String(val)}.`, value: val } };
}

export async function runCommand(id: string, params: Record<string, unknown> = {}): Promise<RunResult> {
  if (!deps) return fail('formvis has not finished starting. Wait a moment, then retry.');
  const entry = build().entries.find((x) => x.id === id);
  if (!entry) return unknown(id);
  const p = isObj(params) ? params : {};
  if (entry.kind === 'action' && !deps.engine.current) return fail('No document is open. Run new or open a project first, then retry.');
  try {
    if (entry.kind === 'tool') { deps.engine.setTool(id.slice('tool.select.'.length) as Tool['id']); return { ok: true, result: { message: `The ${entry.label} is active.` } }; }
    if (entry.kind === 'option') return setOption(id, p);
    if (id === 'filter.apply') return await filterApply(p);
    if (id === 'adjust.apply') return adjustApply(p);
    if (id === 'relight.apply') return await relightApply(p);
    if (entry.kind === 'action') {
      const v = validate(p, entry.params ?? {});
      if (v.error) return fail(v.error);
      if (id === 'paint.stroke') return stroke(v.values!);
      if (id === 'layer.set') return layerSet(v.values!);
      return selectShape(id.slice('select.'.length) as 'rect', v.values!);
    }
    const cmd = deps.commands.get(id);
    if (!cmd) return unknown(id);
    if (!deps.commands.enabled(cmd)) return fail(`"${entry.label}" cannot run right now. ${entry.description} It needs an open document, the right kind of layer active (layer.set with active=true), and a selection if it works on one (select.rect), and some commands are off in the current colour mode or bit depth.`);
    const v = validate(p, entry.params ?? {});
    if (v.error) return fail(v.error);
    const before = steps();
    const { result } = await deps.commands.call(id, v.values);
    await settled();
    const dialog = document.querySelector('.cv-scrim:not([hidden])');
    const out: Record<string, unknown> = { message: `Ran ${entry.label}.`, recorded: steps() - before };
    if (result !== undefined && (typeof result !== 'object' || result === null || Array.isArray(result) || Object.getPrototypeOf(result) === Object.prototype)) out.returned = result;
    if (dialog) out.note = 'A dialog is open in the formvis window. A person must finish or cancel it before further edits.';
    return { ok: true, result: out };
  } catch (err) {
    return fail(`${entry.label} failed: ${err instanceof Error ? err.message : String(err)}. Check the document state with get_document, then retry.`);
  }
}

export async function runCommands(list: Array<{ id: string; params?: Record<string, unknown> }>, name = 'Run Commands'): Promise<{ ok: boolean; results: RunResult[]; error?: string }> {
  if (!deps) return { ok: false, results: [], error: 'formvis has not finished starting. Wait a moment, then retry.' };
  const p = deps.engine.current, results: RunResult[] = [];
  const group = !!p && list.length > 1;
  if (group) p!.history.begin(name, p!.snapshot());
  try {
    for (const [i, item] of list.entries()) {
      const r = await runCommand(item.id, item.params ?? {});
      results.push(r);
      if (!r.ok) return { ok: false, results, error: `Command ${i + 1} of ${list.length} (${item.id}) stopped the list: ${r.error} Commands before it were kept as one history step.` };
    }
  } finally { if (group) { await settled(); p!.history.end(p!.snapshot()); for (const k of ['doc', 'selection', 'active', 'history', 'render', 'options'] as const) deps.engine.emit(k, null); } }
  return { ok: true, results };
}

async function mirror(): Promise<void> {
  if (!deps) return;
  const { entries, missing } = build();
  if (!(await serviceReady())) return;   // no engine service to tell
  try {
    await fetch('/api/commands/catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ size: entries.length, missing, commands: entries }) });
  } catch { return; }
}

export function attachCatalogue(d: CatalogueDeps): void {
  deps = d;
  cache = null;
  const again = (): void => { cache = null; window.clearTimeout(timer); timer = window.setTimeout(() => void mirror(), 600); };
  d.commands.onChange = again;
  again();
}

export const catalogue = { listCommands, describeCommand, runCommand, runCommands, report: catalogueReport };
