import { jpegQuality } from './jpeg-quality';
import { cleanMeta, metaWritable, MAX_EXIF_BYTES, MAX_XMP_RAW_CHARS, type CameraData, type DocMeta } from '../engine/doc-meta';
import { crc32 } from './embed-icc';
import { SOURCE, type AiLabel } from './ai-label';
import { VERSION } from '../version';
import { cameraFromTiff, exifBlockOf, exifForTiff, exposureText, isoOfExifDate, rationalOf, roundText } from './exif';

/** File Info as standard XMP (DEV_PLAN 29.2). The packet carries Dublin Core (dc:title, dc:creator, dc:description,
 *  dc:subject, dc:rights), xmp:Rating, xmp:CreateDate and ModifyDate, xmpRights:Marked and WebStatement,
 *  the AuthorsPosition and CaptionWriter properties, and the camera's record as tiff, exif and aux properties. It is written
 *  into the files formvis encodes (a PNG iTXt chunk, a JPEG APP1 segment, a WebP XMP chunk, a TIFF tag 700) and read back
 *  from the same places, so a round trip keeps the fields. */

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', DC = 'http://purl.org/dc/elements/1.1/', XMP = 'http://ns.adobe.com/xap/1.0/', RIGHTS = 'http://ns.adobe.com/xap/1.0/rights/',
  PS = 'http://ns.adobe.com/photoshop/1.0/', TIFF = 'http://ns.adobe.com/tiff/1.0/', EXIF = 'http://ns.adobe.com/exif/1.0/', AUX = 'http://ns.adobe.com/exif/1.0/aux/', XML = 'http://www.w3.org/XML/1998/namespace', FV = 'https://formvis.app/ns/fileinfo/1.0/';
const KEYWORD = 'XML:com.adobe.xmp', JPEG_HEAD = 'http://ns.adobe.com/xap/1.0/\u0000';
const READ_LIMIT = 64 * 1024 * 1024, JPEG_READ = 8 * 1024 * 1024;

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const at = (b: Uint8Array, p: number, s: string): boolean => p >= 0 && p + s.length <= b.length && s.split('').every((c, i) => b[p + i] === c.charCodeAt(0));
const u32be = (b: Uint8Array, p: number): number => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
const u32le = (b: Uint8Array, p: number): number => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
const be32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const le32 = (v: number): number[] => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
const join = (parts: Array<Uint8Array | number[]>): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

const fromB64 = (s: string): Uint8Array | null => {
  try { const t = atob(s), a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; } catch { return null; }
};
const toB64 = (a: Uint8Array): string => { let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); };

/** A copy of an Exif block with its Orientation tag set to 1: the pixels are turned upright when the picture opens. */
function uprightExif(block: Uint8Array): Uint8Array {
  const out = block.slice();
  try {
    const le = out[0] === 0x49, dv = new DataView(out.buffer), ifd = dv.getUint32(4, le), n = Math.min(dv.getUint16(ifd, le), 500);
    for (let i = 0; i < n; i++) { const o = ifd + 2 + i * 12; if (dv.getUint16(o, le) === 274) dv.setUint16(o + 8, 1, le); }
  } catch { /* left as it was */ }
  return out;
}

