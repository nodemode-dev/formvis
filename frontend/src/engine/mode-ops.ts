// Colour modes (DEV_PLAN 36.13): the Engine's CMYK and Lab mode methods (Image > Mode > CMYK Color, Lab Color and back to
// RGB or Grayscale, the CMYK and Lab documents the file readers open, the tables a saved CMYK project takes), the derive
// step that brings a CMYK, Lab or deep layer's floats into step with its pixels, and Image > Mode > RGB, Grayscale, Bitmap,
// Indexed Color and Multichannel (convertMode), moved out of index.ts. Each function takes a ModeHost, the few Engine
// members it uses, so this file never imports the Engine class. Bit depth (setDepth and the deep openers) stays in index.ts.
import type { Project } from './project';
import { Raster, ctxOf, type Surface } from './surface';
import { Renderer, renderDoc } from './renderer';
import { inkOf, renditionOf, type Ink, type Lut3x4, type Lut4 } from './colour-lut';
import { rasterFromChannels } from './channels';
import { deriveRegion, deriveWhole, renderRegion, type DeriveTables } from './derive';
import { decodeLab, labFromFloats, labFromRgba, labToSrgb, renderLab, srgbToLab as labFromRgbBytes } from './lab';
import { applyDuotoneLut, curveAt, DUOTONE_COUNT, duotoneLut } from './duotone';
import { splitChannels } from './multichannel';
import { bitmapPixels, indexedPixels, INDEXED_DEFAULTS, type BitmapMethod, type Halftone, type IndexedChoice } from './quantize';
import { liveText, textKey } from './text';
import { rasterFromDeep } from './deep';
import type { PixelPatch } from './history';
import { BLEND_MODES, docTransform, newLayer, uid, type BlendMode, type ChannelPixels, type Doc, type DocMode, type DocProfile, type ID, type Layer, type RGB } from './types';
import type { ImportedImage } from './index';

/** What the mode methods need of the Engine. `current` and the colours are read live; the colour fields are also set. */
export interface ModeHost {
  readonly current: Project | null;
  readonly work: Renderer;
  /** The foreground and background colours, kept to the document's mode when set. */
  fg: RGB;
  bg: RGB;
  readonly fgc: RGB;
  readonly bgc: RGB;
  fgInk: Ink;
  bgInk: Ink;
  /** What each fill layer's pixels were drawn for, kept across a derive. */
  readonly fillKeys: WeakMap<Raster, string>;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  refresh(): void;
  emit(what: 'colors' | 'options' | 'projects'): void;
  flattened(): Surface | null;
  multichannelSurface(doc: Doc): Surface | null;
  openImage(img: ImportedImage): Project;
  addProject(doc: Doc, name: string, activeId?: ID | null): Project;
}

export function deriveTables(host: ModeHost, p: Project): DeriveTables | null {
  const out = p.cmykLut, inn = p.cmykIn;
  if (!out || !inn) return null;
  const hint = (ink: Ink): { rgb: [number, number, number]; ink: Ink } => { const c = renditionOf(ink, out); return { rgb: [c.r, c.g, c.b], ink }; };
  return { out, in: inn, hints: [hint(host.fgInk), hint(host.bgInk)] };
}

/** Generated pixels through the table (1.55.9, DEV_PLAN 22.7): after a step at 16 bits or in CMYK, a layer whose
 *  8-bit pixels changed while its floats did not is brought into step (engine/derive.ts), its rendition redrawn from
 *  the floats; a pixel layer without floats takes them whole. Replaced rasters, in-place patches and new layers. A
 *  fill layer's CMYK rendition keeps the note of what its pixels were drawn for (1.66.0), so pinFills leaves it. */
