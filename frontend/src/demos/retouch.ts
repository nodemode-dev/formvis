import { SelectionMask, ctxOf, type Engine } from '../engine';
import { DEFAULT_REFINE, refineSelection } from '../engine/select-mask';
import { FILL_DEFAULTS } from '../engine/retouch';
import { defaultAdjustmentData } from '../engine/adjust';
import { paramValues, type ParamKind } from '../engine/adjust-params';
import type { AdjustmentKind, RGB } from '../engine/types';
import type { DemoMedia } from './media';
import { CHAIN, CORE, LOOSE, type Pt } from './retouch-outlines';

/** The retouching demo (demos/retouch): "golden-portrait" retouched through the engine (Spot Healing, Clone Stamp,
 *  Selection-Aware Fill, a refined subject selection saved as a channel, a blur and a vibrance layer behind masks made
 *  from it) with an "Opening state" snapshot, and "golden-chain" with the chain selected for Remove. */

const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));
const wait = (ms: number): Promise<void> => new Promise((done) => window.setTimeout(done, ms));
const rgb = (hex: string): RGB => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });

async function settle(e: Engine, ms = 350): Promise<void> {
  await frame();
  await wait(ms);
  for (let i = 0; i < 80 && e.busy; i++) await wait(50);
}

function path(e: Engine, pts: Pt[]): SelectionMask | null {
  const p = e.current;
  if (!p) return null;
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.floor(Math.min(...xs)) - 2, y0 = Math.floor(Math.min(...ys)) - 2;
  const bounds = { x: x0, y: y0, w: Math.ceil(Math.max(...xs)) - x0 + 4, h: Math.ceil(Math.max(...ys)) - y0 + 4 };
  return SelectionMask.fromPath(p.doc.width, p.doc.height, bounds, (c) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = '#fff';
    c.fill();
  });
}

function oval(e: Engine, cx: number, cy: number, rx: number, ry: number): SelectionMask | null {
  const p = e.current;
  if (!p) return null;
  const bounds = { x: Math.floor(cx - rx) - 2, y: Math.floor(cy - ry) - 2, w: Math.ceil(rx * 2) + 4, h: Math.ceil(ry * 2) + 4 };
  return SelectionMask.fromPath(p.doc.width, p.doc.height, bounds, (c) => {
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = '#fff';
    c.fill();
  });
}

function drag(e: Engine, kind: 'heal' | 'clone' | 'healBrush', through: Pt[]): void {
  const n = 6;
  if (!e.beginRetouchStroke(kind, { x: through[0][0], y: through[0][1] }, false)) return;
  for (let i = 1; i < through.length; i++) {
    const [ax, ay] = through[i - 1], [bx, by] = through[i];
    for (let k = 1; k <= n; k++) e.strokeTo({ x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n });
  }
  e.endStroke();
}

const params = (kind: ParamKind, values: Record<string, unknown>) => (data: Record<string, unknown>): void => { data.params = paramValues(kind, values); };

function adjust(e: Engine, kind: AdjustmentKind, name: string, tune: (data: Record<string, unknown>) => void, opacity = 1): string | null {
  const id = e.addAdjustmentLayer(kind);
  if (!id) return null;
  const data = defaultAdjustmentData(kind) as Record<string, unknown>;
  tune(data);
  e.edit(`Edit ${name}`, (p) => { p.updateLayer(id, { name, opacity, adjustment: { kind, data } }); });
  return id;
}

