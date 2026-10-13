"""Truevision TGA (TGA File Format Specification 2.0), read and written from the specification. Read: image types 1, 2
and 3 and their run-length forms 9, 10 and 11; colour-mapped pictures with 8 or 16 bit indices and 15, 16, 24 or 32 bit
map entries; true colour at 15/16 (A1R5G5B5), 24 and 32 bits; grey at 8 bits, and 16 bits as grey with alpha; origins
at any of the four corners from descriptor bits 4 and 5. Alpha is taken from the 16 bit attribute bit and the 32 bit
alpha byte when the descriptor declares alpha bits, and a 32 bit picture that declares none but whose fourth byte is
not all zero keeps it as alpha too. Write: type 2 or 10 (run-length), 24 or 32 bits, bottom-left origin, with the
TGA 2.0 footer."""

import struct

import numpy as np

MAX_SIDE = 30000
MAX_PIXELS = 400_000_000
FOOTER = b"\x00\x00\x00\x00\x00\x00\x00\x00TRUEVISION-XFILE.\x00"


class TgaError(Exception):
    pass


def looks_like_tga(data: bytes) -> bool:
    if len(data) < 18:
        return False
    cmap_type, image_type = data[1], data[2]
    depth = data[16]
    if cmap_type not in (0, 1) or image_type not in (1, 2, 3, 9, 10, 11):
        return False
    if image_type in (1, 9) and cmap_type != 1:
        return False
    w, h = struct.unpack("<HH", data[12:16])
    return w > 0 and h > 0 and depth in (8, 15, 16, 24, 32)


def _rle(data: bytes, pos: int, total: int, bpp: int) -> tuple[bytes, int]:
    out = bytearray()
    n = 0
    size = len(data)
    while n < total:
        if pos >= size:
            raise TgaError("The run-length data ends before the picture does.")
        head = data[pos]
        pos += 1
        count = (head & 0x7F) + 1
        if n + count > total:
            count = total - n
        if head & 0x80:
            if pos + bpp > size:
                raise TgaError("The run-length data ends before the picture does.")
            out += data[pos:pos + bpp] * count
            pos += bpp
        else:
            if pos + count * bpp > size:
                raise TgaError("The run-length data ends before the picture does.")
            out += data[pos:pos + count * bpp]
            pos += count * bpp
        n += count
    return bytes(out), pos


def _truecolor(raw: np.ndarray, bits: int, alpha_bits: int) -> np.ndarray:
    """raw (n, bytes a pixel) in file order to RGBA (n, 4) uint8."""
    n = raw.shape[0]
    out = np.empty((n, 4), np.uint8)
    if bits in (15, 16):
        v = raw[:, 0].astype(np.uint16) | (raw[:, 1].astype(np.uint16) << 8)
        for k, shift in enumerate((10, 5, 0)):
            c = ((v >> shift) & 31).astype(np.uint16)
            out[:, k] = ((c << 3) | (c >> 2)).astype(np.uint8)
        out[:, 3] = np.where(((v >> 15) & 1) == 1, 255, 0) if (bits == 16 and alpha_bits >= 1) else 255
    elif bits == 24:
        out[:, 0], out[:, 1], out[:, 2], out[:, 3] = raw[:, 2], raw[:, 1], raw[:, 0], 255
    else:
        out[:, 0], out[:, 1], out[:, 2], out[:, 3] = raw[:, 2], raw[:, 1], raw[:, 0], raw[:, 3]
        if alpha_bits == 0 and not out[:, 3].any():
            out[:, 3] = 255
    return out