export function deriveChannels(host: ModeHost, p: Project, before: ReadonlyMap<ID, Layer>, patches: readonly PixelPatch[]): boolean {
  const cmyk = p.doc.mode === 'cmyk', lab = p.doc.mode === 'lab', linear = p.doc.depth === 32, t = cmyk ? deriveTables(host, p) : null, lut = cmyk ? p.cmykLut : null;
  if (cmyk && !t) return false;
  let changed = false;
  const shown = (r: Raster, ch: ChannelPixels): Raster => {
    if (!lut) return r;
    const out = rasterFromChannels(ch, lut), k = host.fillKeys.get(r);
    if (k) host.fillKeys.set(out, k);
    return out;
  };
  const layers = p.doc.layers.map((l) => {
    if (!l.raster || l.isGroup || l.adjustment) return l;
    const o = before.get(l.id);
    if (!o?.channels || !o.raster) {
      if (l.channels) return l;
      changed = true;
      const ch = deriveWhole(l.raster.read(), t, lab, linear);
      return { ...l, channels: ch, raster: shown(l.raster, ch) };
    }
    if (l.channels !== o.channels) return l;
    if (l.raster !== o.raster) {
      changed = true;
      const same = l.raster.width === o.raster.width && l.raster.height === o.raster.height && JSON.stringify(l.transform) === JSON.stringify(o.transform);
      const ch = same ? deriveRegion(o.channels, 0, 0, o.raster.read(), l.raster.read(), t, linear) : deriveWhole(l.raster.read(), t, lab, linear);
      return { ...l, channels: ch, raster: shown(l.raster, ch) };
    }
    const mine = patches.filter((q) => q.raster === l.raster);
    if (!mine.length) return l;
    changed = true;
    let ch = o.channels;
    for (const q of mine) {
      ch = deriveRegion(ch, q.x, q.y, q.before, q.after, t, linear);
      const img = renderRegion(ch, q.x, q.y, q.before.width, q.before.height, lut, linear);
      l.raster.write(img, q.x, q.y);
      q.after.data.set(img.data);
    }
    return { ...l, channels: ch };
  });
  if (changed) p.doc = { ...p.doc, layers };
  return changed;
}

/** Image > Mode > CMYK Color (1.54.0, H1): each pixel layer's ink, converted by the engine's LittleCMS, beside its
 *  rendition through `lut`; the CMYK profile becomes the document's; one step. Live type and shapes keep their
 *  RGB colours; the deep guard then keeps every later step to what knows ink. */
export function setCmyk(host: ModeHost, profile: DocProfile, ink: Map<ID, ChannelPixels>, lut: Lut4, inLut: Lut3x4 | null = null): boolean {
  const p = host.current;
  if (!p || p.doc.mode === 'cmyk') return false;
  p.cmykLut = lut; p.cmykIn = inLut;
  if (inLut) { host.fgInk = inkOf(host.fgc, inLut); host.bgInk = inkOf(host.bgc, inLut); }
  return host.edit('CMYK Color', (pp) => {
    const layers = pp.doc.layers.map((l) => { const ch = ink.get(l.id); return ch ? { ...l, channels: ch, raster: rasterFromChannels(ch, lut) } : l; });
    pp.doc = { ...pp.doc, layers, mode: 'cmyk', profile, depth: undefined, palette: undefined };
    return true;
  });
}

/** Image > Mode > Lab Color (1.56.4, DEV_PLAN 22.9): each pixel layer's floats in Lab, converted from its pixels
 *  exactly (engine/lab.ts); the rasters stay as their rendition. From an 8-bit or (1.57.3) a 16-bit RGB document,
 *  whose layers convert from their 16-bit floats; 32 bits come down to 16 first (app.ts). */
export function setLab(host: ModeHost): boolean {
  const p = host.current;
  if (!p || (p.doc.mode ?? 'rgb') !== 'rgb' || (p.doc.depth ?? 8) > 16) return false;
  return host.edit('Lab Color', (pp) => {
    const layers = pp.doc.layers.map((l) => (l.raster && !l.isGroup && !l.adjustment ? { ...l, channels: l.channels?.mode === 'rgb' && l.channels.n === 3 ? labFromFloats(l.channels) : labFromRgba(l.raster.read()) } : l));
    pp.doc = { ...pp.doc, layers, mode: 'lab', depth: 8 };
    return true;
  });
}

/** Image > Mode > Grayscale from Lab (1.57.5): each layer's grey from its Lightness alone,
 *  the sRGB grey of that lightness exactly; the document leaves Lab for 8-bit Grayscale. */
export function setGrayFromLab(host: ModeHost): boolean {
  const p = host.current;
  if (!p || p.doc.mode !== 'lab') return false;
  return host.edit('Grayscale', (pp) => {
    const layers = pp.doc.layers.map((l) => {
      if (l.channels?.mode !== 'lab') return l;
      const ch = l.channels, r = new Raster(ch.width, ch.height), img = r.ctx.createImageData(ch.width, ch.height), memo = new Map<number, number>();
      for (let i = 0; i < ch.data.length; i += 4) {
        const key = Math.round(ch.data[i] * 65535);
        let v = memo.get(key);
        if (v === undefined) { v = labToSrgb(ch.data[i] * 100, 0, 0)[0]; memo.set(key, v); }
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.round(ch.data[i + 3] * 255);
      }
      r.ctx.putImageData(img, 0, 0); r.touch();
      return { ...l, channels: undefined, raster: r };
    });
    pp.doc = { ...pp.doc, layers, mode: 'grayscale' };
    return true;
  });
}

