import { api, type FalInput, type FalModel, type FalRole, type FalRunResult } from './api';

let catalogue: Promise<FalModel[]> | null = null;

/** The fal models of the owner's catalogue, fetched once; empty while the engine does not answer. */
export function falCatalogue(): Promise<FalModel[]> {
  if (!catalogue) {
    catalogue = api.falModels().then((r) => r.models ?? [], () => { catalogue = null; return []; });
  }
  return catalogue;
}

export const falModelsOf = (all: readonly FalModel[], ...roles: FalRole[]): FalModel[] => all.filter((m) => roles.includes(m.role));

/** The picker value of a catalogue model, and its model id back. */
export const FAL_PREFIX = 'falcat:';
export const falValue = (m: FalModel): string => `${FAL_PREFIX}${m.id}`;
export const falIdOf = (value: string): string => (value.startsWith(FAL_PREFIX) ? value.slice(FAL_PREFIX.length) : '');

const isUrlKey = (k: string): boolean => /(_url|_urls)$/.test(k) || k === 'image' || k === 'images';
const isMaskKey = (k: string): boolean => /^mask(_image)?_url$/.test(k);

/** The schema key that takes the picture, and the one that takes the mask (empty when the model has none). */
export function falImageKey(m: FalModel): string { return m.inputs.find((i) => /^image(_url|_urls)?$/.test(i.key))?.key ?? ''; }
export function falMaskKey(m: FalModel): string { return m.inputs.find((i) => isMaskKey(i.key))?.key ?? ''; }
export const falIsArray = (m: FalModel, key: string): boolean => !!m.inputs.find((i) => i.key === key)?.isArray;

/** The keys a dialog never offers as options: the prompt, the pictures, the shape it supplies, and run plumbing. */
export function falSupplied(m: FalModel, extra: readonly string[] = []): Set<string> {
  const s = new Set<string>(['prompt', 'text_prompt', 'sync_mode', 'num_images', 'output_format', 'image_size', ...extra]);
  for (const i of m.inputs) if (isUrlKey(i.key)) s.add(i.key);
  return s;
}

/** The inputs that become a control: a select (enum), number, check or text; objects and lists are left to the engine's defaults. */
export function falOptionInputs(m: FalModel, skip: ReadonlySet<string>): FalInput[] {
  return m.inputs.filter((i) => !skip.has(i.key) && !i.isArray && (i.type === 'string' || i.type === 'integer' || i.type === 'number' || i.type === 'boolean'));
}

export const blobToDataUrl = (b: Blob): Promise<string> => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => no(new Error('The picture could not be read.'));
  r.readAsDataURL(b);
});

export function pngBlob(b64: string): Blob {
  const raw = atob(b64.replace(/^data:image\/png;base64,/, '')), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

/** One run of a catalogue model on `image` (and `mask` when the model takes one): the schema's image key gets the
 *  picture, its mask key the mask; the answer's first picture comes back as a PNG blob. */
export async function falRunImage(m: FalModel, inputs: Record<string, unknown>, image: Blob | null, mask: Blob | null = null): Promise<{ result: FalRunResult; blob: Blob }> {
  const images: Record<string, string | string[]> = {};
  const ik = falImageKey(m), mk = falMaskKey(m);
  if (image && ik) { const url = await blobToDataUrl(image); images[ik] = falIsArray(m, ik) ? [url] : url; }
  if (mask && mk) images[mk] = await blobToDataUrl(mask);
  const result = await api.falRun(m.id, inputs, images);
  const first = result.images?.[0];
  if (!first) throw new Error('fal returned no picture.');
  return { result, blob: pngBlob(first.png) };
}

/** A returned picture's alpha as a grayscale mask (white where the picture is opaque), at the picture's size. */
export async function alphaMask(picture: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(picture), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const px = g.getImageData(0, 0, c.width, c.height), d = px.data;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; d[i] = d[i + 1] = d[i + 2] = a; d[i + 3] = 255; }
  g.putImageData(px, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

/** The matting choice that sends Remove Background and Select Subject to the catalogue's cutout model. */
export const FAL_CUTOUT = 'fal-cutout';

/** Remove Background's and Select Subject's one call: the engine's matting, or the fal cutout model when that is the choice. */
export async function subjectMask(image: Blob, method: 'auto' | 'ml' | 'lite', matting: string): Promise<{ mask: Blob; method: string }> {
  if (matting !== FAL_CUTOUT) return api.removeBackground(image, method, matting);
  const m = falModelsOf(await falCatalogue(), 'cutout')[0];
  if (!m) throw new Error('The fal cutout model is not in the catalogue.');
  const { result, blob } = await falRunImage(m, {}, image);
  const mask = result.masks?.[0] ? pngBlob(result.masks[0].png) : await alphaMask(blob);
  return { mask, method: 'file' };
}

export const falPricing =(m: FalModel): string => (m.pricing && m.pricing.trim() ? m.pricing.trim() : 'fal bills each run at the model\'s own rate; see its page on fal.ai.');
