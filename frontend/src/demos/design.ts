import { Raster, defaultEffects, type Engine } from '../engine';
import { ensureBundledFont } from '../engine/bundled-fonts';
import { boxedShapePath, DEFAULT_PATH_SHAPE } from '../engine/shape-paths';
import type { BlendMode, LayerEffects, RGB, ShapeGradient, ShapeStroke, TextSpec } from '../engine/types';
import type { DemoMedia } from './media';

/** The design demo (demos/design): "lantern-night-kit", three artboards (Post, Story, Cover) with smart-object
 *  photographs under Smart Filters, shape layers, live type in the bundled families and layer styles. */

type Box = { x: number; y: number; w: number; h: number };

const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));
const wait = (ms: number): Promise<void> => new Promise((done) => window.setTimeout(done, ms));
const rgb = (hex: string): RGB => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });

const INK = '#07040d';
const GOLD = '#ffc46b';
const PAPER = '#fff3e0';
const PINK = '#ff3d8b';
const VIOLET = '#8a4dff';

interface Look { family?: string; weight?: number; tracking?: number; lineHeight?: number; align?: 'left' | 'center' | 'right'; italic?: boolean; name?: string; fx?: (fx: LayerEffects) => void }

async function type(e: Engine, content: string, at: [number, number], size: number, colour: string, look: Look = {}): Promise<string | null> {
  const family = look.family ?? 'Montserrat', weight = look.weight ?? 400;
  await ensureBundledFont(family, weight >= 700);
  const spec: TextSpec = { ...e.textSettings, content, family, size, color: rgb(colour), align: look.align ?? 'left', bold: weight >= 700, weight, italic: look.italic ?? false, tracking: look.tracking ?? 0, lineHeight: look.lineHeight ?? 1.1, box: null };
  await e.createTextLayer({ x: at[0], y: at[1] }, spec);
  const layer = e.current?.activeLayer;
  if (!layer) return null;
  if (look.name) e.renameLayer(layer.id, look.name);
  if (look.fx) {
    const fx = defaultEffects();
    look.fx(fx);
    e.setLayerEffects(layer.id, fx);
  }
  return layer.id;
}

interface Shape { name: string; box: Box; radius?: number; fill?: string | null; stroke?: ShapeStroke | null; gradient?: ShapeGradient; opacity?: number; blend?: BlendMode; ellipse?: boolean; fx?: (fx: LayerEffects) => void }

function shape(e: Engine, s: Shape): string | null {
  const path = boxedShapePath(s.ellipse ? 'ellipse' : 'rectangle', s.box, { ...DEFAULT_PATH_SHAPE, cornerRadius: s.radius ?? 0 });
  e.addShapeLayers([{ name: s.name, path, fill: s.fill ? rgb(s.fill) : null, stroke: s.stroke ?? null, ...(s.gradient ? { gradient: s.gradient } : {}), ...(s.opacity !== undefined ? { opacity: s.opacity } : {}), ...(s.blend ? { blend: s.blend } : {}) }]);
  const layer = e.current?.activeLayer;
  if (!layer) return null;
  if (s.fx) {
    const fx = defaultEffects();
    s.fx(fx);
    e.setLayerEffects(layer.id, fx);
  }
  return layer.id;
}

const fade = (from: string, to: string, angle: number, a0 = 1, a1 = 0): ShapeGradient => ({ type: 'linear', angle, stops: [{ at: 0, color: rgb(from), alpha: a0 }, { at: 1, color: rgb(to), alpha: a1 }] });

function scaled(from: HTMLCanvasElement, w: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round(from.height * (w / from.width));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(from, 0, 0, c.width, c.height);
  return c;
}

async function smartPhoto(e: Engine, m: DemoMedia, pack: string, name: string, at: [number, number], width: number | null, filters: () => void): Promise<void> {
  const image = await m.image(pack);
  const use = width ? scaled(image, width) : image;
  e.insertRasterLayer(Raster.from(use, use.width, use.height), name, at[0], at[1], {}, `Place ${name}`);
  e.convertToSmartObject();
  filters();
  await wait(250);
}

const glowFilter = (glow: number, clear: number, grain: number, bg: [number, number, number]): Record<string, unknown> => ({
  colors: { fg: [0, 0, 0], bg },
  lib: { filterGallery: { effects: [
    { filter: 'diffuseGlow', values: { graininess: 4, glowAmount: glow, clearAmount: clear }, visible: true },
    { filter: 'filmGrain', values: { grain, highlightArea: 2, intensity: 6 }, visible: true },
  ] } },
});

