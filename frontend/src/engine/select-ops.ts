import type { Layer, Pt, Rect } from './types';
import { integral, intersectRect, mul, placement, setMat, translation } from './geometry';
import type { Mat } from './geometry';
import { Raster, createSurface, ctxOf } from './surface';
import type { Surface } from './surface';
import { SelectionMask } from './selection';
import { antialiasMask, wandMask } from './kernels';
import { toGray } from './filters';
import { alphaPlane } from './alpha-target';
import type { Project } from './project';

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';
export type Target = 'pixels' | 'mask';
export type RGB = { r: number; g: number; b: number };

export interface SelectHost {
  readonly current: Project | null;
  edit(label: string, fn: (p: Project) => boolean | void): void;
  notice(message: string): void;
  rememberDeselected(p: Project, sel: SelectionMask): void;
  regionEdit(label: string, apply: (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void): void;
  tint(rect: Rect, css: string, cover: Surface | null): Surface;
  readonly bg: RGB;
  readonly quickMask?: boolean;
  /** The alpha channel the Channels panel targets, when one is: the Magic Wand samples its grey plane. */
  readonly alphaTarget?: { mask: SelectionMask | null } | null;
  luminance(c: RGB): number;
  composite(p: Project): Surface;
  renderInto(p: Project, target: Surface, view: Mat): void;
  wand: { tolerance: number; contiguous: boolean; sampleSize: number; antialias: boolean; sampleAll: boolean };
  clipboard: { surface: Surface; x: number; y: number; w: number; h: number } | null;
  newDocumentFor(w: number, h: number, name: string): void;
  insertRasterLayer(r: Raster, name: string, x: number, y: number): void;
}

function strengths(cover: Surface | null, w: number, h: number): Uint8ClampedArray | null {
  if (!cover) return null;
  return ctxOf(cover).getImageData(0, 0, w, h).data;
}

function layerRgba(layer: Layer, w: number, h: number): Uint8ClampedArray {
  const raster = layer.raster;
  if (!raster) return new Uint8ClampedArray(w * h * 4);
  const s = createSurface(w, h);
  const ctx = ctxOf(s);
  setMat(ctx, placement(layer.transform, raster.width, raster.height));
  ctx.drawImage(raster.canvas, 0, 0);
  setMat(ctx, [1, 0, 0, 1, 0, 0]);
  return ctx.getImageData(0, 0, w, h).data;
}

export function applySelection(host: SelectHost, next: SelectionMask | null, mode: SelectionMode, label: string): void {
  const p = host.current;
  if (!p) return;
  const cur = p.selection;
  let result: SelectionMask | null;
  if (mode === 'replace') result = next;
  else if (!next) return;
  else if (!cur) result = mode === 'add' ? next : null;
  else result = cur.combine(next, mode);
  if (result === cur) return;
  host.edit(label, (q) => {
    if (q.selection && !result) host.rememberDeselected(q, q.selection);
    q.selection = result;
  });
}

export function clearPixels(host: SelectHost): void {
  const bgv = Math.round(host.luminance(host.bg) * 255);
  const cur = host.current, active = cur?.activeLayer;
  const onBackground = !!active && !active.parentId && !active.isGroup && active.name === 'Background' && !cur?.maskTarget;
  const bg = host.bg;
  host.regionEdit('Clear', ({ raster, target, rect, cover }) => {
    const img = raster.read(rect.x, rect.y, rect.w, rect.h);
    const d = img.data;
    const sv = strengths(cover, rect.w, rect.h);
    for (let i = 0; i < d.length; i += 4) {
      const s = sv ? sv[i + 3] / 255 : 1;
      if (s <= 0) continue;
      if (target === 'mask') {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = Math.round(d[i + 3] + (bgv - d[i + 3]) * s);
      } else if (onBackground) {
        d[i] = Math.round(d[i] + (bg.r - d[i]) * s);
        d[i + 1] = Math.round(d[i + 1] + (bg.g - d[i + 1]) * s);
        d[i + 2] = Math.round(d[i + 2] + (bg.b - d[i + 2]) * s);
        d[i + 3] = Math.round(d[i + 3] + (255 - d[i + 3]) * s);
      } else {
        d[i + 3] = Math.round(d[i + 3] * (1 - s));
      }
    }
    raster.write(img, rect.x, rect.y);
  });
}

export function invertPixels(host: SelectHost): void {
  const label = host.current?.maskTarget ? 'Invert Mask' : 'Invert';
  host.regionEdit(label, ({ raster, target, rect, cover }) => {
    const img = raster.read(rect.x, rect.y, rect.w, rect.h);
    const d = img.data;
    const sv = strengths(cover, rect.w, rect.h);
    for (let i = 0; i < d.length; i += 4) {
      if (target === 'pixels' && d[i + 3] === 0) continue;
      const s = sv ? sv[i + 3] / 255 : 1;
      if (s <= 0) continue;
      if (target === 'mask') {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = Math.round(d[i + 3] + (255 - 2 * d[i + 3]) * s);
        continue;
      }
      for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] + (255 - 2 * d[i + k]) * s);
    }
    raster.write(img, rect.x, rect.y);
  });
}

export function selectLayerPixels(host: SelectHost, id?: string): void {
  const p = host.current;
  if (!p) return;
  const layer = id !== undefined ? p.layer(id) : p.activeLayer;
  if (!layer || !layer.raster) return;
  const w = p.doc.width;
  const h = p.doc.height;
  const rgba = layerRgba(layer, w, h);
  applySelection(host, SelectionMask.fromAlpha(0, 0, w, h, rgba), 'replace', "Select Layer's Pixels");
}

