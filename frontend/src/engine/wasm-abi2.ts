import type { WasmManifest } from './wasm-plugin';

/** WebAssembly filter plug-ins, ABI v2 (docs/WASM_PLUGINS.md): the host side of the sample layout. A v2 module exports
 *  `abi_version() -> 2` and `filter2(ptr, width, height, params, desc) -> i32`; ABI v1 modules keep `filter` and 8 bit RGBA.
 *  Pure functions: the worker and the page share them. */

export type WasmFormat = 'u8' | 'u16' | 'f32';
export type WasmModel = 'rgb' | 'gray' | 'cmyk' | 'lab';
export type WasmAlpha = 'none' | 'pass' | 'process';

export const WASM_FORMATS: readonly WasmFormat[] = ['u8', 'u16', 'f32'];
export const WASM_MODELS: readonly WasmModel[] = ['rgb', 'gray', 'cmyk', 'lab'];
export const WASM_ALPHAS: readonly WasmAlpha[] = ['none', 'pass', 'process'];
export const FORMAT_CODE: Record<WasmFormat, number> = { u8: 0, u16: 1, f32: 2 };
export const MODEL_CODE: Record<WasmModel, number> = { rgb: 0, gray: 1, cmyk: 2, lab: 3 };
export const FORMAT_BYTES: Record<WasmFormat, number> = { u8: 1, u16: 2, f32: 4 };

/** Host pixels as floats: `n` colour channels, then straight alpha when `alpha` is set (stride n + 1), row after row. */
export interface WasmPlane { readonly n: number; readonly alpha: boolean; readonly width: number; readonly height: number; readonly data: Float32Array }

/** What the host sends: the descriptor words the module reads at `desc` (8 little-endian u32). */
export interface WasmLayout { readonly format: WasmFormat; readonly model: WasmModel; readonly colour: number; readonly sendAlpha: boolean; readonly linear: boolean }

export const WASM_DESC_WORDS = 8;

/** The format a module takes for a document's depth and mode, or the reason it cannot run on it. */
export function wasmPick(m: Pick<WasmManifest, 'formats' | 'models' | 'name'>, model: WasmModel, depth: 8 | 16 | 32): { format: WasmFormat } | { error: string } {
  if (!m.models.includes(model)) return { error: `${m.name} does not take ${model === 'cmyk' ? 'CMYK' : model === 'lab' ? 'Lab' : model === 'gray' ? 'single-channel' : 'RGB'} data.` };
  const order: WasmFormat[] = model === 'lab' ? ['f32'] : depth === 8 ? ['u8', 'u16', 'f32'] : depth === 16 ? ['u16', 'f32', 'u8'] : ['f32'];
  const format = order.find((f) => m.formats.includes(f));
  if (!format) return { error: `${m.name} cannot take ${depth} bit data: it declares only ${m.formats.join(', ')}.` };
  return { format };
}

export function wasmLayout(m: Pick<WasmManifest, 'alpha'>, plane: WasmPlane, model: WasmModel, format: WasmFormat, depth: 8 | 16 | 32): WasmLayout {
  return { format, model, colour: plane.n, sendAlpha: plane.alpha && m.alpha !== 'none', linear: depth === 32 };
}

export function wasmDescriptor(lay: WasmLayout, width: number): Uint32Array {
  const bpc = FORMAT_BYTES[lay.format], samples = lay.colour + (lay.sendAlpha ? 1 : 0);
  return Uint32Array.of(2, FORMAT_CODE[lay.format], MODEL_CODE[lay.model], lay.colour, lay.sendAlpha ? 1 : 0, bpc, width * samples * bpc, lay.linear ? 1 : 0);
}

export const wasmSampleBytes = (lay: WasmLayout, width: number, height: number): number => width * height * (lay.colour + (lay.sendAlpha ? 1 : 0)) * FORMAT_BYTES[lay.format];

/** The plane as the module reads it: interleaved samples in the layout's format, colour channels first and alpha last. */
export function wasmPack(plane: WasmPlane, lay: WasmLayout): ArrayBuffer {
  const px = plane.width * plane.height, S = plane.n + (plane.alpha ? 1 : 0), O = lay.colour + (lay.sendAlpha ? 1 : 0), src = plane.data;
  const out = new ArrayBuffer(px * O * FORMAT_BYTES[lay.format]);
  const put = lay.format === 'f32' ? new Float32Array(out) : lay.format === 'u16' ? new Uint16Array(out) : new Uint8Array(out);
  const top = lay.format === 'f32' ? 0 : lay.format === 'u16' ? 65535 : 255;
  for (let i = 0; i < px; i++) {
    for (let c = 0; c < O; c++) {
      const v = src[i * S + c];
      put[i * O + c] = top ? Math.round(Math.min(1, Math.max(0, v)) * top) : Number.isFinite(v) ? v : 0;
    }
  }
  return out;
}

/** The module's result put back into a copy of the plane. Alpha stays as it was unless the module processes it. */
export function wasmUnpack(buf: ArrayBuffer, plane: WasmPlane, lay: WasmLayout, alpha: WasmAlpha): WasmPlane {
  const px = plane.width * plane.height, S = plane.n + (plane.alpha ? 1 : 0), O = lay.colour + (lay.sendAlpha ? 1 : 0), data = new Float32Array(plane.data);
  const get = lay.format === 'f32' ? new Float32Array(buf) : lay.format === 'u16' ? new Uint16Array(buf) : new Uint8Array(buf);
  const top = lay.format === 'f32' ? 0 : lay.format === 'u16' ? 65535 : 255, bounded = lay.model !== 'lab' && !(lay.linear && lay.format === 'f32');
  const take = alpha === 'process' && lay.sendAlpha ? O : lay.colour;
  for (let i = 0; i < px; i++) {
    for (let c = 0; c < take; c++) {
      let v = top ? get[i * O + c] / top : get[i * O + c];
      if (!Number.isFinite(v)) v = 0;
      if (lay.model !== 'lab') v = bounded ? Math.min(1, Math.max(0, v)) : Math.max(0, v);
      data[i * S + c] = v;
    }
  }
  return { n: plane.n, alpha: plane.alpha, width: plane.width, height: plane.height, data };
}

/** An 8 bit RGBA picture as a plane of floats 0 to 1, and back. */
export function planeFromImage(img: ImageData): WasmPlane {
  const d = img.data, data = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) data[i] = d[i] / 255;
  return { n: 3, alpha: true, width: img.width, height: img.height, data };
}

export function imageFromPlane(p: WasmPlane): ImageData {
  const out = new ImageData(p.width, p.height), d = out.data;
  for (let i = 0; i < d.length; i++) d[i] = Math.round(Math.min(1, Math.max(0, p.data[i])) * 255);
  return out;
}
