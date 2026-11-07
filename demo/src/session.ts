import { Raster, type Engine } from '../../frontend/src/engine';
import { defaultAdjustmentData } from '../../frontend/src/engine/adjust';
import { paramValues, type ParamKind } from '../../frontend/src/engine/adjust-params';
import { allBrushPresets } from '../../frontend/src/engine/brush-dynamics';
import type { AdjustmentKind, BlendMode, RGB, TextSpec } from '../../frontend/src/engine/types';
import { loadPack, packImage, packMask, type Pack } from './media';

interface Catalogue { runCommand(id: string, params?: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> }
interface Hook { engine: Engine; catalogue: Catalogue }

const hook = (): Hook | null => (window as unknown as { formvis?: Hook }).formvis ?? null;
const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));
const wait = (ms: number): Promise<void> => new Promise((done) => window.setTimeout(done, ms));

async function ready(): Promise<Hook> {
  for (let i = 0; i < 400; i++) {
    const h = hook();
    if (h?.engine && h.catalogue && document.body.classList.contains('app-ready')) return h;
    await wait(50);
  }
  throw new Error('The demo window did not start.');
}

const rgb = (hex: string): RGB => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });

async function photo(name: string): Promise<{ pack: Pack; image: HTMLCanvasElement; mask: HTMLCanvasElement | null }> {
  const pack = await loadPack(name);
  const [image, mask] = await Promise.all([packImage(pack), packMask(pack)]);
  return { pack, image, mask };
}

function stretched(from: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(from, 0, 0, w, h);
  return c;
}

interface Place { name: string; image: HTMLCanvasElement; mask?: HTMLCanvasElement | null; x?: number; y?: number; blend?: BlendMode; opacity?: number }

function place(e: Engine, p: Place): void {
  const extra = {
    ...(p.blend ? { blend: p.blend } : {}),
    ...(p.opacity !== undefined ? { opacity: p.opacity } : {}),
    ...(p.mask ? { mask: { raster: Raster.from(p.mask, p.mask.width, p.mask.height), enabled: true, linked: true, placement: null } } : {}),
  };
  e.insertRasterLayer(Raster.from(p.image, p.image.width, p.image.height), p.name, p.x ?? 0, p.y ?? 0, extra, `Place ${p.name}`);
}

function adjust(e: Engine, kind: AdjustmentKind, name: string, tune: (data: Record<string, unknown>) => void, opacity = 1): void {
  const id = e.addAdjustmentLayer(kind);
  if (!id) return;
  const data = defaultAdjustmentData(kind) as Record<string, unknown>;
  tune(data);
  e.edit(`Edit ${name}`, (p) => { p.updateLayer(id, { name, opacity, adjustment: { kind, data } }); });
}

const params = (kind: ParamKind, values: Record<string, unknown>) => (data: Record<string, unknown>): void => { data.params = paramValues(kind, values); };

const levelsRange = (black: number, gamma: number, white: number) => (data: Record<string, unknown>): void => {
  const levels = data.levels as { ranges: Array<Record<string, number>> };
  levels.ranges[0] = { black, gamma, white, outputBlack: 0, outputWhite: 255 };
};

const curve = (points: Array<[number, number]>) => (data: Record<string, unknown>): void => {
  const curves = data.curves as { channels: Array<Array<{ x: number; y: number }>> };
  curves.channels[0] = points.map(([x, y]) => ({ x, y }));
};

type Pt = [number, number];

function spline(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  const at = (i: number): Pt => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function stroke(e: Engine, through: Pt[], opts: { lift?: number; peak?: number; step?: number } = {}): void {
  const path = spline(through, opts.step ?? 14), lift = opts.lift ?? 0.12, peak = opts.peak ?? 1;
  const pressure = (t: number): number => lift + (peak - lift) * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.7);
  if (!e.beginStroke({ x: path[0][0], y: path[0][1] }, false, pressure(0))) return;
  for (let i = 1; i < path.length; i++) e.strokeTo({ x: path[i][0], y: path[i][1] }, pressure(i / (path.length - 1)));
  e.endStroke();
}

