import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AfArchive, AfError, crc32, isAfBytes, parseGraph, readAfModel, typeTag, child, children, field } from '../src/io/af-read';

const FX = new URL('../../e2e/fixtures/af/', import.meta.url);
const load = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(n, FX)));
const pngSize = async (b: Uint8Array) => { const v = new DataView(b.buffer, b.byteOffset); return { width: v.getUint32(16), height: v.getUint32(20), rgba: new Uint8ClampedArray(v.getUint32(16) * v.getUint32(20) * 4) }; };

describe('the container', () => {
  it('checks the magic and finds doc.dat in every fixture', () => {
    for (const n of ['exposure.af', 'lf_gauss10.af', 'shp_arrow.af', 'raster_test.afdesign', 'layer_test.afdesign', 'layer_mode.afdesign']) {
      const b = load(n);
      expect(isAfBytes(b)).toBe(true);
      const a = new AfArchive(b);
      expect(a.head('doc.dat')).not.toBeNull();
    }
    expect(isAfBytes(new Uint8Array([1, 2, 3, 4]))).toBe(false);
  });

  it('extracts doc.dat with a matching checksum and finds the preview PNG', async () => {
    const a = new AfArchive(load('exposure.af'));
    const plain = await a.extract(a.head('doc.dat')!);
    expect(plain[0]).toBe(0x00);
    expect(plain[1]).toBe(0xff);
    expect(crc32(plain)).toBe(a.head('doc.dat')!.crc);
    const t = a.thumbnail();
    expect(t && t[1] === 0x50).toBe(true);
  });

  it('reads the older zlib container of a 1.x document', async () => {
    const a = new AfArchive(load('raster_test.afdesign'));
    const e = a.head('doc.dat')!;
    expect(e.comp & 3).toBe(1);
    expect((await a.extract(e)).length).toBe(e.size);
  });

  it('rejects a damaged checksum and a lying size', async () => {
    const b = load('exposure.af').slice();
    const a = new AfArchive(b);
    const e = { ...a.head('doc.dat')! };
    await expect(a.extract({ ...e, crc: e.crc ^ 1 })).rejects.toBeInstanceOf(AfError);
    await expect(a.extract({ ...e, size: 2 ** 40 })).rejects.toBeInstanceOf(AfError);
    await expect(a.extract({ ...e, offset: b.length + 10 })).rejects.toBeInstanceOf(AfError);
    await expect(a.extract({ ...e, csize: b.length * 2 })).rejects.toBeInstanceOf(AfError);
  });

  it('never throws anything but AfError on truncated files', () => {
    const b = load('layer_mode.afdesign');
    for (const cut of [3, 5, 12, 20, 40, 100, b.length - 40, b.length - 1]) {
      try { new AfArchive(b.slice(0, cut)); } catch (e) { expect(e).toBeInstanceOf(AfError); }
    }
  });
});

describe('the object graph', () => {
  it('parses doc.dat into the document tree', async () => {
    const a = new AfArchive(load('exposure.af'));
    const g = parseGraph(await a.extract(a.head('doc.dat')!));
    const doc = child(g, g.nodes[0], 'DocR')!;
    expect(doc).not.toBeNull();
    const spread = children(g, doc, 'Chld')[0];
    expect(field(doc, 'DfSz')).toEqual([512, 512]);
    const names = children(g, spread, 'Chld').map((n) => `${typeTag(n)}:${field(n, 'Desc') ?? ''}`);
    expect(names.length).toBe(2);
    expect(names.some((n) => n.startsWith('ExRA'))).toBe(true);
  });

  it('refuses hostile graphs instead of allocating', () => {
    const head = [0x00, 0xff, 0x4b, 0x53, 1, 0, 0x73, 0x72, 0x65, 0x50, 0, 0];
    const bool = [...head, 0x29 | 0x80, 0x31, 0x32, 0x33, 0x34, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0];
    expect(() => parseGraph(new Uint8Array(bool))).toThrow(AfError);
    const arr = [...head, 0x03 | 0x80, 0x31, 0x32, 0x33, 0x34, 0xff, 0xff, 0xff, 0x7f, 0];
    expect(() => parseGraph(new Uint8Array(arr))).toThrow(AfError);
    let deep: number[] = [...head];
    for (let i = 0; i < 300; i++) deep = deep.concat([0x30, 0x31, 0x32, 0x33, 0x34]);
    expect(() => parseGraph(new Uint8Array(deep))).toThrow(AfError);
    expect(() => parseGraph(new Uint8Array(head))).toThrow(AfError);
    expect(() => parseGraph(new Uint8Array([1, 2, 3]))).toThrow(AfError);
    const link = [...head, 0x31, 0x32, 0x33, 0x34, 2, 9, 0, 0, 0, 0];
    expect(() => parseGraph(new Uint8Array(link))).toThrow(AfError);
  });
});

describe('the layer model', () => {
  it('reads a pixel layer inside a group, with its place and size', async () => {
    const m = await readAfModel(load('raster_test.afdesign'));
    expect(m.width).toBe(180);
    expect(m.rasterCount).toBe(1);
    expect(m.layers.length).toBe(1);
    expect(m.layers[0].kind).toBe('group');
    const px = m.layers[0].children![0];
    expect(px.kind).toBe('raster');
    expect(px.bitmap!.width).toBe(180);
    expect(px.bitmap!.rgba.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    expect(px.map.map((v) => Math.abs(v))).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it('keeps group names, blend modes and isolation', async () => {
    const m = await readAfModel(load('layer_mode.afdesign'));
    const by = (n: string) => m.layers.find((l) => l.name === n)!;
    expect(by('Passthrough').isolated).toBe(false);
    expect(by('Normal').isolated).toBe(true);
    expect(by('Multiply').blend).toEqual({ id: 2, ver: 0 });
    expect(by('Darken Colour').blend).toEqual({ id: 2, ver: 1 });
    expect(m.layers.length).toBeGreaterThan(20);
    expect((await readAfModel(load('layer_test.afdesign'))).layers.map((l) => l.name).slice(0, 3)).toEqual(['Layer1', 'Layer2', 'Layer3']);
  });

  it('reads a source-backed image layer when given an image decoder, and lists what it leaves out', async () => {
    const m = await readAfModel(load('shp_arrow.af'), pngSize);
    expect(m.rasterCount).toBe(1);
    expect(m.layers[0].name).toBe('Image.png');
    expect(m.layers[0].bitmap!.width).toBe(512);
    expect(m.leftOut).toEqual([{ name: 'Shape', what: 'a vector shape' }]);
  });

  it('leaves a source-backed layer out without a decoder, and reports an adjustment', async () => {
    const m = await readAfModel(load('exposure.af'));
    expect(m.rasterCount).toBe(0);
    expect(m.leftOut.map((l) => l.what)).toContain('an Exposure adjustment');
  });

  it('reports a live filter on a read layer', async () => {
    const m = await readAfModel(load('lf_gauss10.af'), pngSize);
    expect(m.rasterCount).toBe(1);
    expect(m.leftOut[0].what).toMatch(/live filter/);
  });

  it('turns every kind of damage into an AfError', async () => {
    const b = load('raster_test.afdesign');
    for (let at = 0; at < b.length; at += 97) {
      const c = b.slice();
      c[at] ^= 0xff;
      await readAfModel(c).then(() => undefined, (e) => expect(e).toBeInstanceOf(AfError));
    }
  });
});
