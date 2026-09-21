import type { BlendMode as PsdBlend, Layer as PsdLayer, LinkedFile, Psd } from 'ag-psd';
import {
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt,
} from '../engine';
import { maskEdgeTone } from '../engine/distort';

/** Layered PSD files, read and written with ag-psd (MIT). Pixel layers keep their position, opacity, blend mode and
 *  visibility, folders become groups and back, layer masks and clipping carry across, and the flattened image goes in
 *  as the composite for readers that ignore layers. What PSD stores in forms sonny does not write yet, layer styles,
 *  adjustment layers and editable type, is reported in the notes. The library loads on first use, keeping it out of
 *  the start-up bundle. */

const TO_PSD: Record<BlendMode, PsdBlend> = {
  normal: 'normal', darken: 'darken', multiply: 'multiply', 'color-burn': 'color burn', lighten: 'lighten', screen: 'screen',
  'color-dodge': 'color dodge', 'linear-dodge': 'linear dodge', overlay: 'overlay', 'soft-light': 'soft light', 'hard-light': 'hard light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
};
const FROM_PSD = new Map<PsdBlend, BlendMode>(Object.entries(TO_PSD).map(([k, v]) => [v, k as BlendMode]));

export const isPsdFile = (f: File): boolean => /\.psd$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop';

const canvas = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

/** A PSD's layers as a sonny document, bottom to top as in the file, with notes on anything left out. */
/** A GUID, which Photoshop requires for a placed layer's id. */
function guid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const h = (n: number): string => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
}

/** Where a smart object's source corners sit in the document (top left, top right, bottom right, bottom left): its
 *  warp, with any move since its last render carried in, or its placement when it has none. */
function smartCorners(l: Layer): Pt[] {
  const sm = l.smart as NonNullable<Layer['smart']>, r = l.raster as Raster;
  if (sm.warp) {
    if (!sm.warpAt || JSON.stringify(sm.warpAt) === JSON.stringify(l.transform)) return sm.warp;
    const move = mul(placement(l.transform, r.width, r.height), invert(placement(sm.warpAt, r.width, r.height)));
    return sm.warp.map((q) => applyMat(move, q.x, q.y));
  }
  const mx = (r.width - sm.source.width) / 2, my = (r.height - sm.source.height) / 2, m = placement(l.transform, r.width, r.height);
  return [[mx, my], [mx + sm.source.width, my], [mx + sm.source.width, my + sm.source.height], [mx, my + sm.source.height]].map(([x, y]) => applyMat(m, x, y));
}

/** A smart object's embedded contents as pixels: an image decoded directly, or a Photoshop document by its composite. */
async function decodeLinked(data: Uint8Array, readPsd: typeof import('ag-psd').readPsd): Promise<Raster | null> {
  try {
    if (String.fromCharCode(data[0], data[1], data[2], data[3]) === '8BPS') {
      const inner = readPsd(data.slice().buffer, { skipLayerImageData: true, skipThumbnail: true });
      return inner.canvas ? Raster.from(inner.canvas, inner.canvas.width, inner.canvas.height) : null;
    }
    const bmp = await createImageBitmap(new Blob([data.slice()]));
    return Raster.from(bmp, bmp.width, bmp.height);
  } catch { return null; }
}

