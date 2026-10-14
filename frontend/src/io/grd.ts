import type { GradientPreset, GradientStop } from '../engine/gradients';
import type { RGB } from '../engine/types';
import { Reader, readDescriptor } from './atn';
import type { Desc, Val } from './atn';

/** Gradient files: Photoshop .grd (version 5, an ActionDescriptor holding a list of gradients) and GIMP .ggr (text).
 *  Noise gradients have no stop form, so they are counted and skipped. Midpoints are ignored. */

const newId = (): string => `grd-${Math.random().toString(36).slice(2, 10)}`;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const byte = (v: number): number => Math.round(clamp(v, 0, 255));

const isDesc = (v: Val | undefined): v is Desc => !!v && typeof v === 'object' && !Array.isArray(v) && 'items' in v;
const num = (v: Val | undefined, fallback = 0): number => {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && !Array.isArray(v) && 'kind' in v && v.kind === 'unit') return v.value;
  return fallback;
};
const enumValue = (v: Val | undefined): string => (v && typeof v === 'object' && !Array.isArray(v) && 'kind' in v && v.kind === 'enum' ? v.value.trim() : '');
const listOf = (v: Val | undefined): Desc[] => (Array.isArray(v) ? v.filter(isDesc) : []);

function hsbToRgb(h: number, s: number, v: number): RGB {
  const hh = ((h % 360) + 360) % 360 / 60, c = v * s, x = c * (1 - Math.abs((hh % 2) - 1)), m = v - c;
  const i = Math.floor(hh);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i % 6] ?? [0, 0, 0];
  return { r: byte((r + m) * 255), g: byte((g + m) * 255), b: byte((b + m) * 255) };
}

function colourOf(d: Desc | undefined): RGB {
  if (!d) return { r: 0, g: 0, b: 0 };
  const g = (k: string): number => num(d.items.get(k));
  switch (d.classId || d.cls) {   // the class ID names the colour model; the display name is usually empty
    case 'RGBC': return { r: byte(g('Rd  ')), g: byte(g('Grn ')), b: byte(g('Bl  ')) };
    case 'HSBC': return hsbToRgb(g('H   '), clamp(g('Strt') / 100, 0, 1), clamp(g('Brgh') / 100, 0, 1));
    case 'CMYC': {
      const k = 1 - clamp(g('Blck') / 100, 0, 1);
      return { r: byte(255 * (1 - clamp(g('Cyn ') / 100, 0, 1)) * k), g: byte(255 * (1 - clamp(g('Mgnt') / 100, 0, 1)) * k), b: byte(255 * (1 - clamp(g('Ylw ') / 100, 0, 1)) * k) };
    }
    case 'Grsc': { const v = byte(255 * (1 - clamp(g('Gry ') / 100, 0, 1))); return { r: v, g: v, b: v }; }
    default: { const v = d.items.has('Bk  ') ? byte(g('Bk  ')) : 128; return { r: v, g: v, b: v }; }
  }
}

interface ColStop { at: number; color: RGB | 'fg' | 'bg' }
interface TrnStop { at: number; alpha: number }

function lerpColour(list: ColStop[], at: number): RGB | 'fg' | 'bg' {
  let lo = list[0], hi = list[list.length - 1];
  if (!lo || !hi) return { r: 0, g: 0, b: 0 };
  for (const s of list) { if (s.at <= at) lo = s; }
  for (let i = list.length - 1; i >= 0; i--) { const s = list[i]; if (s && s.at >= at) hi = s; }
  if (lo.at === hi.at || at <= lo.at) return lo.color;
  if (at >= hi.at) return hi.color;
  if (typeof lo.color === 'string' || typeof hi.color === 'string') return at - lo.at < hi.at - at ? lo.color : hi.color;
  const t = (at - lo.at) / (hi.at - lo.at);
  return { r: byte(lo.color.r + (hi.color.r - lo.color.r) * t), g: byte(lo.color.g + (hi.color.g - lo.color.g) * t), b: byte(lo.color.b + (hi.color.b - lo.color.b) * t) };
}

function lerpAlpha(list: TrnStop[], at: number): number {
  let lo = list[0], hi = list[list.length - 1];
  if (!lo || !hi) return 1;
  for (const s of list) { if (s.at <= at) lo = s; }
  for (let i = list.length - 1; i >= 0; i--) { const s = list[i]; if (s && s.at >= at) hi = s; }
  if (lo.at === hi.at || at <= lo.at) return lo.alpha;
  if (at >= hi.at) return hi.alpha;
  return lo.alpha + (hi.alpha - lo.alpha) * ((at - lo.at) / (hi.at - lo.at));
}

