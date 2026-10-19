import { LIMITS, effectsFromData, newLayer } from './types';
import { scaledEffects } from './style-extras';
import type { Layer, Doc, Transform, Pt } from './types';
import { Raster } from './surface';
import type { Project } from './project';
import { carryMarks } from './guides-ops';
import { resampleRaster, type ResampleMethod } from './resample';

export type { ResampleMethod } from './resample';

type RGB = { r: number; g: number; b: number };

export interface SizeHost {
  readonly current: Project | null;
  edit(label: string, fn: (p: Project) => boolean | void): boolean;
  notice(message: string, kind?: 'error'): void;
  sizeOk(w: number, h: number): boolean;
  fit(): void;
  css(c: RGB): string;
  carryVectors(layers: Layer[], map: (x: number, y: number) => Pt): Layer[];
  carryMeasure(p: Project, prior: Doc, name: string, map: (x: number, y: number) => Pt): void;
  alphasShifted(doc: Doc, dx: number, dy: number, w: number, h: number): Partial<Doc>;
  alphasScaled(doc: Doc, w: number, h: number, sx: number, sy: number, smooth: boolean): Partial<Doc>;
  shapeScaled(shape: NonNullable<Layer['shape']>, k: number): NonNullable<Layer['shape']>;
  shapeRaster(shape: NonNullable<Layer['shape']>, w: number, h: number): Raster;
  deepResampled(p: Project, l: Layer, w: number, h: number): { channels: NonNullable<Layer['channels']>; raster: Raster } | null;
}

const shiftBox = (t: Transform, dx: number, dy: number): Transform => ({ ...t, x: t.x + dx, y: t.y + dy });

const scaleBox = (t: Transform, sx: number, sy: number): Transform => ({
  ...t,
  x: t.x * sx,
  y: t.y * sy,
  w: t.w * sx,
  h: t.h * sy,
});

const scaledDims = (r: Raster, sx: number, sy: number): { w: number; h: number } => ({
  w: Math.max(1, Math.round(r.width * sx)),
  h: Math.max(1, Math.round(r.height * sy)),
});

const resampled = (src: Raster, w: number, h: number, sampling: ResampleMethod): Raster => {
  const kernel = resampleRaster(src, w, h, sampling);
  if (kernel) return kernel;
  const out = new Raster(w, h);
  out.ctx.imageSmoothingEnabled = sampling !== 'nearest';
  out.ctx.imageSmoothingQuality = sampling === 'high' ? 'high' : 'medium';
  out.ctx.drawImage(src.canvas, 0, 0, w, h);
  out.touch();
  return out;
};

export function resizeCanvas(
  host: SizeHost,
  width: number,
  height: number,
  dx: number,
  dy: number,
  fill: RGB | null = null,
  label = 'Canvas Size',
): boolean {
  const project = host.current;
  if (!project) return false;
  if (!host.sizeOk(width, height)) return false;
  const old = project.doc;
  if (width === old.width && height === old.height && dx === 0 && dy === 0) return false;
  const recorded = host.edit(label, (p) => {
    const doc = p.doc;
    const moved: Layer[] = doc.layers.map((l) => ({
      ...l,
      transform: shiftBox(l.transform, dx, dy),
      mask: l.mask ? { ...l.mask, placement: l.mask.placement ? shiftBox(l.mask.placement, dx, dy) : null } : l.mask,
      artboard: l.artboard ? { ...l.artboard, x: l.artboard.x + dx, y: l.artboard.y + dy } : l.artboard,
    }));
    const shift = (x: number, y: number): Pt => ({ x: x + dx, y: y + dy });
    let layers = host.carryVectors(moved, shift);
    if (fill && (width > doc.width || height > doc.height)) {
      const raster = Raster.filled(width, height, host.css(fill));
      raster.ctx.clearRect(dx, dy, doc.width, doc.height);
      raster.touch();
      layers = [newLayer('Canvas Extension', { width, height }, { raster }), ...layers];
    }
    p.doc = { ...doc, width, height, layers, ...host.alphasShifted(doc, dx, dy, width, height), ...carryMarks(doc, { map: shift, width, height }) };
    p.selection = p.selection ? p.selection.translated(dx, dy, width, height) : null;
    host.carryMeasure(p, doc, label, shift);
    return true;
  });
  if (recorded) host.fit();
  return recorded;
}