def read(data: bytes) -> np.ndarray:
    """RGBA uint8 of shape (height, width, 4)."""
    if len(data) < 18:
        raise TgaError("The file is too short for a TGA header.")
    id_len, cmap_type, image_type = data[0], data[1], data[2]
    cmap_first, cmap_len, cmap_bits = struct.unpack("<HHB", data[3:8])
    width, height, depth, desc = struct.unpack("<HHBB", data[12:18])
    if image_type not in (1, 2, 3, 9, 10, 11):
        raise TgaError(f"TGA image type {image_type} is not supported (only uncompressed and run-length colour-mapped, true colour and grey).")
    if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise TgaError("The TGA picture is empty or larger than formvis edits in one piece.")
    mapped, grey, packed = image_type in (1, 9), image_type in (3, 11), image_type >= 9
    if mapped and (cmap_type != 1 or depth not in (8, 16)):
        raise TgaError("A colour-mapped TGA needs a colour map and 8 or 16 bit indices.")
    if grey and depth not in (8, 16):
        raise TgaError("A grey TGA holds 8 or 16 bits a pixel.")
    if not mapped and not grey and depth not in (15, 16, 24, 32):
        raise TgaError(f"A true colour TGA holds 15, 16, 24 or 32 bits a pixel, not {depth}.")
    alpha_bits = desc & 15
    pos = 18 + id_len
    palette = None
    if cmap_type == 1:
        if cmap_bits not in (15, 16, 24, 32):
            raise TgaError(f"TGA colour map entries of {cmap_bits} bits are not supported.")
        step = (cmap_bits + 7) // 8
        end = pos + cmap_len * step
        if end > len(data):
            raise TgaError("The colour map runs past the end of the file.")
        if mapped:
            entries = np.frombuffer(data, np.uint8, count=cmap_len * step, offset=pos).reshape(cmap_len, step)
            palette = _truecolor(entries, cmap_bits, alpha_bits) if cmap_len else np.zeros((0, 4), np.uint8)
        pos = end
    step = (depth + 7) // 8
    total = width * height
    if packed:
        body, _ = _rle(data, pos, total, step)
    else:
        if len(data) - pos < total * step:
            raise TgaError("The pixel data ends before the picture does.")
        body = data[pos:pos + total * step]
    raw = np.frombuffer(body, np.uint8).reshape(total, step)
    if mapped:
        idx = raw[:, 0].astype(np.int64) if step == 1 else raw[:, 0].astype(np.int64) | (raw[:, 1].astype(np.int64) << 8)
        idx = idx - cmap_first
        if palette is None or idx.min() < 0 or idx.max() >= len(palette):
            raise TgaError("A pixel points outside the TGA colour map.")
        px = palette[idx]
    elif grey:
        px = np.empty((total, 4), np.uint8)
        px[:, 0] = px[:, 1] = px[:, 2] = raw[:, 0]
        px[:, 3] = raw[:, 1] if step == 2 else 255
        if step == 2 and alpha_bits == 0 and not px[:, 3].any():
            px[:, 3] = 255
    else:
        px = _truecolor(raw, depth, alpha_bits)
    img = px.reshape(height, width, 4)
    if not desc & 0x20:
        img = img[::-1]
    if desc & 0x10:
        img = img[:, ::-1]
    return np.ascontiguousarray(img)


def _packets(row: np.ndarray) -> bytes:
    """One scanline (width, bytes a pixel) as run-length packets."""
    n = row.shape[0]
    out = bytearray()
    if n == 1:
        return bytes((0,)) + row[0].tobytes()
    change = np.flatnonzero((row[1:] != row[:-1]).any(axis=1)) + 1
    starts = [0] + change.tolist()
    ends = change.tolist() + [n]
    raw_from = None
    for s, e in zip(starts, ends):
        length = e - s
        if length >= 2:
            if raw_from is not None:
                _raw_packets(out, row, raw_from, s)
                raw_from = None
            pixel = row[s].tobytes()
            while length > 0:
                take = min(128, length)
                out.append(0x80 | (take - 1))
                out += pixel
                length -= take
        elif raw_from is None:
            raw_from = s
    if raw_from is not None:
        _raw_packets(out, row, raw_from, n)
    return bytes(out)


def _raw_packets(out: bytearray, row: np.ndarray, a: int, b: int) -> None:
    while a < b:
        take = min(128, b - a)
        out.append(take - 1)
        out += row[a:a + take].tobytes()
        a += take


def write(rgba: np.ndarray, bits: int = 32, rle: bool = False) -> bytes:
    """RGBA uint8 (height, width, 4) to TGA at 24 bits (transparency flattened on white) or 32 bits."""
    if rgba.ndim != 3 or rgba.shape[2] != 4 or rgba.dtype != np.uint8:
        raise TgaError("TGA is written from 8-bit RGBA.")
    if bits not in (24, 32):
        raise TgaError("TGA is written at 24 or 32 bits.")
    height, width = rgba.shape[:2]
    if width < 1 or height < 1 or width > 65535 or height > 65535:
        raise TgaError("TGA holds pictures up to 65,535 pixels a side.")
    if bits == 32:
        px = rgba[..., [2, 1, 0, 3]]
    else:
        a = rgba[..., 3:4].astype(np.uint16)
        flat = ((rgba[..., :3].astype(np.uint16) * a + 255 * (255 - a) + 127) // 255).astype(np.uint8)
        px = flat[..., ::-1]
    px = np.ascontiguousarray(px[::-1])
    head = struct.pack("<BBBHHBHHHHBB", 0, 0, 10 if rle else 2, 0, 0, 0, 0, 0, width, height, bits, 8 if bits == 32 else 0)
    if rle:
        body = b"".join(_packets(px[y]) for y in range(height))
    else:
        body = px.tobytes()
    return head + body + FOOTER
