import type { BlendMode, LayerEffects, RGB } from '../engine/types';
import { defaultEffects } from '../engine/types';
import { Reader, readDescriptor } from './atn';
import type { Desc, Val } from './atn';

/** Photoshop .asl layer style files (DEV_PLAN 32.4 part d). Big-endian: u16 version, '8BSL', u16 subversion, a patterns
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

/** Reads every style of an .asl file. A style that fails to parse is skipped and counted; one bad style never stops the rest. */
export function readAsl(buf: ArrayBuffer): { styles: { name: string; effects: LayerEffects }[]; skipped: number } {
  const r = new Reader(buf);
  const styles: { name: string; effects: LayerEffects }[] = [];
  let skipped = 0;
  r.u16();
  if (r.ascii(4) !== '8BSL') throw new Error('not a Photoshop styles file');
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