const titleStyle = (glow: string) => (fx: LayerEffects): void => {
  fx.gradientOverlay = { ...fx.gradientOverlay, enabled: true, from: rgb('#fff6e6'), to: rgb('#ffb347'), angle: 90, opacity: 1 };
  fx.outerGlow = { ...fx.outerGlow, enabled: true, color: rgb(glow), opacity: 0.55, size: 26, blend: 'screen' };
  fx.dropShadow = { ...fx.dropShadow, enabled: true, color: rgb('#000000'), opacity: 0.6, distance: 6, size: 10, angle: 100 };
};

const pillStyle = (fx: LayerEffects): void => {
  fx.dropShadow = { ...fx.dropShadow, enabled: true, color: rgb(PINK), opacity: 0.55, distance: 0, size: 30, angle: 90, blend: 'normal' };
  fx.innerGlow = { ...fx.innerGlow, enabled: true, color: rgb('#ffffff'), opacity: 0.35, size: 6, blend: 'screen' };
};

function artboard(e: Engine, name: string, rect: Box): void {
  e.newArtboard(rect, rgb(INK), name);
}

async function post(e: Engine, m: DemoMedia, ox: number): Promise<void> {
  artboard(e, 'Post 1080x1350', { x: ox, y: 0, w: 1080, h: 1350 });
  await smartPhoto(e, m, 'lanterns', 'Lanterns (smart object)', [ox - 70, 30], 1160, () => e.addSmartFilter('filterGallery', glowFilter(6, 17, 3, [255, 150, 90])));
  shape(e, { name: 'Fade top', box: { x: ox, y: 0, w: 1080, h: 260 }, fill: INK, gradient: fade(INK, INK, 90, 1, 0) });
  shape(e, { name: 'Fade bottom', box: { x: ox, y: 600, w: 1080, h: 250 }, fill: INK, gradient: fade(INK, INK, 90, 0, 1) });
  await type(e, 'AUTUMN MARKET   /   FREE ENTRY', [ox + 72, 74], 24, GOLD, { weight: 700, tracking: 9, name: 'Kicker' });
  await type(e, 'LANTERN NIGHT', [ox + 56, 902], 196, PAPER, { family: 'Bebas Neue', tracking: 4, lineHeight: 1, name: 'Title', fx: titleStyle(PINK) });
  await type(e, 'An evening of paper light, drums and hot tea on the harbour.', [ox + 76, 972], 34, '#f2d9ff', { family: 'Playfair Display', italic: true, name: 'Standfirst' });
  shape(e, { name: 'Rule', box: { x: ox + 76, y: 1050, w: 928, h: 2 }, fill: GOLD, opacity: 0.55 });
  await type(e, 'WHEN', [ox + 76, 1094], 20, GOLD, { weight: 700, tracking: 8, name: 'Label when' });
  await type(e, 'SAT 14 NOV', [ox + 76, 1170], 84, PAPER, { family: 'Bebas Neue', tracking: 2, lineHeight: 1, name: 'Date' });
  await type(e, '17:00 TO 23:00', [ox + 78, 1214], 24, '#f2d9ff', { weight: 700, tracking: 4, name: 'Hours' });
  await type(e, 'WHERE', [ox + 456, 1094], 20, GOLD, { weight: 700, tracking: 8, name: 'Label where' });
  await type(e, 'HARBOUR SQUARE', [ox + 456, 1170], 84, PAPER, { family: 'Bebas Neue', tracking: 2, lineHeight: 1, name: 'Place' });
  await type(e, 'NORTH QUAY, GATE 3', [ox + 458, 1214], 24, '#f2d9ff', { weight: 700, tracking: 4, name: 'Address' });
  shape(e, { name: 'Button', box: { x: ox + 76, y: 1256, w: 420, h: 62 }, radius: 31, fill: PINK, gradient: fade(PINK, VIOLET, 0, 1, 1), fx: pillStyle });
  await type(e, 'RESERVE A LANTERN', [ox + 124, 1296], 24, '#ffffff', { weight: 700, tracking: 6, name: 'Button label' });
  shape(e, { name: 'Ticket ring', box: { x: ox + 868, y: 1230, w: 136, h: 96 }, radius: 48, stroke: { color: rgb(GOLD), width: 3, align: 'inside' } });
  await type(e, 'FREE\nENTRY', [ox + 902, 1272], 26, GOLD, { weight: 700, tracking: 4, lineHeight: 1.15, align: 'left', name: 'Ring label' });
}

