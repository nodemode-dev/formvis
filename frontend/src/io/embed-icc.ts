/** Embedding an ICC profile in the files the browser encodes (sonny's other formats get theirs from the engine).
 *  PNG: an iCCP chunk right after IHDR, the profile zlib-compressed, and any sRGB, iCCP, gAMA or cHRM chunk dropped, as
 *  the PNG specification says they conflict with it. JPEG: an APP2 ICC_PROFILE segment after SOI and any JFIF APP0,
 *  split across segments of at most 65,519 bytes as the ICC specification describes, any existing ICC_PROFILE
 *  segments (browsers write their own) removed. */

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const be32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function embedPng(png: Blob, icc: Uint8Array, name: string): Promise<Blob> {
  const b = new Uint8Array(await png.arrayBuffer());
  if (b.length < 33 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) throw new Error('Not a PNG file.');
  const label = name.replace(/[^\x20-\x7e]/g, '').slice(0, 79) || 'ICC profile';
  const data = new Uint8Array([...Array.from(label).map((c) => c.charCodeAt(0)), 0, 0, ...(await zlib(icc))]);
  const typed = new Uint8Array([0x69, 0x43, 0x43, 0x50, ...data]);
  const chunk = new Uint8Array([...be32(data.length), ...typed, ...be32(crc32(typed))]);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let p = 8;
  while (p + 8 <= b.length) {
    const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0, type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]), end = p + 12 + len;
    if (!['sRGB', 'iCCP', 'gAMA', 'cHRM'].includes(type)) parts.push(b.subarray(p, end));
    if (type === 'IHDR') parts.push(chunk);
    p = end;
  }
  return new Blob(parts as BlobPart[], { type: 'image/png' });
}

export async function embedJpeg(jpeg: Blob, icc: Uint8Array): Promise<Blob> {
  const b = new Uint8Array(await jpeg.arrayBuffer());
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('Not a JPEG file.');
  // The header segments up to the scan, less any ICC_PROFILE ones: browsers' encoders write their own (Chrome an sRGB
  // one), and two profiles in one file leave readers to guess or ignore both.
  const kept: Uint8Array[] = [];
  let p = 2, at = -1;
  while (p + 4 <= b.length && b[p] === 0xff && b[p + 1] !== 0xda) {
    const end = p + 2 + ((b[p + 2] << 8) | b[p + 3]), isIcc = b[p + 1] === 0xe2 && String.fromCharCode(...b.subarray(p + 4, p + 15)) === 'ICC_PROFILE';
    if (!isIcc) kept.push(b.subarray(p, end));
    if (b[p + 1] === 0xe0 && at < 0) at = kept.length;
    p = end;
  }
  const max = 65519, count = Math.ceil(icc.length / max), segments: number[] = [];
  for (let i = 0; i < count; i++) {
    const part = icc.subarray(i * max, (i + 1) * max), len = 2 + 12 + 2 + part.length;
    segments.push(0xff, 0xe2, (len >> 8) & 255, len & 255, ...Array.from('ICC_PROFILE').map((c) => c.charCodeAt(0)), 0, i + 1, count, ...part);
  }
  const head = at < 0 ? 0 : at;
  return new Blob([b.subarray(0, 2), ...kept.slice(0, head), new Uint8Array(segments), ...kept.slice(head), b.subarray(p)] as BlobPart[], { type: 'image/jpeg' });
}