export async function readPsdFile(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null }> {
  const { readPsd } = await import('ag-psd');
  const psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true });
  // Smart objects' embedded contents, decoded before the layers are built.
  const contents = new Map<string, Raster | null>();
  for (const lf of psd.linkedFiles ?? []) if (lf.data) contents.set(lf.id, await decodeLinked(lf.data, readPsd));
  const doc: Doc = { id: uid(), width: psd.width, height: psd.height, resolution: 72, layers: [] };
  const layers: Layer[] = [], notes: string[] = [];
  const walk = (children: PsdLayer[] | undefined, parentId: ID | null): void => {
    let base: Layer | null = null;
    for (const pl of children ?? []) {
      const name = pl.name || 'Layer', blend = (pl.blendMode && FROM_PSD.get(pl.blendMode)) ?? 'normal';
      if (pl.children) {
        const group = newLayer(name, doc, { isGroup: true, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1 });
        walk(pl.children, group.id);
        layers.push(group); // after its children, where sonny keeps a folder's entry
        base = null;
        continue;
      }
      if (pl.blendMode && !FROM_PSD.has(pl.blendMode) && pl.blendMode !== 'pass through') notes.push(`"${name}" uses ${pl.blendMode}, which sonny does not have; it opened as Normal.`);
      if (!pl.canvas || !pl.canvas.width || !pl.canvas.height) {
        if (pl.adjustment) notes.push(`"${name}" is an adjustment layer; sonny left it out.`);
        continue;
      }
      const w = pl.canvas.width, h = pl.canvas.height, raster = Raster.from(pl.canvas, w, h);
      const layer = newLayer(name, doc, { raster, parentId, transform: { ...docTransform(w, h), x: pl.left ?? 0, y: pl.top ?? 0 }, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend });
      const mk = pl.mask;
      if (mk?.canvas && mk.canvas.width && mk.canvas.height) {
        // PSD masks are grey; sonny's are white with the level in alpha.
        const mw = mk.canvas.width, mh = mk.canvas.height, grey = mk.canvas.getContext('2d')?.getImageData(0, 0, mw, mh);
        if (grey) {
          const img = new ImageData(mw, mh);
          for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = grey.data[i]; }
          const mr = new Raster(mw, mh);
          mr.write(img);
          layer.mask = { raster: mr, enabled: !mk.disabled, linked: true, placement: { ...docTransform(mw, mh), x: mk.left ?? 0, y: mk.top ?? 0 } };
        }
      }
      const vm = pl.vectorMask, vf = pl.vectorFill, vs = pl.vectorStroke;
      if (vm?.paths?.length && (vf?.type === 'color' || vs?.strokeEnabled)) {
        // A Photoshop shape opens as a sonny shape layer: its pixels as saved, its outline editable again.
        const col = (c: unknown): { r: number; g: number; b: number } | null => {
          const o = c as Record<string, number> | null;
          if (!o) return null;
          if (typeof o.r === 'number') return { r: o.r, g: o.g, b: o.b };
          if (typeof o.fr === 'number') return { r: Math.round(o.fr * 255), g: Math.round(o.fg * 255), b: Math.round(o.fb * 255) };
          return null;
        };
        const path = { subpaths: vm.paths.map((bp) => ({ closed: !bp.open, anchors: bp.knots.map((k) => ({ inX: k.points[0], inY: k.points[1], x: k.points[2], y: k.points[3], outX: k.points[4], outY: k.points[5] })) })).filter((sp) => sp.anchors.length) };
        const fill = vs?.fillEnabled === false || vf?.type !== 'color' ? null : col(vf.color);
        const sc = vs?.strokeEnabled && vs.content?.type === 'color' ? col(vs.content.color) : null;
        const stroke = sc ? { color: sc, width: vs?.lineWidth?.value ?? 1 } : null;
        if (path.subpaths.length && (fill || stroke)) layer.vector = { path, fill, stroke, origin: { x: pl.left ?? 0, y: pl.top ?? 0 } };
        if (vm.paths.some((bp) => bp.operation && bp.operation !== 'combine')) notes.push(`"${name}" combines shapes in ways sonny does not; its outline may differ once edited.`);
      }
      const plc = pl.placedLayer;
      if (plc) {
        // A Photoshop smart object opens as a sonny one: its contents the source, its corners the warp, its pixels as
        // Photoshop saved them until it is next re-rendered.
        const source = contents.get(plc.id) ?? null, t8 = plc.nonAffineTransform ?? plc.transform;
        if (source && t8?.length === 8 && t8.every((v) => Number.isFinite(v))) {
          layer.smart = { source, filters: [], warp: [0, 2, 4, 6].map((k) => ({ x: t8[k], y: t8[k + 1] })), warpAt: layer.transform };
          if (plc.filter) notes.push(`"${name}" has Photoshop smart filters; they stay applied in its pixels and are not editable here.`);
        } else notes.push(`"${name}" is a smart object whose contents sonny cannot read; it opened as pixels.`);
      }
      if (pl.text) notes.push(`"${name}" is type in Photoshop; it opened as pixels.`);
      if (pl.effects) notes.push(`"${name}" has a Photoshop layer style; it opened without it.`);
      if (pl.clipping && base) layer.clipId = base.id;
      else base = layer;
      layers.push(layer);
    }
  };
  walk(psd.children, null);
  if (!layers.length && psd.canvas) {
    layers.push(newLayer('Background', doc, { raster: Raster.from(psd.canvas, psd.width, psd.height) }));
    notes.push('This PSD has no layers; it opened as a single one.');
  }
  return { doc: { ...doc, layers }, notes, activeId: layers.at(-1)?.id ?? null };
}

