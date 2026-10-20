import { createSurface, ctxOf, toBlob, type Engine } from '../engine';
import { api } from './api';
import { encodeGif } from './gif';
import { trimSurface } from './layer-export';
import { pathBounds } from '../engine/paths';
import type { VectorLayer } from '../engine/types';

/** File > Export > Generate Image Assets (DEV_PLAN 29.5 part b): layer names in the usual asset syntax become files.
 *  A name is a comma separated list of specs, each an optional size, a file name with an extension and an optional
 *  quality, as in `200% big.png, small.jpg60%` or `64x? icon.png`. */

export type AssetFormat = 'png' | 'png8' | 'png24' | 'png32' | 'jpg' | 'gif' | 'webp' | 'svg';
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

const SPEC = /^(?:(\d+(?:\.\d+)?)%|(\d+|\?)x(\d+|\?))?\s*(.*?\.(png8|png24|png32|png|jpeg|jpg|gif|webp|svg))(\d{1,3}%|\d{1,2})?$/i;

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
      else if (format === 'jpg' || format === 'webp') { const v = parseInt(m[6], 10); quality = v > 10 ? Math.min(100, v) / 100 : Math.max(1, v) / 10; }
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

async function encodeAsset(src: ReturnType<typeof createSurface>, spec: AssetSpec, engineUp: boolean): Promise<Blob> {
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
  // png, png24 and png32 are canvas PNGs; png8 is quantised to a 256-colour palette by the engine when it is running.
  const png = await toBlob(c, 'image/png');
  if (spec.format === 'png8' && engineUp) { try { return await api.encode(png, 'png8'); } catch { /* the full colour PNG below */ } }
  return png;
}

const hex = (c: { r: number; g: number; b: number }): string => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const num = (n: number): string => String(Math.round(n * 1000) / 1000);

/** A shape layer written as an SVG file: its outline, fill and stroke, sized by the spec. Null for a layer with no outline. */
export function vectorSvg(v: VectorLayer, spec: AssetSpec): Blob | null {
  const b = pathBounds(v.path);
  if (!b) return null;
  const pad = v.stroke ? v.stroke.width / 2 : 0, x = b.x - pad, y = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2;
  if (!(w > 0 && h > 0)) return null;
  const [tw, th] = targetSize(spec, w, h);
  let d = '';
  for (const sp of v.path.subpaths) {
    const a = sp.anchors;
    if (!a.length) continue;
    d += `M${num(a[0].x)} ${num(a[0].y)}`;
    const seg = (f: typeof a[number], t: typeof a[number]): string => `C${num(f.outX)} ${num(f.outY)} ${num(t.inX)} ${num(t.inY)} ${num(t.x)} ${num(t.y)}`;
    for (let i = 1; i < a.length; i++) d += seg(a[i - 1], a[i]);
    if (sp.closed && a.length > 1) d += `${seg(a[a.length - 1], a[0])}Z`;
  }
  const stroke = v.stroke ? ` stroke="${hex(v.stroke.color)}" stroke-width="${num(v.stroke.width)}"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}" viewBox="${num(x)} ${num(y)} ${num(w)} ${num(h)}"><path d="${d}" fill="${v.fill ? hex(v.fill) : 'none'}"${v.path.evenOdd ? ' fill-rule="evenodd"' : ''}${stroke}/></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

/** `name` made unique among `used`: a second use becomes `name 2.ext`, a third `name 3.ext`. */
function uniqueName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.'), stem = name.slice(0, dot), ext = name.slice(dot);
  let n = 1, out = name;
  while (used.has(out.toLowerCase())) out = `${stem} ${++n}${ext}`;
  used.add(out.toLowerCase());
  return out;
}

/** A default variant: every asset name without a size of its own is also written at this scale, with the suffix after its name. */
export interface AssetVariant { pct: number; suffix: string }

/** Variants from a typed list such as `100, 200@2x, 3x`: a number with `x` (times) or `%` or neither (percent), then an
 *  optional suffix; a scale other than 100 percent with no suffix gets `@2x` style. Repeats and out-of-range scales are dropped. */
export function parseVariants(text: string): AssetVariant[] {
  const out: AssetVariant[] = [], seen = new Set<number>();
  for (const part of text.split(/[,;\n]/)) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(x|%)?\s*(\S*)\s*$/i.exec(part);
    if (!m) continue;
    const pct = Math.round((m[2]?.toLowerCase() === 'x' ? Number(m[1]) * 100 : Number(m[1])) * 100) / 100;
    if (!(pct >= 1 && pct <= 1600) || seen.has(pct)) continue;
    seen.add(pct);
    const suffix = m[3] ? m[3].replace(/[\\/:*?"<>|]/g, '') : pct === 100 ? '' : `@${Number((pct / 100).toFixed(2))}x`;
    out.push({ pct, suffix });
  }
  return out.slice(0, 8);
}

const VARIANTS_KEY = 'formvis.assetVariants';
export function loadVariantText(): string { try { return localStorage.getItem(VARIANTS_KEY) ?? ''; } catch { return ''; } }
export function saveVariantText(text: string): void { try { localStorage.setItem(VARIANTS_KEY, text); } catch { /* storage is blocked; the variants last this session only */ } }

function withVariant(spec: AssetSpec, v: AssetVariant): AssetSpec {
  const dot = spec.name.lastIndexOf('.');
  return { ...spec, name: `${spec.name.slice(0, dot)}${v.suffix}${spec.name.slice(dot)}`, size: v.pct === 100 ? null : { kind: 'scale', pct: v.pct } };
}

/** Every layer or folder whose name parses to asset specs, drawn alone (a folder with its contents), trimmed, scaled to
 *  each spec and encoded; a spec with no size of its own is written once per default variant when there are any. */
export async function assetFiles(engine: Engine, engineUp: boolean, variants: readonly AssetVariant[] = parseVariants(loadVariantText())): Promise<Array<{ name: string; blob: Blob }>> {
  const p = engine.current, files: Array<{ name: string; blob: Blob }> = [], used = new Set<string>();
  if (!p) return files;
  for (const l of p.doc.layers) {
    if (l.adjustment || (!l.isGroup && !l.raster)) continue;
    const specs = parseAssetSpecs(l.name);
    if (!specs.length) continue;
    const vector = specs.filter((s) => s.format === 'svg' && l.vector), pixel = specs.filter((s) => s.format !== 'svg');
    for (const base of vector) for (const spec of base.size || !variants.length ? [base] : variants.map((v) => withVariant(base, v))) {
      const blob = vectorSvg(l.vector as VectorLayer, spec);
      if (blob) files.push({ name: uniqueName(spec.name, used), blob });
    }
    if (!pixel.length) continue;
    const img = l.isGroup ? engine.renderGroupAlone(l.id) : engine.renderLayerAlone(l.id), cut = img ? trimSurface(img) : null;
    if (!cut) continue;
    for (const base of pixel) for (const spec of base.size || !variants.length ? [base] : variants.map((v) => withVariant(base, v))) files.push({ name: uniqueName(spec.name, used), blob: await encodeAsset(cut, spec, engineUp) });
  }
  return files;
}
