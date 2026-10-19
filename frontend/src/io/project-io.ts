import { deepFromU16, deepToU16 } from '../engine/deep';
import { parseComps } from '../engine/layer-comps';
import type { ChannelPixels, DeepPixels, GenerationInfo } from '../engine/types';
import { readDuotone, type Duotone } from '../engine/duotone';
import {
  Raster, SAMPLING_LABELS, blendFromLabel, blendLabel, clamp, createSurface, ctxOf, samplingFromLabel, toBlob, uid, type AdjustmentKind, type Doc, type ID, type Layer, type Mask, type Transform, effectsPresent, effectsFromData, liveText, textFromData, paragraphStylesFrom, characterStylesFrom,smartFiltersFrom, pathSetData, pathSetFrom, pathData, pathFrom, type PathSet, type RGB, timelineData, timelineFrom, type Timeline, addPattern, patternById, projectPatterns, SelectionMask, type AlphaChannel,
} from '../engine';
import { artboardFromData, LAYER_LABELS, type LayerLabel, type SmartStack } from '../engine/types';
import { isStackMode } from '../engine/stack-modes';
import { cleanMeta } from '../engine/doc-meta';
import { fillContentFrom } from '../engine/fill-layers';
import { relightFrom } from '../engine/relight';
import { alphaGrey, nextAlphaName } from '../engine/alphas';
import { PARAM_ADJUSTMENTS, PARAM_KINDS } from '../engine/adjust-params';
import { api, type FilePart } from './api';
import { TiledRaster, type TileStore } from '../engine/tiled';

export const FORMAT = 'com.nodemode.formvis';
export const FORMAT_VERSION = 1;

type Json = Record<string, unknown>;
const KINDS: Record<string, AdjustmentKind> = { 'Hue/Saturation': 'hsv', Levels: 'levels', Curves: 'curves', Exposure: 'exposure', 'Gradient Map': 'gradientMap', Grain: 'grain', ...Object.fromEntries(PARAM_KINDS.map((k) => [PARAM_ADJUSTMENTS[k].label, k])) };
const KIND_LABELS = Object.fromEntries(Object.entries(KINDS).map(([label, kind]) => [kind, label])) as Record<AdjustmentKind, string>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number' ? [v[0], v[1]] : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function transformRecord(t: Transform): Json {
  return { origin: [t.x, t.y], size: [t.w, t.h], rotation: t.rotation, flipX: t.flipX, flipY: t.flipY, sampling: SAMPLING_LABELS[t.sampling] };
}

export function transformFrom(raw: unknown, w: number, h: number): Transform {
  const o = obj(raw), at = pair(o.origin) ?? [0, 0], extent = pair(o.size) ?? [w, h];
  return { x: at[0], y: at[1], w: Math.max(1, extent[0]), h: Math.max(1, extent[1]), rotation: num(o.rotation, 0), flipX: o.flipX === true, flipY: o.flipY === true, sampling: samplingFromLabel(o.sampling) };
}

function maskToGray(r: Raster): ReturnType<typeof createSurface> {
  const px = r.read(), surface = createSurface(r.width, r.height), ctx = ctxOf(surface), out = ctx.createImageData(r.width, r.height);
  for (let i = 0; i < px.data.length; i += 4) {
    const a = px.data[i + 3];
    out.data[i] = a; out.data[i + 1] = a; out.data[i + 2] = a; out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return surface;
}

function grayToMask(src: ImageBitmap): Raster {
  const surface = createSurface(src.width, src.height), ctx = ctxOf(surface);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const grey = (d[i] + d[i + 1] + d[i + 2]) / 3;
    d[i + 3] = Math.round((grey * d[i + 3]) / 255);
    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
  }
  const mask = Raster.from(src, src.width, src.height);
  mask.write(img);
  return mask;
}

/** What a giant layer's tiles need while saved or opened (1.62.8, DEV_PLAN 26.6): the engine's store, its paging and
 *  the tiles' share of memory, set by the app once the engine answers. */
export const giantTiles: { store: TileStore | null; page: () => Promise<unknown>; share: () => number } = { store: null, page: async () => 0, share: () => 512 * 1048576 };

const bandRows = (w: number): number => Math.max(16, Math.min(512, Math.floor(4_194_304 / w)));

/** A tiled layer's PNG, written by the engine a band at a time from its tiles (brought back from disk as needed and
 *  paged out behind), since a browser cannot encode a picture past one canvas. */
async function tiledPng(t: TiledRaster, ppi: number): Promise<Blob> {
  const key = await api.bandsBegin(t.width, t.height, ppi), B = bandRows(t.width);
  for (let y0 = 0; y0 < t.height; y0 += B) {
    const h = Math.min(B, t.height - y0);
    if (giantTiles.store) await t.ensure(0, y0, t.width, h, giantTiles.store);
    await api.bandsPut(key, t.read(0, y0, t.width, h).data as Uint8ClampedArray<ArrayBuffer>);
    await giantTiles.page();
  }
  return api.bandsEnd(key);
}

/** The engine's reading of an opened project's PNG a band at a time (`deserialize` is given it when opening from the
 *  engine). */
export interface BandReader { open(name: string): Promise<{ key: string; width: number; height: number }>; rows(key: string, n: number): Promise<ArrayBuffer> }

