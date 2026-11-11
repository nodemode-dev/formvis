import { Raster, createSurface, ctxOf, toBlob, type Engine } from '../engine';
import { api, type FalModel } from '../io/api';
import { dataUri, falBlob, falCatalogue, falHas, falImageKey, falOptions, falPick, falWhy, sizeInputs } from './fal-agent';
import type { McpResult } from './agent-bridge';

const text = (t: string, data?: Record<string, unknown>): McpResult => ({ content: [{ type: 'text', text: t }], ...(data ? { structuredContent: data } : {}) });
const fail = (t: string): McpResult => ({ content: [{ type: 'text', text: t }], isError: true });
type Ask = (title: string, text: string) => Promise<boolean>;
type Args = Record<string, unknown>;
const NO_KEY = 'fal has no key yet: the person adds one in Edit > Generative Fill.';

function sizeOf(a: Args): { width: number; height: number } | undefined | string {
  if (a.size === undefined) return undefined;
  const s = a.size as { width?: unknown; height?: unknown } | null;
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 64 && v <= 8192;
  return s && typeof s === 'object' && ok(s.width) && ok(s.height) ? { width: s.width, height: s.height } : 'size is {width, height}, each 64 to 8192 pixels.';
}

function common(m: FalModel, a: Args, skip: string[]): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  if (a.seed !== undefined) {
    if (typeof a.seed !== 'number' || !Number.isInteger(a.seed) || a.seed < 0 || a.seed > 4294967295) return 'seed is a whole number from 0 to 4294967295.';
    if (!falHas(m, 'seed')) return `${m.id} takes no seed: leave it out or choose another model (fal_models lists each model's inputs).`;
    out.seed = a.seed;
  }
  if (a.negative_prompt !== undefined) {
    if (typeof a.negative_prompt !== 'string' || !a.negative_prompt.trim()) return 'negative_prompt is text.';
    if (!falHas(m, 'negative_prompt')) return `${m.id} takes no negative_prompt: put what to avoid in the prompt, or choose a model that has one (fal_models).`;
    out.negative_prompt = a.negative_prompt.trim();
  }
  const opt = falOptions(m, a.options, [...skip, 'seed', 'negative_prompt']);
  return typeof opt === 'string' ? opt : { ...opt, ...out };
}

async function ready(id: string, roles: Parameters<typeof falPick>[2]): Promise<FalModel | McpResult> {
  const cat = await falCatalogue(), m = falPick(cat.models, id, roles);
  if (typeof m === 'string') return fail(m);
  return cat.ready ? m : fail(NO_KEY);
}

const asResult = (m: FalModel | McpResult): m is McpResult => 'content' in m;

/** generate_image with a catalogue model: a new layer from the returned picture. */
export async function falGenerate(e: Engine, ask: Ask, a: Args, id: string, prompt: string): Promise<McpResult> {
  const p = e.current;
  if (!p) return fail('Open a document first.');
  const m = await ready(id, ['generate']);
  if (asResult(m)) return m;
  const size = sizeOf(a), aspect = typeof a.aspect_ratio === 'string' ? a.aspect_ratio : undefined;
  if (typeof size === 'string') return fail(size);
  if (aspect !== undefined && !/^\d+:\d+$/.test(aspect)) return fail('aspect_ratio looks like 16:9.');
  const extra = common(m, a, ['prompt', 'image_size', 'aspect_ratio']), dims = sizeInputs(m, aspect, size, p.doc);
  if (typeof extra === 'string') return fail(extra);
  if (typeof dims === 'string') return fail(dims);
  if (!await ask('An agent asks to run Generate Image', `Prompt: "${prompt}". ${m.label} runs on fal and costs money.`)) return fail('The person declined Generate Image on fal.');
  let out;
  try { out = await api.falRun(m.id, { ...extra, ...dims, prompt }, {}); } catch (err) { return fail(falWhy(err)); }
  const pic = out.images[0];
  if (!pic) return fail('fal returned no picture.');
  const bmp = await createImageBitmap(await falBlob(pic.png)), W = p.doc.width, H = p.doc.height, explicit = !!(aspect || size);
  const k = explicit ? Math.min(1, W / bmp.width, H / bmp.height) : 1, w = explicit ? Math.max(1, Math.round(bmp.width * k)) : W, h = explicit ? Math.max(1, Math.round(bmp.height * k)) : H;
  const r = new Raster(w, h);
  r.ctx.drawImage(bmp, 0, 0, w, h); bmp.close(); r.touch();
  if (e.current !== p && e.projects.includes(p)) e.switchTo(p.id);
  if (e.current !== p) return fail(`${p.name} was closed or could not be brought forward while fal ran; nothing was added.`);
  e.insertRasterLayer(r, 'Generated Image', Math.round((W - w) / 2), Math.round((H - h) / 2), {}, 'Generate Image');
  return text(`Generated with ${m.label} on fal at ${pic.width} by ${pic.height}${out.seed !== undefined ? `, seed ${out.seed}` : ''}; the result is a new layer (id ${e.activeLayer?.id}).`, { id: e.activeLayer?.id, model: m.id, seed: out.seed ?? null, width: pic.width, height: pic.height });
}

