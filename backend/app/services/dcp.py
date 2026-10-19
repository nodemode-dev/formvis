"""DNG Camera Profiles (DEV_PLAN 28.2): the `.dcp` files Camera Raw and other converters read, written from the published
DNG specification (version 1.6): a TIFF-structured file whose byte order mark is followed by the magic number
0x4352 ("RC") instead of 42, holding the ColorMatrix, ForwardMatrix, calibration illuminants, hue/saturation/value
map, look table and tone curve tags of chapter 6. `parse` reads one; `render` turns white-balanced linear camera values
into sRGB through it: camera to XYZ D50 (the forward matrix, or the colour matrix inverted and adapted), to linear
ProPhoto RGB, the hue/saturation/value map, exposure, the look table, the tone curve, and sRGB encoding. Two tables or
matrices (one per calibration illuminant) are blended by the inverse of the scene's correlated colour temperature."""

from __future__ import annotations

import os
import struct
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import BinaryIO

import numpy as np

MAX_BYTES = 64 * 1024 * 1024
MAX_ENTRIES = 1024
MAX_VALUES = 1 << 24
BAND = 1 << 18

T_ASCII, T_SHORT, T_LONG, T_RATIONAL, T_SRATIONAL, T_FLOAT = 2, 3, 4, 5, 10, 11
SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 16: 8}

UNIQUE_CAMERA_MODEL = 50708
COLOR_MATRIX_1, COLOR_MATRIX_2 = 50721, 50722
CALIBRATION_ILLUMINANT_1, CALIBRATION_ILLUMINANT_2 = 50778, 50779
PROFILE_CALIBRATION_SIGNATURE = 50932
PROFILE_NAME = 50936
HUE_SAT_DIMS, HUE_SAT_DATA_1, HUE_SAT_DATA_2 = 50937, 50938, 50939
TONE_CURVE = 50940
EMBED_POLICY, COPYRIGHT = 50941, 50942
FORWARD_MATRIX_1, FORWARD_MATRIX_2 = 50964, 50965
LOOK_DIMS, LOOK_DATA = 50981, 50982
HUE_SAT_ENCODING, LOOK_ENCODING = 51107, 51108
EXPOSURE_OFFSET, DEFAULT_BLACK_RENDER = 51109, 51110

D50 = np.array([0.96422, 1.0, 0.82521])
BRADFORD = np.array([[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]])
PROPHOTO_TO_XYZ = np.array([[0.7976749, 0.1351917, 0.0313534], [0.2880402, 0.7118741, 0.0000857], [0.0, 0.0, 0.8252100]])
XYZ_TO_PROPHOTO = np.linalg.inv(PROPHOTO_TO_XYZ)
XYZ_D50_TO_SRGB = np.array([[3.1338561, -1.6168667, -0.4906146], [-0.9787684, 1.9161415, 0.0334540], [0.0719453, -0.2289914, 1.4052427]])

# EXIF LightSource codes (the values the calibration illuminant tags use) and the colour temperature of each.
LIGHT_KELVIN = {1: 5500.0, 2: 4200.0, 3: 2850.0, 4: 5500.0, 9: 5500.0, 10: 6500.0, 11: 7500.0, 12: 6430.0, 13: 5000.0, 14: 4150.0, 15: 3450.0,
                17: 2856.0, 18: 4874.0, 19: 6774.0, 20: 5503.0, 21: 6504.0, 22: 7504.0, 23: 5003.0, 24: 3200.0}


class DcpError(Exception):
    pass


@dataclass
class Dcp:
    name: str = ""
    camera: str = ""
    copyright: str = ""
    signature: str = ""
    embed_policy: int = 0
    illuminant1: int = 0
    illuminant2: int = 0
    color1: np.ndarray | None = None
    color2: np.ndarray | None = None
    forward1: np.ndarray | None = None
    forward2: np.ndarray | None = None
    hue_sat1: np.ndarray | None = None
    hue_sat2: np.ndarray | None = None
    hue_sat_encoding: int = 0
    look: np.ndarray | None = None
    look_encoding: int = 0
    tone_curve: np.ndarray | None = None
    exposure_offset: float = 0.0
    default_black_render: int = 0
    extras: dict = field(default_factory=dict)