/** A tiled layer filled from its PNG a band at a time: a segment that is all the base colour is not written, so an
 *  untouched white background stays as no tiles (a 600 MP white page would otherwise make all 150), and tiles past the
 *  share go to the engine's disk as it fills (the document is not open yet, so the engine's paging cannot). */
async function fillTiled(t: TiledRaster, name: string, read: BandReader): Promise<void> {
  // Bands a power of two tall, so they divide the tile's 2,048 rows and never straddle two rows of tiles (209-row bands
  // had made an empty tile where a band's painted part sat in the row above).
  const { key, width } = await read.open(name), base = t.base ?? [0, 0, 0, 0], B = 2 ** Math.floor(Math.log2(bandRows(width)));
  for (let y0 = 0; y0 < t.height;) {
    const buf = new Uint8ClampedArray(await read.rows(key, B)), h = buf.length / (width * 4);
    if (!h) break;
    for (let x0 = 0; x0 < width; x0 += t.tile) {
      const w = Math.min(t.tile, width - x0);
      let differs = false;
      for (let yy = 0; yy < h && !differs; yy++) for (let i = (yy * width + x0) * 4, e = i + w * 4; i < e; i += 4) if (buf[i] !== base[0] || buf[i + 1] !== base[1] || buf[i + 2] !== base[2] || buf[i + 3] !== base[3]) { differs = true; break; }
      if (!differs) continue;
      const seg = new ImageData(w, h);
      for (let yy = 0; yy < h; yy++) seg.data.set(buf.subarray((yy * width + x0) * 4, (yy * width + x0 + w) * 4), yy * w * 4);
      t.write(seg, x0, y0);
    }
    y0 += h;
    const store = giantTiles.store;
    if (store) while (t.residentBytes > giantTiles.share()) { const k = t.leastUsed(); if (k === null || !(await t.pageOut(k, store))) break; }
  }
}