const esc = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The XMP packet for `m`: CreateDate is the document's created date (else now) and ModifyDate is `now`. */
export function buildXmp(m: DocMeta, now = new Date(), ai?: AiLabel): string {
  const alt = (tag: string, v: string): string => `<${tag}><rdf:Alt><rdf:li xml:lang="x-default">${esc(v)}</rdf:li></rdf:Alt></${tag}>`;
  const list = (tag: string, kind: 'Seq' | 'Bag', vs: readonly string[]): string => `<${tag}><rdf:${kind}>${vs.map((v) => `<rdf:li>${esc(v)}</rdf:li>`).join('')}</rdf:${kind}></${tag}>`;
  const simple = (tag: string, v: string | undefined): string => (v ? `<${tag}>${esc(v)}</${tag}>` : '');
  const c: CameraData = m.camera ?? {};
  const custom = Object.entries(m.custom ?? {});
  const body = [
    m.title ? alt('dc:title', m.title) : '',
    m.author ? list('dc:creator', 'Seq', [m.author]) : '',
    m.description ? alt('dc:description', m.description) : '',
    m.keywords?.length ? list('dc:subject', 'Bag', m.keywords) : '',
    m.notice ? alt('dc:rights', m.notice) : '',
    m.rating ? `<xmp:Rating>${m.rating}</xmp:Rating>` : '',
    `<xmp:CreatorTool>formvis ${VERSION}</xmp:CreatorTool>`,
    ai ? `<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/${SOURCE[ai]}</Iptc4xmpExt:DigitalSourceType>` : '',
    `<xmp:CreateDate>${esc(m.created ?? now.toISOString())}</xmp:CreateDate>`,
    `<xmp:ModifyDate>${esc(now.toISOString())}</xmp:ModifyDate>`,
    m.copyright === 'copyrighted' ? '<xmpRights:Marked>True</xmpRights:Marked>' : m.copyright === 'public' ? '<xmpRights:Marked>False</xmpRights:Marked>' : '',
    simple('xmpRights:WebStatement', m.url),
    simple('photoshop:AuthorsPosition', m.authorTitle),
    simple('photoshop:CaptionWriter', m.descriptionWriter),
    simple('tiff:Make', c.make), simple('tiff:Model', c.model), simple('aux:Lens', c.lens),
    simple('exif:ExposureTime', c.exposure), simple('exif:FNumber', c.aperture), c.iso ? list('exif:ISOSpeedRatings', 'Seq', [c.iso]) : '',
    simple('exif:FocalLength', c.focalLength), simple('exif:DateTimeOriginal', c.dateTaken),
    custom.length ? `<formvis:fields><rdf:Seq>${custom.map(([k, v]) => `<rdf:li rdf:parseType="Resource"><formvis:key>${esc(k)}</formvis:key><formvis:value>${esc(v)}</formvis:value></rdf:li>`).join('')}</rdf:Seq></formvis:fields>` : '',
  ].join('');
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="formvis"><rdf:RDF xmlns:rdf="${RDF}"><rdf:Description rdf:about="" xmlns:dc="${DC}" xmlns:xmp="${XMP}" xmlns:xmpRights="${RIGHTS}" xmlns:photoshop="${PS}" xmlns:tiff="${TIFF}" xmlns:exif="${EXIF}" xmlns:aux="${AUX}" xmlns:formvis="${FV}" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">${body}</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;
}

/** The properties buildXmp writes: when a picture's own packet is carried on, these come out of it so File Info is the one source. */
const MANAGED: ReadonlyArray<readonly [string, string[]]> = [
  [DC, ['title', 'creator', 'description', 'subject', 'rights']], [XMP, ['Rating', 'CreatorTool', 'CreateDate', 'ModifyDate']], [RIGHTS, ['Marked', 'WebStatement']],
  [PS, ['AuthorsPosition', 'CaptionWriter']], [TIFF, ['Make', 'Model']], [AUX, ['Lens']], [EXIF, ['ExposureTime', 'FNumber', 'ISOSpeedRatings', 'FocalLength', 'DateTimeOriginal']],
  [FV, ['fields']], ['http://iptc.org/std/Iptc4xmpExt/2008-02-29/', ['DigitalSourceType']],
];

