import {
  BLEND_MODES, REF_BLEND_MODES, Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsActive, effectsFromData, liveText, textFromData, smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB, timelineData, timelineFrom, type Timeline, addPattern, patternById, projectPatterns,
} from '../engine';
import { PARAM_ADJUSTMENTS, PARAM_KINDS } from '../engine/adjust-params';
import type { FilePart } from './api';

export const FORMAT = 'com.nodemode.sonny';
export const FORMAT_VERSION = 1;

type Json = Record<string, unknown>;
const KINDS: Record<string, AdjustmentKind> = { 'Hue/Saturation': 'hsv', Levels: 'levels', Curves: 'curves', Exposure: 'exposure', 'Gradient Map': 'gradientMap', Grain: 'grain', ...Object.fromEntries(PARAM_KINDS.map((k) => [PARAM_ADJUSTMENTS[k].label, k])) };
const REF_KINDS: ReadonlySet<string> = new Set(['Hue/Saturation', 'Levels', 'Curves', 'Exposure', 'Gradient Map', 'Grain']);
const KIND_LABELS = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v, k])) as Record<AdjustmentKind, string>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number' ? [v[0], v[1]] : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function transformRecord(t: Transform): Json {
  return { origin: [t.x, t.y], size: [t.w, t.h], rotation: t.rotation, flipX: t.flipX, flipY: t.flipY, sampling: SAMPLING_LABELS[t.sampling] };
}

export function transformFrom(raw: unknown, w: number, h: number): Transform {
  const o = obj(raw);
  const origin = pair(o.origin) ?? [0, 0];
  const size = pair(o.size) ?? [w, h];
  return { x: origin[0], y: origin[1], w: Math.max(1, size[0]), h: Math.max(1, size[1]), rotation: num(o.rotation, 0), flipX: o.flipX === true, flipY: o.flipY === true, sampling: samplingFromLabel(o.sampling) };
}

function maskToGray(r: Raster): ReturnType<typeof createSurface> {
  const img = r.read();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; d[i] = a; d[i + 1] = a; d[i + 2] = a; d[i + 3] = 255; }
  const s = createSurface(r.width, r.height);
  ctxOf(s).putImageData(img, 0, 0);
  return s;
}

function grayToMask(src: ImageBitmap): Raster {
  const r = Raster.from(src, src.width, src.height);
  const img = r.read();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(((d[i] + d[i + 1] + d[i + 2]) / 3) * (d[i + 3] / 255));
    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = v;
  }
  r.write(img);
  return r;
}

