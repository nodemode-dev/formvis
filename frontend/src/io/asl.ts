import type { BlendMode, LayerEffects, RGB } from '../engine/types';
import { defaultEffects } from '../engine/types';
import { Reader, readDescriptor } from './atn';
import { Sink } from './grd';
import type { Desc, Val } from './atn';

/** .asl layer style files (DEV_PLAN 32.4 part d). Big-endian: u16 version, '8BSL', u16 subversion, a patterns
 *  section (u32 length, skipped), u32 style count; each style is a u32 block length and a block of two versioned
 *  descriptors (identity: 'Nm  ' and 'Idnt'; then the style, with its effects under 'Lefx' or at top level). */

const BLENDS: Record<string, BlendMode> = {
  Nrml: 'normal', Mltp: 'multiply', Scrn: 'screen', Ovrl: 'overlay', Drkn: 'darken', Lghtn: 'lighten', Dffr: 'difference',
  CDdg: 'color-dodge', CBrn: 'color-burn', 'H': 'hue', Strt: 'saturation', Clr: 'color', Lmns: 'luminosity',
  linearDodge: 'linear-dodge', SftL: 'soft-light', HrdL: 'hard-light', Xclu: 'exclusion', Dslv: 'dissolve',
  linearBurn: 'linear-burn', darkerColor: 'darker-color', lighterColor: 'lighter-color', vividLight: 'vivid-light',
  linearLight: 'linear-light', pinLight: 'pin-light', hardMix: 'hard-mix', blendSubtraction: 'subtract', blendDivide: 'divide',
};

const isDesc = (v: Val | undefined): v is Desc => !!v && typeof v === 'object' && !Array.isArray(v) && 'items' in v;
function num(v: Val | undefined): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && !Array.isArray(v) && 'kind' in v && v.kind === 'unit') return v.value;
  return null;
}
function enumValue(v: Val | undefined): string | null {
  return v && typeof v === 'object' && !Array.isArray(v) && 'kind' in v && v.kind === 'enum' ? v.value.trim() : null;
}
const nz = (v: number | null, fallback: number): number => (v === null || !Number.isFinite(v) ? fallback : v);
const bool = (d: Desc, key: string, fallback: boolean): boolean => { const v = d.items.get(key); return typeof v === 'boolean' ? v : fallback; };
const percent = (d: Desc, key: string, fallback: number): number => Math.min(1, Math.max(0, nz(num(d.items.get(key)), fallback * 100) / 100));
const amount = (d: Desc, key: string, fallback: number): number => Math.max(0, nz(num(d.items.get(key)), fallback));
const blend = (d: Desc, key: string, fallback: BlendMode): BlendMode => BLENDS[enumValue(d.items.get(key)) ?? ''] ?? fallback;

function colour(v: Val | undefined, fallback: RGB): RGB {
  if (!isDesc(v)) return fallback;
  const c = (k: string, f: number): number => Math.min(255, Math.max(0, Math.round(nz(num(v.items.get(k)), f))));
  if (!v.items.has('Rd  ')) return fallback;
  return { r: c('Rd  ', fallback.r), g: c('Grn ', fallback.g), b: c('Bl  ', fallback.b) };
}

/** The first and last stops of a gradient descriptor ('Grad' > 'Clrs' > each stop's 'Clr '). */
function gradientEnds(g: Val | undefined, from: RGB, to: RGB): { from: RGB; to: RGB } {
  if (!isDesc(g)) return { from, to };
  const stops = g.items.get('Clrs');
  if (!Array.isArray(stops) || stops.length < 2) return { from, to };
  const first = stops[0], last = stops[stops.length - 1];
  return { from: isDesc(first) ? colour(first.items.get('Clr '), from) : from, to: isDesc(last) ? colour(last.items.get('Clr '), to) : to };
}