export async function serialize(doc: Doc, activeId: ID | null, paths: PathSet | null = null, timeline: Timeline | null = null): Promise<{ manifest: Json; files: FilePart[] }> {
  const files: FilePart[] = [], layers: Json[] = [];
  for (const l of doc.layers) {
    const r: Json = { id: l.id, name: l.name, isVisible: l.visible, transform: transformRecord(l.transform) };
    if (l.raster && !l.isGroup) { const name = `${l.id}.png`; files.push({ name, blob: await toBlob(l.raster.canvas) }); r.imageFile = name; }
    else if (l.tiled && !l.isGroup) {   // a giant layer, written band by band by the engine (1.62.8)
      const name = `${l.id}.png`;
      files.push({ name, blob: await tiledPng(l.tiled, doc.resolution ?? 72) });
      r.imageFile = name;
      r.tiled = { width: l.tiled.width, height: l.tiled.height, base: l.tiled.base };
    }
    const ch = l.channels;
    if (ch?.mode === 'rgb' && doc.depth === 32) { const name = `${l.id}.deep32`; files.push({ name, blob: new Blob([new Float32Array(ch.data).buffer as ArrayBuffer]) }); r.deepFile = name; r.deepWidth = ch.width; r.deepHeight = ch.height; }
    else if (ch?.mode === 'rgb') { const name = `${l.id}.deep16`; files.push({ name, blob: new Blob([deepToU16(ch.data).buffer as ArrayBuffer]) }); r.deepFile = name; r.deepWidth = ch.width; r.deepHeight = ch.height; }
    else if (ch?.mode === 'cmyk') { const name = `${l.id}.cmyk32`; files.push({ name, blob: new Blob([new Float32Array(ch.data).buffer as ArrayBuffer]) }); r.inkFile = name; r.inkWidth = ch.width; r.inkHeight = ch.height; }
    else if (ch?.mode === 'lab') { const name = `${l.id}.lab32`; files.push({ name, blob: new Blob([new Float32Array(ch.data).buffer as ArrayBuffer]) }); r.inkFile = name; r.inkWidth = ch.width; r.inkHeight = ch.height; }
    if (l.vector) r.vector = { fill: l.vector.fill, stroke: l.vector.stroke ?? null, origin: l.vector.origin, subpaths: pathData(l.vector.path)?.subpaths ?? [] };
    if (l.fillContent && l.raster) r.fillContent = structuredClone(l.fillContent);
    if (l.relight && l.raster) r.relight = structuredClone(l.relight);
    if (l.vectorMask) r.vectorMask = { enabled: l.vectorMask.enabled, linked: l.vectorMask.linked, inverted: l.vectorMask.inverted, subpaths: pathData(l.vectorMask.path)?.subpaths ?? [] };
    if (l.video && !l.isGroup) {   // 33.4b: every painted frame, and an original only where it differs from its frame
      const frameFiles: string[] = [], originals: (string | null)[] = [];
      for (const [i, f] of l.video.frames.entries()) {
        const fn = `${l.id}.vframe${i}.png`;
        files.push({ name: fn, blob: await toBlob(f.canvas) });
        frameFiles.push(fn);
        const o = l.video.original[i];
        if (!o || o === f) originals.push(null);
        else { const on = `${l.id}.vorig${i}.png`; files.push({ name: on, blob: await toBlob(o.canvas) }); originals.push(on); }
      }
      const it = l.video.interpret;   // Interpret Footage (33.4), field by field
      const interpret = it ? { ...(it.fps ? { fps: it.fps } : {}), ...(it.loop ? { loop: it.loop } : {}), ...(it.alpha ? { alpha: it.alpha } : {}), ...(it.matte ? { matte: { r: it.matte.r, g: it.matte.g, b: it.matte.b } } : {}) } : null;
      r.video = { name: l.video.name, frames: frameFiles, originals, ...(interpret ? { interpret } : {}) };
    }
    if (l.smart && !l.isGroup) {
      const name = `${l.id}.source.png`;
      files.push({ name, blob: await toBlob(l.smart.source.canvas) });
      r.smartSourceFile = name;
      if (l.smart.stack) {
        const stackFiles: string[] = [];
        for (const [i, s] of l.smart.stack.sources.entries()) {
          const sn = `${l.id}.stack${i}.png`;
          files.push({ name: sn, blob: await toBlob(s.canvas) });
          stackFiles.push(sn);
        }
        r.smartStack = { mode: l.smart.stack.mode, files: stackFiles };
      }
      r.smart = { filters: l.smart.filters.map(({ id, kind, settings, enabled }) => ({ id, kind, settings, enabled })), warp: l.smart.warp ?? null, warpAt: l.smart.warpAt ? transformRecord(l.smart.warpAt) : null, filterMaskEnabled: l.smart.filterMaskEnabled !== false, link: l.smart.link ? { id: l.smart.link.id, name: l.smart.link.name, size: l.smart.link.size, lastModified: l.smart.link.lastModified, ...(l.smart.link.path ? { path: l.smart.link.path } : {}) } : null };
      if (l.smart.filterMask) {
        const mn = `${name.replace(/\.png$/i, '')}-filtermask.png`;
        files.push({ name: mn, blob: await toBlob(l.smart.filterMask.canvas) });
        r.smartFilterMaskFile = mn;
      }
    }
    if (l.parentId) r.parentID = l.parentId;
    if (l.isGroup) r.isGroup = true;
    if (l.isGroup && !l.parentId && l.artboard) r.artboard = { x: l.artboard.x, y: l.artboard.y, w: l.artboard.w, h: l.artboard.h, background: l.artboard.background };
    if (l.opacity !== 1) r.opacity = l.opacity;
    if (l.fill !== undefined && l.fill !== 1) r.fill = l.fill;
    if (l.isGroup && l.isolate) r.isolate = true;
    if (l.label) r.label = l.label;
    if (l.locks && Object.values(l.locks).some(Boolean)) r.locks = { ...l.locks };
    if (l.link) r.linkID = l.link;
    if (l.generation) r.generation = structuredClone(l.generation);
    if (l.frame) r.frame = { ...l.frame };
    if (l.blend !== 'normal') r.blendMode = blendLabel(l.blend);
  if (effectsPresent(l.effects)) r.effects = structuredClone(l.effects);
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
    if (l.extrude3d && typeof l.extrude3d === 'object') r.extrude3d = l.extrude3d as Json;   // 32.9: a 3D extrusion's settings, to edit it again
    layers.push(r);
  }
  const mcRecords: Json[] = [];   // Multichannel (31.3b): each channel's grey plane as a PNG beside the layers
  if (doc.mode === 'multichannel' && doc.multichannel) {
    for (let i = 0; i < doc.multichannel.channels.length; i++) {
      const c = doc.multichannel.channels[i], file = `mchan_${i}.png`;
      files.push({ name: file, blob: await toBlob(c.data.canvas) });
      mcRecords.push({ name: c.name, color: { r: c.color.r, g: c.color.g, b: c.color.b }, solidity: c.solidity, file });
    }
  }
  const manifest: Json = { format: FORMAT, version: FORMAT_VERSION, ...(doc.depth ? { depth: doc.depth } : {}), colorSpace: doc.profile?.name ?? 'sRGB', ...(doc.profile ? { profile: { name: doc.profile.name, icc: doc.profile.icc } } : {}), resolution: doc.resolution, documentID: doc.id, width: doc.width, height: doc.height, layers, ...(doc.guides?.length ? { guides: doc.guides.map((g) => ({ axis: g.axis, at: g.at })) } : {}), ...(doc.pixelAspect && doc.pixelAspect !== 1 ? { pixelAspect: doc.pixelAspect } : {}), ...(doc.measureScale ? { measureScale: doc.measureScale } : {}), ...(doc.measurements?.length ? { measurements: doc.measurements } : {}), ...(doc.slices?.length ? { slices: doc.slices.map((s) => ({ id: s.id, name: s.name, x: s.x, y: s.y, w: s.w, h: s.h, ...(s.layer ? { layer: s.layer } : {}), ...(s.url ? { url: s.url } : {}), ...(s.alt ? { alt: s.alt } : {}) })) } : {}), ...(doc.mode && doc.mode !== 'rgb' ? { mode: doc.mode } : {}), ...(doc.mode === 'duotone' && doc.duotone ? { duotone: doc.duotone } : {}), ...(mcRecords.length ? { multichannel: mcRecords } : {}), ...(doc.palette?.length ? { palette: doc.palette.map((c) => [c.r, c.g, c.b]) } : {}),
     ...(doc.notes?.length ? { notes: doc.notes.map((n) => ({ id: n.id, x: n.x, y: n.y, text: n.text })) } : {}), ...(doc.comps?.length ? { comps: JSON.parse(JSON.stringify(doc.comps)), activeComp: doc.activeComp ?? null } : {}), ...(doc.counts?.length ? { counts: doc.counts.map((c) => ({ x: c.x, y: c.y })) } : {}), ...(doc.globalLight ? { globalLight: { angle: doc.globalLight.angle, altitude: doc.globalLight.altitude } } : {}), ...(doc.characterStyles?.length ? { characterStyles: doc.characterStyles.map((s) => ({ ...s, ...(s.color ? { color: { ...s.color } } : {}), ...(s.features ? { features: [...s.features] } : {}) })) } : {}), ...(doc.paragraphStyles?.length ? { paragraphStyles: doc.paragraphStyles.map((s) => ({ ...s, color: { ...s.color } })) } :{}), ...(doc.meta ? { meta: { ...doc.meta, ...(doc.meta.keywords ? { keywords: [...doc.meta.keywords] } : {}), ...(doc.meta.camera ? { camera: { ...doc.meta.camera } } : {}) } } : {}),
     ...(doc.variables?.length ? { variables: doc.variables.map((v) => ({ ...v })) } : {}), ...(doc.dataSets?.length ? { dataSets: doc.dataSets.map((d) => ({ name: d.name, values: { ...d.values } })) } : {}), ...(doc.activeDataSet ? { activeDataSet: doc.activeDataSet } : {}) };
  if (activeId && doc.layers.some((l) => l.id === activeId)) manifest.activeLayerID = activeId;
  const pathRecord = pathSetData(paths);
  if (pathRecord) { manifest.paths = pathRecord.list; if (pathRecord.active) manifest.activePath = pathRecord.active; }
  // The patterns this document's styles use travel inside it, so it opens the same where they are not defined.
  const used = new Set<string>();
  for (const l of doc.layers) {
    const po = l.effects?.patternOverlay, bt = l.effects?.bevel.enabled ? l.effects.bevel.texture : undefined, fc = l.fillContent;
    for (const id of [po?.enabled ? po.pattern : '', bt?.enabled ? bt.pattern : '', fc?.kind === 'pattern' ? fc.pattern : '']) if (id && !id.startsWith('builtin:')) used.add(id);
  }
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
  const alphas: Json[] = [];
  for (const [i, a] of (doc.alphas ?? []).entries()) {
    const file = `alpha-${i + 1}.png`, s = createSurface(doc.width, doc.height);
    ctxOf(s).putImageData(alphaGrey(a.mask, doc.width, doc.height), 0, 0);
    files.push({ name: file, blob: await toBlob(s) });
    alphas.push({ id: a.id, name: a.name, file, ...(a.color ? { color: [a.color.r, a.color.g, a.color.b] } : {}), ...(a.opacity !== undefined ? { opacity: a.opacity } : {}), ...(a.indicates ? { indicates: a.indicates } : {}) });
  }
  if (alphas.length) manifest.alphas = alphas;
  return { manifest, files };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const colorFrom = (raw: unknown): RGB | null => {
  const c = obj(raw);
  return finite(c.r) && finite(c.g) && finite(c.b) ? { r: Math.min(255, Math.max(0, c.r)), g: Math.min(255, Math.max(0, c.g)), b: Math.min(255, Math.max(0, c.b)) } : null;
};

/** A layer's generation settings read back, checked; null when nothing usable is there. */
function generationFrom(raw: unknown): GenerationInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = obj(raw), out: GenerationInfo = {};
  const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
  const prompt = text(o.prompt, 5000), model = text(o.model, 200), sampler = text(o.sampler, 100), parameters = text(o.parameters, 20000);
  if (prompt) out.prompt = prompt;
  if (model) out.model = model;
  if (sampler) out.sampler = sampler;
  if (parameters) out.parameters = parameters;
  if (typeof o.seed === 'number' && Number.isFinite(o.seed)) out.seed = o.seed;
  if (typeof o.steps === 'number' && Number.isFinite(o.steps)) out.steps = o.steps;
  if (typeof o.guidance === 'number' && Number.isFinite(o.guidance)) out.guidance = o.guidance;
  if (Array.isArray(o.loras)) {
    const loras = o.loras.slice(0, 32).map(obj).filter((l) => typeof l.file === 'string' && l.file && typeof l.scale === 'number' && Number.isFinite(l.scale)).map((l) => ({ file: String(l.file).slice(0, 300), scale: l.scale as number }));
    if (loras.length) out.loras = loras;
  }
  return Object.keys(out).length ? out : null;
}