async function portrait(e: Engine, m: DemoMedia): Promise<string> {
  const image = await m.image('golden-portrait');
  const project = e.openImage({ source: image, width: image.width, height: image.height, name: 'golden-portrait.jpg' });
  const base = project.doc.layers[0].id;
  e.renameLayer(base, 'Portrait');
  e.takeSnapshot('Opening state');
  e.retouch.spotSampleAll = true;
  e.retouch.cloneSample = 'all';
  e.retouch.healSample = 'all';
  e.setBrush({ diameter: 26, hardness: 0.6, opacity: 1 });

  e.addLayerWith({ name: 'Spot Healing: tear stain and drool' });
  e.setTool('spotHealing');
  drag(e, 'heal', [[777, 306], [773, 340], [762, 376]]);
  await settle(e, 700);
  e.setBrush({ diameter: 22 });
  drag(e, 'heal', [[890, 420], [891, 436]]);
  await settle(e, 700);
  drag(e, 'heal', [[742, 600], [750, 612]]);
  await settle(e, 700);

  e.addLayerWith({ name: 'Clone Stamp: bokeh blob' });
  e.setTool('cloneStamp');
  e.setBrush({ diameter: 150, hardness: 0.2 });
  e.setCloneSource({ x: 1330, y: 240 });
  drag(e, 'clone', [[1420, 150], [1470, 180], [1490, 215]]);
  await settle(e, 700);

  e.addLayerWith({ name: 'Selection-Aware Fill: second blob' });
  const blob = oval(e, 1458, 462, 82, 74);
  if (blob) e.applySelection(blob, 'replace', 'Select blob');
  e.contentAwareFillWith(null, 'current', FILL_DEFAULTS, true);
  await settle(e, 1500);
  e.deselect();

  return project.id;
}

function refined(e: Engine): void {
  const p = e.current, sel = p?.selection;
  if (!p || !sel) return;
  const W = p.doc.width, H = p.doc.height, flat = e.flattened();
  if (!flat) return;
  const px = ctxOf(flat).getImageData(0, 0, W, H).data, guide = new Float32Array(W * H), mask = new Float32Array(W * H);
  for (let i = 0; i < guide.length; i++) {
    guide[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
    mask[i] = sel.valueAt(i % W, Math.floor(i / W)) / 255;
  }
  const out = refineSelection(mask, guide, W, H, { ...DEFAULT_REFINE, radius: 12, smooth: 10, feather: 1, contrast: 30, smart: true });
  const data = new Uint8Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, out[i])) * 255);
  e.applySelection(SelectionMask.cropped(0, 0, W, H, data), 'replace', 'Select and Mask');
}

async function subject(e: Engine): Promise<void> {
  e.deselect();
  e.selectColorRange({ mode: 'reds', plus: [], minus: [], fuzziness: 60, invert: false });
  e.selectColorRange({ mode: 'skin', plus: [], minus: [], fuzziness: 60, invert: false, combine: 'add' });
  await settle(e);
  const loose = path(e, LOOSE), core = path(e, CORE);
  if (loose) e.applySelection(loose, 'intersect', 'Keep inside the outline');
  if (core) e.applySelection(core, 'add', 'Add the solid core');
  refined(e);
  await settle(e);
  const saved = e.saveSelection({ name: 'Subject' });
  e.resizeSelection(40, false);
  e.modifySelection('feather', 22);
  e.invertSelection();
  e.addFilterLayer('gaussianBlur', 'Gaussian Blur', { radius: 14 });
  e.addMask(false, true);
  e.renameLayer(e.current!.activeLayer!.id, 'Background blur');
  if (saved) e.loadSelection({ channel: saved });
  adjust(e, 'vibrance', 'Subject pop', params('vibrance', { vibrance: 24, saturation: 4 }));
  e.addMask(false, true);
  e.deselect();
}

async function chain(e: Engine, m: DemoMedia): Promise<void> {
  const image = await m.image('golden-chain');
  e.openImage({ source: image, width: image.width, height: image.height, name: 'golden-chain.jpg' });
  e.takeSnapshot('Opening state');
  const around = path(e, CHAIN);
  if (around) e.applySelection(around, 'replace', 'Select chain');
}

/** Builds the retouching demo's two documents and leaves the portrait in front with Spot Healing. */
export async function buildRetouchDemo(e: Engine, m: DemoMedia): Promise<void> {
  const first = await portrait(e, m);
  await subject(e);
  await chain(e, m);
  e.switchTo(first);
  e.setTool('spotHealing');
  e.fit();
  await frame();
  e.setColors(rgb('#f4a45a'), rgb('#ffffff'));
  await wait(300);
  e.fit();
}