export async function serialize(doc: Doc, activeId: ID | null, paths: PathSet | null = null, timeline: Timeline | null = null): Promise<{ manifest: Json; files: FilePart[] }> {
  const files: FilePart[] = [];
  const layers: Json[] = [];
  for (const l of doc.layers) {
    const r: Json = { id: l.id, name: l.name, isVisible: l.visible, transform: transformRecord(l.transform) };
    if (l.raster && !l.isGroup) { const name = `${l.id}.png`; files.push({ name, blob: await toBlob(l.raster.canvas) }); r.imageFile = name; }
    if (l.vector) r.vector = { fill: l.vector.fill, stroke: l.vector.stroke ?? null, origin: l.vector.origin, subpaths: pathData(l.vector.path)?.subpaths ?? [] };
    if (l.smart && !l.isGroup) {
      const name = `${l.id}.source.png`;
      files.push({ name, blob: await toBlob(l.smart.source.canvas) });
      r.smartSourceFile = name;
      r.smart = { filters: l.smart.filters.map(({ id, kind, settings, enabled }) => ({ id, kind, settings, enabled })), warp: l.smart.warp ?? null, warpAt: l.smart.warpAt ? transformRecord(l.smart.warpAt) : null, filterMaskEnabled: l.smart.filterMaskEnabled !== false, link: l.smart.link ? { id: l.smart.link.id, name: l.smart.link.name, size: l.smart.link.size, lastModified: l.smart.link.lastModified } : null };
      if (l.smart.filterMask) {
        const mn = `${name.replace(/\.png$/i, '')}-filtermask.png`;
        files.push({ name: mn, blob: await toBlob(l.smart.filterMask.canvas) });
        r.smartFilterMaskFile = mn;
      }
    }
    if (l.parentId) r.parentID = l.parentId;
    if (l.isGroup) r.isGroup = true;
    if (l.opacity !== 1) r.opacity = l.opacity;
    if (l.blend !== 'normal') r.blendMode = blendLabel(l.blend);
  if (effectsActive(l.effects)) r.effects = structuredClone(l.effects);
  if (liveText(l) && l.text) { const { rendered: _rendered, ...text } = l.text; r.text = text; }
    if (l.mask) {
      const w = l.mask.raster?.width ?? l.raster?.width ?? Math.max(1, Math.round(l.transform.w));
      const h = l.mask.raster?.height ?? l.raster?.height ?? Math.max(1, Math.round(l.transform.h));
      const name = `${l.id}.mask.png`;
      files.push({ name, blob: await toBlob(maskToGray(l.mask.raster ?? Raster.filled(w, h, 'white'))) });
      r.maskFile = name;
      r.maskEnabled = l.mask.enabled;
      if (l.mask.placement) r.maskPlacement = transformRecord(l.mask.placement);
      if (!l.mask.linked) r.maskLinked = false;
    }
    if (l.clipId) r.maskSourceID = l.clipId;
    if (l.adjustment) r.adjustment = { ...l.adjustment.data, kind: KIND_LABELS[l.adjustment.kind] };
    if (l.shape) r.shape = l.shape;
    layers.push(r);
  }
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, colorSpace: 'sRGB', resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}) };
  if (activeId && doc.layers.some((l) => l.id === activeId)) manifest.activeLayerID = activeId;
  const pathRecord = pathSetData(paths);
  if (pathRecord) { manifest.paths = pathRecord.list; if (pathRecord.active) manifest.activePath = pathRecord.active; }
  // The patterns this document's styles use travel inside it, so it opens the same where they are not defined.
  const used = new Set<string>();
  for (const l of doc.layers) { const po = l.effects?.patternOverlay; if (po?.enabled && po.pattern && !po.pattern.startsWith('builtin:')) used.add(po.pattern); }
  const carried: Array<{ id: string; name: string; file: string }> = [];
  for (const id of used) {
    const pat = patternById(id);
    if (!pat) continue;
    const file = `pattern-${carried.length + 1}.png`;
    files.push({ name: file, blob: await toBlob(pat.surface) });
    carried.push({ id, name: pat.name, file });
  }
  if (carried.length) manifest.patterns = carried;
  const frames = timelineData(timeline);
  if (frames) manifest.timeline = frames;
  return { manifest, files };
}

const REF_BLEND_LABELS: ReadonlySet<string> = new Set(BLEND_MODES.filter((b) => REF_BLEND_MODES.has(b.id)).map((b) => b.label));
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const asUuid = (v: unknown, map: Map<string, string>): string | null => {
  const s = str(v);
  if (!s) return null;
  let u = map.get(s);
  if (!u) { u = UUID.test(s) ? s : uid().toUpperCase(); map.set(s, u); }
  return u;
};

/** The document as a project (format `com.reference.project`, version 7), for `Name.ref/`: the same
 *  manifest and files as `serialize`, reshaped to what `ProjectStore.validate` accepts: UUID ids (regenerated where
 * sonny fell back to counters), image files named after them, folders without opacity or blend (the
 *  folders carry neither), adjustment layers without pixels, non-empty names and a resolution of 1 to 9600. Anything
 * changed is listed in `notes` so the person knows what will see differently. */
