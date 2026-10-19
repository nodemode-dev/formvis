import type { ID, Layer, Rect, Transform } from './types';
import { applyMat, boundsOf, invert, mul, placement, setMat, translation } from './geometry';
import type { Mat } from './geometry';
import { Raster, createSurface, ctxOf } from './surface';
import type { Surface } from './surface';
import type { SelectionMask } from './selection';
import { fromGray, gaussianBlur, toGray } from './filters';
import { contentFill, premultiply, unpremultiply } from './retouch';
import type { Project } from './project';
import type { LibFrame } from './filter-library';

export type Target = 'pixels' | 'mask';
export type Run = (src: ImageData, scale: number, frame?: LibFrame) => ImageData;

export interface EditHost {
  readonly current: Project | null;
  edit(label: string, fn: (p: Project) => boolean | void): void;
  notice(message: string): void;
  emit(what: 'render'): void;
  canPaint(p: Project): boolean;
  paintable(l: Layer | null): boolean;
  target(p: Project): { layer: Layer; raster: Raster; local: Mat; target: Target } | null;
  coverage(p: Project, l: Layer, target: Target, w: number, h: number): Uint8ClampedArray | null;
  frame(p: Project, t: Transform, w: number, h: number, shift?: number): LibFrame;
  setPreview(layerId: ID | null, target?: Target, surface?: Surface, transform?: Transform): void;
  clearPreview(): void;
  room(bytes: number, what: string): boolean;
  layerBytes(): number;
  refusal(l: Layer, maskTargeted: boolean): string | null;
}

export type EditTarget = NonNullable<ReturnType<EditHost['target']>>;
export type RegionApply = (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void;
type AsyncRun = (src: ImageData, scale: number, frame?: LibFrame) => ImageData | Promise<ImageData>;

const NEED_LAYER = 'Select a pixel layer first.';

let previewSeq = 0;

export function tint(rect: Rect, css: string, cover?: Surface | null): Surface {
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));
  const s = createSurface(w, h);
  const c = ctxOf(s);
  c.fillStyle = css;
  c.fillRect(0, 0, w, h);
  if (cover) {
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(cover, 0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  }
  return s;
}

function crop(img: ImageData, r: Rect): ImageData {
  if (r.x === 0 && r.y === 0 && r.w === img.width && r.h === img.height) return img;
  const o = new ImageData(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const a = ((r.y + y) * img.width + r.x) * 4;
    o.data.set(img.data.subarray(a, a + r.w * 4), y * r.w * 4);
  }
  return o;
}

function targetTransform(l: Layer, target: Target): Transform {
  return target === 'mask' && l.mask && l.mask.placement ? l.mask.placement : l.transform;
}