export function resampleImage(
  host: SizeHost,
  width: number,
  height: number,
  sampling: ResampleMethod,
  resolution: number,
  scaleStyles = true,
): boolean {
  const project = host.current;
  if (!project) return false;
  if (!host.sizeOk(width, height)) return false;
  const old = project.doc;
  if (old.layers.some((l) => l.tiled)) {
    host.notice('A document with layers past 268 megapixels cannot be resampled yet.');
    return false;
  }
  if (width === old.width && height === old.height && resolution === old.resolution) return false;
  if (width === old.width && height === old.height) return host.edit('Image Size', (p) => { p.doc = { ...p.doc, resolution }; return true; });
  const sx = width / old.width;
  const sy = height / old.height;
  let total = 0;
  for (const l of old.layers) {
    if (l.raster) {
      const d = scaledDims(l.raster, sx, sy);
      total += d.w * d.h;
    }
  }
  if (total > LIMITS.pixels) {
    host.notice(`The resized layers would exceed the ${Math.round(LIMITS.pixels / 1e6)}-megapixel document limit.`, 'error');
    return false;
  }
  const smooth = sampling !== 'nearest';
  const k = Math.min(sx, sy);
  const recorded = host.edit('Image Size', (p) => {
    const doc = p.doc;
    const scaled: Layer[] = doc.layers.map((l) => {
      const transform = scaleBox(l.transform, sx, sy);
      let raster = l.raster;
      let channels = l.channels;
      let shape = l.shape;
      if (l.shape) {
        shape = host.shapeScaled(l.shape, k);
        raster = host.shapeRaster(shape, Math.max(1, Math.round(transform.w)), Math.max(1, Math.round(transform.h)));
      } else if (l.raster) {
        const d = scaledDims(l.raster, sx, sy);
        const deep = host.deepResampled(p, l, d.w, d.h);
        if (deep) {
          raster = deep.raster;
          channels = deep.channels;
        } else {
          raster = resampled(l.raster, d.w, d.h, sampling);
        }
      }
      let mask = l.mask;
      if (mask) {
        const mr = mask.raster ? resampled(mask.raster, scaledDims(mask.raster, sx, sy).w, scaledDims(mask.raster, sx, sy).h, sampling) : null;
        mask = { ...mask, raster: mr, placement: mask.placement ? scaleBox(mask.placement, sx, sy) : null };
      }
      const artboard = l.artboard
        ? {
            ...l.artboard,
            x: Math.round(l.artboard.x * sx),
            y: Math.round(l.artboard.y * sy),
            w: Math.max(1, Math.round(l.artboard.w * sx)),
            h: Math.max(1, Math.round(l.artboard.h * sy)),
          }
        : l.artboard;
      const effects = scaleStyles && l.effects ? effectsFromData(scaledEffects(l.effects, k)) ?? l.effects : l.effects;
      return { ...l, transform, raster, channels, shape, mask, artboard, ...(effects ? { effects } : {}) };
    });
    const grow = (x: number, y: number): Pt => ({ x: x * sx, y: y * sy });
    const layers = host.carryVectors(scaled, grow);
    p.doc = { ...doc, width, height, resolution, layers, ...host.alphasScaled(doc, width, height, sx, sy, smooth), ...carryMarks(doc, { map: grow, width, height }) };
    p.selection = p.selection ? p.selection.scaled(sx, sy, width, height) : null;
    host.carryMeasure(p, doc, 'Image Size', grow);
    return true;
  });
  if (recorded) host.fit();
  return recorded;
}
