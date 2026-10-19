import type { GenerationInfo, Layer } from '../engine/types';

/** The generation settings of the picture, for the PNG text chunks: the topmost visible layer made by a generator. */
export function generationOf(layers: readonly Layer[]): GenerationInfo | null {
  for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; if (l.visible && l.generation && (l.generation.prompt || l.generation.parameters)) return l.generation; }
  return null;
}

/** The "parameters" text most generators read back: the prompt, then one line of settings. */
export function parametersText(g: GenerationInfo): string {
  if (g.parameters) return g.parameters;
  const rest = [g.steps !== undefined ? `Steps: ${g.steps}` : '', g.sampler ? `Sampler: ${g.sampler}` : '', g.guidance !== undefined ? `CFG scale: ${g.guidance}` : '', g.seed !== undefined ? `Seed: ${g.seed}` : '', g.model ? `Model: ${g.model}` : '',
    ...(g.loras ?? []).map((l) => `Lora: ${l.file} ${l.scale}`)].filter(Boolean);
  return `${g.prompt ?? ''}\n${rest.join(', ')}`.trim();
}

const table = ((): Uint32Array => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (d: Uint8Array): number => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = table[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** `png` with one uncompressed UTF-8 text chunk (iTXt) a key, placed right after IHDR. */
export function addPngText(png: Uint8Array, entries: ReadonlyArray<readonly [string, string]>): Uint8Array {
  if (png.length < 33 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) throw new Error('not a PNG');
  const enc = new TextEncoder(), chunks: Uint8Array[] = [];
  for (const [key, value] of entries) {
    const k = enc.encode(key.slice(0, 79)), v = enc.encode(value), data = new Uint8Array(k.length + 5 + v.length), chunk = new Uint8Array(12 + data.length), dv = new DataView(chunk.buffer);
    data.set(k, 0); data.set(v, k.length + 5);
    dv.setUint32(0, data.length); chunk.set(enc.encode('iTXt'), 4); chunk.set(data, 8);
    dv.setUint32(8 + data.length, crc(chunk.subarray(4, 8 + data.length)));
    chunks.push(chunk);
  }
  const at = 8 + 12 + new DataView(png.buffer, png.byteOffset).getUint32(8), out = new Uint8Array(png.length + chunks.reduce((n, c) => n + c.length, 0));
  out.set(png.subarray(0, at), 0);
  let o = at;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  out.set(png.subarray(at), o);
  return out;
}

/** `blob` (a PNG) with the prompt, seed and settings as "parameters" and the full record as "formvis-recipe"; unchanged when no layer was generated. */
export async function withGenerationText(blob: Blob, layers: readonly Layer[]): Promise<Blob> {
  const g = generationOf(layers);
  if (!g) return blob;
  const out = addPngText(new Uint8Array(await blob.arrayBuffer()), [['parameters', parametersText(g)], ['formvis-recipe', JSON.stringify(g)]]);
  return new Blob([out as BlobPart], { type: 'image/png' });
}
