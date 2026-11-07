import type { BlendMode } from '../../frontend/src/engine/types';
import { adjustDef, defaults } from './adjust-defs';
import { loadPack, packImage, packMask } from './media';
import { adjustLayer, makeCanvas, pixelLayer, type Doc, type PixelLayer } from './model';
import { ensureFont, renderText, type TextSpec } from './text';

export const POSTER_W = 1080;
export const POSTER_H = 1350;
export const POSTER_NAME = 'Above the Clouds';

export function placeholderDoc(): Doc {
  const c = makeCanvas(POSTER_W, POSTER_H), g = c.getContext('2d')!;
  g.fillStyle = '#17181d';
  g.fillRect(0, 0, POSTER_W, POSTER_H);
  const l = pixelLayer('Background', c);
  return { name: POSTER_NAME, w: POSTER_W, h: POSTER_H, layers: [l], active: l.id };
}

interface PhotoPlan { name: string; pack: string; x: number; y: number; blend?: BlendMode; opacity?: number }

async function photoLayer(plan: PhotoPlan): Promise<PixelLayer> {
  const pack = await loadPack(plan.pack);
  const [image, mask] = await Promise.all([packImage(pack), packMask(pack)]);
  const l = pixelLayer(plan.name, image, plan.x, plan.y);
  l.mask = mask;
  l.blend = plan.blend ?? 'normal';
  l.opacity = plan.opacity ?? 1;
  return l;
}

async function textLayer(name: string, spec: TextSpec): Promise<PixelLayer> {
  await ensureFont(spec);
  const c = makeCanvas(POSTER_W, POSTER_H);
  renderText(spec, c);
  const l = pixelLayer(name, c);
  l.text = spec;
  return l;
}

function adjust(label: string, id: string, extra: Record<string, unknown>, opacity = 1): ReturnType<typeof adjustLayer> {
  const def = adjustDef(id)!;
  const l = adjustLayer(label, id, { ...defaults(def), ...extra });
  l.opacity = opacity;
  return l;
}

export async function posterDoc(): Promise<Doc> {
  const [sky, mountains, mist, birds, balloon] = await Promise.all([
    photoLayer({ name: 'Sunset sky', pack: 'sky', x: 0, y: 0 }),
    photoLayer({ name: 'Mountains (sky masked)', pack: 'mountains', x: 0, y: 0 }),
    photoLayer({ name: 'Mist', pack: 'mist', x: 0, y: 720, blend: 'screen', opacity: 0.6 }),
    photoLayer({ name: 'Birds', pack: 'birds', x: 0, y: 400, blend: 'multiply', opacity: 0.55 }),
    photoLayer({ name: 'Balloon (cut out)', pack: 'balloon', x: 580, y: 390 }),
  ]);
  const kicker = await textLayer('Kicker', { text: 'ALPINE JOURNAL   /   ISSUE 07', size: 24, color: '#f4d3a6', tracking: 7, weight: 600, family: 'Inter', x: 84, y: 76, align: 'left' });
  const title = await textLayer('Title', { text: 'ABOVE\nTHE CLOUDS', size: 128, color: '#fff6ea', tracking: 2, weight: 600, family: 'Inter', x: 78, y: 122, align: 'left' });
  const place = await textLayer('Caption', { text: 'First light over the haze', size: 34, color: '#fff6ea', tracking: 0.5, weight: 400, family: 'Inter', x: 84, y: 1214, align: 'left' });
  const coords = await textLayer('Details', { text: 'AUTUMN FLIGHTS  /  06:12  /  1,840 M', size: 20, color: '#f4d3a6', tracking: 5, weight: 400, family: 'JetBrains Mono', x: 84, y: 1268, align: 'left' });
  const grade = [
    adjust('Warm grade', 'photoFilter', { color: { r: 255, g: 150, b: 64 }, density: 16 }),
    adjust('Colour balance', 'colorBalance', { shadowsYB: 16, highlightsCR: 12, midtonesCR: 4 }),
    adjust('Vibrance', 'vibrance', { vibrance: 30, saturation: 4 }),
    adjust('Tone', 'levels', { black: 6, gamma: 1.06, white: 248 }),
  ];
  const layers = [sky, mountains, mist, birds, balloon, ...grade, kicker, title, place, coords];
  return { name: POSTER_NAME, w: POSTER_W, h: POSTER_H, layers, active: balloon.id };
}
