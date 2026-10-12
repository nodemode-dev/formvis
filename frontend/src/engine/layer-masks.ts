import type { ID, Layer, Mask, Rect, Transform } from './types';
import { Raster, createSurface, ctxOf } from './surface';
import { integral, intersectRect, invert, mul, placement, setMat, transformBounds, translation } from './geometry';
import { SelectionMask } from './selection';
import type { Project } from './project';

export interface MaskHost {
  readonly current: Project | null;
  edit(label: string, fn: (p: Project) => boolean | void): void;
  focus(p: Project, id: ID): void;
  notice(message: string): void;
  applySelection(sel: SelectionMask | null, mode: 'replace', label: string): void;
}

const IDENTITY: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

function maskRaster(w: number, h: number, alpha: (i: number) => number): Raster {
  const r = new Raster(w, h);
  const img = r.read();
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    d[o] = 255;
    d[o + 1] = 255;
    d[o + 2] = 255;
    d[o + 3] = alpha(i);
  }
  r.write(img);
  return r;
}

function plainMask(raster: Raster | null): Mask {
  return { raster, enabled: true, linked: true, placement: null };
}

function layerSize(layer: Layer): { w: number; h: number } {
  if (layer.raster) return { w: layer.raster.width, h: layer.raster.height };
  return { w: Math.max(1, Math.round(layer.transform.w)), h: Math.max(1, Math.round(layer.transform.h)) };
}

function selectionOnLayer(sel: SelectionMask, layer: Layer, w: number, h: number): Uint8ClampedArray {
  const surf = createSurface(w, h);
  const ctx = ctxOf(surf);
  const toLayer = invert(placement(layer.transform, w, h));
  setMat(ctx, mul(toLayer, translation(sel.x, sel.y)));
  ctx.drawImage(sel.surface(), 0, 0);
  ctx.setTransform(...IDENTITY);
  return ctx.getImageData(0, 0, w, h).data;
}

export function addMask(host: MaskHost, hide = false, fromSelection = true): void {
  host.edit(hide ? 'Add Mask Hiding All' : 'Add Layer Mask', (p) => {
    const layer = p.activeLayer;
    if (!layer || layer.mask) return false;
    const sel = fromSelection ? p.selection : null;
    let mask: Mask;
    if (sel) {
      const { w, h } = layerSize(layer);
      const data = selectionOnLayer(sel, layer, w, h);
      mask = plainMask(maskRaster(w, h, (i) => (hide ? 255 - data[i * 4 + 3] : data[i * 4 + 3])));
    } else if (hide) {
      const { w, h } = layerSize(layer);
      mask = plainMask(maskRaster(w, h, () => 0));
    } else {
      mask = plainMask(null);
    }
    p.updateLayer(layer.id, { mask });
    p.maskTarget = true;
  });
}

export function deleteMask(host: MaskHost, apply: boolean): void {
  host.edit(apply ? 'Apply Layer Mask' : 'Delete Layer Mask', (p) => {
    const layer = p.activeLayer;
    if (!layer || !layer.mask) return false;
    const mask = layer.mask;
    if (apply && layer.raster && mask.raster && mask.enabled) {
      const out = layer.raster.clone();
      const ctx = out.ctx;
      const toLayer = invert(placement(layer.transform, out.width, out.height));
      const maskPlace = placement(mask.placement ?? layer.transform, mask.raster.width, mask.raster.height);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      setMat(ctx, mul(toLayer, maskPlace));
      ctx.drawImage(mask.raster.canvas, 0, 0);
      ctx.restore();
      ctx.setTransform(...IDENTITY);
      p.updateLayer(layer.id, { raster: out, mask: null });
    } else {
      p.updateLayer(layer.id, { mask: null });
    }
    p.maskTarget = false;
  });
}

export function toggleMaskEnabled(host: MaskHost): void {
  host.edit('Toggle Layer Mask', (p) => {
    const layer = p.activeLayer;
    if (!layer || !layer.mask) return false;
    p.updateLayer(layer.id, { mask: { ...layer.mask, enabled: !layer.mask.enabled } });
  });
}