function regionBox(region: SelectionMask, local: Mat, raster: Raster): Rect | null {
  const inv = invert(local);
  const r = region.rect;
  const b = boundsOf([
    applyMat(inv, r.x, r.y),
    applyMat(inv, r.x + r.w, r.y),
    applyMat(inv, r.x + r.w, r.y + r.h),
    applyMat(inv, r.x, r.y + r.h),
  ]);
  const x0 = Math.max(0, Math.floor(b.x) - 1);
  const y0 = Math.max(0, Math.floor(b.y) - 1);
  const x1 = Math.min(raster.width, Math.ceil(b.x + b.w) + 1);
  const y1 = Math.min(raster.height, Math.ceil(b.y + b.h) + 1);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function coverOf(region: SelectionMask, local: Mat, rect: Rect): Surface {
  const s = createSurface(rect.w, rect.h);
  const c = ctxOf(s);
  setMat(c, mul(translation(-rect.x, -rect.y), invert(local)));
  c.drawImage(region.surface(), region.x, region.y, region.w, region.h);
  return s;
}

export function regionEdit(
  host: EditHost,
  label: string,
  apply: RegionApply,
  region?: SelectionMask | null,
): void {
  const p = host.current;
  if (!p || !host.canPaint(p)) {
    host.notice(NEED_LAYER);
    return;
  }
  const t0 = host.target(p);
  if (!t0) {
    host.notice(NEED_LAYER);
    return;
  }
  const reg = region === undefined ? p.selection : region;
  let rect: Rect;
  let cover: Surface | null = null;
  if (reg) {
    const box = regionBox(reg, t0.local, t0.raster);
    if (!box) return;
    rect = box;
    cover = coverOf(reg, t0.local, rect);
  } else {
    rect = { x: 0, y: 0, w: t0.raster.width, h: t0.raster.height };
  }
  const box = rect;
  const cov = cover;
  host.edit(label, (q) => {
    const t = host.target(q);
    if (!t) return false;
    const raster = t.raster;
    const before = raster.read(box.x, box.y, box.w, box.h);
    try {
      apply({ raster, target: t.target, rect: box, cover: cov });
    } catch (e) {
      raster.write(before, box.x, box.y);
      throw e;
    }
    if (t.target === 'pixels' && t.layer.shape) q.updateLayer(t.layer.id, { shape: null });
    q.history.addPatch({
      raster,
      x: box.x,
      y: box.y,
      before,
      after: raster.read(box.x, box.y, box.w, box.h),
    });
  });
}

export function blendThrough(src: ImageData, out: ImageData, cov: ImageData): ImageData {
  const n = src.width * src.height;
  const r = new ImageData(src.width, src.height);
  const s = src.data;
  const o = out.data;
  const c = cov.data;
  const d = r.data;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const k = c[j + 3];
    if (k === 0) {
      d[j] = s[j];
      d[j + 1] = s[j + 1];
      d[j + 2] = s[j + 2];
      d[j + 3] = s[j + 3];
    } else if (k === 255) {
      d[j] = o[j];
      d[j + 1] = o[j + 1];
      d[j + 2] = o[j + 2];
      d[j + 3] = o[j + 3];
    } else {
      const f = k / 255;
      const sa = s[j + 3];
      const oa = o[j + 3];
      const ra = sa + (oa - sa) * f;
      if (ra <= 0) {
        d[j] = 0;
        d[j + 1] = 0;
        d[j + 2] = 0;
        d[j + 3] = 0;
      } else {
        for (let q = 0; q < 3; q++) {
          const sp = s[j + q] * sa;
          d[j + q] = (sp + (o[j + q] * oa - sp) * f) / ra;
        }
        d[j + 3] = ra;
      }
    }
  }
  return r;
}

function commit(raster: Raster, rect: Rect, cover: Surface | null, target: Target, src: ImageData, out: ImageData): void {
  let res = out;
  if (cover) res = blendThrough(src, out, ctxOf(cover).getImageData(0, 0, rect.w, rect.h));
  if (target === 'mask') res = fromGray(res);
  raster.write(res, rect.x, rect.y);
}

function greyIf(img: ImageData, target: Target): ImageData {
  return target === 'mask' ? toGray(img) : img;
}

/** Lock Transparency: a result keeps the colour the filter made and the alpha the layer had, pixel by pixel, as
 *  painting does (source-atop). Sizes that differ are returned as they are. */
export function keepAlpha(out: ImageData, src: ImageData): ImageData {
  if (out.width !== src.width || out.height !== src.height) return out;
  const r = new ImageData(new Uint8ClampedArray(out.data), out.width, out.height);
  const d = r.data;
  const s = src.data;
  for (let i = 3; i < d.length; i += 4) d[i] = s[i];
  return r;
}

function alphaLocked(l: Layer, target: Target): boolean {
  return target === 'pixels' && !!l.locks?.transparency;
}

export function targetImage(host: EditHost): {
  layerId: ID;
  target: Target;
  image: ImageData;
  width: number;
  height: number;
  unitsPerPixel: number;
} | null {
  const p = host.current;
  if (!p) return null;
  const l = p.activeLayer;
  if (!l || !host.paintable(l)) return null;
  const t = host.target(p);
  if (!t || t.raster.width < 1 || t.raster.height < 1) return null;
  const image = greyIf(t.raster.read(), t.target);
  return {
    layerId: t.layer.id,
    target: t.target,
    image,
    width: image.width,
    height: image.height,
    unitsPerPixel: Math.hypot(t.local[0], t.local[1]),
  };
}

function grown(t: Transform, g: number, rw: number, rh: number): Transform {
  const dx = g * (t.w / rw);
  const dy = g * (t.h / rh);
  return { ...t, x: t.x - dx, y: t.y - dy, w: t.w + 2 * dx, h: t.h + 2 * dy };
}

