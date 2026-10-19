import type { DitherKind, PaletteKind } from './sfw-reduce';
import { DITHERS, PALETTES } from './sfw-reduce';

/** Save for Web's settings, its built-in presets and the user's own, kept in this browser between sessions. */
export type SfwFormat = 'jpeg' | 'png24' | 'png8' | 'gif' | 'webp' | 'wbmp';
export interface SfwCfg {
  fmt: SfwFormat; quality: number; colors: number; palette: PaletteKind; dither: DitherKind; ditherAmount: number; transparency: boolean;
  matte: string; progressive: boolean; embedProfile: boolean; interlace: boolean;
}
export interface SfwPreset { id: string; name: string; builtin: boolean; cfg: SfwCfg }

export const SFW_DEFAULT: SfwCfg = { fmt: 'jpeg', quality: 80, colors: 256, palette: 'adaptive', dither: 'diffusion', ditherAmount: 88, transparency: true, matte: '#ffffff', progressive: false, embedProfile: false, interlace: false };

const make = (id: string, name: string, over: Partial<SfwCfg>): SfwPreset => ({ id, name, builtin: true, cfg: { ...SFW_DEFAULT, ...over } });
export const SFW_BUILTIN: SfwPreset[] = [
  make('gif128d', 'GIF 128 Dithered', { fmt: 'gif', colors: 128, dither: 'diffusion', ditherAmount: 100 }),
  make('gif128', 'GIF 128 No Dither', { fmt: 'gif', colors: 128, dither: 'none' }),
  make('gif64', 'GIF 64 No Dither', { fmt: 'gif', colors: 64, dither: 'none' }),
  make('gif32d', 'GIF 32 Dithered', { fmt: 'gif', colors: 32, dither: 'diffusion', ditherAmount: 100 }),
  make('gif32', 'GIF 32 No Dither', { fmt: 'gif', colors: 32, dither: 'none' }),
  make('jpegHigh', 'JPEG High', { fmt: 'jpeg', quality: 60 }),
  make('jpegMedium', 'JPEG Medium', { fmt: 'jpeg', quality: 30 }),
  make('jpegLow', 'JPEG Low', { fmt: 'jpeg', quality: 10 }),
  make('png8d', 'PNG-8 128 Dithered', { fmt: 'png8', colors: 128, dither: 'diffusion', ditherAmount: 100 }),
  make('png24', 'PNG-24', { fmt: 'png24' }),
  make('webpHigh', 'WebP High', { fmt: 'webp', quality: 75 }),
];

const FORMATS: readonly SfwFormat[] = ['jpeg', 'png24', 'png8', 'gif', 'webp', 'wbmp'];
const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** Settings read back from storage or a preset, every field checked and clamped. */
export function cfgFrom(raw: unknown): SfwCfg {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>, d = SFW_DEFAULT;
  return {
    fmt: FORMATS.includes(o.fmt as SfwFormat) ? (o.fmt as SfwFormat) : d.fmt,
    quality: num(o.quality, 0, 100, d.quality), colors: num(o.colors, 2, 256, d.colors),
    palette: PALETTES.some(([k]) => k === o.palette) ? (o.palette as PaletteKind) : d.palette,
    dither: DITHERS.some(([k]) => k === o.dither) ? (o.dither as DitherKind) : d.dither,
    ditherAmount: num(o.ditherAmount, 0, 100, d.ditherAmount),
    transparency: typeof o.transparency === 'boolean' ? o.transparency : d.transparency,
    matte: typeof o.matte === 'string' && /^#[0-9a-f]{6}$/i.test(o.matte) ? o.matte.toLowerCase() : d.matte,
    progressive: o.progressive === true, embedProfile: o.embedProfile === true, interlace: o.interlace === true,
  };
}

const KEY = 'formvis.saveForWeb';
interface Stored { last?: unknown; presets?: Array<{ id?: unknown; name?: unknown; cfg?: unknown }> }
function read(): Stored {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown; return v && typeof v === 'object' ? (v as Stored) : {}; } catch { return {}; }
}

export const loadLast = (): SfwCfg => cfgFrom(read().last);
export function loadUserPresets(): SfwPreset[] {
  const list = read().presets;
  return Array.isArray(list) ? list.flatMap((p) => (typeof p.id === 'string' && typeof p.name === 'string' && p.name ? [{ id: p.id, name: p.name.slice(0, 60), builtin: false, cfg: cfgFrom(p.cfg) }] : [])) : [];
}
export function saveLast(cfg: SfwCfg, presets: readonly SfwPreset[]): void {
  try { localStorage.setItem(KEY, JSON.stringify({ last: cfg, presets: presets.filter((p) => !p.builtin).map((p) => ({ id: p.id, name: p.name, cfg: p.cfg })) })); } catch { /* storage unavailable */ }
}