/** Image > Mode > RGB Color from Lab: each layer's pixels from its Lab floats, exactly, clipped to sRGB. */
export function setRgbFromLab(host: ModeHost): boolean {
  const p = host.current;
  if (!p || p.doc.mode !== 'lab') return false;
  return host.edit('RGB Color', (pp) => {
    const layers = pp.doc.layers.map((l) => {
      if (l.channels?.mode !== 'lab') return l;
      const ch = l.channels, r = new Raster(ch.width, ch.height), img = r.ctx.createImageData(ch.width, ch.height);
      for (let i = 0, o = 0; i < ch.data.length; i += 4, o += 4) { const [L, a, b] = decodeLab(ch.data[i], ch.data[i + 1], ch.data[i + 2]), rgb = labToSrgb(L, a, b); img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = Math.round(ch.data[i + 3] * 255); }
      r.ctx.putImageData(img, 0, 0); r.touch();
      return { ...l, channels: undefined, raster: r };
    });
    pp.doc = { ...pp.doc, layers, mode: 'rgb' };
    return true;
  });
}

export function setRgbFromCmyk(host: ModeHost, rasters: Map<ID, Raster>, profile: DocProfile | null = null): boolean {
  const p = host.current;
  if (!p || p.doc.mode !== 'cmyk') return false;
  return host.edit('RGB Color', (pp) => {
    const layers = pp.doc.layers.map((l) => { const r = rasters.get(l.id); return l.channels ? { ...l, channels: undefined, raster: r ?? l.raster } : l; });
    pp.doc = { ...pp.doc, layers, mode: 'rgb', profile: profile ?? undefined };
    return true;
  });
}

/** Opens CMYK ink as a CMYK document (1.54.0): its layer holds the ink, its raster the rendition through `lut`. */
export function openChannels(host: ModeHost, name: string, ch: ChannelPixels, profile: DocProfile, lut: Lut4, inLut: Lut3x4 | null = null): Project {
  const raster = rasterFromChannels(ch, lut);
  const p = host.openImage({ source: raster.canvas as CanvasImageSource, width: ch.width, height: ch.height, name });
  p.cmykLut = lut; p.cmykIn = inLut;
  p.doc = { ...p.doc, mode: 'cmyk', profile, layers: p.doc.layers.map((l) => (l.raster && !l.isGroup ? { ...l, channels: ch } : l)) };
  host.refresh();
  return p;
}

/** Opens CMYK layers as a CMYK document (1.56.1, a CMYK PSD): each layer's ink beside its rendition through `lut`,
 *  its place, opacity, visibility and blend mode kept; bottom layer first. */
export function openChannelLayers(host: ModeHost, name: string, width: number, height: number, layers: ReadonlyArray<{ name: string; x: number; y: number; channels: ChannelPixels; opacity: number; visible: boolean; blend: string }>, profile: DocProfile, lut: Lut4, inLut: Lut3x4): Project {
  const made = layers.map((l) => {
    const raster = rasterFromChannels(l.channels, lut), blend = (BLEND_MODES.find((b) => b.id === l.blend)?.id ?? 'normal') as BlendMode;
    return newLayer(l.name, { width, height }, { raster, channels: l.channels, transform: { ...docTransform(l.channels.width, l.channels.height), x: l.x, y: l.y }, opacity: l.opacity, visible: l.visible, blend });
  });
  const doc: Doc = { id: uid(), width, height, resolution: 72, layers: made, mode: 'cmyk', profile } as Doc;
  const p = host.addProject(doc, name, made[made.length - 1]?.id ?? null);
  setCmykTables(host, p, lut, inLut);
  return p;
}

/** A Lab document from read layers (1.58.1, Lab TIFF and PSD): each layer's Lab floats kept, its rendition drawn by
 *  the formulas; `depth` 16 for a 16-bit file. */