/** The active layer's mask as opaque gray at document size (white where the mask has no pixels), what the Magic Wand
 *  samples while the mask is the target. */
function maskRgba(layer: Layer, w: number, h: number): Uint8ClampedArray {
  const s = createSurface(w, h), c = ctxOf(s), m = layer.mask;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  if (m?.raster) {
    setMat(c, placement(m.placement ?? layer.transform, m.raster.width, m.raster.height));
    c.drawImage(m.raster.canvas, 0, 0);
    setMat(c, [1, 0, 0, 1, 0, 0]);
  }
  const g = toGray(c.getImageData(0, 0, w, h));
  for (let i = 3; i < g.data.length; i += 4) g.data[i] = 255;
  return g.data;
}

export function magicWand(host: SelectHost, pt: Pt, mode: SelectionMode): void {
  const p = host.current;
  if (!p) return;
  const w = p.doc.width;
  const h = p.doc.height;
  const x = Math.floor(pt.x);
  const y = Math.floor(pt.y);
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const o = host.wand;
  let rgba: Uint8ClampedArray;
  if (host.alphaTarget) {
    rgba = alphaPlane(host.alphaTarget.mask, w, h).data;
  } else if (host.quickMask) {
    rgba = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = (j * w + i) * 4, v = p.selection ? p.selection.valueAt(i, j) : 255; rgba[k] = rgba[k + 1] = rgba[k + 2] = v; rgba[k + 3] = 255; }
  } else if (o.sampleAll) {
    rgba = ctxOf(host.composite(p)).getImageData(0, 0, w, h).data;
  } else {
    const layer = p.activeLayer;
    if (!layer) {
      host.notice('Select a layer first.');
      return;
    }
    rgba = p.maskTarget && layer.mask ? maskRgba(layer, w, h) : layerRgba(layer, w, h);
  }
  let region = wandMask(rgba, w, h, x, y, o.tolerance, o.contiguous, o.sampleSize);
  if (o.antialias) region = antialiasMask(region, w, h);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) out[i * 4 + 3] = region[i];
  applySelection(host, SelectionMask.fromAlpha(0, 0, w, h, out, !o.antialias), mode, 'Magic Wand');
}

export function selectedPixels(host: SelectHost, merged: boolean): { surface: Surface; region: Rect } | null {
  const p = host.current;
  if (!p) return null;
  const layer = p.activeLayer;
  if (!merged) {
    if (!layer) return null;
    if (layer.isGroup || layer.adjustment) {
      host.notice('Select a pixel layer to copy.');
      return null;
    }
  }
  const canvas: Rect = { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
  const sel = p.selection;
  const clipped = sel ? intersectRect(integral(sel.rect), canvas) : canvas;
  if (!clipped || clipped.w <= 0 || clipped.h <= 0) return null;
  const region = integral(clipped);
  const out = createSurface(region.w, region.h);
  const ctx = ctxOf(out);
  if (merged) {
    ctx.drawImage(host.composite(p), -region.x, -region.y);
  } else if (layer) {
    const shift = translation(-region.x, -region.y);
    if (p.maskTarget) {
      const m = layer.mask;
      if (m && m.raster) {
        setMat(ctx, mul(shift, placement(m.placement ?? layer.transform, m.raster.width, m.raster.height)));
        ctx.drawImage(m.raster.canvas, 0, 0);
        setMat(ctx, [1, 0, 0, 1, 0, 0]);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, region.w, region.h);
      }
      ctx.putImageData(toGray(ctx.getImageData(0, 0, region.w, region.h)), 0, 0);
    } else if (layer.raster) {
      setMat(ctx, mul(shift, placement(layer.transform, layer.raster.width, layer.raster.height)));
      ctx.drawImage(layer.raster.canvas, 0, 0);
      setMat(ctx, [1, 0, 0, 1, 0, 0]);
    }
  }
  if (sel) {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(sel.surface(), sel.x - region.x, sel.y - region.y);
    ctx.globalCompositeOperation = 'source-over';
  }
  return { surface: out, region };
}

/** Where a paste lands: the copied place, or with `inPlace` false and that place's centre outside the visible part of
 *  the canvas, centred on the visible part. */
export function pastePlace(p: Project, c: { x: number; y: number; w: number; h: number }, inPlace: boolean): Pt {
  if (inPlace) return { x: c.x, y: c.y };
  const v = p.viewport, a = v.toDoc(0, 0), b = v.toDoc(v.width, v.height);
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  if (cx >= a.x && cx <= b.x && cy >= a.y && cy <= b.y) return { x: c.x, y: c.y };
  const x0 = Math.max(a.x, 0), x1 = Math.min(b.x, p.doc.width), y0 = Math.max(a.y, 0), y1 = Math.min(b.y, p.doc.height);
  const mx = x1 > x0 ? (x0 + x1) / 2 : p.doc.width / 2, my = y1 > y0 ? (y0 + y1) / 2 : p.doc.height / 2;
  return { x: Math.round(mx - c.w / 2), y: Math.round(my - c.h / 2) };
}

export function pasteClipboard(host: SelectHost, inPlace = false): boolean {
  const c = host.clipboard;
  if (!c) return false;
  const r = Raster.from(c.surface, c.w, c.h);
  const p = host.current;
  if (!p) {
    host.newDocumentFor(c.w, c.h, 'Pasted');
    host.insertRasterLayer(r, 'Pasted Layer', 0, 0);
  } else {
    const at = pastePlace(p, c, inPlace);
    host.insertRasterLayer(r, 'Pasted Layer', at.x, at.y);
  }
  return true;
}