export async function serializeRefProject(doc: Doc, activeId: ID | null, paths: PathSet | null = null, timeline: Timeline | null = null): Promise<{ manifest: Json; files: FilePart[]; notes: string[] }> {
  const { manifest, files } = await serialize(doc, activeId);
  const ids = new Map<string, string>(), rename = new Map<string, string>(), drop = new Set<string>(), notes: string[] = [];
  if (pathSetData(paths)) notes.push('Paths are left out; .ref projects have none.');
  if (timelineData(timeline)) notes.push('Animation frames are left out; .ref projects have none.');
  const layers = (Array.isArray(manifest.layers) ? manifest.layers.map(obj) : []).map((r) => {
    const id = asUuid(r.id, ids) as string, out: Json = { ...r, id };
    const name = (str(r.name) ?? '').trim();
    if (!name) { out.name = 'Layer'; notes.push('An unnamed layer was named "Layer".'); }
    if (r.parentID) out.parentID = asUuid(r.parentID, ids);
    if (r.maskSourceID) out.maskSourceID = asUuid(r.maskSourceID, ids);
    if (str(r.imageFile)) {
      if (r.adjustment) { drop.add(str(r.imageFile) as string); delete out.imageFile; }
      else { rename.set(str(r.imageFile) as string, `${id}.png`); out.imageFile = `${id}.png`; }
    }
    if (str(r.maskFile)) { rename.set(str(r.maskFile) as string, `${id}.mask.png`); out.maskFile = `${id}.mask.png`; }
    if (r.vector) { delete out.vector; notes.push(`"${name || 'Layer'}" goes as pixels; .ref projects have no shape layers.`); }
    if (str(r.smartSourceFile)) {
      drop.add(str(r.smartSourceFile) as string);
      if (str(r.smartFilterMaskFile)) drop.add(str(r.smartFilterMaskFile) as string);
      delete out.smartSourceFile;
      delete out.smartFilterMaskFile;
      delete out.smart;
      notes.push(`"${name || 'Layer'}" goes as pixels; .ref projects have no smart objects.`);
    }
    if (r.isGroup === true && ((typeof r.opacity === 'number' && r.opacity !== 1) || (r.blendMode && r.blendMode !== 'Normal'))) {
      delete out.opacity; delete out.blendMode;
      notes.push(`Folder "${name || 'Layer'}" loses its opacity or blend mode; .ref folders carry neither.`);
    }
    if (typeof out.blendMode === 'string' && !REF_BLEND_LABELS.has(out.blendMode)) {
      notes.push(`"${name || 'Layer'}" uses ${out.blendMode}, which .ref projects cannot hold; it exports as Normal.`);
      delete out.blendMode;
    }
    if (out.effects) {
      notes.push(`"${name || 'Layer'}" loses its layer style; .ref projects have none.`);
      delete out.effects;
    }
    if (out.text) {
      notes.push(`"${name || 'Layer'}" becomes plain pixels; .ref projects have no editable type.`);
      delete out.text;
    }
    if (r.adjustment && !REF_KINDS.has(String(obj(r.adjustment).kind))) {
      notes.push(`"${name || 'Layer'}" is a ${String(obj(r.adjustment).kind)} layer, which .ref projects cannot hold; it is left out.`);
      return null;
    }
    return out;
  }).filter((x): x is Json => x !== null);
  const res = num(manifest.resolution, 72);
  const out: Json = { ...manifest, format: 'com.reference.project', version: 7, documentID: asUuid(manifest.documentID, ids) ?? uid().toUpperCase(), resolution: Math.min(9600, Math.max(1, res)), layers };
  if (manifest.activeLayerID) out.activeLayerID = asUuid(manifest.activeLayerID, ids);
  if (res < 1 || res > 9600) notes.push(`Resolution ${res} was clamped to the .ref range, 1 to 9600.`);
  const parts = files.filter((f) => !drop.has(f.name)).map((f) => ({ ...f, name: rename.get(f.name) ?? f.name }));
  return { manifest: out, files: parts, notes };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const colorFrom = (raw: unknown): RGB | null => {
  const c = obj(raw);
  return finite(c.r) && finite(c.g) && finite(c.b) ? { r: Math.min(255, Math.max(0, c.r)), g: Math.min(255, Math.max(0, c.g)), b: Math.min(255, Math.max(0, c.b)) } : null;
};

/** A shape layer read back, checked: a path, a render origin, and a fill, a stroke or both. */
function vectorFrom(raw: unknown): Layer['vector'] {
  if (!raw || typeof raw !== 'object') return null;
  const o = obj(raw), path = pathFrom(o), origin = obj(o.origin), fill = colorFrom(o.fill), s = obj(o.stroke), color = colorFrom(s.color);
  const stroke = color && finite(s.width) && s.width > 0 ? { color, width: Math.min(1000, s.width) } : null;
  if (!path || !finite(origin.x) || !finite(origin.y) || (!fill && !stroke)) return null;
  return { path, fill, stroke, origin: { x: origin.x, y: origin.y } };
}

export async function deserialize(manifest: Json, fetchImage: (name: string) => Promise<Blob>): Promise<{ doc: Doc; activeId: ID | null; paths: PathSet | null; timeline: Timeline | null }> {
  // Patterns carried by the project, registered before its layers render.
  if (Array.isArray(manifest.patterns)) {
    for (const raw of manifest.patterns.slice(0, 200)) {
      const r = raw as Record<string, unknown>;
      if (typeof r?.id !== 'string' || typeof r.file !== 'string' || patternById(r.id)) continue;
      try {
        const bmp = await createImageBitmap(await fetchImage(r.file)), surface = createSurface(bmp.width, bmp.height);
        ctxOf(surface).drawImage(bmp, 0, 0);
        addPattern(typeof r.name === 'string' ? r.name : 'Pattern', surface, r.id.slice(0, 120));
        projectPatterns.add(r.id.slice(0, 120));
      } catch { /* a pattern that cannot be read leaves its style showing nothing */ }
    }
  }
  const width = num(manifest.width, 0), height = num(manifest.height, 0);
  const records = Array.isArray(manifest.layers) ? manifest.layers.map(obj) : [];
  const names = new Set<string>();
  for (const r of records) { for (const n of [str(r.imageFile), str(r.maskFile), str(r.smartSourceFile), str(r.smartFilterMaskFile)]) if (n) names.add(n); }
  const bitmaps = new Map<string, ImageBitmap>();
  await Promise.all([...names].map(async (n) => { bitmaps.set(n, await createImageBitmap(await fetchImage(n))); }));
  const layers: Layer[] = records.map((r) => {
    const image = bitmaps.get(str(r.imageFile) ?? '');
    const raster = image ? Raster.from(image, image.width, image.height) : null;
    const sourceImage = bitmaps.get(str(r.smartSourceFile) ?? '');
    const vector = raster ? vectorFrom(r.vector) : null;
    const sw = obj(r.smart), warpPts = Array.isArray(sw.warp) && sw.warp.length === 4 && sw.warp.every((q) => finite(obj(q).x) && finite(obj(q).y)) ? (sw.warp as Array<{ x: number; y: number }>).map((q) => ({ x: q.x, y: q.y })) : null;
    const fmImage = bitmaps.get(str(r.smartFilterMaskFile) ?? ''), fmOk = !!fmImage && !!sourceImage && fmImage.width === sourceImage.width && fmImage.height === sourceImage.height;
    const lk = obj(sw.link), link = str(lk.id) && str(lk.name) && finite(lk.size) && finite(lk.lastModified) ? { id: str(lk.id) as string, name: str(lk.name) as string, size: lk.size as number, lastModified: lk.lastModified as number } : null;
    const smart = raster && sourceImage ? { source: Raster.from(sourceImage, sourceImage.width, sourceImage.height), filters: smartFiltersFrom(r.smart), warp: warpPts, warpAt: warpPts && sw.warpAt ? transformFrom(sw.warpAt, raster.width, raster.height) : null, filterMask: fmOk && fmImage ? Raster.from(fmImage, fmImage.width, fmImage.height) : null, filterMaskEnabled: sw.filterMaskEnabled !== false, link } : null;
    const maskImage = bitmaps.get(str(r.maskFile) ?? '');
    const mask: Mask | null = maskImage
      ? { raster: grayToMask(maskImage), enabled: r.maskEnabled !== false, linked: r.maskLinked !== false, placement: r.maskPlacement ? transformFrom(r.maskPlacement, maskImage.width, maskImage.height) : null }
      : null;
    const adj = obj(r.adjustment);
    const kind = KINDS[String(adj.kind)];
    return {
      id: str(r.id) ?? uid(), name: str(r.name) ?? 'Layer', raster, transform: transformFrom(r.transform, raster?.width ?? width, raster?.height ?? height),
      visible: r.isVisible !== false, parentId: str(r.parentID), isGroup: r.isGroup === true, opacity: clamp(num(r.opacity, 1), 0, 1),
      blend: blendFromLabel(r.blendMode), effects: effectsFromData(r.effects), text: textFromData(r.text, raster), smart, vector, mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null,
    };
  });
  for (const b of bitmaps.values()) b.close();
  const guides = (Array.isArray(manifest.guides) ? manifest.guides : []).flatMap((g) => {
    const o = obj(g), axis: 'x' | 'y' | null = o.axis === 'x' || o.axis === 'y' ? o.axis : null, at = num(o.at, NaN);
    return axis && Number.isFinite(at) && at >= 0 && at <= (axis === 'x' ? width : height) ? [{ axis, at }] : [];
  }).slice(0, 1000);
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(guides.length ? { guides } : {}) }, activeId: str(manifest.activeLayerID) };
}
