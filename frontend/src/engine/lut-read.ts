/** Reads a creative 3D LUT file into .cube text, the form the Color Lookup adjustment keeps. A .cube file passes through;
 *  a Lustre/Flame .3dl file (an optional shaper line, then integer triples with blue changing fastest, 10, 12 or 16 bit)
 *  is converted to red-fastest floats. Anything else, a 1D table or an unknown format, gives null. */
export function lutFileToCube(name: string, text: string): string | null {
  if (/^\s*LUT_3D_SIZE\s/m.test(text)) return text;
  if (/\.look$/i.test(name) || /<look[\s>]/i.test(text)) return fromLook(text);
  return /\.3dl$/i.test(name) ? fromThreeDl(text) : null;
}

/** An Iridas/SpeedGrade .look: XML whose LUT element holds a quoted size and a quoted hex string of little-endian
 *  32-bit floats, three per node with red changing fastest (the .cube order). */
function fromLook(text: string): string | null {
  const lut = /<LUT>([\s\S]*?)<\/LUT>/i.exec(text)?.[1];
  if (!lut) return null;
  const size = Number(/<size>\s*"?\s*(\d+)\s*"?\s*<\/size>/i.exec(lut)?.[1]);
  const hex = (/<data>\s*"?([0-9a-fA-F\s]*)"?\s*<\/data>/i.exec(lut)?.[1] ?? '').replace(/\s+/g, '');
  if (!Number.isInteger(size) || size < 2 || size > 256 || hex.length !== size ** 3 * 3 * 8) return null;
  const view = new DataView(new ArrayBuffer(4)), out = new Array<string>(size ** 3), v = [0, 0, 0];
  for (let n = 0; n < size ** 3; n++) {
    for (let ch = 0; ch < 3; ch++) {
      const at = (n * 3 + ch) * 8;
      for (let k = 0; k < 4; k++) view.setUint8(k, parseInt(hex.slice(at + k * 2, at + k * 2 + 2), 16));
      v[ch] = view.getFloat32(0, true);
      if (!Number.isFinite(v[ch])) return null;
    }
    out[n] = `${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`;
  }
  return `LUT_3D_SIZE ${size}\n${out.join('\n')}\n`;
}

function fromThreeDl(text: string): string | null {
  const triples: number[] = [];
  let shaper = 0, outBits = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const mesh = /^Mesh\s+(\d+)\s+(\d+)/i.exec(line);
    if (mesh) { outBits = Number(mesh[2]); continue; }
    if (/^(3DMESH|[A-Za-z])/i.test(line)) continue;
    const nums = line.split(/[\s,]+/).map(Number);
    if (nums.some((n) => !Number.isFinite(n))) return null;
    if (nums.length === 3) triples.push(nums[0], nums[1], nums[2]);
    else if (!shaper && !triples.length && nums.length >= 2) shaper = nums.length;
    else return null;
  }
  const count = triples.length / 3, size = shaper || Math.round(Math.cbrt(count));
  if (size < 2 || size > 256 || size ** 3 !== count) return null;
  let peak = 0;
  for (const v of triples) if (v > peak) peak = v;
  const top = outBits ? 2 ** outBits - 1 : peak <= 1 ? 1 : peak <= 1023 ? 1023 : peak <= 4095 ? 4095 : 65535;
  const out = new Array<string>(count);
  for (let r = 0; r < size; r++) for (let g = 0; g < size; g++) for (let b = 0; b < size; b++) {
    const from = ((r * size + g) * size + b) * 3, to = (b * size + g) * size + r;
    out[to] = `${(triples[from] / top).toFixed(6)} ${(triples[from + 1] / top).toFixed(6)} ${(triples[from + 2] / top).toFixed(6)}`;
  }
  return `LUT_3D_SIZE ${size}\n${out.join('\n')}\n`;
}
