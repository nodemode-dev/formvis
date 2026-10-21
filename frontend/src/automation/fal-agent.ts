import { api, type FalInput, type FalModel, type FalRole } from '../io/api';

/** What the MCP tools need of the fal catalogue (the owner's 51 models): finding a model of the right role, turning size,
 *  aspect and seed into the inputs that model's schema names, and checking an options object against its keys before
 *  the engine checks the values. */
export const IMAGE_KEY = /^[a-z0-9_]*image_urls?$/;

export async function falCatalogue(): Promise<{ ready: boolean; models: FalModel[] }> {
  return api.falModels();
}

export function falPick(models: FalModel[], id: string, roles: FalRole[]): FalModel | string {
  const hit = models.find((m) => m.id === id);
  const names = (r: FalRole[]): string => models.filter((m) => r.includes(m.role)).map((m) => m.id).join(', ');
  if (!hit) return `${id} is not in the formvis catalogue. fal_models lists the models; for this tool use one of: ${names(roles)}.`;
  if (!roles.includes(hit.role)) return `${id} is a ${hit.role} model, not ${roles.join(' or ')}. Use one of: ${names(roles)}.`;
  return hit;
}

export function falHas(m: FalModel, key: string): FalInput | undefined {
  return m.inputs.find((i) => i.key === key);
}

export function falImageKey(m: FalModel): string | null {
  const inputs = m.inputs.filter((i) => IMAGE_KEY.test(i.key) && (i.type === 'string' || i.type === 'array'));
  return (inputs.find((i) => i.required) ?? inputs[0])?.key ?? null;
}

const snap16 = (n: number): number => Math.max(64, Math.round(n / 16) * 16);

export function dimsFor(aspect: string | undefined, size: { width: number; height: number } | undefined, doc: { width: number; height: number }): { width: number; height: number } {
  if (size) return { width: Math.round(size.width), height: Math.round(size.height) };
  const m = aspect ? /^(\d+):(\d+)$/.exec(aspect) : null;
  const ratio = m ? Number(m[1]) / Number(m[2]) : doc.width / doc.height, long = m ? 1024 : Math.min(2048, Math.max(doc.width, doc.height));
  return ratio >= 1 ? { width: snap16(long), height: snap16(long / ratio) } : { width: snap16(long * ratio), height: snap16(long) };
}

function nearestAspect(options: string[], ratio: number): string | undefined {
  let best: string | undefined, gap = Infinity;
  for (const o of options) {
    const m = /^(\d+):(\d+)$/.exec(o);
    if (!m) continue;
    const g = Math.abs(Math.log(Number(m[1]) / Number(m[2]) / ratio));
    if (g < gap) { gap = g; best = o; }
  }
  return best;
}

export function sizeInputs(m: FalModel, aspect: string | undefined, size: { width: number; height: number } | undefined, doc: { width: number; height: number }): Record<string, unknown> | string {
  const asked = !!(aspect || size), d = dimsFor(aspect, size, doc);
  if (falHas(m, 'image_size')) return { image_size: { width: d.width, height: d.height } };
  const ar = falHas(m, 'aspect_ratio');
  if (ar) {
    if (aspect && (!ar.enum || ar.enum.includes(aspect))) return { aspect_ratio: aspect };
    const pick = ar.enum ? nearestAspect(ar.enum, d.width / d.height) : `${d.width}:${d.height}`;
    if (aspect && ar.enum) return `${m.id} takes aspect_ratio ${ar.enum.join(', ')}.`;
    return pick ? { aspect_ratio: pick } : {};
  }
  return asked ? `${m.id} has no size or aspect_ratio input: leave them out or choose another model (fal_models lists each model's inputs).` : {};
}

export function falOptions(m: FalModel, options: unknown, skip: string[]): Record<string, unknown> | string {
  if (options === undefined || options === null) return {};
  if (typeof options !== 'object' || Array.isArray(options)) return 'options must be an object of the model\'s input names and values.';
  const out: Record<string, unknown> = {}, known = new Set(m.inputs.filter((i) => !IMAGE_KEY.test(i.key)).map((i) => i.key));
  for (const [k, v] of Object.entries(options as Record<string, unknown>)) {
    if (skip.includes(k)) return `${k} is set through its own parameter, not options.`;
    if (!known.has(k)) return `${m.id} has no input ${k}. Its inputs: ${[...known].join(', ')}.`;
    out[k] = v;
  }
  return out;
}

export async function falBlob(png: string): Promise<Blob> {
  return (await fetch(`data:image/png;base64,${png}`)).blob();
}

export async function dataUri(blob: Blob): Promise<string> {
  const b = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/png'};base64,${btoa(s)}`;
}

export function falWhy(err: unknown): string {
  const t = err instanceof Error ? err.message : String(err);
  const code = (err as { status?: number })?.status;
  if (code === 428) return 'fal has no key yet: add one in Edit > Generative Fill.';
  if (code === 401) return 'fal rejected the key: change it in Edit > Generative Fill.';
  if (code === 402) return 'fal needs credit on this account before it can run the model.';
  return t;
}