/** The document as a layered PSD, with notes on what it could not carry. */
export async function writePsdFile(doc: Doc, composite: Surface): Promise<{ bytes: ArrayBuffer; notes: string[] }> {
  const { writePsd } = await import('ag-psd');
  const notes: string[] = [], linked: LinkedFile[] = [], sources = new Map<ID, Uint8Array>();
  for (const l of doc.layers) if (l.smart) sources.set(l.id, new Uint8Array(await (await toBlob(l.smart.source.canvas)).arrayBuffer()));
  /** A raster drawn through `t` into a box aligned to the canvas; null when it covers nothing. */
  const placed = (r: Raster, t: Layer['transform']): { c: HTMLCanvasElement; x: number; y: number } | null => {
    const m = placement(t, r.width, r.height);
    const box = integral(boundsOf([applyMat(m, 0, 0), applyMat(m, r.width, 0), applyMat(m, r.width, r.height), applyMat(m, 0, r.height)]));
    if (box.w < 1 || box.h < 1) return null;
    const c = canvas(box.w, box.h), g = c.getContext('2d') as CanvasRenderingContext2D;
    g.imageSmoothingEnabled = t.sampling !== 'nearest';
    g.setTransform(m[0], m[1], m[2], m[3], m[4] - box.x, m[5] - box.y);
    g.drawImage(r.canvas as CanvasImageSource, 0, 0);
    return { c, x: box.x, y: box.y };
  };
  const toPsd = (l: Layer): PsdLayer | null => {
    if (l.isGroup) return { name: l.name, hidden: !l.visible, opacity: l.opacity, blendMode: 'pass through', opened: true, children: build(l.id) };
    if (l.adjustment) { notes.push(`"${l.name}" is an adjustment layer; it is left out of the PSD.`); return null; }
    if (!l.raster) return null;
    const px = placed(l.raster, l.transform);
    if (!px) return null;
    if (effectsActive(l.effects)) notes.push(`"${l.name}" loses its layer style; the PSD holds its pixels only.`);
    if (liveText(l)) notes.push(`"${l.name}" goes as pixels; the PSD does not hold it as editable type.`);

    const out: PsdLayer = { name: l.name, left: px.x, top: px.y, canvas: px.c, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId };
    const embed = l.smart ? sources.get(l.id) : undefined;
    if (l.smart && embed && l.raster) {
      // A smart object goes as a Photoshop placed layer: its source embedded as PNG, its corners where it sits.
      const id = guid(), corners = smartCorners(l).flatMap((q) => [q.x, q.y]);
      linked.push({ id, name: `${l.name || 'Smart Object'}.png`, type: 'png ', data: embed });
      out.placedLayer = { id, placed: id, type: 'raster', transform: corners, nonAffineTransform: corners, width: l.smart.source.width, height: l.smart.source.height };
      if (l.smart.filters.some((f) => f.enabled)) notes.push(`"${l.name}" keeps its smart filters applied in its pixels; in Photoshop its smart object holds the original without them.`);
    }
    const v = l.vector, t = l.transform;
    if (v && l.raster) {
      // A shape layer goes as a Photoshop shape: its path as a vector mask, with its fill and stroke, beside its pixels.
      // Only a move keeps the path exact; after a scale, rotation or flip it goes as pixels.
      const moved = t.rotation === 0 && !t.flipX && !t.flipY && Math.abs(t.w - l.raster.width) < 1e-6 && Math.abs(t.h - l.raster.height) < 1e-6;
      if (moved) {
        const dx = t.x - v.origin.x, dy = t.y - v.origin.y, rgb = (c: { r: number; g: number; b: number }) => ({ r: c.r, g: c.g, b: c.b });
        out.vectorMask = { paths: v.path.subpaths.filter((sp) => sp.anchors.length).map((sp) => ({
          open: !sp.closed, operation: 'combine' as const, fillRule: 'non-zero' as const,
          knots: sp.anchors.map((a) => ({ linked: Math.abs((a.outX - a.x) * (a.inY - a.y) - (a.outY - a.y) * (a.inX - a.x)) < 1e-6 && (a.outX !== a.x || a.outY !== a.y), points: [a.inX + dx, a.inY + dy, a.x + dx, a.y + dy, a.outX + dx, a.outY + dy] })),
        })) };
        out.vectorFill = { type: 'color', color: rgb(v.fill ?? v.stroke?.color ?? { r: 0, g: 0, b: 0 }) };
        out.vectorStroke = { strokeEnabled: !!v.stroke, fillEnabled: !!v.fill, lineWidth: { units: 'Pixels', value: v.stroke?.width ?? 1 }, lineCapType: 'round', lineJoinType: 'round', lineAlignment: 'center', content: { type: 'color', color: rgb(v.stroke?.color ?? v.fill ?? { r: 0, g: 0, b: 0 }) } };
      } else notes.push(`"${l.name}" goes as pixels; after a scale, rotation or flip the PSD cannot keep it as a shape.`);
    }
    const mk = l.mask;
    if (mk?.raster) {
      const mp = placed(mk.raster, mk.placement ?? l.transform);
      if (mp) {
        const g = mp.c.getContext('2d') as CanvasRenderingContext2D, img = g.getImageData(0, 0, mp.c.width, mp.c.height);
        for (let i = 0; i < img.data.length; i += 4) { const a = img.data[i + 3]; img.data[i] = img.data[i + 1] = img.data[i + 2] = a; img.data[i + 3] = 255; }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.putImageData(img, 0, 0);
        out.mask = { canvas: mp.c, left: mp.x, top: mp.y, defaultColor: maskEdgeTone(mk.raster), disabled: !mk.enabled };
      }
    }
    return out;
  };
  const build = (parentId: ID | null): PsdLayer[] => doc.layers.filter((l) => l.parentId === parentId).map(toPsd).filter((x): x is PsdLayer => x !== null);
  const flat = canvas(doc.width, doc.height);
  (flat.getContext('2d') as CanvasRenderingContext2D).drawImage(composite as CanvasImageSource, 0, 0);
  const psd: Psd = { width: doc.width, height: doc.height, children: build(null), canvas: flat };
  if (linked.length) psd.linkedFiles = linked;
  return { bytes: writePsd(psd, { generateThumbnail: false }), notes };
}
