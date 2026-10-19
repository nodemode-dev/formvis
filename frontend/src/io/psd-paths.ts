import type { NamedPath, PathOp, PathSet, VectorPath } from '../engine/paths';

/** The Paths panel in PSD files, which ag-psd does not handle. PSD files keep saved paths as image resources 2000 to
 *  2997 (named) and 1025 (the Work Path), each a run of 26-byte path records: a fill rule record, then for each
 *  subpath a length record followed by its knots, every point as y then x in 8.24 fixed point, a fraction of the
 *  document's height or width. The records are the ones ag-psd reads for shape outlines (`vmsk`), so a knot's three
 *  points are the control before, the anchor, and the control after. Writing adds the resource blocks to ag-psd's file;
 *  reading picks them out of a file before ag-psd parses it. */

const WORK_ID = 1025, FIRST = 2000, LAST = 2997;
/** PSD path operations by number, as ag-psd lists them. */
const OPS: readonly PathOp[] = ['exclude', 'combine', 'subtract', 'intersect'];

function fixed(v: number): number[] {
  const n = Math.round(Math.max(-127, Math.min(127, v)) * (1 << 24)) | 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
const u16 = (v: number): number[] => [(v >> 8) & 255, v & 255], u32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

/** A path as PSD path records, coordinates as fractions of `w` and `h`. */
export function pathRecords(vp: VectorPath, w: number, h: number): Uint8Array {
  const out: number[] = [...u16(6), ...new Array(24).fill(0), ...u16(8), ...new Array(24).fill(0)];
  for (const sp of vp.subpaths) {
    if (!sp.anchors.length) continue;
    // length record: kind, knot count, the operation (PSD numbers exclude 0, combine 1, subtract 2, intersect 3),
    // non-zero fill (2), then padding
    out.push(...u16(sp.closed ? 0 : 3), ...u16(sp.anchors.length), ...u16(OPS.indexOf(sp.op ?? 'combine')), ...u16(2), ...new Array(18).fill(0));
    for (const a of sp.anchors) {
      const cornered = a.inX === a.x && a.inY === a.y && a.outX === a.x && a.outY === a.y;
      const linked = !cornered && Math.abs((a.outX - a.x) * (a.inY - a.y) - (a.outY - a.y) * (a.inX - a.x)) < 1e-6;
      out.push(...u16(sp.closed ? (linked ? 1 : 2) : linked ? 4 : 5), ...fixed(a.inY / h), ...fixed(a.inX / w), ...fixed(a.y / h), ...fixed(a.x / w), ...fixed(a.outY / h), ...fixed(a.outX / w));
    }
  }
  return new Uint8Array(out);
}

/** Path records back into a path, coordinates in pixels of `w` by `h`. */
export function pathFromRecords(b: Uint8Array, w: number, h: number): VectorPath {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), f = (o: number): number => dv.getInt32(o) / (1 << 24);
  const vp: VectorPath = { subpaths: [] };
  for (let o = 0; o + 26 <= b.length; o += 26) {
    const sel = dv.getUint16(o);
    if (sel === 0 || sel === 3) {
      const op = OPS[dv.getInt16(o + 4)];
      vp.subpaths.push({ closed: sel === 0, anchors: [], ...(op && op !== 'combine' ? { op } : {}) });
    }
    else if (sel === 1 || sel === 2 || sel === 4 || sel === 5) {
      const sp = vp.subpaths[vp.subpaths.length - 1];
      if (!sp) continue;
      sp.anchors.push({ inY: f(o + 2) * h, inX: f(o + 6) * w, y: f(o + 10) * h, x: f(o + 14) * w, outY: f(o + 18) * h, outX: f(o + 22) * w });
    }
  }
  vp.subpaths = vp.subpaths.filter((sp) => sp.anchors.length);
  return vp;
}

/** Image resource blocks: 8BIM, the id, an even-padded Pascal name, the size, the data padded to even. */
export function block(id: number, name: string, data: Uint8Array): number[] {
  const nm = Array.from(new TextEncoder().encode(name)).slice(0, 255), pascal = [nm.length, ...nm];
  if (pascal.length % 2) pascal.push(0);
  const body = Array.from(data);
  if (body.length % 2) body.push(0);
  return [0x38, 0x42, 0x49, 0x4d, ...u16(id), ...pascal, ...u32(data.length), ...body];
}

/** Where the image resources section's length sits in a PSD or PSB (after the header and colour mode data). */
function resourcesAt(b: Uint8Array): number {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0) !== 0x38425053) throw new Error('Not a PSD file.');
  return 26 + 4 + dv.getUint32(26);
}

