/** A ZIP archive of `files`, stored without compression (images are compressed already), names in UTF-8. */
export async function zipFiles(files: ReadonlyArray<{ name: string; blob: Blob }>): Promise<Blob> {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc32 = (d: Uint8Array): number => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = table[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const enc = new TextEncoder(), parts: BlobPart[] = [], central: BlobPart[] = [];
  let offset = 0, size = 0;
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, time, true); local.setUint16(12, date, true); local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(local.buffer, name, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true); entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true); entry.setUint16(14, date, true); entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true);
    central.push(entry.buffer, name);
    size += 46 + name.length;
    offset += 30 + name.length + data.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/** The files in a ZIP archive (1.51.7, for OpenRaster), by name: stored and deflated entries, read from the central
 *  directory; deflate through the browser's own DecompressionStream. Throws on anything malformed. */
export async function unzip(data: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(data), out = new Map<string, Uint8Array>(), dec = new TextDecoder();
  let end = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('not a ZIP archive');
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  for (let k = 0; k < count; k++) {
    if (at + 46 > data.byteLength || v.getUint32(at, true) !== 0x02014b50) throw new Error('a damaged ZIP directory');
    const method = v.getUint16(at + 10, true), packed = v.getUint32(at + 20, true), nameLen = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), note = v.getUint16(at + 32, true), local = v.getUint32(at + 42, true);
    const name = dec.decode(new Uint8Array(data, at + 46, nameLen));
    at += 46 + nameLen + extra + note;
    if (local + 30 > data.byteLength || v.getUint32(local, true) !== 0x04034b50) throw new Error('a damaged ZIP entry');
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (start + packed > data.byteLength) throw new Error('a truncated ZIP entry');
    const raw = new Uint8Array(data, start, packed);
    if (name.endsWith('/')) continue;
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()));
    else throw new Error(`${name} is packed in a way this reader does not know`);
  }
  return out;
}