function gradientFrom(g: Desc): GradientPreset | null {
  const name = g.items.get('Nm  ');
  const cols: ColStop[] = listOf(g.items.get('Clrs')).map((c) => {
    const type = enumValue(c.items.get('Type'));
    const clr = c.items.get('Clr ');
    const color: RGB | 'fg' | 'bg' = type === 'FrgC' ? 'fg' : type === 'BckC' ? 'bg' : colourOf(isDesc(clr) ? clr : undefined);
    return { at: clamp(num(c.items.get('Lctn')) / 4096, 0, 1), color };
  }).sort((a, b) => a.at - b.at);
  const trns: TrnStop[] = listOf(g.items.get('Trns')).map((t) => ({ at: clamp(num(t.items.get('Lctn')) / 4096, 0, 1), alpha: clamp(num(t.items.get('Opct'), 100) / 100, 0, 1) })).sort((a, b) => a.at - b.at);
  if (!cols.length) return null;
  const locations = [...new Set([...cols.map((c) => c.at), ...trns.map((t) => t.at)])].sort((a, b) => a - b);
  const stops: GradientStop[] = locations.map((at) => ({ at, color: lerpColour(cols, at), alpha: trns.length ? lerpAlpha(trns, at) : 1 }));
  return { id: newId(), label: typeof name === 'string' && name ? name : 'Gradient', stops };
}

/** Reads a Photoshop .grd (version 5). `skipped` counts the noise gradients, which have no stop form. */
export function readGrd(buf: ArrayBuffer): { gradients: GradientPreset[]; skipped: number } {
  const r = new Reader(buf);
  if (buf.byteLength < 12 || r.ascii(4) !== '8BGR') throw new Error('Not a Photoshop gradient file.');
  const version = r.u16();
  if (version !== 5) throw new Error(`Gradient file version ${version} is not supported (only version 5, Photoshop CS and later).`);
  r.u32();
  const root = readDescriptor(r);
  const gradients: GradientPreset[] = [];
  let skipped = 0;
  for (const item of listOf(root.items.get('GrdL'))) {
    const g = item.items.get('Grad');
    if (!isDesc(g)) continue;
    if (enumValue(g.items.get('GrdF')) === 'ClNs') { skipped += 1; continue; }
    const p = gradientFrom(g);
    if (p) gradients.push(p);
  }
  return { gradients, skipped };
}

/** Reads a GIMP .ggr: each segment gives a stop at its left and its right edge. */
export function readGgr(text: string): GradientPreset[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines[0] !== 'GIMP Gradient') throw new Error('Not a GIMP gradient file.');
  let i = 1;
  let label = 'Gradient';
  const nm = lines[i];
  if (nm && nm.startsWith('Name:')) { label = nm.slice(5).trim() || label; i += 1; }
  const count = Number(lines[i]);
  if (!Number.isFinite(count)) throw new Error('The gradient has no segment count.');
  i += 1;
  const stops: GradientStop[] = [];
  const push = (at: number, r: number, g: number, b: number, a: number): void => {
    const color: RGB = { r: byte(r * 255), g: byte(g * 255), b: byte(b * 255) };
    const alpha = clamp(a, 0, 1);
    const last = stops[stops.length - 1];
    const c = last?.color;
    if (last && typeof c === 'object' && last.at === at && c.r === color.r && c.g === color.g && c.b === color.b && last.alpha === alpha) return;
    stops.push({ at: clamp(at, 0, 1), color, alpha });
  };
  for (let n = 0; n < count && i < lines.length; n++, i++) {
    const v = (lines[i] ?? '').split(/\s+/).map(Number);
    if (v.length < 11 || v.some((x) => !Number.isFinite(x))) throw new Error('A gradient segment is malformed.');
    push(v[0] ?? 0, v[3] ?? 0, v[4] ?? 0, v[5] ?? 0, v[6] ?? 1);
    push(v[2] ?? 1, v[7] ?? 0, v[8] ?? 0, v[9] ?? 0, v[10] ?? 1);
  }
  if (!stops.length) throw new Error('The gradient has no segments.');
  return [{ id: newId(), label, stops }];
}
