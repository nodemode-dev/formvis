import { VERSION } from '../version';

/** The AI label (1.51.8, the capability plan): IPTC's Digital Source Type, the machine-readable marking of AI content,
 *  in an XMP packet: "trainedAlgorithmicMedia" for a picture made with AI, "compositeWithTrainedAlgorithmicMedia" for
 *  one edited with it. Written into PNG (an iTXt chunk), JPEG (an APP1 segment) and WebP (an XMP chunk), each from its
 *  format's specification. */
export type AiLabel = 'generated' | 'edited';
export const SOURCE: Record<AiLabel, string> = { generated: 'trainedAlgorithmicMedia', edited: 'compositeWithTrainedAlgorithmicMedia' };

export function xmpPacket(kind: AiLabel): string {
  return '<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"'
    + ` Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/${SOURCE[kind]}" xmp:CreatorTool="formvis ${VERSION}"/>`
    + '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
}

const crcTable = ((): Uint32Array => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (d: Uint8Array): number => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = crcTable[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const cat = (...parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const enc = new TextEncoder();

/** PNG: an iTXt chunk "XML:com.adobe.xmp", uncompressed, right after IHDR. */
export function labelPng(png: Uint8Array, kind: AiLabel): Uint8Array {
  if (png.length < 33 || png[12] !== 0x49 || png[15] !== 0x52) throw new Error('not a PNG');
  const data = cat(enc.encode('XML:com.adobe.xmp'), new Uint8Array([0, 0, 0, 0, 0]), enc.encode(xmpPacket(kind))), type = enc.encode('iTXt');
  const chunk = new Uint8Array(12 + data.length), v = new DataView(chunk.buffer);
  v.setUint32(0, data.length); chunk.set(type, 4); chunk.set(data, 8); v.setUint32(8 + data.length, crc32(cat(type, data)));
  const afterIhdr = 8 + 12 + new DataView(png.buffer, png.byteOffset).getUint32(8);
  return cat(png.subarray(0, afterIhdr), chunk, png.subarray(afterIhdr));
}

/** JPEG: an APP1 segment with the XMP namespace, right after SOI. */
export function labelJpeg(jpg: Uint8Array, kind: AiLabel): Uint8Array {
  if (jpg[0] !== 0xff || jpg[1] !== 0xd8) throw new Error('not a JPEG');
  const body = cat(enc.encode('http://ns.adobe.com/xap/1.0/\0'), enc.encode(xmpPacket(kind))), seg = new Uint8Array(4 + body.length);
  seg[0] = 0xff; seg[1] = 0xe1; new DataView(seg.buffer).setUint16(2, body.length + 2); seg.set(body, 4);
  return cat(jpg.subarray(0, 2), seg, jpg.subarray(2));
}

/** WebP: an "XMP " chunk, the file made extended (VP8X, with its XMP flag) when it was simple. */
export function labelWebp(webp: Uint8Array, kind: AiLabel): Uint8Array {
  const tag = (at: number): string => String.fromCharCode(webp[at], webp[at + 1], webp[at + 2], webp[at + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('not a WebP');
  const chunk = (fourcc: string, data: Uint8Array): Uint8Array => { const c = new Uint8Array(8 + data.length + (data.length & 1)); c.set(enc.encode(fourcc), 0); new DataView(c.buffer).setUint32(4, data.length, true); c.set(data, 8); return c; };
  let body = webp.subarray(12);
  const first = tag(12);
  if (first === 'VP8X') { const b = new Uint8Array(body); b[8] |= 0x04; body = b; }
  else {
    let w = 0, h = 0, alpha = false;
    if (first === 'VP8L') { const b = webp.subarray(21, 25), bits = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24); w = (bits & 0x3fff) + 1; h = ((bits >>> 14) & 0x3fff) + 1; alpha = ((bits >>> 28) & 1) === 1; }
    else if (first === 'VP8 ') { const v = new DataView(webp.buffer, webp.byteOffset); w = v.getUint16(26, true) & 0x3fff; h = v.getUint16(28, true) & 0x3fff; }
    else throw new Error('an unknown WebP layout');
    const x = new Uint8Array(10);
    x[0] = 0x04 | (alpha ? 0x10 : 0);
    x[4] = (w - 1) & 0xff; x[5] = ((w - 1) >> 8) & 0xff; x[6] = ((w - 1) >> 16) & 0xff;
    x[7] = (h - 1) & 0xff; x[8] = ((h - 1) >> 8) & 0xff; x[9] = ((h - 1) >> 16) & 0xff;
    body = cat(chunk('VP8X', x), body);
  }
  const all = cat(enc.encode('WEBP'), body, chunk('XMP ', enc.encode(xmpPacket(kind)))), head = new Uint8Array(8);
  head.set(enc.encode('RIFF')); new DataView(head.buffer).setUint32(4, all.length, true);
  return cat(head, all);
}

/** `blob` labelled, for PNG, JPEG and WebP; other formats as they are. */
export async function withAiLabel(blob: Blob, format: string, kind: AiLabel): Promise<Blob> {
  const b = new Uint8Array(await blob.arrayBuffer());
  const out = format === 'png' ? labelPng(b, kind) : format === 'jpg' ? labelJpeg(b, kind) : format === 'webp' ? labelWebp(b, kind) : null;
  return out ? new Blob([new Uint8Array(out)], { type: blob.type }) : blob;
}