/** upscale with a catalogue model: the function Engine.upscaleToDocument runs on the flattened picture. */
export async function falUpscaler(ask: Ask, a: Args, id: string, scale: number): Promise<{ run: (image: Blob) => Promise<Blob>; label: string; fixed: boolean } | McpResult> {
  const m = await ready(id, ['upscale']);
  if (asResult(m)) return m;
  const key = falImageKey(m);
  if (!key) return fail(`${m.id} has no image input.`);
  const extra = common(m, a, [key, 'upscale_factor']);
  if (typeof extra === 'string') return fail(extra);
  const factor = falHas(m, 'upscale_factor');
  if (factor && ((factor.min !== undefined && scale < factor.min) || (factor.max !== undefined && scale > factor.max))) return fail(`${m.id} takes an upscale factor from ${factor.min ?? 1} to ${factor.max}.`);
  if (!await ask(`An agent asks to upscale ${scale}x`, `${m.label} runs on fal and costs money.`)) return fail('The person declined upscaling on fal.');
  const run = async (image: Blob): Promise<Blob> => {
    const out = await api.falRun(m.id, { ...extra, ...(factor ? { upscale_factor: scale } : {}) }, { [key]: await dataUri(image) });
    if (!out.images[0]) throw new Error('fal returned no picture.');
    return falBlob(out.images[0].png);
  };
  return { run, label: m.label, fixed: !factor };
}

/** select_by_text: SAM 3 on the document's picture, its masks joined into the selection. */
export async function falSelectByText(e: Engine, ask: Ask, a: Args, mode: 'replace' | 'add' | 'subtract' | 'intersect'): Promise<McpResult> {
  const p = e.current, prompt = typeof a.prompt === 'string' ? a.prompt.trim() : '';
  if (!p) return fail('Open a document first.');
  if (!prompt) return fail('Give a prompt naming what to select, for example "the red car".');
  const m = await ready('fal-ai/sam-3/image', ['segment']);
  if (asResult(m)) return m;
  const key = falImageKey(m), flat = e.flattened();
  if (!key || !flat) return fail('There is no picture to select from.');
  const extra = falOptions(m, a.options, [key, 'prompt']);
  if (typeof extra === 'string') return fail(extra);
  if (!await ask('An agent asks to Select by Text', `Prompt: "${prompt}". ${m.label} runs on fal and costs money.`)) return fail('The person declined Select by Text on fal.');
  const W = p.doc.width, H = p.doc.height, k = Math.min(1, 2048 / Math.max(W, H)), sent = createSurface(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)));
  ctxOf(sent).drawImage(flat, 0, 0, sent.width, sent.height);
  let out;
  try { out = await api.falRun(m.id, { ...(falHas(m, 'apply_mask') ? { apply_mask: false } : {}), ...extra, prompt }, { [key]: await dataUri(await toBlob(sent)) }); } catch (err) { return fail(falWhy(err)); }
  const masks = out.masks ?? [];
  if (!masks.length) return fail(`Nothing in the picture matched "${prompt}". Try other words, or select with select, select_subject or select_color_range.`);
  const data = new Uint8Array(W * H);
  for (const mk of masks) {
    const bmp = await createImageBitmap(await falBlob(mk.png)), s = createSurface(W, H), c = ctxOf(s);
    c.drawImage(bmp, 0, 0, W, H); bmp.close();
    const px = c.getImageData(0, 0, W, H).data;
    let alpha = false;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { alpha = true; break; }
    for (let i = 0; i < data.length; i++) { const v = alpha ? px[i * 4 + 3] : px[i * 4]; if (v > data[i]) data[i] = v; }
  }
  if (!data.some((v) => v >= 128)) return fail(`Nothing in the picture matched "${prompt}". Try other words.`);
  if (e.current !== p && e.projects.includes(p)) e.switchTo(p.id);
  if (e.current !== p) return fail(`${p.name} was closed or could not be brought forward while fal ran; nothing was selected.`);
  e.applyAutoSelection(0, 0, W, H, data, 'Select by Text', { mode });
  const s = e.current?.selection;
  return s ? text(`Selected "${prompt}" with ${m.label} (${masks.length} mask${masks.length === 1 ? '' : 's'}): ${s.w} by ${s.h} at ${s.x}, ${s.y}.`, { x: s.x, y: s.y, width: s.w, height: s.h, masks: masks.length }) : fail(`Nothing in the picture matched "${prompt}".`);
}
