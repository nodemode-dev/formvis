// Colour profiles (DEV_PLAN 36.13): the Engine's Assign Profile and Convert to Profile methods, moved out of
// index.ts. Each takes a ProfileHost, the few Engine members they use, so this file never imports the Engine class.
import { applyLut, type ColourLut, type Lut3x4, type Lut4 } from './colour-lut';
import { rasterFromChannels } from './channels';
import { rasterFromDeep } from './deep';
import { renderLab } from './lab';
import { Raster } from './surface';
import type { Project } from './project';
import type { ChannelPixels, DocProfile } from './types';
import type { DocMode, ID } from './types';

/** What the profile methods need of the Engine. */
export interface ProfileHost {
  current: Project | null;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  setCmykTables(p: Project, lut: Lut4, inLut: Lut3x4): void;
}

/** Edit > Assign Profile: the profile the numbers are read in, the numbers unchanged; null for sRGB. */
export function assignProfile(host: ProfileHost, profile: DocProfile | null): boolean {
  const p = host.current;
  if (!p || (p.doc.profile?.icc ?? null) === (profile?.icc ?? null)) return false;
  return host.edit('Assign Profile', (pp) => { pp.doc = { ...pp.doc, profile: profile ?? undefined }; return true; });
}

/** Assign Profile in a CMYK document (1.57.9): the inks unchanged, each layer's rendition redrawn through the new
 *  profile's tables (`lut`, `inLut`), the profile assigned; one step. */
export function assignCmykProfile(host: ProfileHost, profile: DocProfile, lut: Lut4, inLut: Lut3x4): boolean {
  const p = host.current;
  if (!p || p.doc.mode !== 'cmyk') return false;
  const ok = host.edit('Assign Profile', (pp) => {
    // A new ink record with the same values, so derive (1.55.9) reads the inks as set, not as an 8-bit edit to undo.
    const layers = pp.doc.layers.map((l) => (l.channels?.mode === 'cmyk' ? { ...l, channels: { ...l.channels }, raster: rasterFromChannels(l.channels, lut) } : l));
    pp.doc = { ...pp.doc, layers, profile };
    return true;
  });
  if (ok) host.setCmykTables(p, lut, inLut);
  return ok;
}

/** Convert to Profile in a CMYK document (1.57.9): each layer's inks replaced by `inks` (converted by the engine's
 *  LittleCMS to `profile`), renditions redrawn through its tables, the profile assigned; one step. */
export function convertCmykProfile(host: ProfileHost, profile: DocProfile, inks: Map<ID, ChannelPixels>, lut: Lut4, inLut: Lut3x4): boolean {
  const p = host.current;
  if (!p || p.doc.mode !== 'cmyk') return false;
  const ok = host.edit('Convert to Profile', (pp) => {
    const layers = pp.doc.layers.map((l) => { const ch = inks.get(l.id); return ch ? { ...l, channels: ch, raster: rasterFromChannels(ch, lut) } : l; });
    pp.doc = { ...pp.doc, layers, profile };
    return true;
  });
  if (ok) host.setCmykTables(p, lut, inLut);
  return ok;
}

/** Convert to Profile at 32 bits (1.57.3): every layer's linear floats through `m` (the engine's matrix between the
 *  two profiles' primaries), light above white converting exactly; renditions redrawn; `target` assigned; one step. */
export function convertToProfileLinear(host: ProfileHost, target: DocProfile | null, m: number[][]): boolean {
  const p = host.current;
  if (!p || p.doc.depth !== 32) return false;
  return host.edit('Convert to Profile', (pp) => {
    const layers = pp.doc.layers.map((l) => {
      if (!l.channels || l.channels.mode !== 'rgb' || l.isGroup) return l;
      const d = new Float32Array(l.channels.data);
      for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, m[c][0] * r + m[c][1] * g + m[c][2] * b); }
      const ch = { ...l.channels, data: d };
      return { ...l, channels: ch, raster: rasterFromDeep(ch, true) };
    });
    pp.doc = { ...pp.doc, layers, profile: target ?? undefined };
    return true;
  });
}

/** Edit > Convert to Profile: every layer's pixels through `lut` (the engine's LittleCMS table from the document's
 *  profile to `target`), then `target` assigned; one step. Live type and shapes keep their colours' numbers. */
export function convertToProfile(host: ProfileHost, target: DocProfile | null, lut: ColourLut): boolean {
  if (!host.current) return false;
  return host.edit('Convert to Profile', (pp) => {
    const layers = pp.doc.layers.map((l) => {
      if (!l.raster || l.isGroup) return l;
      const r = l.raster.clone(), d = r.ctx.getImageData(0, 0, r.width, r.height);
      applyLut(d.data, lut); r.ctx.putImageData(d, 0, 0); r.touch();
      return { ...l, raster: r };
    });
    pp.doc = { ...pp.doc, layers, profile: target ?? undefined };
    return true;
  });
}

/** Convert to Profile and mode changes at 16 bits (DEV_PLAN 28.2): each pixel layer's channels replaced by the engine's
 *  LittleCMS result in `plan.layers` (double precision, rounded once, no 8-bit step), renditions redrawn, the mode,
 *  profile and depth set; one step. For CMYK the plan carries the new press's display and separation tables. */
export function convertDeepDocument(host: ProfileHost, plan: { mode: DocMode; profile: DocProfile | null; depth: 8 | 16; layers: ReadonlyMap<ID, ChannelPixels>; cmyk?: { lut: Lut4; inLut: Lut3x4 } }): boolean {
  const p = host.current;
  if (!p || (plan.mode === 'cmyk' && !plan.cmyk)) return false;
  if (plan.cmyk) { p.cmykLut = plan.cmyk.lut; p.cmykIn = plan.cmyk.inLut; }
  const ok = host.edit('Convert to Profile', (pp) => {
    const layers = pp.doc.layers.map((l) => {
      const ch = plan.layers.get(l.id);
      if (!ch) return l;
      let raster: Raster;
      if (ch.mode === 'cmyk' && plan.cmyk) raster = rasterFromChannels(ch, plan.cmyk.lut);
      else if (ch.mode === 'lab') { raster = new Raster(ch.width, ch.height); const img = raster.ctx.createImageData(ch.width, ch.height); renderLab(ch.data, img.data); raster.ctx.putImageData(img, 0, 0); raster.touch(); }
      else raster = rasterFromDeep(ch);
      return { ...l, channels: plan.depth === 8 && ch.mode === 'rgb' ? undefined : ch, raster };
    });
    pp.doc = { ...pp.doc, layers, mode: plan.mode, profile: plan.profile ?? undefined, depth: plan.depth === 8 ? undefined : plan.depth, palette: undefined };
    return true;
  });
  if (ok && plan.cmyk) host.setCmykTables(p, plan.cmyk.lut, plan.cmyk.inLut);
  return ok;
}
