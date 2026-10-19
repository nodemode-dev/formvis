// Fixed colour tables for Indexed Color and the Color Table dialog: the 6 by 6 by 6 cube, System (Mac OS), System (Windows),
// Web (the 216 safe colours) and Uniform (evenly spaced levels of red, green and blue).
import type { RGB } from './types';

const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export const cube = (): RGB[] => { const o: RGB[] = []; for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) o.push({ r: r * 51, g: g * 51, b: b * 51 }); return o; };

/** System (Mac OS): the 6 by 6 by 6 colour cube then 40 greys, an approximation of the classic 8-bit system table. */
export function systemMac(): RGB[] {
  const o = cube();
  for (let i = 0; o.length < 256; i++) { const v = clamp(((i + 1) / 41) * 255); o.push({ r: v, g: v, b: v }); }
  return o;
}

/** System (Windows): the 16 VGA colours, the 6 by 6 by 6 colour cube and 24 greys, an approximation of the Windows 8-bit table. */
export function systemWindows(): RGB[] {
  const vga = [0x000000, 0x800000, 0x008000, 0x808000, 0x000080, 0x800080, 0x008080, 0xc0c0c0, 0x808080, 0xff0000, 0x00ff00, 0xffff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xffffff];
  const o: RGB[] = vga.map((n) => ({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }));
  o.push(...cube());
  for (let i = 0; o.length < 256; i++) { const v = clamp(((i + 1) / 25) * 255); o.push({ r: v, g: v, b: v }); }
  return o;
}

/** Web: the 216 colours whose channels are multiples of 51. */
export const webSafe = (): RGB[] => cube();

/** Uniform: k levels a channel with k cubed at most `max`, evenly spaced. */
export function uniformPalette(max: number): RGB[] {
  const k = Math.max(2, Math.floor(Math.cbrt(Math.max(8, max)) + 1e-9)), o: RGB[] = [];
  for (let r = 0; r < k; r++) for (let g = 0; g < k; g++) for (let b = 0; b < k; b++) o.push({ r: clamp((r * 255) / (k - 1)), g: clamp((g * 255) / (k - 1)), b: clamp((b * 255) / (k - 1)) });
  return o;
}