export function openLabLayers(host: ModeHost, name: string, width: number, height: number, layers: ReadonlyArray<{ name: string; x: number; y: number; channels: ChannelPixels; opacity: number; visible: boolean }>, depth: 8 | 16): Project {
  const made = layers.map((l) => {
    const ch = l.channels, raster = new Raster(ch.width, ch.height), img = raster.ctx.createImageData(ch.width, ch.height);
    renderLab(ch.data, img.data); raster.ctx.putImageData(img, 0, 0); raster.touch();
    return newLayer(l.name, { width, height }, { raster, channels: ch, transform: { ...docTransform(ch.width, ch.height), x: l.x, y: l.y }, opacity: l.opacity, visible: l.visible });
  });
  const doc: Doc = { id: uid(), width, height, resolution: 72, layers: made, mode: 'lab', depth } as Doc;
  return host.addProject(doc, name, made[made.length - 1]?.id ?? null);
}

/** The tables of a CMYK project opened from a saved file (1.54.2), fetched by the app once its profile is known. */
export function setCmykTables(host: ModeHost, p: Project, lut: Lut4, inLut: Lut3x4): void {
  p.cmykLut = lut; p.cmykIn = inLut;
  if (p === host.current) { host.fgInk = inkOf(host.fgc, inLut); host.bgInk = inkOf(host.bgc, inLut); host.emit('colors'); }
}

/** The conversion dialog's choices: Bitmap `method` and `halftone`; Indexed Color `indexed` (a boolean `dither` stays the old Diffusion on or off). */
export interface ModeOpts { /** Grayscale: the red, green and blue weights of the grey (8-bit pixels); absent is the luminosity weights. */ grayWeights?: readonly [number, number, number]; dither?: boolean; colors?: number; method?: BitmapMethod; halftone?: Halftone; indexed?: Partial<IndexedChoice> }

/** A Lab picture as three grey channels: Lightness (0 to 100 as 0 to 255) and a and b (-128 to 127 as 0 to 255), each a single spot channel at full solidity. */
function labParts(px: Uint8ClampedArray, n: number): { name: string; color: RGB; solidity: number; grey: ArrayLike<number> }[] {
  const l = new Uint8ClampedArray(n), a = new Uint8ClampedArray(n), b = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const [L, A, B] = labFromRgbBytes(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    l[i] = Math.round(L * 2.55); a[i] = Math.round(A + 128); b[i] = Math.round(B + 128);
  }
  return [{ name: 'Lightness', color: { r: 0, g: 0, b: 0 }, solidity: 1, grey: l }, { name: 'a', color: { r: 236, g: 0, b: 140 }, solidity: 1, grey: a }, { name: 'b', color: { r: 255, g: 242, b: 0 }, solidity: 1, grey: b }];
}