/** The effect descriptors of a style: under 'Lefx' when present, else the style descriptor itself. */
function effectsOf(style: Desc): { fx: Desc; scale: number } {
  const lefx = style.items.get('Lefx');
  const fx = isDesc(lefx) ? lefx : style;
  const sc = num(fx.items.get('Scl ')) ?? num(style.items.get('Scl '));
  return { fx, scale: sc !== null && sc > 0 ? sc / 100 : 1 };
}

function mapEffects(style: Desc): LayerEffects {
  const out = defaultEffects();
  const { fx, scale } = effectsOf(style);
  const sub = (k: string): Desc | null => { const v = fx.items.get(k); return isDesc(v) ? v : null; };
  const px = (d: Desc, k: string, f: number): number => amount(d, k, f) * scale;

  const dr = sub('DrSh');
  if (dr) {
    const o = out.dropShadow;
    out.dropShadow = { ...o, enabled: bool(dr, 'enab', true), color: colour(dr.items.get('Clr '), o.color), opacity: percent(dr, 'Opct', o.opacity), blend: blend(dr, 'Md  ', o.blend),
      angle: nz(num(dr.items.get('lagl')), o.angle), distance: px(dr, 'Dstn', o.distance), size: px(dr, 'blur', o.size), useGlobal: bool(dr, 'uglg', false) };
  }
  const ig = sub('IrSh');
  if (ig) {
    const o = out.innerShadow;
    out.innerShadow = { ...o, enabled: bool(ig, 'enab', true), color: colour(ig.items.get('Clr '), o.color), opacity: percent(ig, 'Opct', o.opacity), blend: blend(ig, 'Md  ', o.blend),
      angle: nz(num(ig.items.get('lagl')), o.angle), distance: px(ig, 'Dstn', o.distance), size: px(ig, 'blur', o.size), useGlobal: bool(ig, 'uglg', false) };
  }
  const og = sub('OrGl');
  if (og) {
    const o = out.outerGlow;
    out.outerGlow = { ...o, enabled: bool(og, 'enab', true), color: colour(og.items.get('Clr '), o.color), opacity: percent(og, 'Opct', o.opacity), blend: blend(og, 'Md  ', o.blend), size: px(og, 'blur', o.size) };
  }
  const ir = sub('IrGl');
  if (ir) {
    const o = out.innerGlow;
    out.innerGlow = { ...o, enabled: bool(ir, 'enab', true), color: colour(ir.items.get('Clr '), o.color), opacity: percent(ir, 'Opct', o.opacity), blend: blend(ir, 'Md  ', o.blend), size: px(ir, 'blur', o.size) };
  }
  const fr = sub('FrFX');
  if (fr) {
    const o = out.stroke, pos = enumValue(fr.items.get('Styl'));
    out.stroke = { ...o, enabled: bool(fr, 'enab', true), color: colour(fr.items.get('Clr '), o.color), opacity: percent(fr, 'Opct', o.opacity), size: px(fr, 'Sz  ', o.size),
      position: pos === 'InsF' ? 'inside' : pos === 'CtrF' ? 'center' : 'outside' };
  }
  const so = sub('SoFi');
  if (so) {
    const o = out.colorOverlay;
    out.colorOverlay = { ...o, enabled: bool(so, 'enab', true), color: colour(so.items.get('Clr '), o.color), opacity: percent(so, 'Opct', o.opacity), blend: blend(so, 'Md  ', o.blend) };
  }
  const gr = sub('GrFl');
  if (gr) {
    const o = out.gradientOverlay, ends = gradientEnds(gr.items.get('Grad'), o.from, o.to);
    out.gradientOverlay = { ...o, enabled: bool(gr, 'enab', true), from: ends.from, to: ends.to, opacity: percent(gr, 'Opct', o.opacity), blend: blend(gr, 'Md  ', o.blend),
      angle: nz(num(gr.items.get('Angl')), o.angle), style: enumValue(gr.items.get('Type')) === 'Rdl' ? 'radial' : 'linear', scale: Math.max(0.1, nz(num(gr.items.get('Scl ')), 100) / 100), reverse: bool(gr, 'Rvrs', false) };
  }
  const sa = sub('ChFX');
  if (sa) {
    const o = out.satin;
    out.satin = { ...o, enabled: bool(sa, 'enab', true), color: colour(sa.items.get('Clr '), o.color), opacity: percent(sa, 'Opct', o.opacity), blend: blend(sa, 'Md  ', o.blend),
      angle: nz(num(sa.items.get('lagl')), o.angle), distance: px(sa, 'Dstn', o.distance), size: px(sa, 'blur', o.size), invert: bool(sa, 'Invr', o.invert) };
  }
  const be = sub('ebbl');
  if (be) {
    const o = out.bevel, st = enumValue(be.items.get('bvlS')), tech = enumValue(be.items.get('bvlT'));
    out.bevel = { ...o, enabled: bool(be, 'enab', true),
      style: st === 'OtrB' ? 'outer' : st === 'Embs' ? 'emboss' : st === 'PlEb' ? 'pillow' : st === 'strokeEmboss' ? 'stroke' : 'inner',
      depth: amount(be, 'srgR', o.depth), down: enumValue(be.items.get('bvlD')) === 'Out', size: px(be, 'blur', o.size), soften: px(be, 'Sftn', o.soften),
      angle: nz(num(be.items.get('lagl')), o.angle), altitude: nz(num(be.items.get('Lald')), o.altitude),
      highlight: colour(be.items.get('hglC'), o.highlight), highlightOpacity: percent(be, 'hglO', o.highlightOpacity), highlightBlend: blend(be, 'hglM', o.highlightBlend),
      shadow: colour(be.items.get('sdwC'), o.shadow), shadowOpacity: percent(be, 'sdwO', o.shadowOpacity), shadowBlend: blend(be, 'sdwM', o.shadowBlend),
      useGlobal: bool(be, 'uglg', false), technique: tech === 'PrBL' ? 'chiselHard' : tech === 'SfBL' ? 'chiselSoft' : undefined };
  }
  return out;
}

