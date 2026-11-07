export interface Pixels { width: number; height: number; data: Uint8ClampedArray }

const u32 = (n: number): number[] => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const u16 = (n: number): number[] => [n & 255, (n >>> 8) & 255];
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const join = (parts: Array<Uint8Array | number[]>): Uint8Array => {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

const hasAlpha = (px: Pixels): boolean => {
  for (let i = 3; i < px.data.length; i += 4) if (px.data[i] < 255) return true;
  return false;
};

export function encodeTiff(px: Pixels, dpi: number): Uint8Array {
  const alpha = hasAlpha(px), spp = alpha ? 4 : 3, size = px.width * px.height * spp;
  const raster = new Uint8Array(size);
  for (let i = 0, o = 0; i < px.data.length; i += 4) { raster[o++] = px.data[i]; raster[o++] = px.data[i + 1]; raster[o++] = px.data[i + 2]; if (alpha) raster[o++] = px.data[i + 3]; }
  const entries: Array<[number, number, number, number]> = [
    [256, 4, 1, px.width], [257, 4, 1, px.height], [258, 3, spp, 0], [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, 1, 0],
    [277, 3, 1, spp], [278, 4, 1, px.height], [279, 4, 1, size], [282, 5, 1, 0], [283, 5, 1, 0], [296, 3, 1, 2], ...(alpha ? [[338, 3, 1, 2] as [number, number, number, number]] : []),
  ];
  entries.sort((a, b) => a[0] - b[0]);
  const ifdAt = 8, ifdSize = 2 + entries.length * 12 + 4, extra = ifdAt + ifdSize;
  const bitsAt = extra, resAt = bitsAt + spp * 2, dataAt = resAt + 16;
  const rows: number[] = [];
  for (const [tag, type, count, value] of entries) {
    let v = value;
    if (tag === 258) v = bitsAt;
    if (tag === 273) v = dataAt;
    if (tag === 282) v = resAt;
    if (tag === 283) v = resAt + 8;
    const inline = type === 3 && count === 1 ? [...u16(v), 0, 0] : u32(v);
    rows.push(...u16(tag), ...u16(type), ...u32(count), ...inline);
  }
  const head = [73, 73, 42, 0, ...u32(ifdAt), ...u16(entries.length), ...rows, ...u32(0)];
  const bits = Array.from({ length: spp }, () => u16(8)).flat();
  const res = [...u32(Math.round(dpi)), ...u32(1), ...u32(Math.round(dpi)), ...u32(1)];
  return join([head, bits, res, raster]);
}

export function encodeBmp(px: Pixels, dpi: number): Uint8Array {
  const rowBytes = px.width * 4, imageSize = rowBytes * px.height, headerSize = 108, offset = 14 + headerSize, ppm = Math.round(dpi / 0.0254);
  const info = [...u32(headerSize), ...u32(px.width), ...u32(px.height), ...u16(1), ...u16(32), ...u32(3), ...u32(imageSize), ...u32(ppm), ...u32(ppm), ...u32(0), ...u32(0),
    ...u32(0x00ff0000), ...u32(0x0000ff00), ...u32(0x000000ff), ...u32(0xff000000), ...ascii('Win '), ...new Array(36).fill(0), ...u32(0), ...u32(0), ...u32(0)];
  const body = new Uint8Array(imageSize);
  for (let y = 0; y < px.height; y++) {
    const src = (px.height - 1 - y) * px.width * 4;
    for (let x = 0; x < px.width; x++) {
      const s = src + x * 4, d = y * rowBytes + x * 4;
      body[d] = px.data[s + 2]; body[d + 1] = px.data[s + 1]; body[d + 2] = px.data[s]; body[d + 3] = px.data[s + 3];
    }
  }
  return join([[66, 77, ...u32(offset + imageSize), 0, 0, 0, 0, ...u32(offset)], info, body]);
}

export function encodeTga(px: Pixels): Uint8Array {
  const body = new Uint8Array(px.width * px.height * 4);
  for (let i = 0; i < px.data.length; i += 4) { body[i] = px.data[i + 2]; body[i + 1] = px.data[i + 1]; body[i + 2] = px.data[i]; body[i + 3] = px.data[i + 3]; }
  return join([[0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u16(px.width), ...u16(px.height), 32, 40], body, ascii('\0\0\0\0\0\0\0\0TRUEVISION-XFILE.\0')]);
}

export function encodeQoi(px: Pixels): Uint8Array {
  const out: number[] = [...ascii('qoif'), ...be32(px.width), ...be32(px.height), 4, 0];
  const seen = new Uint8Array(64 * 4);
  let r = 0, g = 0, b = 0, a = 255, run = 0;
  const n = px.width * px.height;
  for (let i = 0; i < n; i++) {
    const R = px.data[i * 4], G = px.data[i * 4 + 1], B = px.data[i * 4 + 2], A = px.data[i * 4 + 3];
    if (R === r && G === g && B === b && A === a) {
      run++;
      if (run === 62 || i === n - 1) { out.push(0xc0 | (run - 1)); run = 0; }
      continue;
    }
    if (run > 0) { out.push(0xc0 | (run - 1)); run = 0; }
    const h = (R * 3 + G * 5 + B * 7 + A * 11) % 64;
    if (seen[h * 4] === R && seen[h * 4 + 1] === G && seen[h * 4 + 2] === B && seen[h * 4 + 3] === A) out.push(h);
    else {
      seen[h * 4] = R; seen[h * 4 + 1] = G; seen[h * 4 + 2] = B; seen[h * 4 + 3] = A;
      if (A === a) {
        const dr = R - r, dg = G - g, db = B - b, drg = dr - dg, dbg = db - dg;
        if (dr > -3 && dr < 2 && dg > -3 && dg < 2 && db > -3 && db < 2) out.push(0x40 | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2));
        else if (dg > -33 && dg < 32 && drg > -9 && drg < 8 && dbg > -9 && dbg < 8) out.push(0x80 | (dg + 32), ((drg + 8) << 4) | (dbg + 8));
        else out.push(0xfe, R, G, B);
      } else out.push(0xff, R, G, B, A);
    }
    r = R; g = G; b = B; a = A;
  }
  out.push(0, 0, 0, 0, 0, 0, 0, 1);
  return Uint8Array.from(out);
}