/** A shape layer read back, checked: a path, a render origin, and a fill, a stroke or both. */
function vectorFrom(raw: unknown): Layer['vector'] {
  if (!raw || typeof raw !== 'object') return null;
  const o = obj(raw), path = pathFrom(o), origin = obj(o.origin), fill = colorFrom(o.fill), s = obj(o.stroke), color = colorFrom(s.color);
  const stroke = color && finite(s.width) && s.width > 0 ? { color, width: Math.min(1000, s.width) } : null;
  if (!path || !finite(origin.x) || !finite(origin.y) || (!fill && !stroke)) return null;
  return { path, fill, stroke, origin: { x: origin.x, y: origin.y } };
}

export async function deserialize(manifest: Json, fetchImage: (name: string) => Promise<Blob>, read: BandReader | null = null): Promise<{ doc: Doc; activeId: ID | null; paths: PathSet | null; timeline: Timeline | null }> {
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
  const records = (Array.isArray(manifest.layers) ? manifest.layers : []).map((x) => obj(x));
  const names = new Set<string>();
  for (const r of records) { for (const n of [r.tiled ? null : str(r.imageFile), str(r.maskFile), str(r.smartSourceFile), str(r.smartFilterMaskFile)]) if (n) names.add(n); const sf = obj(r.smartStack).files; if (Array.isArray(sf)) for (const n of sf) if (typeof n === 'string') names.add(n); const vd = obj(r.video); for (const list of [vd.frames, vd.originals]) if (Array.isArray(list)) for (const n of list) if (typeof n === 'string') names.add(n); }
  const bitmaps = new Map<string, ImageBitmap>();
  await Promise.all([...names].map(async (n) => { bitmaps.set(n, await createImageBitmap(await fetchImage(n))); }));
  // Giant layers (1.62.8): filled band by band by the engine's reader, past what the browser can decode.
  const tiledById = new Map<string, TiledRaster>();
  for (const r of records) {
    const file = str(r.imageFile), tr = obj(r.tiled);
    if (!r.tiled || !file) continue;
    if (!read) throw new Error('A layer past 268 megapixels opens only through formvis\'s engine.');
    const t = new TiledRaster(num(tr.width, width), num(tr.height, height)), b = Array.isArray(tr.base) ? (tr.base as number[]) : null;
    t.base = b && b.length === 4 ? [b[0], b[1], b[2], b[3]] : null;
    await fillTiled(t, file, read);
    tiledById.set(str(r.id) ?? '', t);
  }
  const deeps = new Map<string, Uint16Array | Float32Array>();   // 16-bit pixels (1.53.6), 32-bit floats (1.53.9)
  await Promise.all(records.map(async (r) => { const n = str(r.deepFile); if (n) { const b = await (await fetchImage(n)).arrayBuffer(); deeps.set(n, n.endsWith('.deep32') ? new Float32Array(b) : new Uint16Array(b)); } }));
  const inks = new Map<string, Float32Array>();
  await Promise.all(records.map(async (r) => { const n = str(r.inkFile); if (n) inks.set(n, new Float32Array(await (await fetchImage(n)).arrayBuffer())); }));
  const stackFrom = (raw: unknown): SmartStack | null => {
    const o = obj(raw), list = Array.isArray(o.files) ? o.files : [];
    const pics = list.map((n) => bitmaps.get(typeof n === 'string' ? n : ''));
    if (!pics.length || !isStackMode(o.mode) || pics.some((b) => !b)) return null;
    return { mode: o.mode, sources: pics.map((b) => Raster.from(b as ImageBitmap, (b as ImageBitmap).width, (b as ImageBitmap).height)) };
  };
  const videoFrom = (raw: unknown): NonNullable<Layer['video']> | null => {
    const o = obj(raw), list = Array.isArray(o.frames) ? o.frames : [], origs = Array.isArray(o.originals) ? o.originals : [];
    const ras = (n: unknown): Raster | null => { const b = bitmaps.get(typeof n === 'string' ? n : ''); return b ? Raster.from(b, b.width, b.height) : null; };
    const frames = list.map(ras);
    if (!frames.length || frames.some((f) => !f)) return null;
    const live = frames as Raster[];
    const io = obj(o.interpret), num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
    const fps = num(io.fps, 0.1, 240), loop = num(io.loop, 1, 100), alpha: 'ignore' | 'premultiplied' | undefined = io.alpha === 'ignore' ? 'ignore' : io.alpha === 'premultiplied' ? 'premultiplied' : undefined, mt = obj(io.matte);
    const matte = alpha === 'premultiplied' && typeof mt.r === 'number' && typeof mt.g === 'number' && typeof mt.b === 'number' ? { r: mt.r, g: mt.g, b: mt.b } : undefined;
    const interpret = fps || loop || alpha ? { ...(fps ? { fps } : {}), ...(loop ? { loop } : {}), ...(alpha ? { alpha } : {}), ...(matte ? { matte } : {}) } : undefined;
    return { name: str(o.name) ?? 'Video Layer', frames: live, original: live.map((f, i) => ras(origs[i]) ?? f), ...(interpret ? { interpret } : {}) };
  };
  const layers: Layer[] = records.map((r) => {
    const picture = bitmaps.get(str(r.imageFile) ?? '');
    const raster = picture ? Raster.from(picture, picture.width, picture.height) : null;
    const sourceImage = bitmaps.get(str(r.smartSourceFile) ?? '');
    const vector = raster ? vectorFrom(r.vector) : null;
    const sw = obj(r.smart), warpPts = Array.isArray(sw.warp) && sw.warp.length === 4 && sw.warp.every((q) => finite(obj(q).x) && finite(obj(q).y)) ? (sw.warp as Array<{ x: number; y: number }>).map((q) => ({ x: q.x, y: q.y })) : null;
    const fmImage = bitmaps.get(str(r.smartFilterMaskFile) ?? ''), fmOk = !!fmImage && !!sourceImage && fmImage.width === sourceImage.width && fmImage.height === sourceImage.height;
    const lk = obj(sw.link), link = str(lk.id) && str(lk.name) && finite(lk.size) && finite(lk.lastModified) ? { id: str(lk.id) as string, name: str(lk.name) as string, size: lk.size as number, lastModified: lk.lastModified as number, ...(typeof lk.path === 'string' && lk.path ? { path: lk.path.slice(0, 1024) } : {}) } : null;
    const smart = raster && sourceImage ? { source: Raster.from(sourceImage, sourceImage.width, sourceImage.height), filters: smartFiltersFrom(r.smart), stack: stackFrom(r.smartStack), warp: warpPts, warpAt: warpPts && sw.warpAt ? transformFrom(sw.warpAt, raster.width, raster.height) : null, filterMask: fmOk && fmImage ? Raster.from(fmImage, fmImage.width, fmImage.height) : null, filterMaskEnabled: sw.filterMaskEnabled !== false, link } : null;
    const maskPicture = bitmaps.get(str(r.maskFile) ?? '');
    const mask: Mask | null = maskPicture
      ? { raster: grayToMask(maskPicture), enabled: r.maskEnabled !== false, linked: r.maskLinked !== false, placement: r.maskPlacement ? transformFrom(r.maskPlacement, maskPicture.width, maskPicture.height) : null }
      : null;
    const adj = obj(r.adjustment), kind = KINDS[str(adj.kind) ?? ''] ?? null;
    return {
      id: str(r.id) ?? uid(),
      name: str(r.name) ?? 'Layer',
      raster,
      transform: transformFrom(r.transform, raster?.width ?? width, raster?.height ?? height),
      visible: r.isVisible !== false,
      parentId: str(r.parentID),
      isGroup: r.isGroup === true,
      opacity: clamp(num(r.opacity, 1), 0, 1),
      ...(r.fill !== undefined ? { fill: clamp(num(r.fill, 1), 0, 1) } : {}),
      ...(r.isGroup === true && r.isolate === true ? { isolate: true } : {}),
      ...((LAYER_LABELS as readonly unknown[]).includes(r.label) ? { label: r.label as LayerLabel } : {}),
      ...(r.frame && typeof r.frame === 'object' ? (() => { const f = r.frame as Record<string, unknown>; return { frame: { x: num(f.x, 0), y: num(f.y, 0), w: Math.max(2, num(f.w, 2)), h: Math.max(2, num(f.h, 2)), shape: f.shape === 'ellipse' ? 'ellipse' as const : 'rect' as const } }; })() : {}),
      ...(r.locks && typeof r.locks === 'object' ? (() => { const k = r.locks as Record<string, unknown>, out = Object.fromEntries((['transparency', 'pixels', 'position', 'all'] as const).filter((n) => k[n] === true).map((n) => [n, true])); return Object.keys(out).length ? { locks: out } : {}; })() : {}),
      ...(str(r.linkID) ? { link: (str(r.linkID) as string).slice(0, 120) } : {}),
      ...(generationFrom(r.generation) ? { generation: generationFrom(r.generation) as GenerationInfo } : {}),
      blend: blendFromLabel(r.blendMode), effects: effectsFromData(r.effects), text: textFromData(r.text, raster), smart, ...(r.video && raster ? { video: videoFrom(r.video) } : {}), vector, mask, clipId: str(r.maskSourceID), adjustment: kind ? { kind, data: adj } : null, shape: r.shape ? obj(r.shape) : null, ...(r.extrude3d && typeof r.extrude3d === 'object' ? { extrude3d: r.extrude3d } : {}),
      ...(r.isGroup === true && !str(r.parentID) && r.artboard ? { artboard: artboardFromData(r.artboard) } : {}),
      ...(raster && r.fillContent ? { fillContent: fillContentFrom(r.fillContent) } : {}),
      ...(raster && r.relight ? { relight: relightFrom(r.relight) } : {}),
      ...(r.vectorMask && typeof r.vectorMask === 'object' ? { vectorMask: { path: pathFrom(r.vectorMask) ?? { subpaths: [] }, enabled: (r.vectorMask as Record<string, unknown>).enabled !== false, linked: (r.vectorMask as Record<string, unknown>).linked !== false, inverted: (r.vectorMask as Record<string, unknown>).inverted === true } } : {}),
    };
  });
  for (const b of bitmaps.values()) b.close();
  const comps = parseComps(manifest.comps);
  const guides = (Array.isArray(manifest.guides) ? manifest.guides : []).flatMap((g) => {
    const o = obj(g), axis: 'x' | 'y' | null = o.axis === 'x' || o.axis === 'y' ? o.axis : null, at = num(o.at, NaN);
    return axis && Number.isFinite(at) && at >= 0 && at <= (axis === 'x' ? width : height) ? [{ axis, at }] : [];
  }).slice(0, 1000);
  const msO = obj(manifest.measureScale);
  const measureScale = num(msO.pixels, 0) > 0 && num(msO.length, 0) > 0 ? { pixels: num(msO.pixels, 1), length: num(msO.length, 1), units: str(msO.units) ?? 'px' } : null;
  const measurements = (Array.isArray(manifest.measurements) ? manifest.measurements : []).flatMap((m) => {
    const o = obj(m), id = num(o.id, NaN);
    if (!Number.isFinite(id)) return [];
    const opt = (k: string): { [key: string]: number } => (Number.isFinite(num(o[k], NaN)) ? { [k]: num(o[k], 0) } : {});
    return [{ id, label: str(o.label) ?? `Measurement ${id}`, scale: num(o.scale, 1), units: str(o.units) ?? 'px', ...opt('area'), ...opt('perimeter'), ...opt('length'), ...opt('angle'), ...opt('count'), ...opt('w'), ...opt('h') }];
  }).slice(0, 10000);
  const slices = (Array.isArray(manifest.slices) ? manifest.slices : []).flatMap((s) => {
    const o = obj(s), x = num(o.x, NaN), y = num(o.y, NaN), w = num(o.w, NaN), h = num(o.h, NaN);
    if (![x, y, w, h].every(Number.isFinite) || w < 1 || h < 1 || typeof o.id !== 'string') return [];
    return [{ id: o.id, name: typeof o.name === 'string' ? o.name : '', x, y, w, h, ...(typeof o.layer === 'string' ? { layer: o.layer } : {}), ...(typeof o.url === 'string' ? { url: o.url } : {}), ...(typeof o.alt === 'string' ? { alt: o.alt } : {}) }];
  }).slice(0, 1000);
  const glo =obj(manifest.globalLight), globalLight = finite(glo.angle) && finite(glo.altitude) ? { angle: Math.max(-180, Math.min(180, glo.angle)), altitude: Math.max(0, Math.min(90, glo.altitude)) } : null;
  const styles = paragraphStylesFrom(manifest.paragraphStyles);
  const charStyles = characterStylesFrom(manifest.characterStyles);
  const inside = (x: number, y: number): boolean => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= width && y <= height;
  // The colour mode and an indexed document's palette (1.50.2); anything else reads as RGB.
  const mode = manifest.mode === 'grayscale' || manifest.mode === 'bitmap' || manifest.mode === 'indexed' || manifest.mode === 'cmyk' || manifest.mode === 'lab' || manifest.mode === 'duotone' || manifest.mode === 'multichannel' ? manifest.mode : null;
  const palette = (Array.isArray(manifest.palette) ? manifest.palette : []).flatMap((c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) ? [{ r: c[0] as number, g: c[1] as number, b: c[2] as number }] : []).slice(0, 256);
  const notes = (Array.isArray(manifest.notes) ? manifest.notes : []).flatMap((n) => { const o = obj(n), x = num(o.x, NaN), y = num(o.y, NaN); return inside(x, y) ? [{ id: str(o.id) ?? uid(), x, y, text: (str(o.text) ?? '').slice(0, 10000) }] : []; }).slice(0, 1000);
  const counts = (Array.isArray(manifest.counts) ? manifest.counts : []).flatMap((c) => { const o = obj(c), x = num(o.x, NaN), y = num(o.y, NaN); return inside(x, y) ? [{ x, y }] : []; }).slice(0, 10000);
  records.forEach((r, i) => { const n = str(r.deepFile), u = n ? deeps.get(n) : undefined, w = num(r.deepWidth, 0), h = num(r.deepHeight, 0); if (u && layers[i] && u.length === w * h * 4) (layers[i] as { channels?: ChannelPixels }).channels = u instanceof Float32Array ? { mode: 'rgb', n: 3, width: w, height: h, data: u } : deepFromU16(u, w, h); });
  if (mode === 'cmyk') records.forEach((r, i) => { const n = str(r.inkFile), u = n ? inks.get(n) : undefined, w = num(r.inkWidth, 0), h = num(r.inkHeight, 0); if (u && layers[i] && u.length === w * h * 5) (layers[i] as { channels?: ChannelPixels }).channels = { mode: 'cmyk', n: 4, width: w, height: h, data: u }; });
  records.forEach((r, i) => { const t = tiledById.get(str(r.id) ?? ''); if (t && layers[i]) layers[i] = { ...layers[i], raster: null, tiled: t }; });   // giant layers (1.62.8)
  if (mode === 'lab') records.forEach((r, i) => { const n = str(r.inkFile), u = n ? inks.get(n) : undefined, w = num(r.inkWidth, 0), h = num(r.inkHeight, 0); if (u && layers[i] && u.length === w * h * 4) (layers[i] as { channels?: ChannelPixels }).channels = { mode: 'lab', n: 3, width: w, height: h, data: u }; });
  const mcChannels: { name: string; color: { r: number; g: number; b: number }; solidity: number; data: Raster }[] = [];   // Multichannel (31.3b)
  if (mode === 'multichannel' && Array.isArray(manifest.multichannel)) {
    for (const raw of manifest.multichannel.slice(0, 64)) {
      const o = obj(raw), file = str(o.file), col = obj(o.color);
      if (!file) continue;
      try {
        const bmp = await createImageBitmap(await fetchImage(file));
        const ch = (v: unknown): number => Math.max(0, Math.min(255, Math.round(num(v, 0))));
        mcChannels.push({ name: (str(o.name) ?? 'Channel').slice(0, 200), color: { r: ch(col.r), g: ch(col.g), b: ch(col.b) }, solidity: Math.max(0, Math.min(1, num(o.solidity, 1))), data: Raster.from(bmp, bmp.width, bmp.height) });
      } catch { /* a channel that cannot be read is left out */ }
    }
  }
  const fileInfo = cleanMeta(manifest.meta);   // File Info (29.2); older projects have none
  const alphas: AlphaChannel[] = [];
  for (const raw of (Array.isArray(manifest.alphas) ? manifest.alphas : []).slice(0, 100)) {
    const o = obj(raw), file = str(o.file);
    if (!file) continue;
    try {
      const bmp = await createImageBitmap(await fetchImage(file));
      if (bmp.width === width && bmp.height === height) {
        const s = createSurface(width, height), c = ctxOf(s);
        c.drawImage(bmp, 0, 0);
        const d = c.getImageData(0, 0, width, height).data, m = new Uint8Array(width * height);
        for (let i = 0; i < m.length; i++) m[i] = Math.round((d[i * 4] * d[i * 4 + 3]) / 255);
        const id = str(o.id), name = str(o.name);
        const col = Array.isArray(o.color) && o.color.length === 3 ? o.color.map((v) => Math.max(0, Math.min(255, Math.round(num(v, 0))))) : null;
        alphas.push({ id: id && !alphas.some((a) => a.id === id) ? id.slice(0, 120) : uid(), name: name ? name.slice(0, 200) : nextAlphaName(alphas), mask: SelectionMask.cropped(0, 0, width, height, m),
          ...(col ? { color: { r: col[0], g: col[1], b: col[2] } } : {}), ...(typeof o.opacity === 'number' ? { opacity: Math.max(0, Math.min(100, Math.round(num(o.opacity, 50)))) } : {}), ...(o.indicates === 'selected' || o.indicates === 'masked' ? { indicates: o.indicates } : {}) });
      }
      bmp.close();
    } catch { /* a channel that cannot be read is left out */ }
  }
  return { timeline: timelineFrom(manifest.timeline), paths: pathSetFrom(manifest.paths, manifest.activePath, manifest.workPath), doc: { ...profileFrom(manifest.profile), ...(manifest.depth === 16 || manifest.depth === 32 ? { depth: manifest.depth as 16 | 32 } : {}), id: str(manifest.documentID) ?? uid(), width, height, resolution: num(manifest.resolution, 72), layers, ...(notes.length ? { notes } : {}), ...(comps.length ? { comps, activeComp: comps.some((c) => c.id === manifest.activeComp) ? (manifest.activeComp as string) : null } : {}), ...(counts.length ? { counts } : {}), ...(mode ? { mode } : {}), ...(mode === 'indexed' && palette.length ? { palette } : {}), ...(mode === 'duotone' && readDuotone(manifest.duotone) ? { duotone: readDuotone(manifest.duotone) as Duotone } : {}), ...(mode === 'multichannel' && mcChannels.length ? { multichannel: { channels: mcChannels } } : {}), ...(guides.length ? { guides } : {}), ...(num(manifest.pixelAspect, 1) !== 1 && num(manifest.pixelAspect, 1) > 0 ? { pixelAspect: num(manifest.pixelAspect, 1) } : {}), ...(measureScale ? { measureScale } : {}), ...(measurements.length ? { measurements } : {}), ...(slices.length ? { slices } : {}),...(globalLight ? { globalLight } : {}), ...(styles.length ? { paragraphStyles: styles } : {}), ...(charStyles.length ? { characterStyles: charStyles } : {}),...(alphas.length ? { alphas } : {}), ...variablesFrom(manifest, records.map((r) => str(r.id))), ...(fileInfo ? { meta: fileInfo } : {}) }, activeId: str(manifest.activeLayerID) };
}