class _Source:
    """Bytes read by offset, from memory or from an open file, so a folder of profiles can be listed by name without
    reading the tables."""

    def __init__(self, data: bytes | BinaryIO, size: int | None = None):
        self.data = data
        if isinstance(data, (bytes, bytearray)):
            self.size = len(data)
        else:
            self.size = size if size is not None else data.seek(0, 2)

    def get(self, offset: int, n: int) -> bytes:
        if offset < 0 or n < 0 or offset + n > self.size:
            raise DcpError("The profile points outside its own data (the file is damaged or cut short).")
        if isinstance(self.data, (bytes, bytearray)):
            return bytes(self.data[offset : offset + n])
        self.data.seek(offset)
        return self.data.read(n)


def _header(src: _Source) -> tuple[str, int]:
    head = src.get(0, 8) if src.size >= 8 else b""
    order = {b"II": "<", b"MM": ">"}.get(head[:2])
    if not order:
        raise DcpError("This is not a camera profile: it does not start with a TIFF byte order mark.")
    magic = struct.unpack(order + "H", head[2:4])[0]
    if magic not in (0x4352, 42):
        raise DcpError("This is not a DNG camera profile (its magic number is not 0x4352).")
    return order, struct.unpack(order + "I", head[4:8])[0]


def _entries(src: _Source, order: str, ifd: int) -> dict[int, tuple[int, int, bytes]]:
    count = struct.unpack(order + "H", src.get(ifd, 2))[0]
    if count > MAX_ENTRIES:
        raise DcpError("The profile's directory is implausibly long.")
    raw = src.get(ifd + 2, count * 12)
    out = {}
    for i in range(count):
        tag, kind, n = struct.unpack(order + "HHI", raw[i * 12 : i * 12 + 8])
        out[tag] = (kind, n, raw[i * 12 + 8 : i * 12 + 12])
    return out


def _bytes(src: _Source, order: str, entry: tuple[int, int, bytes]) -> bytes:
    kind, n, field_ = entry
    size = SIZES.get(kind)
    if size is None or n > MAX_VALUES:
        raise DcpError("The profile has a value of a kind this reader does not know.")
    total = size * n
    if total <= 4:
        return field_[:total]
    return src.get(struct.unpack(order + "I", field_)[0], total)


def _numbers(src: _Source, order: str, entry: tuple[int, int, bytes]) -> np.ndarray:
    kind, n, _f = entry
    raw = _bytes(src, order, entry)
    e = order
    if kind in (T_RATIONAL, T_SRATIONAL):
        pairs = np.frombuffer(raw, np.dtype(e + ("u4" if kind == T_RATIONAL else "i4"))).reshape(-1, 2).astype(np.float64)
        if np.any(pairs[:, 1] == 0):
            raise DcpError("A matrix in the profile has a zero denominator.")
        return pairs[:, 0] / pairs[:, 1]
    dtypes = {1: "u1", 3: "u2", 4: "u4", 6: "i1", 7: "u1", 8: "i2", 9: "i4", 11: "f4", 12: "f8", 13: "u4"}
    if kind not in dtypes:
        raise DcpError("The profile has a number of a kind this reader does not know.")
    return np.frombuffer(raw, np.dtype(e + dtypes[kind])).astype(np.float64)


def _text(src: _Source, order: str, entry: tuple[int, int, bytes]) -> str:
    return _bytes(src, order, entry).split(b"\0")[0].decode("utf-8", "replace").strip()


def _matrix(values: np.ndarray, name: str) -> np.ndarray:
    if values.size != 9:
        raise DcpError(f"{name} has {values.size} numbers; only three-colour cameras (a 3 by 3 matrix) are supported.")
    return values.reshape(3, 3)