export function encodePam(px: Pixels): Uint8Array {
  return join([ascii(`P7\nWIDTH ${px.width}\nHEIGHT ${px.height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`), new Uint8Array(px.data.buffer, px.data.byteOffset, px.data.byteLength)]);
}

export function encodeIco(png: Uint8Array, width: number, height: number): Uint8Array {
  return join([[0, 0, 1, 0, 1, 0, width >= 256 ? 0 : width, height >= 256 ? 0 : height, 0, 0, 1, 0, 32, 0, ...u32(png.length), ...u32(22)], png]);
}

export interface PdfPage { jpeg: Uint8Array; width: number; height: number; dpi: number }

export function encodePdf(pages: PdfPage[]): Uint8Array {
  const objects: Uint8Array[] = [];
  const add = (parts: Array<Uint8Array | number[]>): number => { objects.push(join(parts)); return objects.length; };
  const catalog = add([ascii('<< /Type /Catalog /Pages 2 0 R >>')]);
  const kids = pages.map((_p, i) => `${3 + i * 3} 0 R`).join(' ');
  add([ascii(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)]);
  pages.forEach((p, i) => {
    const w = (p.width * 72) / p.dpi, h = (p.height * 72) / p.dpi, base = 3 + i * 3;
    const content = ascii(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 0 0 cm /Im0 Do Q`);
    add([ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Resources << /XObject << /Im0 ${base + 1} 0 R >> >> /Contents ${base + 2} 0 R >>`)]);
    add([ascii(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`), p.jpeg, ascii('\nendstream')]);
    add([ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii('\nendstream')]);
  });
  const parts: Array<Uint8Array | number[]> = [ascii('%PDF-1.4\n')];
  const offsets: number[] = [];
  let at = parts[0].length;
  objects.forEach((o, i) => {
    offsets.push(at);
    const head = ascii(`${i + 1} 0 obj\n`), tail = ascii('\nendobj\n');
    parts.push(head, o, tail);
    at += head.length + o.length + tail.length;
  });
  const xref = ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${at}\n%%EOF\n`);
  parts.push(xref);
  return join(parts);
}
