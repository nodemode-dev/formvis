import { createSurface, ctxOf, toBlob, type Engine } from '../engine';
import { encodeGif } from './gif';
import { trimSurface } from './layer-export';

/** File > Export > Generate Image Assets (DEV_PLAN 29.5 part b): layer names in Photoshop's asset syntax become files.
 *  A name is a comma separated list of specs, each an optional size, a file name with an extension and an optional
 *  quality, as in `200% big.png, small.jpg60%` or `64x? icon.png`. */

export type AssetFormat = 'png' | 'png8' | 'png24' | 'png32' | 'jpg' | 'gif' | 'webp';
export interface AssetSize { kind: 'scale'; pct: number }
export interface AssetBox { kind: 'box'; w: number | null; h: number | null }
export interface AssetSpec {
  /** The file name as written, with its extension. */
  name: string;
  format: AssetFormat;
  /** Lossy quality from 0 to 1; 0.9 when the spec gives none. */
  quality: number;
  size: AssetSize | AssetBox | null;
}

const SPEC = /^(?:(\d+(?:\.\d+)?)%|(\d+|\?)x(\d+|\?))?\s*(.*?\.(png8|png24|png32|png|jpeg|jpg|gif|webp))(\d{1,3}%|\d{1,2})?$/i;

/** The specs a layer name holds; an empty list when no part of it carries a known extension. */
export function parseAssetSpecs(layerName: string): AssetSpec[] {
  const out: AssetSpec[] = [];
  for (const part of layerName.split(',')) {
    const m = SPEC.exec(part.trim());
    if (!m) continue;
    const ext = m[5].toLowerCase(), format = (ext === 'jpeg' ? 'jpg' : ext) as AssetFormat, base = m[4].slice(0, m[4].length - ext.length - 1).trim();
    if (!base) continue;
    let quality = 0.9;
    if (m[6]) {
      if (m[6].endsWith('%')) quality = Math.min(100, parseInt(m[6], 10)) / 100;
      else if (format === 'jpg') quality = Math.min(10, Math.max(1, parseInt(m[6], 10))) / 10;
    }
    let size: AssetSpec['size'] = null;
    if (m[1]) size = { kind: 'scale', pct: parseFloat(m[1]) };
    else if (m[2] !== undefined && m[3] !== undefined) size = { kind: 'box', w: m[2] === '?' ? null : parseInt(m[2], 10), h: m[3] === '?' ? null : parseInt(m[3], 10) };
    if (size && ((size.kind === 'scale' && !(size.pct > 0)) || (size.kind === 'box' && size.w === null && size.h === null))) size = null;
    out.push({ name: `${base}.${ext === 'jpeg' ? 'jpg' : ext}`, format, quality, size });
  }
  return out;
}

function targetSize(spec: AssetSpec, w: number, h: number): [number, number] {
  const s = spec.size;
  if (!s) return [w, h];
  if (s.kind === 'scale') return [Math.max(1, Math.round(w * s.pct / 100)), Math.max(1, Math.round(h * s.pct / 100))];
  if (s.w !== null && s.h !== null) return [Math.max(1, s.w), Math.max(1, s.h)];
  if (s.w !== null) return [Math.max(1, s.w), Math.max(1, Math.round(h * s.w / w))];
  return [Math.max(1, Math.round(w * (s.h as number) / h)), Math.max(1, s.h as number)];
}

async function encodeAsset(src: ReturnType<typeof createSurface>, spec: AssetSpec): Promise<Blob> {
  const [w, h] = targetSize(spec, src.width, src.height), c = createSurface(w, h), x = ctxOf(c);
  x.imageSmoothingQuality = 'high';
  if (spec.format === 'jpg') { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); }
  x.drawImage(src as CanvasImageSource, 0, 0, src.width, src.height, 0, 0, w, h);
  if (spec.format === 'jpg') return toBlob(c, 'image/jpeg', spec.quality);
  if (spec.format === 'webp') return toBlob(c, 'image/webp', spec.quality);
  if (spec.format === 'gif') {
    const d = x.getImageData(0, 0, w, h);
    return new Blob([encodeGif([{ data: d, delayMs: 0 }], w, h)], { type: 'image/gif' });
  }
  // png, png24 and png32 are canvas PNGs. png8 is also a full colour PNG for now (no palette quantiser yet).
  return toBlob(c, 'image/png');
}

/** `name` made unique among `used`: a second use becomes `name 2.ext`, a third `name 3.ext`. */
function uniqueName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.'), stem = name.slice(0, dot), ext = name.slice(dot);
  let n = 1, out = name;
  while (used.has(out.toLowerCase())) out = `${stem} ${++n}${ext}`;
  used.add(out.toLowerCase());
  return out;
}

/** Every layer whose name parses to asset specs, drawn alone, trimmed, scaled to each spec and encoded. */
export async function assetFiles(engine: Engine, _engineUp: boolean): Promise<Array<{ name: string; blob: Blob }>> {
  const p = engine.current, files: Array<{ name: string; blob: Blob }> = [], used = new Set<string>();
  if (!p) return files;
  for (const l of p.doc.layers) {
    if (l.isGroup || l.adjustment || !l.raster) continue;
    const specs = parseAssetSpecs(l.name);
    if (!specs.length) continue;
    const img = engine.renderLayerAlone(l.id), cut = img ? trimSurface(img) : null;
    if (!cut) continue;
    for (const spec of specs) files.push({ name: uniqueName(spec.name, used), blob: await encodeAsset(cut, spec) });
  }
  return files;
}
