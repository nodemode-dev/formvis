"""Windows icons (.ico, and .cur read the same), read and written from the format as Microsoft documents it: a 6 byte
header (reserved 0, type 1 icon or 2 cursor, image count), 16 byte directory entries, then each image as a PNG or as a
DIB without its file header, whose height is twice the picture's because an AND mask (1 bit a pixel, 1 where
transparent, rows padded to 4 bytes) follows the colour data. Read: PNG entries, and DIBs of 1, 4, 8, 16, 24 and 32 bits
(palette, 555 or bitfields, BGR, BGRA; a 32 bit DIB whose alpha bytes are all zero takes its transparency from the
mask). Write: any set of sizes from 1 to 256, 32 bit BGRA DIBs with the mask for the sizes below 256 and PNG for 256
(or PNG for all)."""

import io
import struct

import numpy as np
from PIL import Image

PNG = b"\x89PNG\r\n\x1a\n"
SIZES = (16, 24, 32, 48, 64, 128, 256)


class IcoError(Exception):
    pass


def is_ico(data: bytes) -> bool:
    if len(data) < 22:
        return False
    reserved, kind, count = struct.unpack("<HHH", data[:6])
    return reserved == 0 and kind in (1, 2) and 1 <= count <= 1024


def _entries(data: bytes) -> list[tuple[int, int, int]]:
    count = struct.unpack("<H", data[4:6])[0]
    out = []
    for i in range(count):
        at = 6 + i * 16
        if at + 16 > len(data):
            raise IcoError("The icon directory runs past the end of the file.")
        size, offset = struct.unpack("<II", data[at + 8:at + 16])
        if offset + size > len(data) or size < 8:
            raise IcoError("An icon image runs past the end of the file.")
        out.append((offset, size, i))
    return out