/** The packet for `m`: buildXmp, with the picture's original packet (m.xmpRaw) kept and its unmanaged properties carried on. */
export function buildMergedXmp(m: DocMeta, now = new Date(), ai?: AiLabel): string {
  const ours = buildXmp(m, now, ai);
  if (!m.xmpRaw || typeof DOMParser === 'undefined') return ours;
  try {
    const parse = (s: string): Document => new DOMParser().parseFromString(s.replace(/^﻿/, ''), 'application/xml');
    const orig = parse(m.xmpRaw.replace(/<\?xpacket[^>]*\?>/g, '')), mine = parse(ours.replace(/<\?xpacket[^>]*\?>/g, ''));
    const rdf = orig.getElementsByTagNameNS(RDF, 'RDF')[0], mineDesc = mine.getElementsByTagNameNS(RDF, 'Description')[0];
    if (orig.getElementsByTagName('parsererror').length || !rdf || !mineDesc) return ours;
    for (const d of Array.from(orig.getElementsByTagNameNS(RDF, 'Description'))) {
      for (const [ns, names] of MANAGED) for (const n of names) {
        if (d.hasAttributeNS(ns, n)) d.removeAttributeNS(ns, n);
        for (const k of Array.from(d.children)) if (k.namespaceURI === ns && k.localName === n) k.remove();
      }
    }
    rdf.appendChild(orig.importNode(mineDesc, true));
    const body = new XMLSerializer().serializeToString(orig.documentElement);
    const out = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${body}\n<?xpacket end="w"?>`;
    return out.length <= 60000 ? out : ours;
  } catch { return ours; }
}

/** File Info from an XMP packet (elements or attributes, as other programs write them), or null when it holds none of ours. */
export function metaFromXmp(xml: string): DocMeta | null {
  let doc: Document;
  try { doc = new DOMParser().parseFromString(xml.replace(/^﻿/, ''), 'application/xml'); } catch { return null; }
  if (doc.getElementsByTagName('parsererror').length) return null;
  const descriptions = Array.from(doc.getElementsByTagNameNS(RDF, 'Description'));
  const child = (ns: string, name: string): Element | null => {
    for (const d of descriptions) for (const k of Array.from(d.children)) if (k.namespaceURI === ns && k.localName === name) return k;
    return null;
  };
  const simple = (ns: string, name: string): string | undefined => {
    for (const d of descriptions) { const a = d.getAttributeNS(ns, name); if (a) return a.trim(); }
    const k = child(ns, name);
    return k && !k.children.length ? k.textContent?.trim() || undefined : undefined;
  };
  const items = (ns: string, name: string): string[] => {
    const k = child(ns, name);
    return k ? Array.from(k.getElementsByTagNameNS(RDF, 'li')).map((li) => li.textContent?.trim() ?? '').filter(Boolean) : [];
  };
  const lang = (ns: string, name: string): string | undefined => {
    const k = child(ns, name) ?? null;
    if (!k) { for (const d of descriptions) { const a = d.getAttributeNS(ns, name); if (a) return a.trim(); } return undefined; }
    const lis = Array.from(k.getElementsByTagNameNS(RDF, 'li'));
    const hit = lis.find((li) => li.getAttributeNS(XML, 'lang') === 'x-default') ?? lis[0];
    return (hit ?? k).textContent?.trim() || undefined;
  };
  if (!descriptions.length) return null;
  const rating = Number(simple(XMP, 'Rating'));
  const marked = simple(RIGHTS, 'Marked')?.toLowerCase();
  const camera: CameraData = {};
  const make = simple(TIFF, 'Make'), model = simple(TIFF, 'Model'), lens = simple(AUX, 'Lens') ?? simple(EXIF, 'LensModel');
  if (make) camera.make = make;
  if (model) camera.model = model;
  if (lens) camera.lens = lens;
  const exposure = rationalOf(simple(EXIF, 'ExposureTime') ?? ''), aperture = rationalOf(simple(EXIF, 'FNumber') ?? ''), focal = rationalOf(simple(EXIF, 'FocalLength') ?? '');
  if (exposure > 0 && Number.isFinite(exposure)) camera.exposure = exposureText(exposure);
  if (aperture > 0 && Number.isFinite(aperture)) camera.aperture = roundText(aperture);
  if (focal > 0 && Number.isFinite(focal)) camera.focalLength = roundText(focal);
  const iso = items(EXIF, 'ISOSpeedRatings')[0] ?? simple(EXIF, 'ISOSpeedRatings') ?? simple(EXIF, 'PhotographicSensitivity');
  if (iso && Number(iso) > 0) camera.iso = String(Math.round(Number(iso)));
  const taken = simple(EXIF, 'DateTimeOriginal');
  if (taken) camera.dateTaken = isoOfExifDate(taken.replace(/-/g, ':').replace('T', ' ')) ?? taken.slice(0, 19);
  const custom: Record<string, string> = {};
  for (const li of Array.from(child(FV, 'fields')?.getElementsByTagNameNS(RDF, 'li') ?? [])) {
    const k = li.getElementsByTagNameNS(FV, 'key')[0]?.textContent?.trim(), v = li.getElementsByTagNameNS(FV, 'value')[0]?.textContent?.trim();
    if (k && v) custom[k] = v;
  }
  return cleanMeta({
    custom: Object.keys(custom).length ? custom : undefined,
    title: lang(DC, 'title'), author: items(DC, 'creator')[0] ?? simple(DC, 'creator'), description: lang(DC, 'description'), keywords: items(DC, 'subject'), notice: lang(DC, 'rights'),
    rating: Number.isFinite(rating) ? rating : undefined, copyright: marked === 'true' ? 'copyrighted' : marked === 'false' ? 'public' : undefined,
    url: simple(RIGHTS, 'WebStatement'), authorTitle: simple(PS, 'AuthorsPosition'), descriptionWriter: simple(PS, 'CaptionWriter'),
    camera: Object.keys(camera).length ? camera : undefined, created: simple(XMP, 'CreateDate'), modified: simple(XMP, 'ModifyDate'),
  });
}

/** PNG: the packet as an iTXt chunk with the keyword XML:com.adobe.xmp right after IHDR, any earlier one dropped. */
function pngWith(b: Uint8Array, xmp: Uint8Array, exif?: Uint8Array | null): Uint8Array {
  if (b.length < 33 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) throw new Error('Not a PNG file.');
  const typed = join([ascii('iTXt'), ascii(KEYWORD), [0, 0, 0, 0, 0], xmp]);
  const chunk = join([be32(typed.length - 4), typed, be32(crc32(typed))]);
  const exifTyped = exif ? join([ascii('eXIf'), exif]) : null;
  const exifChunk = exifTyped ? join([be32(exif!.length), exifTyped, be32(crc32(exifTyped))]) : null;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let p = 8;
  while (p + 8 <= b.length) {
    const len = u32be(b, p), end = p + 12 + len;
    if (!(at(b, p + 4, 'iTXt') && at(b, p + 8, KEYWORD + '\u0000')) && !(exifChunk && at(b, p + 4, 'eXIf'))) parts.push(b.subarray(p, Math.min(end, b.length)));
    if (at(b, p + 4, 'IHDR')) { if (exifChunk) parts.push(exifChunk); parts.push(chunk); }
    p = end;
  }
  return join(parts);
}

/** JPEG: the packet as an APP1 segment with the XMP namespace header after the JFIF and Exif segments, any earlier one dropped. */
function jpegWith(b: Uint8Array, xmp: Uint8Array, exif?: Uint8Array | null): Uint8Array {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('Not a JPEG file.');
  const len = 2 + JPEG_HEAD.length + xmp.length;
  if (len > 0xffff) throw new Error('The File Info is too large to write into a JPEG; shorten the description or the keywords.');
  const exifLen = exif && 8 + exif.length <= 0xffff ? 8 + exif.length : 0;
  const kept: Array<{ marker: number; bytes: Uint8Array }> = [];
  let p = 2, lead = 0, leading = true, jfif = 0, jfifOpen = true;
  while (p + 4 <= b.length && b[p] === 0xff && b[p + 1] !== 0xda) {
    const end = p + 2 + ((b[p + 2] << 8) | b[p + 3]), marker = b[p + 1];
    if (!(marker === 0xe1 && (at(b, p + 4, JPEG_HEAD) || (exifLen && at(b, p + 4, 'Exif\u0000\u0000'))))) {
      kept.push({ marker, bytes: b.subarray(p, end) });
      if (leading && (marker === 0xe0 || marker === 0xe1)) lead = kept.length; else leading = false;
      if (jfifOpen && marker === 0xe0) jfif = kept.length; else jfifOpen = false;
    }
    p = end;
  }
  const segment = join([[0xff, 0xe1, (len >> 8) & 255, len & 255], ascii(JPEG_HEAD), xmp]);
  const exifSegment = exifLen ? join([[0xff, 0xe1, (exifLen >> 8) & 255, exifLen & 255], ascii('Exif\u0000\u0000'), exif!]) : new Uint8Array(0);
  const head = kept.slice(0, lead).map((k) => k.bytes);
  if (exifLen) head.splice(jfif, 0, exifSegment);
  return join([b.subarray(0, 2), ...head, segment, ...kept.slice(lead).map((k) => k.bytes), b.subarray(p)]);
}

interface Riff { id: string; data: Uint8Array }
function riffChunks(b: Uint8Array): Riff[] | null {
  if (!at(b, 0, 'RIFF') || !at(b, 8, 'WEBP')) return null;
  const out: Riff[] = [];
  let p = 12;
  while (p + 8 <= b.length) {
    const size = u32le(b, p + 4), id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    out.push({ id, data: b.subarray(p + 8, Math.min(b.length, p + 8 + size)) });
    p += 8 + size + (size & 1);
  }
  return out;
}

/** WebP: the packet as an XMP chunk after the image, in an extended (VP8X) file; a plain file is first given its VP8X header. */
function webpWith(b: Uint8Array, xmp: Uint8Array, exif?: Uint8Array | null): Uint8Array {
  const chunks = riffChunks(b);
  if (!chunks) throw new Error('Not a WebP file.');
  const rest = chunks.filter((c) => c.id !== 'XMP ' && !(exif && c.id === 'EXIF'));
  const flags = exif ? 0x0c : 0x04;
  if (rest[0]?.id === 'VP8X') { const head = rest[0].data.slice(); head[0] |= flags; rest[0] = { id: 'VP8X', data: head }; }
  else {
    const im = rest.find((c) => c.id === 'VP8 ' || c.id === 'VP8L');
    if (!im) throw new Error('Not a WebP picture.');
    let w: number, h: number, alpha = 0;
    if (im.id === 'VP8L') { const v = u32le(im.data, 1); w = (v & 0x3fff) + 1; h = ((v >>> 14) & 0x3fff) + 1; alpha = (v >>> 28) & 1; }
    else { w = (im.data[6] | (im.data[7] << 8)) & 0x3fff; h = (im.data[8] | (im.data[9] << 8)) & 0x3fff; }
    const dim = (n: number): number[] => [(n - 1) & 255, ((n - 1) >> 8) & 255, ((n - 1) >> 16) & 255];
    rest.unshift({ id: 'VP8X', data: Uint8Array.from([flags | (alpha ? 0x10 : 0), 0, 0, 0, ...dim(w), ...dim(h)]) });
  }
  if (exif) rest.push({ id: 'EXIF', data: exif });
  rest.push({ id: 'XMP ', data: xmp });
  const body = join(rest.flatMap((c) => [ascii(c.id), le32(c.data.length), c.data, c.data.length & 1 ? [0] : []]));
  return join([ascii('RIFF'), le32(body.length + 4), ascii('WEBP'), body]);
}

/** TIFF: tag 700 (XMP) added to the first directory; the packet and the rewritten directory go at the end of the file. */
function tiffWith(b: Uint8Array, xmp: Uint8Array, exif: Uint8Array | null = null): Uint8Array {
  const le = b[0] === 0x49 && b[1] === 0x49;
  if (b.length < 16 || (!le && !(b[0] === 0x4d && b[1] === 0x4d))) throw new Error('Not a TIFF file.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint16(2, le) !== 42) return b;
  const ifd = dv.getUint32(4, le), n = dv.getUint16(ifd, le), next = dv.getUint32(ifd + 2 + n * 12, le);
  const pad = b.length & 1, dataAt = b.length + pad, exifAt = dataAt + xmp.length + (xmp.length & 1), ex = le && exif ? exifForTiff(exif, exifAt) : null, ifdAt = exifAt + (ex && exif ? exif.length + (exif.length & 1) : 0);
  const taken = new Set([700, ...(ex?.entries.map((x) => x.tag) ?? [])]);
  const entries: Array<{ tag: number; bytes: Uint8Array }> = [];
  for (let i = 0; i < n; i++) { const o = ifd + 2 + i * 12, tag = dv.getUint16(o, le); if (!taken.has(tag)) entries.push({ tag, bytes: b.subarray(o, o + 12) }); }
  const mine = new Uint8Array(12), mv = new DataView(mine.buffer);
  mv.setUint16(0, 700, le); mv.setUint16(2, 1, le); mv.setUint32(4, xmp.length, le); mv.setUint32(8, dataAt, le);
  entries.push({ tag: 700, bytes: mine });
  for (const x of ex?.entries ?? []) { const e = new Uint8Array(12), ev = new DataView(e.buffer); ev.setUint16(0, x.tag, true); ev.setUint16(2, x.type, true); ev.setUint32(4, x.count, true); e.set(x.value, 8); entries.push({ tag: x.tag, bytes: e }); }   // Exif's Make, Model and directory pointers
  entries.sort((x, y) => x.tag - y.tag);
  const dir = new Uint8Array(2 + entries.length * 12 + 4), dd = new DataView(dir.buffer);
  dd.setUint16(0, entries.length, le);
  entries.forEach((e, i) => dir.set(e.bytes, 2 + i * 12));
  dd.setUint32(2 + entries.length * 12, next, le);
  const out = join([b, new Uint8Array(pad), xmp, new Uint8Array(xmp.length & 1), ...(ex && exif ? [ex.bytes, new Uint8Array(exif.length & 1)] : []), dir]);
  new DataView(out.buffer).setUint32(4, ifdAt, le);
  return out;
}

export type XmpFormat = 'png' | 'jpg' | 'webp' | 'tiff';

/** `blob`, an encoded picture, with File Info written into it as XMP; the blob as it is when there is nothing to write
 *  (no field filled in and no camera record) or for a format that carries none here. */
export async function withXmp(blob: Blob, format: string, meta: DocMeta | undefined, now = new Date(), ai?: AiLabel): Promise<Blob> {
  if (!metaWritable(meta)) return blob;
  const f = format === 'jpeg' ? 'jpg' : format === 'tif' ? 'tiff' : format;
  if (f !== 'png' && f !== 'jpg' && f !== 'webp' && f !== 'tiff') return blob;
  const xmp = new TextEncoder().encode(buildMergedXmp(meta, now, ai ?? meta.aiLabel)), b = new Uint8Array(await blob.arrayBuffer());
  const exif = exifBlockOf(meta);   // the picture's own block, else one built from the camera record
  const out = f === 'png' ? pngWith(b, xmp, exif) : f === 'jpg' ? jpegWith(b, xmp, exif) : f === 'webp' ? webpWith(b, xmp, exif) : tiffWith(b, xmp, exif);
  return new Blob([out as BlobPart], { type: blob.type });
}

/** The XMP packet and the Exif block in the first bytes of a picture file, whichever the format holds. */
function packets(b: Uint8Array): { xmp: string | null; exif: Uint8Array | null } {
  const dec = (a: Uint8Array): string => new TextDecoder().decode(a);
  let xmp: string | null = null, exif: Uint8Array | null = null;
  if (b[0] === 0x89 && at(b, 1, 'PNG')) {
    let p = 8;
    while (p + 12 <= b.length) {
      const len = u32be(b, p), body = p + 8;
      if (at(b, p + 4, 'iTXt') && at(b, body, KEYWORD + '\u0000') && b[body + KEYWORD.length + 1] === 0) {
        let q = body + KEYWORD.length + 3;
        for (let z = 0; z < 2 && q < body + len; z++) { while (q < body + len && b[q] !== 0) q++; q++; }
        xmp = dec(b.subarray(q, body + len));
      } else if (at(b, p + 4, 'eXIf')) exif = b.subarray(body, body + len);
      else if (at(b, p + 4, 'IEND')) break;
      p += 12 + len;
    }
  } else if (b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 4 <= b.length && b[p] === 0xff && b[p + 1] !== 0xda) {
      const end = p + 2 + ((b[p + 2] << 8) | b[p + 3]);
      if (b[p + 1] === 0xe1) {
        if (at(b, p + 4, JPEG_HEAD)) xmp = dec(b.subarray(p + 4 + JPEG_HEAD.length, end));
        else if (at(b, p + 4, 'Exif\u0000\u0000')) exif = b.subarray(p + 10, end);
      }
      p = end;
    }
  } else if (at(b, 0, 'RIFF')) {
    for (const c of riffChunks(b) ?? []) {
      if (c.id === 'XMP ') xmp = dec(c.data);
      else if (c.id === 'EXIF') exif = at(c.data, 0, 'Exif\u0000\u0000') ? c.data.subarray(6) : c.data;
    }
  } else if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 42)) {
    const le = b[0] === 0x49, dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    exif = b;
    try {
      const ifd = dv.getUint32(4, le), n = Math.min(dv.getUint16(ifd, le), 500);
      for (let i = 0; i < n; i++) {
        const o = ifd + 2 + i * 12;
        if (dv.getUint16(o, le) === 700) { const len = dv.getUint32(o + 4, le), off = len > 4 ? dv.getUint32(o + 8, le) : o + 8; xmp = dec(b.subarray(off, off + len)); }
      }
    } catch { /* no packet */ }
  }
  return { xmp, exif };
}

/** File Info from a picture file being opened: its XMP, with the camera's Exif record behind it; null when it has neither.
 *  Never throws; a file that cannot be read for metadata opens without it. */
export async function readFileMeta(file: Blob): Promise<DocMeta | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer()), jpeg = head[0] === 0xff && head[1] === 0xd8;
    const b = new Uint8Array(await file.slice(0, jpeg ? JPEG_READ : READ_LIMIT).arrayBuffer()), { xmp, exif } = packets(b);
    const fromXmp = xmp ? metaFromXmp(xmp) : null, camera = fromXmp?.camera ?? (exif ? cameraFromTiff(exif) : null);
    const quality = jpeg ? jpegQuality(b) : null;
    const tiff = head[0] === 0x49 || head[0] === 0x4d;   // a TIFF's whole file is its Exif; only JPEG, PNG and WebP blocks are kept
    const keepExif = exif && !tiff && exif.length <= MAX_EXIF_BYTES ? toB64(uprightExif(exif)) : undefined;
    const keepXmp = xmp && xmp.length <= MAX_XMP_RAW_CHARS ? xmp : undefined;
    if (!fromXmp && !camera && !quality && !keepExif && !keepXmp) return null;
    return cleanMeta({ ...(fromXmp ?? {}), ...(camera ? { camera } : {}), ...(quality ? { jpegQuality: quality } : {}), ...(keepExif ? { exif: keepExif } : {}), ...(keepXmp ? { xmpRaw: keepXmp } : {}) });
  } catch { return null; }
}