function brush(e: Engine, id: string, colour: string, patch: { diameter?: number; opacity?: number; hardness?: number } = {}): void {
  const preset = allBrushPresets().find((b) => b.id === id);
  if (preset) e.applyBrushPreset(preset);
  e.setColors(rgb(colour));
  if (patch.diameter !== undefined || patch.opacity !== undefined || patch.hardness !== undefined) e.setBrush(patch);
}

async function type(e: Engine, content: string, at: Pt, size: number, colour: string, tracking: number, weight = 600, family = 'Inter'): Promise<void> {
  const spec: TextSpec = { ...e.textSettings, content, family, size, color: rgb(colour), align: 'left', bold: weight >= 700, weight, italic: false, tracking, lineHeight: 1.08, box: null };
  await e.createTextLayer({ x: at[0], y: at[1] }, spec);
}

async function dawn(e: Engine): Promise<string> {
  const { image } = await photo('tray-night');
  const project = e.openImage({ source: image, width: image.width, height: image.height, name: 'dawn-over-the-range.jpg' });
  e.renameLayer(project.doc.layers[0].id, 'Night range');

  adjust(e, 'curves', 'Curves', curve([[0, 0], [58, 44], [128, 126], [196, 214], [255, 255]]));

  const mist = await photo('mist');
  place(e, { name: 'Valley mist', image: stretched(mist.image, 1600, 520), mask: mist.mask ? stretched(mist.mask, 1600, 520) : null, y: 547, blend: 'screen', opacity: 0.55 });

  e.addDodgeBurnLayer();
  e.setTool('brush');
  brush(e, 'soft-air', '#ffffff', { diameter: 120, opacity: 0.35, hardness: 0.05 });
  stroke(e, [[150, 650], [400, 548], [640, 498], [790, 560]], { lift: 0.3 });
  stroke(e, [[1020, 600], [1190, 520], [1360, 470], [1520, 520]], { lift: 0.3 });
  stroke(e, [[330, 600], [560, 640], [820, 690]], { lift: 0.3, peak: 0.8 });
  brush(e, 'soft-air', '#000000', { diameter: 220, opacity: 0.45, hardness: 0.02 });
  stroke(e, [[0, 900], [420, 860], [900, 880], [1400, 840], [1600, 880]], { lift: 0.4 });
  stroke(e, [[1180, 760], [1450, 700], [1600, 650]], { lift: 0.3, peak: 0.7 });

  e.addLayerWith({ name: 'Painted light', blend: 'screen', opacity: 0.85 });
  brush(e, 'soft-air', '#ffb86b', { diameter: 34, opacity: 0.8, hardness: 0.1 });
  stroke(e, [[160, 676], [330, 598], [520, 546], [640, 520], [740, 560], [800, 586]], { lift: 0.15 });
  stroke(e, [[1040, 622], [1170, 558], [1290, 516], [1370, 492], [1470, 522], [1540, 544]], { lift: 0.15 });
  brush(e, 'soft-air', '#ff8a3d', { diameter: 20, opacity: 0.7 });
  stroke(e, [[600, 530], [700, 527], [770, 570]], { lift: 0.2, peak: 0.9 });
  brush(e, 'hard-round', '#bfe6ff', { diameter: 7, opacity: 0.95, hardness: 0.95 });
  stroke(e, [[1020, 120], [1130, 160], [1250, 214]], { lift: 0.08 });
  stroke(e, [[260, 190], [330, 214], [400, 250]], { lift: 0.08, peak: 0.7 });
  brush(e, 'hard-round', '#ffe2b8', { diameter: 7, opacity: 1, hardness: 0.95 });
  stroke(e, [[420, 566], [520, 540], [610, 522]], { lift: 0.18, peak: 0.85 });
  stroke(e, [[1330, 508], [1380, 488], [1430, 500]], { lift: 0.18, peak: 0.85 });
  e.setBrushMode('erase');
  brush(e, 'soft-air', '#000000', { diameter: 60, opacity: 0.5, hardness: 0.1 });
  stroke(e, [[760, 560], [820, 585], [900, 600]], { lift: 0.3 });
  e.setBrushMode('paint');

  adjust(e, 'photoFilter', 'Warm grade', params('photoFilter', { color: { r: 255, g: 150, b: 64 }, density: 14 }), 0.85);
  await type(e, 'DAWN OVER THE RANGE', [84, 978], 64, '#fff6ea', 5);
  await type(e, 'FIRST LIGHT  /  05:41  /  4,200 M', [88, 1018], 20, '#f4d3a6', 5, 400, 'JetBrains Mono');
  return project.id;
}