def _dib(blob: bytes) -> np.ndarray:
    if len(blob) < 40:
        raise IcoError("An icon image is too short.")
    hsize, width, height2, planes, bpp, comp, _img, _x, _y, used, _imp = struct.unpack("<IiiHHIIiiII", blob[:40])
    if hsize < 40 or hsize > len(blob):
        raise IcoError("An icon image has an unreadable bitmap header.")
    if comp not in (0, 3):
        raise IcoError("Compressed bitmap icons are not supported.")
    if bpp not in (1, 4, 8, 16, 24, 32):
        raise IcoError(f"Icon images of {bpp} bits a pixel are not supported.")
    height = abs(height2) // 2
    top_down = height2 < 0
    if width < 1 or height < 1 or width > 1024 or height > 1024:
        raise IcoError("An icon image has an impossible size.")
    pos = hsize
    masks = None
    if comp == 3 and bpp in (16, 32):
        if hsize == 40:
            masks = struct.unpack("<III", blob[40:52])
            pos = 52
        else:
            masks = struct.unpack("<III", blob[40:52])
    palette = None
    if bpp <= 8:
        n = used or (1 << bpp)
        if pos + n * 4 > len(blob):
            raise IcoError("An icon palette runs past the end of the image.")
        pal = np.frombuffer(blob, np.uint8, count=n * 4, offset=pos).reshape(n, 4)
        palette = pal[:, [2, 1, 0]]
        pos += n * 4
    stride = ((width * bpp + 31) // 32) * 4
    mstride = ((width + 31) // 32) * 4
    if pos + stride * height > len(blob):
        raise IcoError("The icon pixels run past the end of the image.")
    rows = np.frombuffer(blob, np.uint8, count=stride * height, offset=pos).reshape(height, stride)
    out = np.empty((height, width, 4), np.uint8)
    out[..., 3] = 255
    if bpp == 32:
        px = np.ascontiguousarray(rows[:, :width * 4]).reshape(height, width, 4)
        if masks is None or masks == (0xFF0000, 0xFF00, 0xFF):
            out[..., 0], out[..., 1], out[..., 2], out[..., 3] = px[..., 2], px[..., 1], px[..., 0], px[..., 3]
        else:
            v = px.view("<u4").reshape(height, width)
            for k, m in enumerate(masks):
                shift = (m & -m).bit_length() - 1 if m else 0
                span = (m >> shift).bit_length() if m else 0
                out[..., k] = (((v & m) >> shift).astype(np.uint32) * 255 // max(1, (1 << span) - 1)).astype(np.uint8) if m else 0
    elif bpp == 24:
        px = rows[:, :width * 3].reshape(height, width, 3)
        out[..., 0], out[..., 1], out[..., 2] = px[..., 2], px[..., 1], px[..., 0]
    elif bpp == 16:
        v = rows[:, :width * 2].copy().view("<u2").reshape(height, width).astype(np.uint32)
        m = masks if masks else (0x7C00, 0x03E0, 0x001F)
        for k, mk in enumerate(m):
            shift = (mk & -mk).bit_length() - 1 if mk else 0
            span = (mk >> shift).bit_length() if mk else 0
            out[..., k] = (((v & mk) >> shift) * 255 // max(1, (1 << span) - 1)).astype(np.uint8) if mk else 0
    else:
        if bpp == 8:
            idx = rows[:, :width].astype(np.int64)
        else:
            groups = np.unpackbits(rows[:, :(width * bpp + 7) // 8], axis=1).reshape(height, -1, bpp)[:, :width]
            idx = (groups * (1 << np.arange(bpp - 1, -1, -1))).sum(axis=2).astype(np.int64)
        if idx.max() >= len(palette):
            raise IcoError("An icon pixel points outside its palette.")
        out[..., :3] = palette[idx]
    has_alpha = bpp == 32 and bool(out[..., 3].any())
    if not has_alpha:
        mpos = pos + stride * height
        if mpos + mstride * height <= len(blob):
            mrows = np.frombuffer(blob, np.uint8, count=mstride * height, offset=mpos).reshape(height, mstride)
            mask = np.unpackbits(mrows, axis=1)[:, :width]
            out[..., 3] = np.where(mask == 1, 0, 255)
        else:
            out[..., 3] = 255
    return np.ascontiguousarray(out if top_down else out[::-1])


def _image(data: bytes, offset: int, size: int) -> np.ndarray:
    blob = data[offset:offset + size]
    if blob[:8] == PNG:
        try:
            with Image.open(io.BytesIO(blob)) as im:
                return np.asarray(im.convert("RGBA"))
        except Exception as exc:
            raise IcoError(f"An icon's PNG image could not be read: {exc}") from exc
    return _dib(blob)


def _dims(data: bytes, offset: int, size: int) -> tuple[int, int, int]:
    blob = data[offset:offset + size]
    if blob[:8] == PNG and len(blob) >= 26:
        w, h = struct.unpack(">II", blob[16:24])
        return w, h, blob[24] * {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(blob[25], 4)
    if len(blob) >= 16:
        w, h2, _p, bpp = struct.unpack("<iiHH", blob[4:16])
        return w, abs(h2) // 2, bpp
    raise IcoError("An icon image is too short.")


def listing(data: bytes) -> list[dict]:
    """The images in the file, largest first (then the deeper), each with the index decode() takes."""
    if not is_ico(data):
        raise IcoError("This is not an icon file.")
    found = []
    for offset, size, i in _entries(data):
        w, h, bits = _dims(data, offset, size)
        found.append({"file": i, "offset": offset, "size": size, "width": w, "height": h, "bits": bits})
    found.sort(key=lambda e: (-(e["width"] * e["height"]), -e["bits"], e["file"]))
    for k, e in enumerate(found):
        e["index"] = k
    return found


def read(data: bytes, index: int = 0) -> np.ndarray:
    """RGBA uint8 of the index-th image, counted from the largest."""
    found = listing(data)
    if not 0 <= index < len(found):
        raise IcoError(f"The icon holds {len(found)} image{'s' if len(found) != 1 else ''}; there is no number {index + 1}.")
    e = found[index]
    return _image(data, e["offset"], e["size"])


def _fit(rgba: np.ndarray, side: int) -> np.ndarray:
    h, w = rgba.shape[:2]
    k = min(side / w, side / h)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    im = Image.fromarray(rgba)
    if (nw, nh) != (w, h):
        im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - nw) // 2, (side - nh) // 2))
    return np.asarray(canvas)


def _bmp(px: np.ndarray) -> bytes:
    side = px.shape[0]
    bgra = np.ascontiguousarray(px[..., [2, 1, 0, 3]][::-1])
    mask = np.packbits((px[..., 3] == 0)[::-1].astype(np.uint8), axis=1)
    pad = ((side + 31) // 32) * 4 - mask.shape[1]
    if pad:
        mask = np.pad(mask, ((0, 0), (0, pad)))
    colour, andmask = bgra.tobytes(), mask.tobytes()
    head = struct.pack("<IiiHHIIiiII", 40, side, side * 2, 1, 32, 0, len(colour) + len(andmask), 0, 0, 0, 0)
    return head + colour + andmask


def write(rgba: np.ndarray, sizes: list[int] | tuple[int, ...] = SIZES, png_all: bool = False) -> bytes:
    """RGBA uint8 (height, width, 4) to an icon holding the sizes asked (each fitted in a square, centred)."""
    if rgba.ndim != 3 or rgba.shape[2] != 4 or rgba.dtype != np.uint8:
        raise IcoError("Icons are written from 8-bit RGBA.")
    wanted = sorted({int(s) for s in sizes})
    if not wanted or any(s < 1 or s > 256 for s in wanted):
        raise IcoError("Choose at least one icon size between 1 and 256 pixels.")
    blobs = []
    for s in wanted:
        px = _fit(rgba, s)
        if png_all or s == 256:
            buf = io.BytesIO()
            Image.fromarray(px).save(buf, "PNG", optimize=True)
            blobs.append((s, buf.getvalue(), 0))
        else:
            blobs.append((s, _bmp(px), 32))
    out = bytearray(struct.pack("<HHH", 0, 1, len(blobs)))
    offset = 6 + 16 * len(blobs)
    for s, blob, _ in blobs:
        out += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    for _, blob, _ in blobs:
        out += blob
    return bytes(out)
