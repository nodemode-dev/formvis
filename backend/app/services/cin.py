"""Kodak Cineon film scans (read only): 8, 10, 12 and 16 bit samples, one to four channels in pixel interleave, big
endian, the 10 bit data left justified in 32 bit words (three samples to a word) or packed. The printing density curve
of dpx.py takes the codes to linear light, then to the sRGB encoding formvis's 16-bit documents hold."""

import numpy as np

from app.services import dpx

MAGIC = b"\x80\x2a\x5f\xd7"


class CinError(Exception):
    pass


def is_cineon(data: bytes) -> bool:
    return data[:4] == MAGIC and len(data) >= 712


def _u32(data: bytes, at: int) -> int:
    return int.from_bytes(data[at : at + 4], "big")


def read(data: bytes) -> tuple[np.ndarray, dict]:
    """The picture as RGBA, 16 bits a channel, sRGB encoded, and what the header said."""
    if not is_cineon(data):
        raise CinError("This is not a Cineon file.")
    offset, channels = _u32(data, 4), data[193]
    bits, w, h = data[198], _u32(data, 200), _u32(data, 204)
    interleave, packing, line_pad = data[680], data[681], _u32(data, 684)
    if channels < 1 or channels > 4 or w < 1 or h < 1 or w > dpx.MAX_SIDE or h > dpx.MAX_SIDE or w * h > dpx.MAX_PIXELS:
        raise CinError("This Cineon file's size is not one formvis opens.")
    if bits not in (8, 10, 12, 16):
        raise CinError(f"{bits}-bit Cineon samples are not supported; 8, 10, 12 and 16 are.")
    if interleave != 0:
        raise CinError("Only pixel-interleaved Cineon files are supported.")
    per_line = w * channels
    pack = 0 if (packing & 3) == 0 and bits not in (8, 16) else 1
    if bits == 8:
        line_bytes = per_line
    elif bits == 16:
        line_bytes = per_line * 2
    elif pack == 0:
        line_bytes = -(-(per_line * bits) // 32) * 4
    elif bits == 10:
        line_bytes = -(-per_line // 3) * 4
    else:
        line_bytes = per_line * 2
    stride = line_bytes + line_pad
    if offset + stride * (h - 1) + line_bytes > len(data):
        raise CinError("This Cineon file is shorter than its header says.")
    block = data[offset : offset + stride * h] if offset + stride * h <= len(data) else data[offset:] + bytes(stride * h - (len(data) - offset))
    code = dpx._samples(block, h, stride, line_bytes, per_line, bits, pack, ">").reshape(h, w, channels).astype(np.float64) / float((1 << bits) - 1)
    if channels == 1:
        rgb, alpha = np.repeat(code, 3, axis=2), np.ones((h, w))
    elif channels == 2:
        rgb, alpha = np.repeat(code[..., :1], 3, axis=2), code[..., 1]
    elif channels == 3:
        rgb, alpha = code, np.ones((h, w))
    else:
        rgb, alpha = code[..., :3], code[..., 3]
    rgb = dpx.srgb_encode(dpx.log_to_linear(rgb))
    out = np.empty((h, w, 4), np.uint16)
    out[..., :3] = np.round(np.clip(rgb, 0.0, 1.0) * 65535.0)
    out[..., 3] = np.round(np.clip(alpha, 0.0, 1.0) * 65535.0)
    return out, {"width": w, "height": h, "bits": bits, "channels": channels}