export function toggleMaskLink(host: MaskHost): void {
  host.edit('Link Layer Mask', (p) => {
    const layer = p.activeLayer;
    if (!layer || !layer.mask) return false;
    const m = layer.mask;
    const frozen: Transform = m.placement ?? { ...layer.transform };
    const next: Mask = m.linked
      ? { ...m, linked: false, placement: frozen }
      : { ...m, linked: true, placement: m.placement };
    p.updateLayer(layer.id, { mask: next });
  });
}

export function copyMask(host: MaskHost, sourceId: ID, targetId: ID): void {
  const cur = host.current;
  if (!cur || sourceId === targetId) return;
  const target = cur.layer(targetId);
  if (!target || target.isGroup || !cur.layer(sourceId)) return;
  host.edit(target.mask ? 'Replace Layer Mask' : 'Copy Layer Mask', (p) => {
    const src = p.layer(sourceId);
    const dst = p.layer(targetId);
    if (!src || !dst || !src.mask) return false;
    const sm = src.mask;
    const copy: Mask = { ...sm, raster: sm.raster ? sm.raster.clone() : null, placement: { ...(sm.placement ?? src.transform) } };
    p.updateLayer(targetId, { mask: copy });
    host.focus(p, targetId);
    p.maskTarget = true;
  });
}

export function selectMaskBlack(host: MaskHost): void {
  const p = host.current;
  const label = "Mask's Black Areas";
  if (!p) return;
  const layer = p.activeLayer;
  const mask = layer?.mask;
  if (!layer || !mask) {
    host.notice('The active layer has no mask.');
    return;
  }
  if (!mask.raster) {
    host.applySelection(null, 'replace', label);
    return;
  }
  const place: Transform = mask.placement ?? layer.transform;
  const box: Rect = integral(transformBounds(place));
  const canvas: Rect = { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
  const clip = intersectRect(box, canvas);
  if (!clip || clip.w <= 0 || clip.h <= 0) {
    host.applySelection(null, 'replace', label);
    return;
  }
  const w = Math.round(clip.w);
  const h = Math.round(clip.h);
  const surf = createSurface(w, h);
  const ctx = ctxOf(surf);
  setMat(ctx, mul(translation(-clip.x, -clip.y), placement(place, mask.raster.width, mask.raster.height)));
  ctx.drawImage(mask.raster.canvas, 0, 0);
  ctx.setTransform(...IDENTITY);
  const src = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4 + 3] = 255 - src[i * 4 + 3];
  }
  host.applySelection(SelectionMask.fromAlpha(clip.x, clip.y, w, h, out), 'replace', label);
}

export function applySubjectMask(host: MaskHost, id: ID, levels: Float32Array, width: number, height: number): void {
  const cur = host.current;
  if (!cur) return;
  const l0 = cur.layer(id);
  if (!l0 || l0.isGroup || !l0.raster || levels.length !== width * height) return;
  host.edit('Remove Background', (p) => {
    const layer = p.layer(id);
    if (!layer || layer.isGroup || !layer.raster || levels.length !== width * height) return false;
    const old = layer.mask;
    let prev: Uint8ClampedArray | null = null;
    if (old && old.raster && old.placement === null && old.raster.width === width && old.raster.height === height) {
      prev = old.raster.read().data;
    }
    const raster = maskRaster(width, height, (i) => {
      const v = Math.round(Math.min(1, Math.max(0, levels[i])) * 255);
      return prev ? Math.round((v * prev[i * 4 + 3]) / 255) : v;
    });
    p.updateLayer(id, { mask: plainMask(raster) });
  });
}

export function setMaskFromImage(
  host: MaskHost,
  id: ID,
  source: CanvasImageSource,
  width: number,
  height: number,
  label: string,
): void {
  const cur = host.current;
  if (!cur) return;
  const l0 = cur.layer(id);
  if (!l0 || l0.isGroup) return;
  host.edit(label, (p) => {
    const layer = p.layer(id);
    if (!layer || layer.isGroup) return false;
    const surf = createSurface(width, height);
    const ctx = ctxOf(surf);
    ctx.drawImage(source, 0, 0, width, height);
    const d = ctx.getImageData(0, 0, width, height).data;
    const raster = maskRaster(width, height, (i) => {
      const o = i * 4;
      return Math.round(((d[o] + d[o + 1] + d[o + 2]) / 3) * (d[o + 3] / 255));
    });
    p.updateLayer(id, { mask: plainMask(raster) });
    host.focus(p, id);
    p.maskTarget = true;
  });
}