const BLEND_IDS = new Map<BlendMode, string>(Object.entries(BLENDS).map(([id, mode]) => [mode, id]));

const putBool = (s: Sink, key: string, v: boolean): void => { s.key(key, 'bool'); s.u8(v ? 1 : 0); };
const putUnit = (s: Sink, key: string, unit: '#Prc' | '#Pxl' | '#Ang', v: number): void => { s.key(key, 'UntF'); s.ascii(unit); s.f64(v); };
const putPct = (s: Sink, key: string, v: number): void => putUnit(s, key, '#Prc', v * 100);
const putBlend = (s: Sink, key: string, m: BlendMode): void => s.enum(key, 'BlnM', BLEND_IDS.get(m) ?? 'Nrml');
function putColour(s: Sink, key: string, c: RGB): void {
  s.key(key, 'Objc'); s.head('RGBC', 3);
  s.key('Rd  ', 'doub'); s.f64(c.r); s.key('Grn ', 'doub'); s.f64(c.g); s.key('Bl  ', 'doub'); s.f64(c.b);
}
/** One effect object under `key` ('Objc' of class `cls`) with `count` items; the caller writes exactly that many. */
const putFx = (s: Sink, key: string, cls: string, count: number): void => { s.key(key, 'Objc'); s.head(cls, count); };

