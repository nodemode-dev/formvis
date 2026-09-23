import { describe, expect, it } from 'vitest';
import { addPathResources, pathFromRecords, pathRecords, readPathResources } from '../src/io/psd-paths';
import type { VectorPath } from '../src/engine/paths';

const curve: VectorPath = { subpaths: [
  { closed: true, anchors: [{ x: 20, y: 20, inX: 20, inY: 20, outX: 20, outY: 20 }, { x: 180, y: 20, inX: 180, inY: 20, outX: 180, outY: 20 }, { x: 100, y: 90, inX: 150, inY: 90, outX: 50, outY: 90 }] },
  { closed: false, anchors: [{ x: 10, y: 50, inX: 10, inY: 50, outX: 10, outY: 50 }, { x: 60, y: 70, inX: 60, inY: 70, outX: 60, outY: 70 }] },
] };
const near = (a: VectorPath, b: VectorPath): void => {
  expect(a.subpaths.map((s) => [s.closed, s.anchors.length])).toEqual(b.subpaths.map((s) => [s.closed, s.anchors.length]));
  a.subpaths.forEach((s, i) => s.anchors.forEach((p, j) => { const q = b.subpaths[i].anchors[j]; for (const k of ['x', 'y', 'inX', 'inY', 'outX', 'outY'] as const) expect(Math.abs(p[k] - q[k])).toBeLessThan(1e-3); }));
};
// A minimal PSD: signature, version 1, reserved, 3 channels, 100 x 200, 8 bits, RGB; empty colour mode data and image resources.
const minimal = (): ArrayBuffer => new Uint8Array([0x38, 0x42, 0x50, 0x53, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 100, 0, 0, 0, 200, 0, 8, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 9, 9]).buffer;

describe('paths in PSD', () => {
  it('turns a path into records and back, curves and open subpaths included', () => {
    near(pathFromRecords(pathRecords(curve, 200, 100), 200, 100), curve);
  });

  it('adds saved paths and the Work Path to a file and reads them back, names padded either way', () => {
    const set = { list: [{ id: 'a', name: 'Outline', work: false, path: curve }, { id: 'b', name: 'Odd', work: false, path: curve }, { id: 'w', name: 'Work Path', work: true, path: curve }], active: null };
    const out = addPathResources(minimal(), set, 200, 100), back = readPathResources(out, 200, 100);
    expect(back.map((p) => [p.name, p.work])).toEqual([['Outline', false], ['Odd', false], ['Work Path', true]]);
    near(back[1].path, curve);
    // what followed the resources section is still there, after the new blocks
    expect(Array.from(new Uint8Array(out).slice(-2))).toEqual([9, 9]);
  });

  it('leaves a file with no paths as it was, and refuses what is not a Photoshop file', () => {
    const b = minimal();
    expect(addPathResources(b, { list: [], active: null }, 200, 100)).toBe(b);
    expect(() => readPathResources(new Uint8Array(40).buffer, 1, 1)).toThrow(/Photoshop/);
  });
});
