/** File Info fields read from the header of a FITS or DPX file: each header card or field becomes one custom field. */

const text = (b: Uint8Array, at: number, len: number): string => {
  let s = '';
  for (let i = at; i < Math.min(b.length, at + len); i++) { if (b[i] === 0) break; s += String.fromCharCode(b[i]!); }
  return s.trim();
};

const FITS_SKIP = /^(SIMPLE|BITPIX|NAXIS\d*|EXTEND|END|BZERO|BSCALE|BLANK|PCOUNT|GCOUNT|XTENSION|COMMENT|HISTORY|CONTINUE|)$/;

/** The informative header cards of a FITS file's first header (its structural cards left out). */
export function fitsCards(b: Uint8Array): Record<string, string> | null {
  if (b.length < 80 || text(b, 0, 9) !== 'SIMPLE  =') return null;
  const out: Record<string, string> = {};
  for (let at = 0; at + 80 <= b.length && Object.keys(out).length < 50; at += 80) {
    const key = text(b, at, 8);
    if (key === 'END') break;
    if (FITS_SKIP.test(key) || b[at + 8] !== 0x3d) continue;
    let val = text(b, at + 10, 70);
    if (val.startsWith("'")) { const close = val.indexOf("'", 1); val = (close > 0 ? val.slice(1, close) : val.slice(1)).trim(); } else { const slash = val.indexOf('/'); if (slash >= 0) val = val.slice(0, slash).trim(); }
    if (val) out[key] = val;
  }
  return Object.keys(out).length ? out : null;
}

/** The text fields, frame rate and time code of a DPX file's header (either byte order). */
export function dpxFields(b: Uint8Array): Record<string, string> | null {
  if (b.length < 2048) return null;
  const magic = text(b, 0, 4), le = magic === 'XPDS';
  if (magic !== 'SDPX' && !le) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out: Record<string, string> = {};
  const put = (k: string, s: string): void => { if (s) out[k] = s; };
  put('Version', text(b, 8, 8));
  put('Image file name', text(b, 36, 100));
  put('Creation date', text(b, 136, 24));
  put('Creator', text(b, 160, 100));
  put('Project', text(b, 260, 200));
  put('Copyright', text(b, 460, 200));
  put('Frame ID', text(b, 1732, 32));
  put('Slate', text(b, 1764, 200));
  const rate = v.getFloat32(1724, le);
  if (Number.isFinite(rate) && rate > 0 && rate < 1000) out['Frame rate'] = String(Math.round(rate * 1000) / 1000);
  const tc = v.getUint32(1920, le);
  if (tc !== 0xffffffff) {
    const two = (shift: number): string => `${(tc >>> (shift + 4)) & 15}${(tc >>> shift) & 15}`;
    out['Time code'] = `${two(24)}:${two(16)}:${two(8)}:${two(0)}`;
  }
  return Object.keys(out).length ? out : null;
}