/** Preferences > Performance > Full Resolution Previews: previews run on the whole layer, not a copy of about 2 MP. */
export const previewMode = { full: false };

export function previewImageEdit(
  host: EditHost,
  run: AsyncRun,
  grow = 0,
  maxPixels = 2_000_000,
): void {
  if (previewMode.full) maxPixels = Number.POSITIVE_INFINITY;
  const mine = ++previewSeq;
  const p = host.current;
  const l = p ? p.activeLayer : null;
  if (!p || !l || !host.paintable(l)) {
    host.setPreview(null);
    return;
  }
  const t = host.target(p);
  const w = t ? t.raster.width : 0;
  const h = t ? t.raster.height : 0;
  if (!t || w < 1 || h < 1) {
    host.setPreview(null);
    return;
  }
  const keep = alphaLocked(t.layer, t.target);
  const margined = grow > 0 && t.target === 'pixels' && !p.selection && !l.mask && !keep;
  const scale = Math.min(1, Math.sqrt(maxPixels / (w * h)));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const m = margined ? Math.ceil(grow * scale) : 0;
  const copy = createSurface(sw + 2 * m, sh + 2 * m);
  const cc = ctxOf(copy);
  cc.imageSmoothingEnabled = true;
  cc.imageSmoothingQuality = 'high';
  cc.drawImage(t.raster.canvas, 0, 0, w, h, m, m, sw, sh);
  const src = greyIf(cc.getImageData(0, 0, copy.width, copy.height), t.target);
  const tr = targetTransform(t.layer, t.target);
  const full = m / scale;
  const frame = host.frame(p, tr, w, h, margined ? full : undefined);
  const layerId = t.layer.id;
  const target = t.target;
  const layer = t.layer;
  const show = (out: ImageData): void => {
    if (mine !== previewSeq) return;
    let res = keep ? keepAlpha(out, src) : out;
    if (!margined) {
      const cov = host.coverage(p, layer, target, out.width, out.height);
      if (cov && cov.length >= out.width * out.height * 4) {
        const ci = new ImageData(out.width, out.height);
        ci.data.set(cov.subarray(0, out.width * out.height * 4));
        res = blendThrough(src, res, ci);
      }
    }
    if (target === 'mask') res = fromGray(res);
    const surface = createSurface(res.width, res.height);
    ctxOf(surface).putImageData(res, 0, 0);
    host.setPreview(layerId, target, surface, margined ? grown(tr, full, w, h) : tr);
  };
  const fail = (): void => {
    if (mine === previewSeq) host.setPreview(null);
  };
  try {
    Promise.resolve(run(src, scale, frame)).then(show).catch(fail);
  } catch {
    fail();
  }
}

export function applyImageEdit(
  host: EditHost,
  label: string,
  run: Run,
  grow = 0,
  peak = 2,
): void {
  const p = host.current;
  if (!p) return;
  if (!host.room(host.layerBytes() * peak, label)) return;
  const l = p.activeLayer;
  const msg = l ? host.refusal(l, p.maskTarget) : null;
  if (msg) host.notice(msg);
  previewSeq++;
  host.clearPreview();
  if (!l || !host.paintable(l)) {
    if (!msg) host.notice(NEED_LAYER);
    host.emit('render');
    return;
  }
  const t = host.target(p);
  if (!t) {
    host.emit('render');
    return;
  }
  const w = t.raster.width;
  const h = t.raster.height;
  const g = Math.round(grow);
  const keep = alphaLocked(t.layer, t.target);
  if (g > 0 && t.target === 'pixels' && !p.selection && !l.mask && !keep) {
    const s = createSurface(w + 2 * g, h + 2 * g);
    const c = ctxOf(s);
    c.drawImage(t.raster.canvas, g, g);
    const out = run(c.getImageData(0, 0, s.width, s.height), 1, host.frame(p, l.transform, w, h, g));
    const id = l.id;
    host.edit(label, (q) => {
      const ly = q.layer(id);
      if (!ly) return false;
      const nr = new Raster(out.width, out.height);
      nr.write(out);
      q.updateLayer(id, { raster: nr, transform: grown(ly.transform, g, w, h), shape: null });
    });
    return;
  }
  const full = greyIf(t.raster.read(), t.target);
  const made = run(full, 1, host.frame(p, targetTransform(t.layer, t.target), w, h));
  const out = keep ? keepAlpha(made, full) : made;
  regionEdit(host, label, ({ raster, target, rect, cover }) => {
    const sub = greyIf(raster.read(rect.x, rect.y, rect.w, rect.h), target);
    commit(raster, rect, cover, target, sub, crop(out, rect));
  });
}