/** Writes the 'Lefx' descriptor's effects: the exact inverse of mapEffects (scale 100 percent, so pixel values are literal). */
function writeEffects(s: Sink, e: LayerEffects): void {
  s.head('Lefx', 10);
  putUnit(s, 'Scl ', '#Prc', 100);
  const d = e.dropShadow;
  putFx(s, 'DrSh', 'DrSh', 9); putBool(s, 'enab', d.enabled); putBlend(s, 'Md  ', d.blend); putColour(s, 'Clr ', d.color); putPct(s, 'Opct', d.opacity);
  putBool(s, 'uglg', d.useGlobal ?? false); putUnit(s, 'lagl', '#Ang', d.angle); putUnit(s, 'Dstn', '#Pxl', d.distance); putUnit(s, 'blur', '#Pxl', d.size);
  s.long('Ckmt', 0);
  const i = e.innerShadow;
  putFx(s, 'IrSh', 'IrSh', 9); putBool(s, 'enab', i.enabled); putBlend(s, 'Md  ', i.blend); putColour(s, 'Clr ', i.color); putPct(s, 'Opct', i.opacity);
  putBool(s, 'uglg', i.useGlobal ?? false); putUnit(s, 'lagl', '#Ang', i.angle); putUnit(s, 'Dstn', '#Pxl', i.distance); putUnit(s, 'blur', '#Pxl', i.size);
  s.long('Ckmt', 0);
  const og = e.outerGlow;
  putFx(s, 'OrGl', 'OrGl', 5); putBool(s, 'enab', og.enabled); putBlend(s, 'Md  ', og.blend); putColour(s, 'Clr ', og.color); putPct(s, 'Opct', og.opacity); putUnit(s, 'blur', '#Pxl', og.size);
  const ig = e.innerGlow;
  putFx(s, 'IrGl', 'IrGl', 5); putBool(s, 'enab', ig.enabled); putBlend(s, 'Md  ', ig.blend); putColour(s, 'Clr ', ig.color); putPct(s, 'Opct', ig.opacity); putUnit(s, 'blur', '#Pxl', ig.size);
  const st = e.stroke;
  putFx(s, 'FrFX', 'FrFX', 5); putBool(s, 'enab', st.enabled); putColour(s, 'Clr ', st.color); putPct(s, 'Opct', st.opacity); putUnit(s, 'Sz  ', '#Pxl', st.size);
  s.enum('Styl', 'FStl', st.position === 'inside' ? 'InsF' : st.position === 'center' ? 'CtrF' : 'OutF');
  const co = e.colorOverlay;
  putFx(s, 'SoFi', 'SoFi', 4); putBool(s, 'enab', co.enabled); putBlend(s, 'Md  ', co.blend); putColour(s, 'Clr ', co.color); putPct(s, 'Opct', co.opacity);
  const g = e.gradientOverlay;
  putFx(s, 'GrFl', 'GrFl', 8); putBool(s, 'enab', g.enabled); putBlend(s, 'Md  ', g.blend); putPct(s, 'Opct', g.opacity);
  s.key('Grad', 'Objc'); s.head('Grdn', 2);
  s.key('Nm  ', 'TEXT'); s.unicode('Custom');
  s.key('Clrs', 'VlLs'); s.u32(2);
  for (const [c, at] of [[g.from, 0], [g.to, 4096]] as const) {
    s.ascii('Objc'); s.head('Clrt', 3); putColour(s, 'Clr ', c); s.enum('Type', 'Clry', 'UsrS'); s.long('Lctn', at);
  }
  putUnit(s, 'Angl', '#Ang', g.angle); s.enum('Type', 'GrdT', g.style === 'radial' ? 'Rdl' : 'Lnr'); putBool(s, 'Rvrs', g.reverse); putPct(s, 'Scl ', g.scale);
  const sa = e.satin;
  putFx(s, 'ChFX', 'ChFX', 8); putBool(s, 'enab', sa.enabled); putBlend(s, 'Md  ', sa.blend); putColour(s, 'Clr ', sa.color); putPct(s, 'Opct', sa.opacity);
  putUnit(s, 'lagl', '#Ang', sa.angle); putUnit(s, 'Dstn', '#Pxl', sa.distance); putUnit(s, 'blur', '#Pxl', sa.size); putBool(s, 'Invr', sa.invert);
  const b = e.bevel;
  putFx(s, 'ebbl', 'ebbl', b.technique ? 16 : 15); putBool(s, 'enab', b.enabled);
  s.enum('bvlS', 'BESl', b.style === 'outer' ? 'OtrB' : b.style === 'emboss' ? 'Embs' : b.style === 'pillow' ? 'PlEb' : b.style === 'stroke' ? 'strokeEmboss' : 'InrB');
  if (b.technique) s.enum('bvlT', 'bvlT', b.technique === 'chiselHard' ? 'PrBL' : 'SfBL');
  s.enum('bvlD', 'BESs', b.down ? 'Out' : 'In  ');
  putUnit(s, 'srgR', '#Prc', b.depth); putUnit(s, 'blur', '#Pxl', b.size); putUnit(s, 'Sftn', '#Pxl', b.soften);
  putUnit(s, 'lagl', '#Ang', b.angle); putUnit(s, 'Lald', '#Ang', b.altitude); putBool(s, 'uglg', b.useGlobal ?? false);
  putColour(s, 'hglC', b.highlight); putPct(s, 'hglO', b.highlightOpacity); putBlend(s, 'hglM', b.highlightBlend);
  putColour(s, 'sdwC', b.shadow); putPct(s, 'sdwO', b.shadowOpacity); putBlend(s, 'sdwM', b.shadowBlend);
}

