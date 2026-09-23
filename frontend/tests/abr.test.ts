import { describe, expect, it } from 'vitest';
import { parseAbr } from '../src/engine/abr';

class W { b: number[] = []; u8(v: number) { this.b.push(v & 255); return this; } u16(v: number) { return this.u8(v >> 8).u8(v); } u32(v: number) { return this.u16(v >>> 16).u16(v & 0xffff); } bytes(a: ArrayLike<number>) { for (let i = 0; i < a.length; i++) this.u8(a[i]); return this; } str(s: string) { for (const c of s) this.u8(c.charCodeAt(0)); return this; } }
const cross = (w: number, h: number): Uint8Array => { const d = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(x - w / 2 + 0.5) < 2 || Math.abs(y - h / 2 + 0.5) < 2) d[y * w + x] = 255; return d; };
const packRows = (d: Uint8Array, w: number, h: number): number[] => { const rows: number[][] = []; for (let y = 0; y < h; y++) { const row = Array.from(d.slice(y * w, y * w + w)), out: number[] = []; for (let i = 0; i < row.length;) { if (row[i] === row[i + 1]) { let n = 1; while (i + n < row.length && row[i + n] === row[i] && n < 128) n++; out.push(257 - n, row[i]); i += n; } else { let n = 1; while (i + n < row.length && row[i + n] !== row[i + n + 1] && n < 128) n++; out.push(n - 1, ...row.slice(i, i + n)); i += n; } } rows.push(out); } const all: number[] = []; for (const r of rows) all.push(r.length >> 8, r.length & 255); for (const r of rows) all.push(...r); return all; };

function v6(sub: number, tips: Array<{ w: number; h: number; data: Uint8Array; packed: boolean }>): ArrayBuffer {
  const samp = new W();
  for (const t of tips) {
    const body = new W().bytes(new Array(sub === 1 ? 47 : 301).fill(7)).u32(0).u32(0).u32(t.h).u32(t.w).u16(8).u8(t.packed ? 1 : 0).bytes(t.packed ? packRows(t.data, t.w, t.h) : t.data);
    samp.u32(body.b.length).bytes(body.b);
    while (samp.b.length % 4) samp.u8(0);
  }
  const f = new W().u16(6).u16(sub).str('8BIM').str('samp').u32(samp.b.length).bytes(samp.b).str('8BIM').str('desc').u32(4).u32(0);
  return new Uint8Array(f.b).buffer;
}

describe('.abr reader', () => {
  it('reads version 6.2 tips, raw and PackBits', () => {
    const a = cross(20, 14), b = cross(9, 9);
    const got = parseAbr(v6(2, [{ w: 20, h: 14, data: a, packed: true }, { w: 9, h: 9, data: b, packed: false }]), 'Set');
    expect(got.map((x) => [x.name, x.tip.w, x.tip.h])).toEqual([['Set 1', 20, 14], ['Set 2', 9, 9]]);
    expect(Array.from(got[0].tip.data)).toEqual(Array.from(a));
    expect(Array.from(got[1].tip.data)).toEqual(Array.from(b));
  });

  it('reads version 6.1, whose header is shorter', () => {
    const got = parseAbr(v6(1, [{ w: 12, h: 10, data: cross(12, 10), packed: true }]));
    expect(got.length).toBe(1);
    expect(Array.from(got[0].tip.data)).toEqual(Array.from(cross(12, 10)));
  });

  it('reads version 2 sampled brushes with their names, skipping computed ones', () => {
    const d = cross(8, 6), name = 'Star';
    const sampled = new W().u32(0).u16(25).u32(name.length);
    for (const c of name) sampled.u16(c.charCodeAt(0));
    sampled.u8(1).u16(0).u16(0).u16(6).u16(8).u32(0).u32(0).u32(6).u32(8).u16(8).u8(0).bytes(d);
    const f = new W().u16(2).u16(2).u16(1).u32(5).bytes([1, 2, 3, 4, 5]).u16(2).u32(sampled.b.length).bytes(sampled.b);
    const got = parseAbr(new Uint8Array(f.b).buffer);
    expect(got.map((x) => [x.name, x.tip.w, x.tip.h, x.spacing])).toEqual([['Star', 8, 6, 0.25]]);
    expect(Array.from(got[0].tip.data)).toEqual(Array.from(d));
  });

  it('refuses files that are not brush files', () => {
    expect(() => parseAbr(new Uint8Array([0, 3, 0, 0]).buffer)).toThrow(/version 3/);
    expect(() => parseAbr(new Uint8Array([0]).buffer)).toThrow(/too short/);
  });
});