export function convertMode(host: ModeHost, mode: DocMode, opts: ModeOpts = {}): boolean {
  const p = host.current;
  if (!p || (p.doc.mode ?? 'rgb') === mode || mode === 'cmyk' || (p.doc.mode === 'cmyk' && mode !== 'multichannel') || mode === 'lab' || (p.doc.mode === 'lab' && mode !== 'multichannel') || (p.doc.mode === 'multichannel' && mode !== 'rgb')) return false;
  if (mode === 'duotone') return false;   // reached through setDuotone, from Grayscale only
  const label = { rgb: 'RGB Color', grayscale: 'Grayscale', bitmap: 'Bitmap', indexed: 'Indexed Color', cmyk: 'CMYK Color', lab: 'Lab Color', duotone: 'Duotone', multichannel: 'Multichannel' }[mode];
  const flat = mode === 'bitmap' || mode === 'indexed' || mode === 'multichannel' ? host.flattened() : null;
  const duoGrey = mode === 'multichannel' && p.doc.mode === 'duotone' ? renderDoc(host.work, p.doc) : null;   // the grey under the inks
  const ok = host.edit(label, (pp) => {
    const W = pp.doc.width, H = pp.doc.height;
    if (pp.doc.mode === 'multichannel' && mode === 'rgb') {
      // Multichannel to RGB: the overprint is baked into one pixel layer.
      const s = host.multichannelSurface(pp.doc);
      if (!s) return false;
      const r = new Raster(W, H);
      r.ctx.drawImage(s as CanvasImageSource, 0, 0);
      r.touch();
      const l = newLayer('Background', pp.doc, { raster: r });
      pp.doc = { ...pp.doc, layers: [l], mode: 'rgb', multichannel: undefined, palette: undefined };
      pp.activeId = l.id;
      return true;
    }
    if (mode === 'multichannel') {
      // To Multichannel (31.3b): RGB gives Cyan, Magenta, Yellow; CMYK adds Black; Grayscale one Black; Duotone its inks.
      const from = duoGrey ?? flat;
      if (!from) return false;
      const px = ctxOf(from).getImageData(0, 0, W, H).data, duo = pp.doc.duotone;
      const src = pp.doc.mode;
      const parts: { name: string; color: RGB; solidity: number; grey: ArrayLike<number> }[] = src === 'duotone' && duo
        ? duo.inks.slice(0, DUOTONE_COUNT[duo.type]).map((ink) => {
          const g = new Uint8ClampedArray(W * H);
          for (let i = 0; i < g.length; i++) g[i] = 255 - Math.round(curveAt(ink.curve, (1 - px[i * 4] / 255) * 100) * 2.55);
          return { name: ink.name, color: ink.color, solidity: 1, grey: g };
        })
        : src === 'lab' ? labParts(px, W * H)
        : splitChannels(px, src === 'cmyk' ? 'cmyk' : src === 'grayscale' ? 'grayscale' : 'rgb');
      const channels = parts.map((c) => {
        const r = new Raster(W, H), img = r.ctx.createImageData(W, H);
        for (let i = 0; i < c.grey.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = c.grey[i]; img.data[i * 4 + 3] = 255; }
        r.ctx.putImageData(img, 0, 0);
        r.touch();
        return { name: c.name, color: c.color, solidity: c.solidity, data: r };
      });
      pp.doc = { ...pp.doc, mode: 'multichannel', multichannel: { channels }, duotone: undefined, palette: undefined };
      return true;
    }
    if (pp.doc.mode === 'duotone' && pp.doc.duotone && mode === 'rgb') {
      // Duotone to RGB: the overprint is baked into each layer's pixels.
      const lut = duotoneLut(pp.doc.duotone);
      const layers = pp.doc.layers.map((l) => {
        if (!l.raster || l.isGroup) return l;
        const r = l.raster.clone(), d = r.ctx.getImageData(0, 0, r.width, r.height);
        applyDuotoneLut(d.data, lut);
        r.ctx.putImageData(d, 0, 0); r.touch();
        return { ...l, raster: r };
      });
      pp.doc = { ...pp.doc, layers, mode: 'rgb', duotone: undefined, palette: undefined };
      return true;
    }
    if (pp.doc.duotone) pp.doc = { ...pp.doc, duotone: undefined };   // back to Grayscale (or on) drops the inks
    if (mode === 'rgb') { pp.doc = { ...pp.doc, mode: 'rgb', palette: undefined }; return true; }
    if (mode === 'grayscale') {
      const [wr, wg, wb] = opts.grayWeights ?? [0.299, 0.587, 0.114];
      const gray = (c: RGB): RGB => { const v = Math.round(wr * c.r + wg * c.g + wb * c.b); return { r: v, g: v, b: v }; };
      const layers = pp.doc.layers.map((l) => {
        if (!l.raster || l.isGroup) return l;
        if (l.channels?.mode === 'rgb' && l.channels.n === 3 && (pp.doc.depth ?? 8) > 8) {
          // 16 and 32 bits (1.57.5, DEV_PLAN 22.11): the floats themselves go grey, 16 bits by the 8-bit formula on
          // their encoded values, 32 bits as luminance in linear light (sRGB primaries), light above white kept.
          const lin = pp.doc.depth === 32, s = l.channels.data, d = new Float32Array(s.length);
          for (let i = 0; i < s.length; i += 4) { const v = lin ? 0.2126 * s[i] + 0.7152 * s[i + 1] + 0.0722 * s[i + 2] : 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2]; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = s[i + 3]; }
          const ch = { ...l.channels, data: d }, r = rasterFromDeep(ch, lin), patch: Partial<Layer> = { raster: r, channels: ch };
          if (l.text && liveText(l)) patch.text = { ...l.text, color: gray(l.text.color), rendered: textKey(r) };
          return { ...l, ...patch };
        }
        const r = l.raster.clone(), d = r.ctx.getImageData(0, 0, r.width, r.height);
        for (let i = 0; i < d.data.length; i += 4) { const v = Math.round(wr * d.data[i] + wg * d.data[i + 1] + wb * d.data[i + 2]); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
        r.ctx.putImageData(d, 0, 0);
        r.touch();
        const patch: Partial<Layer> = { raster: r };
        if (l.text && liveText(l)) patch.text = { ...l.text, color: gray(l.text.color), rendered: textKey(r) };
        if (l.vector) patch.vector = { ...l.vector, fill: l.vector.fill ? gray(l.vector.fill) : null, stroke: l.vector.stroke ? { ...l.vector.stroke, color: gray(l.vector.stroke.color) } : null };
        if (l.shape) { const sh = l.shape as Record<string, unknown>, v = wr * Number(sh.red) + wg * Number(sh.green) + wb * Number(sh.blue); patch.shape = { ...l.shape, red: v, green: v, blue: v }; }
        return { ...l, ...patch };
      });
      pp.doc = { ...pp.doc, layers, mode: 'grayscale', palette: undefined };
      return true;
    }
    if (!flat) return false;
    const src = ctxOf(flat).getImageData(0, 0, W, H), d = src.data, out = new ImageData(W, H);
    let palette: RGB[] | undefined, transparentIndex: number | undefined;
    if (mode === 'bitmap') {
      // Over white, as grey, then black or white (engine/quantize.ts): 50 percent, pattern or diffusion dither, or a halftone screen.
      const method = opts.method ?? (opts.dither ? 'diffusion' : 'threshold');
      out.data.set(bitmapPixels(d, W, H, method, pp.doc.resolution || 72, opts.halftone ?? { lpi: 53, angle: 45, shape: 'round' }));
    } else {
      const choice: IndexedChoice = { ...INDEXED_DEFAULTS, colors: opts.colors ?? 256, dither: opts.dither ? 'diffusion' : 'none', amount: opts.dither ? 100 : INDEXED_DEFAULTS.amount, ...opts.indexed };
      const res = indexedPixels(d, W, H, choice, paletteFor);
      out.data.set(res.pixels); palette = res.palette; transparentIndex = res.transparentIndex;
    }
    const r = new Raster(W, H);
    r.ctx.putImageData(out, 0, 0);
    r.touch();
    const l = newLayer(mode === 'bitmap' ? 'Background' : 'Index', pp.doc, { raster: r });
    pp.doc = { ...pp.doc, layers: [l], mode, palette, transparentIndex };
    pp.activeId = l.id;
    return true;
  });
  if (ok) { host.fg = host.fgc; host.bg = host.bgc; host.emit('options'); host.emit('projects'); }   // the colours kept to the new mode; the tab's label
  return ok;
}