def _table(dims: np.ndarray, values: np.ndarray, name: str) -> np.ndarray:
    hue, sat, val = (int(d) for d in dims)
    if hue < 1 or sat < 2 or val < 1 or hue * sat * val * 3 != values.size or hue * sat * val > 1 << 20:
        raise DcpError(f"The {name} table's size does not match its divisions.")
    return values.reshape(val, hue, sat, 3).astype(np.float32)


def names(data: bytes | BinaryIO, size: int | None = None) -> dict:
    """Only the profile name and the camera it is for, read without the tables (listing a folder)."""
    src = _Source(data, size)
    order, ifd = _header(src)
    e = _entries(src, order, ifd)
    return {"name": _text(src, order, e[PROFILE_NAME]) if PROFILE_NAME in e else "", "camera": _text(src, order, e[UNIQUE_CAMERA_MODEL]) if UNIQUE_CAMERA_MODEL in e else ""}


def parse(data: bytes) -> Dcp:
    """A camera profile read in full; DcpError, in plain words, when it is not one or is damaged."""
    if len(data) > MAX_BYTES:
        raise DcpError("The profile file is larger than 64 MB.")
    src = _Source(data)
    order, ifd = _header(src)
    e = _entries(src, order, ifd)
    p = Dcp()
    if PROFILE_NAME in e:
        p.name = _text(src, order, e[PROFILE_NAME])
    if UNIQUE_CAMERA_MODEL in e:
        p.camera = _text(src, order, e[UNIQUE_CAMERA_MODEL])
    if COPYRIGHT in e:
        p.copyright = _text(src, order, e[COPYRIGHT])
    if PROFILE_CALIBRATION_SIGNATURE in e:
        p.signature = _text(src, order, e[PROFILE_CALIBRATION_SIGNATURE])
    one = lambda tag, d=0.0: float(_numbers(src, order, e[tag])[0]) if tag in e else d
    p.embed_policy = int(one(EMBED_POLICY))
    p.illuminant1, p.illuminant2 = int(one(CALIBRATION_ILLUMINANT_1)), int(one(CALIBRATION_ILLUMINANT_2))
    for tag, attr in ((COLOR_MATRIX_1, "color1"), (COLOR_MATRIX_2, "color2"), (FORWARD_MATRIX_1, "forward1"), (FORWARD_MATRIX_2, "forward2")):
        if tag in e:
            setattr(p, attr, _matrix(_numbers(src, order, e[tag]), {COLOR_MATRIX_1: "ColorMatrix1", COLOR_MATRIX_2: "ColorMatrix2", FORWARD_MATRIX_1: "ForwardMatrix1", FORWARD_MATRIX_2: "ForwardMatrix2"}[tag]))
    if p.color1 is None and p.forward1 is None:
        raise DcpError("The profile holds neither a ColorMatrix1 nor a ForwardMatrix1, so it cannot map the camera's colours.")
    if HUE_SAT_DIMS in e:
        dims = _numbers(src, order, e[HUE_SAT_DIMS])
        if dims.size != 3:
            raise DcpError("ProfileHueSatMapDims must hold three numbers.")
        if HUE_SAT_DATA_1 in e:
            p.hue_sat1 = _table(dims, _numbers(src, order, e[HUE_SAT_DATA_1]), "ProfileHueSatMapData1")
        if HUE_SAT_DATA_2 in e:
            p.hue_sat2 = _table(dims, _numbers(src, order, e[HUE_SAT_DATA_2]), "ProfileHueSatMapData2")
    p.hue_sat_encoding = int(one(HUE_SAT_ENCODING))
    if LOOK_DIMS in e and LOOK_DATA in e:
        dims = _numbers(src, order, e[LOOK_DIMS])
        if dims.size != 3:
            raise DcpError("ProfileLookTableDims must hold three numbers.")
        p.look = _table(dims, _numbers(src, order, e[LOOK_DATA]), "ProfileLookTableData")
    p.look_encoding = int(one(LOOK_ENCODING))
    if TONE_CURVE in e:
        pts = _numbers(src, order, e[TONE_CURVE])
        if pts.size >= 4 and pts.size % 2 == 0:
            curve = pts.reshape(-1, 2)
            curve = curve[np.argsort(curve[:, 0], kind="stable")]
            keep = np.concatenate([[True], np.diff(curve[:, 0]) > 1e-9])
            p.tone_curve = np.clip(curve[keep], 0.0, 1.0)
            if p.tone_curve.shape[0] < 2:
                p.tone_curve = None
    p.exposure_offset = one(EXPOSURE_OFFSET)
    p.default_black_render = int(one(DEFAULT_BLACK_RENDER))
    return p