async function poster(e: Engine): Promise<string> {
  const W = 1080, H = 1350;
  const project = e.newDocument(W, H, 'above-the-clouds', 'transparent');
  if (!project) throw new Error('The poster could not open.');
  const [sky, mountains, mist, birds, balloon] = await Promise.all([photo('sky'), photo('mountains'), photo('mist'), photo('birds'), photo('balloon')]);
  place(e, { name: 'Sunset sky', image: sky.image });
  place(e, { name: 'Mountains (sky masked)', image: mountains.image, mask: mountains.mask });
  place(e, { name: 'Mist', image: mist.image, mask: mist.mask, y: 720, blend: 'screen', opacity: 0.6 });
  place(e, { name: 'Birds', image: birds.image, y: 400, blend: 'multiply', opacity: 0.55 });
  place(e, { name: 'Balloon (cut out)', image: balloon.image, mask: balloon.mask, x: 580, y: 390 });
  adjust(e, 'photoFilter', 'Warm grade', params('photoFilter', { color: { r: 255, g: 150, b: 64 }, density: 16 }));
  adjust(e, 'colorBalance', 'Colour balance', params('colorBalance', { shadowsYB: 16, highlightsCR: 12, midtonesCR: 4 }));
  adjust(e, 'vibrance', 'Vibrance', params('vibrance', { vibrance: 30, saturation: 4 }));
  adjust(e, 'levels', 'Tone', levelsRange(6, 1.06, 248));
  await type(e, 'ALPINE JOURNAL   /   ISSUE 07', [84, 100], 24, '#f4d3a6', 7);
  await type(e, 'ABOVE\nTHE CLOUDS', [78, 250], 128, '#fff6ea', 2);
  await type(e, 'First light over the haze', [84, 1238], 34, '#fff6ea', 0.5, 400);
  await type(e, 'AUTUMN FLIGHTS  /  06:12  /  1,840 M', [84, 1290], 20, '#f4d3a6', 5, 400, 'JetBrains Mono');
  return project.id;
}

const PHOTOS: Array<{ pack: string; name: string }> = [
  { pack: 'tray-lake', name: 'oeschinensee-lake.jpg' },
  { pack: 'tray-larch', name: 'autumn-larches.jpg' },
  { pack: 'tray-surf', name: 'ocean-waves.jpg' },
  { pack: 'tray-dunes', name: 'desert-dunes.jpg' },
  { pack: 'tray-glacier', name: 'snowy-mountain.jpg' },
];

async function photos(e: Engine): Promise<void> {
  for (const p of PHOTOS) {
    const { image } = await photo(p.pack);
    e.openImage({ source: image, width: image.width, height: image.height, name: p.name });
  }
}

export async function openSession(): Promise<void> {
  const { engine: e, catalogue } = await ready();
  const root = document.documentElement;
  try {
    const first = await dawn(e);
    await poster(e);
    await photos(e);
    e.switchTo(first);
    e.setTool('brush');
    e.fit();
    await frame();
    const painted = e.current?.doc.layers.find((l) => l.name === 'Painted light');
    if (painted) e.selectLayer(painted.id);
    e.setColors(rgb('#ffb86b'), rgb('#ffffff'));
    await catalogue.runCommand('new-adj-levels');
    await wait(400);
    if (painted) e.selectLayer(painted.id);
    e.fit();
  } finally {
    await frame();
    await frame();
    root.removeAttribute('data-demo');
  }
}