/** A palette of at most `n` colours for RGBA pixels: every colour when there are that few (Exact), else median cut over
 *  a sample (Adaptive), as Indexed Color chooses. */
function paletteFor(d: Uint8ClampedArray, n: number): RGB[] {
  const seen = new Map<number, RGB>();
  for (let i = 0; i < d.length && seen.size <= n; i += 4) if (d[i + 3] >= 128) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; if (!seen.has(k)) seen.set(k, { r: d[i], g: d[i + 1], b: d[i + 2] }); }
  if (seen.size <= n) return [...seen.values()];
  const step = Math.max(1, Math.floor(d.length / 4 / 200000)), pts: number[][] = [];
  for (let i = 0; i < d.length; i += 4 * step) if (d[i + 3] >= 128) pts.push([d[i], d[i + 1], d[i + 2]]);
  let boxes: number[][][] = [pts];
  while (boxes.length < n) {
    let bi = -1, bestRange = -1, axis = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; for (let a = 0; a < 3; a++) { let lo = 255, hi = 0; for (const p of b) { if (p[a] < lo) lo = p[a]; if (p[a] > hi) hi = p[a]; } if (hi - lo > bestRange) { bestRange = hi - lo; bi = i; axis = a; } } });
    if (bi < 0 || bestRange <= 0) break;
    const b = boxes[bi].sort((p, q) => p[axis] - q[axis]), mid = b.length >> 1;
    boxes = [...boxes.slice(0, bi), b.slice(0, mid), b.slice(mid), ...boxes.slice(bi + 1)];
  }
  return boxes.filter((b) => b.length).map((b) => { let r = 0, g = 0, bl = 0; for (const p of b) { r += p[0]; g += p[1]; bl += p[2]; } return { r: Math.round(r / b.length), g: Math.round(g / b.length), b: Math.round(bl / b.length) }; });
}
