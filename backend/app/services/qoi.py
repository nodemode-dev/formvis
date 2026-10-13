"""QOI, the Quite OK Image format (qoiformat.org, specification of 2022-01-05), read and written from the specification.
A 14 byte header ("qoif", width and height as big-endian 32 bit, channels 3 or 4, colourspace 0 for sRGB with linear
alpha or 1 for all channels linear), the chunks INDEX, DIFF, LUMA, RUN, RGB and RGBA over a 64 entry running index of
seen pixels, and the 8 byte end marker. The colourspace byte is informative only: the numbers are stored as they are."""

import struct

import numpy as np

MAGIC = b"qoif"
END = b"\x00\x00\x00\x00\x00\x00\x00\x01"
MAX_SIDE = 30000
MAX_PIXELS = 400_000_000


class QoiError(Exception):
    pass


def is_qoi(data: bytes) -> bool:
    return data[:4] == MAGIC and len(data) >= 14


def read(data: bytes) -> tuple[np.ndarray, int, int]:
    """(RGBA uint8 array of shape (height, width, 4), channels, colourspace)."""
    if not is_qoi(data):
        raise QoiError("This is not a QOI file.")
    width, height, channels, space = struct.unpack(">IIBB", data[4:14])
    if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise QoiError("The QOI picture is empty or larger than formvis edits in one piece.")
    if channels not in (3, 4) or space not in (0, 1):
        raise QoiError("The QOI header holds an unknown channel count or colourspace.")
    total = width * height
    out = np.empty((total, 4), np.uint8)
    index = [(0, 0, 0, 0)] * 64
    r, g, b, a = 0, 0, 0, 255
    pos, n, size = 14, 0, len(data)
    while n < total:
        if pos >= size:
            raise QoiError("The QOI data ends before the picture does.")
        op = data[pos]
        pos += 1
        if op == 0xFE:
            if pos + 3 > size:
                raise QoiError("The QOI data ends before the picture does.")
            r, g, b = data[pos], data[pos + 1], data[pos + 2]
            pos += 3
        elif op == 0xFF:
            if pos + 4 > size:
                raise QoiError("The QOI data ends before the picture does.")
            r, g, b, a = data[pos], data[pos + 1], data[pos + 2], data[pos + 3]
            pos += 4
        else:
            tag = op >> 6
            if tag == 0:
                r, g, b, a = index[op]
            elif tag == 1:
                r = (r + ((op >> 4) & 3) - 2) & 255
                g = (g + ((op >> 2) & 3) - 2) & 255
                b = (b + (op & 3) - 2) & 255
            elif tag == 2:
                if pos >= size:
                    raise QoiError("The QOI data ends before the picture does.")
                nxt = data[pos]
                pos += 1
                dg = (op & 63) - 32
                r = (r + dg - 8 + (nxt >> 4)) & 255
                g = (g + dg) & 255
                b = (b + dg - 8 + (nxt & 15)) & 255
            else:
                run = (op & 63) + 1
                if n + run > total:
                    raise QoiError("A QOI run goes past the end of the picture.")
                out[n:n + run] = (r, g, b, a)
                n += run
                continue
        index[(r * 3 + g * 5 + b * 7 + a * 11) & 63] = (r, g, b, a)
        out[n] = (r, g, b, a)
        n += 1
    return out.reshape(height, width, 4), channels, space


def write(rgba: np.ndarray, linear: bool = False) -> bytes:
    """RGBA uint8 of shape (height, width, 4) to QOI. Four channels when any alpha is below 255, else three."""
    if rgba.ndim != 3 or rgba.shape[2] != 4 or rgba.dtype != np.uint8:
        raise QoiError("QOI is written from 8-bit RGBA.")
    height, width = rgba.shape[:2]
    if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise QoiError("The picture is larger than QOI export handles.")
    channels = 4 if bool((rgba[..., 3] != 255).any()) else 3
    flat = np.ascontiguousarray(rgba).reshape(-1, 4)
    packed = (flat[:, 0].astype(np.uint32) << 24) | (flat[:, 1].astype(np.uint32) << 16) | (flat[:, 2].astype(np.uint32) << 8) | flat[:, 3]
    px = packed.tolist()
    out = bytearray(MAGIC + struct.pack(">IIBB", width, height, channels, 1 if linear else 0))
    index = [0] * 64
    prev = 0x000000FF
    run = 0
    last = len(px) - 1
    for i, cur in enumerate(px):
        if cur == prev:
            run += 1
            if run == 62 or i == last:
                out.append(0xC0 | (run - 1))
                run = 0
            continue
        if run:
            out.append(0xC0 | (run - 1))
            run = 0
        r, g, b, a = cur >> 24, (cur >> 16) & 255, (cur >> 8) & 255, cur & 255
        h = (r * 3 + g * 5 + b * 7 + a * 11) & 63
        if index[h] == cur:
            out.append(h)
        else:
            index[h] = cur
            if (prev & 255) == a:
                pr, pg, pb = prev >> 24, (prev >> 16) & 255, (prev >> 8) & 255
                dr, dg, db = ((r - pr + 128) & 255) - 128, ((g - pg + 128) & 255) - 128, ((b - pb + 128) & 255) - 128
                if -2 <= dr <= 1 and -2 <= dg <= 1 and -2 <= db <= 1:
                    out.append(0x40 | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2))
                else:
                    drg, dbg = dr - dg, db - dg
                    if -32 <= dg <= 31 and -8 <= drg <= 7 and -8 <= dbg <= 7:
                        out.append(0x80 | (dg + 32))
                        out.append(((drg + 8) << 4) | (dbg + 8))
                    else:
                        out += bytes((0xFE, r, g, b))
            else:
                out += bytes((0xFF, r, g, b, a))
        prev = cur
    out += END
    return bytes(out)