async function story(e: Engine, m: DemoMedia, ox: number): Promise<void> {
  artboard(e, 'Story 1080x1920', { x: ox, y: 0, w: 1080, h: 1920 });
  await smartPhoto(e, m, 'tree', 'Tree lanterns (smart object)', [ox, 0], null, () => e.addSmartFilter('filterGallery', glowFilter(8, 16, 7, [255, 150, 70])));
  shape(e, { name: 'Shade', box: { x: ox, y: 760, w: 1080, h: 1160 }, fill: INK, gradient: fade(INK, INK, 90, 0, 0.96) });
  shape(e, { name: 'Shade top', box: { x: ox, y: 0, w: 1080, h: 300 }, fill: INK, gradient: fade(INK, INK, 90, 0.8, 0) });
  await type(e, 'AUTUMN MARKET   /   FREE ENTRY', [ox + 72, 120], 24, GOLD, { weight: 700, tracking: 9, name: 'Kicker' });
  await type(e, 'LANTERN\nNIGHT', [ox + 62, 1166], 330, PAPER, { family: 'Bebas Neue', tracking: 4, lineHeight: 0.92, name: 'Title', fx: titleStyle(PINK) });
  shape(e, { name: 'Glass panel', box: { x: ox + 72, y: 1520, w: 936, h: 232 }, radius: 28, fill: '#ffffff', opacity: 0.1, stroke: { color: rgb('#ffffff'), width: 2, align: 'inside' } });
  await type(e, '17:30    Lantern making on the quay', [ox + 112, 1590], 30, PAPER, { weight: 700, tracking: 1, name: 'Programme 1' });
  await type(e, '19:30    Taiko drums on the water', [ox + 112, 1654], 30, PAPER, { weight: 700, tracking: 1, name: 'Programme 2' });
  await type(e, '21:00    The lantern procession', [ox + 112, 1718], 30, PAPER, { weight: 700, tracking: 1, name: 'Programme 3' });
  shape(e, { name: 'Button', box: { x: ox + 72, y: 1796, w: 520, h: 76 }, radius: 38, fill: PINK, gradient: fade(PINK, VIOLET, 0, 1, 1), fx: pillStyle });
  await type(e, 'SAT 14 NOV  /  HARBOUR SQUARE', [ox + 116, 1843], 24, '#ffffff', { weight: 700, tracking: 4, name: 'Button label' });
}

async function cover(e: Engine, m: DemoMedia, ox: number): Promise<void> {
  artboard(e, 'Cover 1920x1080', { x: ox, y: 0, w: 1920, h: 1080 });
  await smartPhoto(e, m, 'bokeh', 'String lights (smart object)', [ox, 0], null, () => e.addSmartFilter('filterGallery', glowFilter(7, 15, 5, [255, 140, 80])));
  shape(e, { name: 'Shade left', box: { x: ox, y: 0, w: 1260, h: 1080 }, fill: INK, gradient: fade(INK, INK, 0, 0.94, 0) });
  await type(e, 'AUTUMN MARKET   /   FREE ENTRY', [ox + 110, 150], 26, GOLD, { weight: 700, tracking: 10, name: 'Kicker' });
  await type(e, 'LANTERN\nNIGHT', [ox + 100, 440], 300, PAPER, { family: 'Bebas Neue', tracking: 5, lineHeight: 0.92, name: 'Title', fx: titleStyle(PINK) });
  await type(e, 'Saturday 14 November, Harbour Square', [ox + 112, 810], 44, '#f2d9ff', { family: 'Playfair Display', italic: true, name: 'Standfirst' });
  shape(e, { name: 'Button', box: { x: ox + 112, y: 900, w: 460, h: 72 }, radius: 36, fill: PINK, gradient: fade(PINK, VIOLET, 0, 1, 1), fx: pillStyle });
  await type(e, 'RESERVE A LANTERN', [ox + 168, 946], 26, '#ffffff', { weight: 700, tracking: 6, name: 'Button label' });
}


/** Builds the design demo's document and leaves the Post artboard in view with the Type tool on its title. */
export async function buildDesignDemo(e: Engine, m: DemoMedia): Promise<void> {
  const project = e.newDocument(1080, 1350, 'lantern-night-kit', 'transparent');
  if (!project) throw new Error('The document could not open.');
  const base = project.doc.layers[0];
  await cover(e, m, 2360);
  await story(e, m, 1180);
  await post(e, m, 0);
  e.selectLayer(base.id);
  e.deleteLayers();
  const title = e.current?.doc.layers.filter((l) => l.name === 'Title').pop();
  const first = e.current?.doc.layers.find((l) => l.name === 'Title' && l.text && (l.transform?.x ?? 0) < 1000);
  const pick = first ?? title;
  if (pick) e.selectLayer(pick.id);
  e.setTool('type');
  e.fitArtboard();
  await frame();
  await wait(500);
  e.fitArtboard();
  e.zoomTo(0.44);
}