/** A PSD or PSB with the Paths panel's paths added as saved paths (named) and the Work Path. */
export function addPathResources(psd: ArrayBuffer, set: PathSet | null, w: number, h: number): ArrayBuffer {
  const list = (set?.list ?? []).filter((p) => p.path.subpaths.some((sp) => sp.anchors.length));
  if (!list.length) return psd;
  const b = new Uint8Array(psd), at = resourcesAt(b), dv = new DataView(psd), len = dv.getUint32(at);
  const extra: number[] = [];
  let id = FIRST;
  for (const p of list) {
    if (p.work) extra.push(...block(WORK_ID, 'Work Path', pathRecords(p.path, w, h)));
    else if (id <= LAST) extra.push(...block(id++, p.name, pathRecords(p.path, w, h)));
  }
  const out = new Uint8Array(b.length + extra.length);
  out.set(b.subarray(0, at + 4 + len), 0);
  out.set(extra, at + 4 + len);
  out.set(b.subarray(at + 4 + len), at + 4 + len + extra.length);
  new DataView(out.buffer).setUint32(at, len + extra.length);
  return out.buffer;
}

/** A PSD or PSB with the document's ICC profile added as image resource 1039, which readers use to tag the pixels. */
export function addIccResource(psd: ArrayBuffer, icc: Uint8Array | null): ArrayBuffer {
  if (!icc?.length || icc.length > 1_000_000) return psd;
  const b = new Uint8Array(psd), at = resourcesAt(b), len = new DataView(psd).getUint32(at), head = [0x38, 0x42, 0x49, 0x4d, ...u16(1039), 0, 0, ...u32(icc.length)];
  const extra = new Uint8Array(head.length + icc.length + (icc.length % 2));
  extra.set(head, 0);
  extra.set(icc, head.length);
  const out = new Uint8Array(b.length + extra.length);
  out.set(b.subarray(0, at + 4 + len), 0);
  out.set(extra, at + 4 + len);
  out.set(b.subarray(at + 4 + len), at + 4 + len + extra.length);
  new DataView(out.buffer).setUint32(at, len + extra.length);
  return out.buffer;
}

/** A PSD or PSB with ready-made image resource blocks added at the end of the resources section. */
export function addResourceBytes(psd: ArrayBuffer, extra: number[]): ArrayBuffer {
  if (!extra.length) return psd;
  const b = new Uint8Array(psd), at = resourcesAt(b), len = new DataView(psd).getUint32(at);
  const out = new Uint8Array(b.length + extra.length);
  out.set(b.subarray(0, at + 4 + len), 0);
  out.set(extra, at + 4 + len);
  out.set(b.subarray(at + 4 + len), at + 4 + len + extra.length);
  new DataView(out.buffer).setUint32(at, len + extra.length);
  return out.buffer;
}

/** The saved paths and Work Path in a PSD or PSB, in pixels of `w` by `h`; empty when there are none. */
export function readPathResources(psd: ArrayBuffer, w: number, h: number): NamedPath[] {
  const b = new Uint8Array(psd), dv = new DataView(psd), at = resourcesAt(b), end = at + 4 + dv.getUint32(at), out: NamedPath[] = [];
  let o = at + 4;
  while (o + 12 <= end && dv.getUint32(o) === 0x3842494d) {
    const id = dv.getUint16(o + 4), nlen = b[o + 6], name = new TextDecoder().decode(b.subarray(o + 7, o + 7 + nlen));
    let p = o + 6 + 1 + nlen;
    if ((1 + nlen) % 2) p += 1;
    const size = dv.getUint32(p), data = b.subarray(p + 4, p + 4 + size);
    if (id === WORK_ID || (id >= FIRST && id <= LAST)) {
      const path = pathFromRecords(data, w, h);
      if (path.subpaths.length) out.push({ id: `psd-path-${id}`, name: id === WORK_ID ? 'Work Path' : name || `Path ${out.length + 1}`, path, work: id === WORK_ID });
    }
    o = p + 4 + size + (size % 2);
  }
  return out;
}

/** Every image resource block of a PSD or PSB by id, the data as stored; a repeated id keeps its first block. */
export function resourceBlocks(psd: ArrayBuffer): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  try {
    const b = new Uint8Array(psd), dv = new DataView(psd), at = resourcesAt(b), end = Math.min(b.length, at + 4 + dv.getUint32(at));
    let o = at + 4;
    while (o + 12 <= end && dv.getUint32(o) === 0x3842494d) {
      const id = dv.getUint16(o + 4), nlen = b[o + 6];
      const p = o + 6 + 1 + nlen + ((1 + nlen) % 2), size = dv.getUint32(p);
      if (p + 4 + size > end) break;
      if (!out.has(id)) out.set(id, b.subarray(p + 4, p + 4 + size));
      o = p + 4 + size + (size % 2);
    }
  } catch { /* a header that is not one */ }
  return out;
}

/** The name stored in the clipping path resource (2999), a Pascal string; null when the file has none. */
export function clippingPathName(blocks: Map<number, Uint8Array>): string | null {
  const d = blocks.get(2999);
  if (!d || !d.length || d[0] + 1 > d.length) return null;
  const name = new TextDecoder().decode(d.subarray(1, 1 + d[0]));
  return name || null;
}