def _kelvin(code: int, fallback: float) -> float:
    return LIGHT_KELVIN.get(code, fallback)


def _cct(x: float, y: float) -> float:
    n = (x - 0.3320) / (0.1858 - y)
    return float(449.0 * n**3 + 3525.0 * n**2 + 6823.3 * n + 5520.33)


def _blend(a: np.ndarray | None, b: np.ndarray | None, g: float) -> np.ndarray | None:
    if a is None:
        return b
    if b is None or a.shape != b.shape:
        return a
    return g * a + (1.0 - g) * b


def weight(p: Dcp, kelvin: float) -> float:
    """The share of the first illuminant's matrices and tables at a scene colour temperature: linear in inverse colour
    temperature between the two illuminants, all of one at or beyond its end."""
    t1, t2 = _kelvin(p.illuminant1, 2856.0), _kelvin(p.illuminant2, 6504.0)
    if (p.color2 is None and p.forward2 is None) or abs(1.0 / t1 - 1.0 / t2) < 1e-12:
        return 1.0
    return float(np.clip((1.0 / kelvin - 1.0 / t2) / (1.0 / t1 - 1.0 / t2), 0.0, 1.0))


def camera_to_pcs(p: Dcp, neutral: np.ndarray) -> tuple[np.ndarray, float]:
    """The matrix taking white-balanced linear camera values (the as-shot neutral at 1, 1, 1) to XYZ D50, and the weight
    of the first illuminant that the neutral's colour temperature chose. With a forward matrix it is that, blended;
    without one the colour matrix is inverted through the neutral and the result adapted from the scene white to D50
    (Bradford), as chapter 6 describes."""
    g = 1.0
    if p.color1 is not None:
        for _ in range(40):
            cm = _blend(p.color1, p.color2, g)
            xyz = np.linalg.solve(cm, neutral)
            total = float(xyz.sum())
            if not np.isfinite(total) or abs(total) < 1e-9:
                break
            nxt = weight(p, float(np.clip(_cct(xyz[0] / total, xyz[1] / total), 2000.0, 12500.0)))
            if abs(nxt - g) < 1e-6:
                g = nxt
                break
            g = nxt
    else:
        g = weight(p, 5003.0)
    if p.forward1 is not None:
        return np.asarray(_blend(p.forward1, p.forward2, g)), g
    cm = _blend(p.color1, p.color2, g)
    inverse = np.linalg.inv(cm)
    white = inverse @ neutral
    s, d = BRADFORD @ white, BRADFORD @ D50
    adapt = np.linalg.inv(BRADFORD) @ np.diag(d / s) @ BRADFORD
    m = adapt @ inverse @ np.diag(neutral)
    return m / float((m @ np.ones(3))[1]), g


def _srgb_encode(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.maximum(x, 0.0031308), 1 / 2.4) - 0.055)


def _srgb_decode(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, np.power((np.maximum(x, 0.04045) + 0.055) / 1.055, 2.4))


