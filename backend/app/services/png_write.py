"""An Adam7 interlaced 8-bit RGBA PNG writer. Pillow writes only non-interlaced PNG, so the passes are cut and filtered here.

Each pass is its own run of scanlines, every row filtered with the Paeth predictor chosen per row by the smallest sum
of absolute values, then deflated as one stream.
"""
import struct
import zlib

import numpy as np

#: (x start, y start, x step, y step) of the seven passes.
PASSES = ((0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2))


def _chunk(kind: bytes, body: bytes) -> bytes:
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)


def _paeth(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    p = a.astype(np.int16) + b - c
    pa, pb, pc = np.abs(p - a), np.abs(p - b), np.abs(p - c)
    return np.where((pa <= pb) & (pa <= pc), a, np.where(pb <= pc, b, c)).astype(np.uint8)


def _filtered(rows: np.ndarray) -> bytes:
    """`rows` (h, w, 4) uint8 as filtered scanlines, each prefixed by its filter byte."""
    h = rows.shape[0]
    flat = rows.reshape(h, -1)
    out = bytearray()
    prev = np.zeros(flat.shape[1], np.uint8)
    for y in range(h):
        cur = flat[y]
        left = np.concatenate([np.zeros(4, np.uint8), cur[:-4]])
        upleft = np.concatenate([np.zeros(4, np.uint8), prev[:-4]])
        options = (cur, (cur - left).astype(np.uint8), (cur - prev).astype(np.uint8), (cur - ((left.astype(np.uint16) + prev) >> 1).astype(np.uint8)).astype(np.uint8),
                   (cur - _paeth(left, prev, upleft)).astype(np.uint8))
        best = min(range(5), key=lambda k: int(np.abs(options[k].astype(np.int8).astype(np.int16)).sum()))
        out.append(best)
        out += options[best].tobytes()
        prev = cur
    return bytes(out)


def write(rgba: np.ndarray, dpi: int = 72, icc: bytes | None = None, level: int = 6) -> bytes:
    """`rgba` (h, w, 4) uint8 as an interlaced PNG with a pHYs chunk at `dpi` and an iCCP chunk when `icc` is given."""
    h, w = rgba.shape[:2]
    raw = bytearray()
    for x0, y0, dx, dy in PASSES:
        sub = rgba[y0::dy, x0::dx]
        if sub.shape[0] and sub.shape[1]:
            raw += _filtered(np.ascontiguousarray(sub))
    ppm = int(round(max(1, dpi) / 0.0254))
    out = b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 1))
    if icc:
        out += _chunk(b"iCCP", b"ICC profile\x00\x00" + zlib.compress(icc))
    out += _chunk(b"pHYs", struct.pack(">IIB", ppm, ppm, 1))
    return out + _chunk(b"IDAT", zlib.compress(bytes(raw), max(0, min(9, level)))) + _chunk(b"IEND", b"")