export function contentAwareFill(host: EditHost): void {
  const p = host.current;
  if (!p) return;
  if (!p.selection) {
    host.notice('Content-Aware Fill needs a selection.');
    return;
  }
  if (!host.canPaint(p)) {
    host.notice(NEED_LAYER);
    return;
  }
  regionEdit(host, 'Content-Aware Fill', ({ raster, target, rect, cover }) => {
    const w = raster.width;
    const h = raster.height;
    const tl = host.target(p);
    if (!tl) return;
    const cov = host.coverage(p, tl.layer, target, w, h);
    if (!cov) return;
    const mask = new Uint8Array(w * h);
    let any = false;
    for (let i = 0; i < mask.length; i++) {
      if (cov[i * 4 + 3] > 0) {
        mask[i] = 1;
        any = true;
      }
    }
    if (!any) return;
    const src = greyIf(raster.read(), target);
    const pm = premultiply(src.data);
    if (!contentFill(pm, mask, w, h)) {
      host.notice('There is nothing opaque around the selection to fill from.');
      return;
    }
    const out = new ImageData(w, h);
    unpremultiply(pm, out.data);
    commit(raster, rect, cover, target, crop(src, rect), crop(out, rect));
  });
}

function blurSurface(s: Surface, sigma: number): void {
  if (!(sigma > 0)) return;
  const c = ctxOf(s);
  c.putImageData(gaussianBlur(c.getImageData(0, 0, s.width, s.height), sigma), 0, 0);
}

function drawPlaced(c: ReturnType<typeof ctxOf>, raster: Raster, t: Transform): void {
  c.imageSmoothingEnabled = t.sampling !== 'nearest';
  if (t.sampling === 'high') c.imageSmoothingQuality = 'high';
  setMat(c, placement(t, raster.width, raster.height));
  c.drawImage(raster.canvas, 0, 0);
  c.setTransform(1, 0, 0, 1, 0, 0);
}

export function layerSample(p: Project, layer: Layer, sigma = 0): Surface {
  const s = createSurface(p.doc.width, p.doc.height);
  if (!layer.raster) return s;
  drawPlaced(ctxOf(s), layer.raster, layer.transform);
  blurSurface(s, sigma);
  return s;
}

function edgeReveals(r: Raster): boolean {
  const w = r.width;
  const h = r.height;
  const strips = [r.read(0, 0, w, 1), r.read(0, h - 1, w, 1), r.read(0, 0, 1, h), r.read(w - 1, 0, 1, h)];
  let sum = 0;
  let n = 0;
  for (const img of strips) {
    for (let i = 3; i < img.data.length; i += 4) {
      sum += img.data[i];
      n++;
    }
  }
  return n > 0 && sum / n >= 127.5;
}

export function maskBlurSample(p: Project, layer: Layer, sigma: number): Surface {
  const W = p.doc.width;
  const H = p.doc.height;
  const s = createSurface(W, H);
  const m = layer.mask;
  const r = m ? m.raster : null;
  if (!m || !r || r.width < 1 || r.height < 1) return s;
  const t = m.placement ? m.placement : layer.transform;
  const tmp = createSurface(W, H);
  const tc = ctxOf(tmp);
  drawPlaced(tc, r, t);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = '#fff';
  tc.fillRect(0, 0, W, H);
  const c = ctxOf(s);
  if (edgeReveals(r)) {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, W, H);
    const pm = placement(t, r.width, r.height);
    const q = [applyMat(pm, 0, 0), applyMat(pm, r.width, 0), applyMat(pm, r.width, r.height), applyMat(pm, 0, r.height)];
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < 4; i++) c.lineTo(q[i].x, q[i].y);
    c.closePath();
    c.fill();
    c.globalCompositeOperation = 'source-over';
  }
  c.drawImage(tmp, 0, 0);
  blurSurface(s, sigma);
  return s;
}
