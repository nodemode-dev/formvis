import type { FalModel } from './api';

/** How big the area goes to a model (1.96.3, Preferences > Generative > High-res): as it is (clamped to the model), about
 *  one megapixel, twice or four times the area's size, or the model's largest. The answer is always fitted back to the
 *  area, so this only trades detail for time and cost. */
export type Highres = 'off' | 'target' | '2x' | '4x' | 'max';

/** A model's size rules as data: the longest side it takes, the step both sides are rounded to, the shortest long side. */
interface SizeRule { max: number; step: number; min: number }
const RULES: ReadonlyArray<[RegExp, SizeRule]> = [
  [/^fal-ai\/flux-pro\/v1\/(fill|erase)/, { max: 1440, step: 32, min: 512 }],
  [/^fal-ai\/flux-pro\/kontext/, { max: 1440, step: 32, min: 512 }],
  [/^blackforestlabs\/flux-3/, { max: 2048, step: 16, min: 608 }],
  [/^fal-ai\/flux-2/, { max: 1440, step: 32, min: 512 }],
  [/^fal-ai\/bria\/|^bria\//, { max: 2048, step: 16, min: 512 }],
];
const DEFAULT_RULE: SizeRule = { max: 2048, step: 16, min: 512 };
export const sizeRule = (m: FalModel): SizeRule => RULES.find(([re]) => re.test(m.id))?.[1] ?? DEFAULT_RULE;

/** How many pictures a model takes in its picture list, the area itself included (1.96.4); 1 for a single picture input. */
const PICTURES: ReadonlyArray<[RegExp, number]> = [
  [/^blackforestlabs\/flux-3\/klein/, 4],
  [/^blackforestlabs\/flux-3/, 10],
  [/nano-banana/, 14],
  [/^fal-ai\/flux-2\/klein/, 4],
  [/^fal-ai\/flux-2/, 8],
  [/seedream/, 10],
  [/gpt-image/, 16],
  [/qwen-image-edit/, 3],
  [/kontext\/(max\/)?multi/, 4],
];
export function pictureLimit(m: FalModel): number {
  const list = m.inputs.find((i) => /^image(_url|_urls)?$/.test(i.key));
  if (!list?.isArray) return list ? 1 : 0;
  return PICTURES.find(([re]) => re.test(m.id))?.[1] ?? 4;
}

const ratioOf = (s: string): number => { const [a, b] = s.split(':').map(Number); return a > 0 && b > 0 ? a / b : 0; };

/** The model's aspect presets when it has no automatic choice (an answer of another shape would be stretched). */
function presets(m: FalModel): string[] {
  const e = m.inputs.find((i) => i.key === 'aspect_ratio')?.enum ?? [];
  return e.includes('auto') ? [] : e.filter((v) => ratioOf(v) > 0);
}

/** Its resolution tier for the High-res choice, when the model names tiers (1k, 2K and so on). */
function tier(m: FalModel, highres: Highres): string | null {
  const e = m.inputs.find((i) => i.key === 'resolution')?.enum ?? [];
  if (!e.length) return null;
  const want = highres === '4x' ? '4k' : highres === '2x' || highres === 'max' ? '2k' : '1k';
  return e.find((v) => v.toLowerCase() === want) ?? null;
}

async function bitmapOf(b: Blob): Promise<ImageBitmap> { return createImageBitmap(b); }
async function png(c: OffscreenCanvas): Promise<Blob> { return c.convertToBlob({ type: 'image/png' }); }

export interface Prepared { image: Blob; mask: Blob | null; inputs: Record<string, unknown>; restore: (answer: Blob) => Promise<Blob> }

/** The area and mask as the model should get them: padded to the nearest aspect preset (blurred context, the mask kept
 *  black there) when the model has presets but no automatic shape, scaled to the High-res choice inside the model's rules
 *  with both sides on its step, and its resolution tier set; `restore` cuts the answer back to the area's own shape. The
 *  person's own options win over what is set here. */
export async function prepareForModel(m: FalModel, image: Blob, mask: Blob | null, highres: Highres, chosen: Record<string, unknown>): Promise<Prepared> {
  const src = await bitmapOf(image), w = src.width, h = src.height, rule = sizeRule(m);
  const inputs: Record<string, unknown> = {};
  let bw = w, bh = h;
  const ps = presets(m);
  if (ps.length && chosen.aspect_ratio === undefined) {
    const r = w / h, best = ps.reduce((a, b) => (Math.abs(Math.log(ratioOf(b) / r)) < Math.abs(Math.log(ratioOf(a) / r)) ? b : a));
    const pr = ratioOf(best);
    if (pr > r) bw = Math.round(h * pr); else bh = Math.round(w / pr);
    inputs.aspect_ratio = best;
  }
  const t = tier(m, highres);
  if (t && chosen.resolution === undefined) inputs.resolution = t;
  const long = Math.max(bw, bh);
  const target = highres === 'off' ? long : highres === 'target' ? 1024 : highres === '2x' ? long * 2 : highres === '4x' ? long * 4 : rule.max;
  const scale = Math.min(rule.max, Math.max(rule.min, target)) / long;
  const snap = (v: number): number => Math.max(rule.step, Math.round((v * scale) / rule.step) * rule.step);
  const ow = snap(bw), oh = snap(bh), fx = ow / bw, fy = oh / bh, ox = Math.round(((bw - w) / 2) * fx), oy = Math.round(((bh - h) / 2) * fy), iw = Math.round(w * fx), ih = Math.round(h * fy);
  const c = new OffscreenCanvas(ow, oh), g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  g.imageSmoothingQuality = 'high';
  if (bw !== w || bh !== h) { g.filter = 'blur(24px)'; g.drawImage(src, 0, 0, ow, oh); g.filter = 'none'; }
  g.drawImage(src, ox, oy, iw, ih);
  src.close();
  let maskOut: Blob | null = null;
  if (mask) {
    const mb = await bitmapOf(mask), mc = new OffscreenCanvas(ow, oh), mg = mc.getContext('2d') as OffscreenCanvasRenderingContext2D;
    mg.fillStyle = '#000'; mg.fillRect(0, 0, ow, oh);
    mg.drawImage(mb, ox, oy, iw, ih);
    mb.close();
    maskOut = await png(mc);
  }
  const restore = async (answer: Blob): Promise<Blob> => {
    if (bw === w && bh === h) return answer;
    const a = await bitmapOf(answer), sx = a.width / ow, sy = a.height / oh, out = new OffscreenCanvas(w, h), og = out.getContext('2d') as OffscreenCanvasRenderingContext2D;
    og.imageSmoothingQuality = 'high';
    og.drawImage(a, ox * sx, oy * sy, iw * sx, ih * sy, 0, 0, w, h);
    a.close();
    return png(out);
  };
  return { image: await png(c), mask: maskOut, inputs, restore };
}

/** A FIBO-style expand: the whole canvas, the original's size and where it sits, from the margins. */
export function canvasInputs(m: FalModel, w: number, h: number, margins: { left: number; top: number; right: number; bottom: number }): Record<string, unknown> {
  const keys = new Set(m.inputs.map((i) => i.key));
  if (!keys.has('canvas_size')) return {};
  return { canvas_size: [w, h], ...(keys.has('original_image_size') ? { original_image_size: [w - margins.left - margins.right, h - margins.top - margins.bottom] } : {}), ...(keys.has('original_image_location') ? { original_image_location: [margins.left, margins.top] } : {}) };
}