/** Writes an .asl (version 2, subversion 3): '8BSL', an empty patterns section, the style count, then per style a
 *  block length and two versioned (16) descriptors, padded to 4 bytes: identity ('null': 'Nm  ', 'Idnt') and the style
 *  ('Styl' holding 'Lefx': 'Scl ' 100 percent and the nine effects). readAsl reads it back field for field. */
export function writeAsl(styles: { name: string; effects: LayerEffects }[]): Uint8Array {
  const s = new Sink();
  s.u16(2); s.ascii('8BSL'); s.u16(3); s.u32(0); s.u32(styles.length);
  for (const style of styles) {
    const blk = new Sink();
    blk.u32(16); blk.head('null', 2);
    blk.key('Nm  ', 'TEXT'); blk.unicode(style.name);
    blk.key('Idnt', 'TEXT'); blk.unicode(crypto.randomUUID());
    blk.u32(16); blk.head('Styl', 1);
    blk.key('Lefx', 'Objc'); writeEffects(blk, style.effects);
    const len = blk.bytes.length;
    s.u32(len);
    for (const byte of blk.bytes) s.u8(byte);
    for (let p = (4 - (len % 4)) % 4; p > 0; p -= 1) s.u8(0);
  }
  return new Uint8Array(s.bytes);
}

/** Reads every style of an .asl file. A style that fails to parse is skipped and counted; one bad style never stops the rest. */
export function readAsl(buf: ArrayBuffer): { styles: { name: string; effects: LayerEffects }[]; skipped: number } {
  const r = new Reader(buf);
  const styles: { name: string; effects: LayerEffects }[] = [];
  let skipped = 0;
  r.u16();
  if (r.ascii(4) !== '8BSL') throw new Error('not an .asl styles file');
  r.u16();
  r.skip(r.u32());
  const count = r.u32();
  for (let i = 0; i < count; i++) {
    let len: number;
    try { len = r.u32(); } catch { skipped += count - i; break; }
    const start = r.pos, end = start + len;
    if (end > buf.byteLength) { skipped += count - i; break; }
    try {
      r.u32();
      const head = readDescriptor(r);
      r.u32();
      const style = readDescriptor(r);
      const nm = head.items.get('Nm  ');
      const name = typeof nm === 'string' && nm.trim() ? nm.trim() : `Style ${i + 1}`;
      styles.push({ name, effects: mapEffects(style) });
    } catch { skipped++; }
    r.pos = end + ((4 - (len % 4)) % 4);
    if (r.pos > buf.byteLength) r.pos = buf.byteLength;
  }
  return { styles, skipped };
}