def _to_hsv(c: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    r, g, b = c[:, 0], c[:, 1], c[:, 2]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    d = mx - mn
    inv = np.float32(1.0) / np.maximum(d, np.float32(1e-20))
    h = np.where(mx == r, (g - b) * inv, np.where(mx == g, (b - r) * inv + 2.0, (r - g) * inv + 4.0)).astype(np.float32)
    h = np.where(d > 0, h % 6.0, 0.0).astype(np.float32)
    s = (d / np.maximum(mx, np.float32(1e-20))).astype(np.float32)
    return h, s, mx


def _from_hsv(h: np.ndarray, s: np.ndarray, v: np.ndarray) -> np.ndarray:
    vs = v * s
    out = np.empty((h.shape[0], 3), np.float32)
    for c, n in enumerate((5.0, 3.0, 1.0)):
        k = (h + np.float32(n)) % np.float32(6.0)
        out[:, c] = v - vs * np.clip(np.minimum(k, np.float32(4.0) - k), 0.0, 1.0)
    return out


def apply_map(rgb: np.ndarray, table: np.ndarray, encoding: int) -> np.ndarray:
    """A hue/saturation/value map (value, hue, saturation, three numbers: hue shift in degrees, saturation scale, value
    scale) applied to linear RGB in [0, 1]: through HSV (of the sRGB-encoded values when the profile says so), with
    wrap-around in hue and linear interpolation in all three dimensions."""
    x = np.clip(rgb, 0.0, 1.0)
    if encoding == 1:
        x = _srgb_encode(x)
    h, s, v = _to_hsv(x)
    V, H, S, _ = table.shape
    flat = table.reshape(-1, 3)
    hf = h * np.float32(H / 6.0)
    h0 = np.floor(hf).astype(np.int32)
    fh = (hf - h0)[:, None]
    h0, h1 = h0 % H, (h0 + 1) % H
    sf = s * np.float32(S - 1)
    s0 = np.minimum(np.floor(sf).astype(np.int32), S - 2)
    fs = (sf - s0)[:, None]
    if V > 1:
        vf = v * np.float32(V - 1)
        v0 = np.minimum(np.floor(vf).astype(np.int32), V - 2)
        slabs = ((v0, 1 - (vf - v0)[:, None]), (v0 + 1, (vf - v0)[:, None]))
    else:
        slabs = ((np.zeros(h.shape, np.int32), None),)
    out = 0.0
    for vi, wv in slabs:
        base = vi * (H * S)
        part = 0.0
        for hi, wh in ((h0, 1 - fh), (h1, fh)):
            row = base + hi * S
            part = part + (flat[row + s0] * (1 - fs) + flat[row + s0 + 1] * fs) * wh
        out = out + (part if wv is None else part * wv)
    h = h + out[:, 0] / np.float32(60.0)
    s = np.minimum(s * out[:, 1], np.float32(1.0))
    v = np.minimum(v * out[:, 2], np.float32(1.0))
    y = _from_hsv(h, s, v)
    return _srgb_decode(y) if encoding == 1 else y


def tone_lut(curve: np.ndarray, size: int = 4096) -> np.ndarray:
    """The profile's tone curve on an even grid: a monotone cubic through its points (Fritsch and Carlson's slopes), so
    it cannot overshoot between points."""
    x, y = curve[:, 0], curve[:, 1]
    h, d = np.diff(x), np.diff(y) / np.diff(x)
    m = np.zeros_like(x)
    m[1:-1] = np.where(d[:-1] * d[1:] > 0, 2 * d[:-1] * d[1:] / np.where(d[:-1] + d[1:] != 0, d[:-1] + d[1:], 1.0), 0.0)
    m[0], m[-1] = d[0], d[-1]
    grid = np.linspace(0.0, 1.0, size)
    i = np.clip(np.searchsorted(x, grid, side="right") - 1, 0, len(x) - 2)
    t = (grid - x[i]) / h[i]
    t = np.clip(t, 0.0, 1.0)
    h00, h10, h01, h11 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2, t**3 - t**2
    out = h00 * y[i] + h10 * h[i] * m[i] + h01 * y[i + 1] + h11 * h[i] * m[i + 1]
    out = np.where(grid <= x[0], y[0], np.where(grid >= x[-1], y[-1], out))
    return np.clip(out, 0.0, 1.0).astype(np.float32)


def apply_tone(rgb: np.ndarray, lut: np.ndarray) -> np.ndarray:
    """The curve applied to the largest and smallest channel of each pixel, the middle one placed between them in the
    same proportion, so the hue does not shift."""
    x = np.clip(rgb, 0.0, 1.0)
    r, g, b = x[:, 0], x[:, 1], x[:, 2]
    lo, hi = np.minimum(np.minimum(r, g), b), np.maximum(np.maximum(r, g), b)
    mid = r + g + b - lo - hi
    ylo, yhi = _lookup(lo, lut), _lookup(hi, lut)
    span = hi - lo
    ymid = np.where(span > 1e-9, ylo + (yhi - ylo) * (mid - lo) / np.maximum(span, np.float32(1e-9)), yhi).astype(np.float32)
    return np.where(x >= hi[:, None], yhi[:, None], np.where(x <= lo[:, None], ylo[:, None], ymid[:, None])).astype(np.float32)


def _mul3(c: np.ndarray, m: np.ndarray) -> np.ndarray:
    """(n, 3) times a 3 by 3 matrix's transpose, by column: faster than a matrix product for such thin arrays."""
    return c[:, 0:1] * m[:, 0] + c[:, 1:2] * m[:, 1] + c[:, 2:3] * m[:, 2]


def _lookup(x: np.ndarray, table: np.ndarray) -> np.ndarray:
    """Values in [0, 1] through a table sampled evenly over [0, 1], linearly between samples, in single precision."""
    t = x * np.float32(table.size - 1)
    i = np.minimum(t.astype(np.int32), table.size - 2)
    f = t - i
    return table[i] + (table[i + 1] - table[i]) * f


_ENCODE = (_srgb_encode(np.linspace(0.0, 1.0, 16385)) * 255.0).astype(np.float32)


def render(linear: np.ndarray, neutral: np.ndarray, p: Dcp, exposure: float = 1.0) -> np.ndarray:
    """White-balanced linear camera values (height, width, 3; floats where 1.0 is the sensor's white) through the
    profile to 8-bit sRGB. `neutral` is the as-shot neutral (the camera's response to the scene white, one for the
    strongest channel). `exposure` is a plain linear gain applied first (the caller's auto exposure)."""
    h, w, _ = linear.shape
    cam, g = camera_to_pcs(p, np.asarray(neutral, dtype=np.float64))
    to_prophoto = (XYZ_TO_PROPHOTO @ cam).astype(np.float32)
    to_srgb = (XYZ_D50_TO_SRGB @ PROPHOTO_TO_XYZ).astype(np.float32)
    hue_sat = _blend(p.hue_sat1, p.hue_sat2, g)
    look = p.look
    lut = tone_lut(p.tone_curve) if p.tone_curve is not None else None
    gain = float(exposure) * 2.0 ** float(p.exposure_offset)
    flat = linear.reshape(-1, 3)
    out = np.empty((h * w, 3), np.uint8)

    def band(a: int) -> None:
        c = flat[a : a + BAND].astype(np.float32)
        c *= gain
        c = np.clip(_mul3(np.clip(c, 0.0, 1.0), to_prophoto), 0.0, 1.0)
        if hue_sat is not None:
            c = apply_map(c, hue_sat, p.hue_sat_encoding)
        if look is not None:
            c = apply_map(c, look, p.look_encoding)
        if lut is not None:
            c = apply_tone(c, lut)
        c = np.clip(_mul3(c, to_srgb), 0.0, 1.0)
        out[a : a + BAND] = (_lookup(c, _ENCODE) + np.float32(0.5)).astype(np.uint8)

    starts = range(0, flat.shape[0], BAND)
    with ThreadPoolExecutor(max_workers=max(1, min(os.cpu_count() or 1, 8))) as pool:
        list(pool.map(band, starts))
    return out.reshape(h, w, 3)
