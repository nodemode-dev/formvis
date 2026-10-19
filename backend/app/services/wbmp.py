"""WBMP type 0 (WAP) read: a zero type byte, a zero fixed header byte, width and height as variable-length integers,
then 1 bit a pixel with rows padded to whole bytes, 1 for white. The picture comes out as opaque black and white RGBA."""

import numpy as np

MAX_SIDE = 30000
MAX_PIXELS = 400_000_000


class WbmpError(Exception):
    pass


def _uint(data: bytes, at: int) -> tuple[int, int]:
    value = 0
    for i in range(5):
        if at + i >= len(data):
            raise WbmpError("This WBMP header is cut short.")
        b = data[at + i]
        value = (value << 7) | (b & 0x7F)
        if not b & 0x80:
            return value, at + i + 1
    raise WbmpError("This WBMP header is damaged.")


def looks_like_wbmp(data: bytes) -> bool:
    """A type 0 header whose size matches the data to the byte, which tells a WBMP from any other file named .wbmp."""
    try:
        if len(data) < 5 or data[0] != 0 or data[1] != 0:
            return False
        w, at = _uint(data, 2)
        h, at = _uint(data, at)
        return w > 0 and h > 0 and len(data) - at == ((w + 7) // 8) * h
    except WbmpError:
        return False


def read(data: bytes) -> np.ndarray:
    if not looks_like_wbmp(data):
        raise WbmpError("This is not a type 0 WBMP file.")
    w, at = _uint(data, 2)
    h, at = _uint(data, at)
    if w > MAX_SIDE or h > MAX_SIDE or w * h > MAX_PIXELS:
        raise WbmpError("The WBMP picture is larger than formvis edits in one piece.")
    bits = np.unpackbits(np.frombuffer(data, np.uint8, offset=at).reshape(h, (w + 7) // 8), axis=1)[:, :w]
    out = np.full((h, w, 4), 255, np.uint8)
    out[..., :3] = (bits * 255).astype(np.uint8)[..., None]
    return out