/** Variables, data sets and the active data set from a manifest (29.9), checked; a variable whose layer is gone is dropped. */
function variablesFrom(m: Json, layerIds: Array<string | null>): Pick<Doc, 'variables' | 'dataSets' | 'activeDataSet'> {
  const ids = new Set(layerIds), kinds = ['visibility', 'text', 'pixels'], methods = ['fit', 'fill', 'asis', 'conform'];
  const variables = (Array.isArray(m.variables) ? m.variables : []).slice(0, 500).flatMap((x) => {
    const o = obj(x), name = str(o.name), layer = str(o.layer);
    if (!name || !layer || !ids.has(layer) || typeof o.kind !== 'string' || !kinds.includes(o.kind)) return [];
    const method = typeof o.method === 'string' && methods.includes(o.method) ? (o.method as 'fit' | 'fill' | 'asis' | 'conform') : undefined;
    return [{ name: name.slice(0, 120), layer, kind: o.kind as 'visibility' | 'text' | 'pixels', ...(method ? { method } : {}) }];
  });
  const dataSets = (Array.isArray(m.dataSets) ? m.dataSets : []).slice(0, 1000).flatMap((x) => {
    const o = obj(x), name = str(o.name), v = obj(o.values), values: Record<string, string> = {};
    if (!name) return [];
    for (const k of Object.keys(v).slice(0, 500)) if (typeof v[k] === 'string') values[k] = v[k] as string;
    return [{ name: name.slice(0, 200), values }];
  });
  const active = str(m.activeDataSet);
  return { ...(variables.length ? { variables } : {}), ...(dataSets.length ? { dataSets } : {}), ...(active && dataSets.some((d) => d.name === active) ? { activeDataSet: active } : {}) };
}

/** A document's colour profile from a manifest (1.53.5): a name and base64 ICC bytes, or nothing (sRGB). */
function profileFrom(v: unknown): { profile?: { name: string; icc: string } } {
  const o = v as { name?: unknown; icc?: unknown } | null;
  return o && typeof o.name === 'string' && typeof o.icc === 'string' && /^[A-Za-z0-9+/=]+$/.test(o.icc) ? { profile: { name: o.name.slice(0, 200), icc: o.icc } } : {};
}
