"""The Netpbm family from the published format descriptions (netpbm.sourceforge.net/doc): PBM (P1 text, P4 raw bits),
PGM (P2 text, P5 raw), PPM (P3 text, P6 raw) and PAM (P7, tuple types BLACKANDWHITE, GRAYSCALE, RGB and their _ALPHA
forms). Samples above 255 are two bytes, most significant first. A picture comes out as RGBA with every sample scaled
from its maxval to the full range of 8 or, past a maxval of 255, 16 bits; PBM's 1 is black. Writers take RGBA at 8 or 16
bits: P4 thresholds the luma at half, P5 and P6 flatten transparency on white, and P7 keeps alpha and chooses
GRAYSCALE, GRAYSCALE_ALPHA, RGB or RGB_ALPHA from what the picture holds."""

import re

import numpy as np

MAX_SIDE = 30000
MAX_PIXELS = 400_000_000
WHITESPACE = b" \t\r\n\x0b\x0c"
KINDS = {"pbm": "P4", "pgm": "P5", "ppm": "P6", "pam": "P7"}


class PnmError(Exception):
    pass


def is_pnm(data: bytes) -> bool:
    return len(data) >= 3 and data[0:1] == b"P" and data[1:2] in b"1234567" and data[2] in WHITESPACE + b"#"


class _Reader:
    def __init__(self, data: bytes, pos: int) -> None:
        self.data, self.pos = data, pos

    def token(self) -> bytes:
        d, n = self.data, len(self.data)
        while self.pos < n:
            c = d[self.pos]
            if c in WHITESPACE:
                self.pos += 1
            elif c == 0x23:
                while self.pos < n and d[self.pos] not in b"\r\n":
                    self.pos += 1
            else:
                break
        start = self.pos
        while self.pos < n and d[self.pos] not in WHITESPACE and d[self.pos] != 0x23:
            self.pos += 1
        if start == self.pos:
            raise PnmError("The file ends inside its header.")
        return d[start:self.pos]

    def number(self) -> int:
        t = self.token()
        if not t.isdigit():
            raise PnmError(f"Expected a number in the header, found {t[:12]!r}.")
        return int(t)


def _scale(v: np.ndarray, maxval: int, top: int) -> np.ndarray:
    if maxval == top:
        return v.astype(np.uint16 if top > 255 else np.uint8)
    return ((v.astype(np.uint64) * top * 2 + maxval) // (2 * maxval)).astype(np.uint16 if top > 255 else np.uint8)


def _check(width: int, height: int) -> None:
    if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise PnmError("The picture is empty or larger than formvis edits in one piece.")


def _rgba(samples: np.ndarray, depth: int, maxval: int, white_is_one: bool = True) -> tuple[np.ndarray, int]:
    """samples (h, w, depth) of raw values to RGBA at 8 or 16 bits."""
    bits = 16 if maxval > 255 else 8
    top = 65535 if bits == 16 else 255
    v = _scale(samples, maxval, top)
    h, w = v.shape[:2]
    out = np.empty((h, w, 4), v.dtype)
    if depth in (1, 2):
        out[..., 0] = out[..., 1] = out[..., 2] = v[..., 0]
        out[..., 3] = v[..., 1] if depth == 2 else top
    else:
        out[..., :3] = v[..., :3]
        out[..., 3] = v[..., 3] if depth == 4 else top
    return out, bits


def read(data: bytes) -> tuple[np.ndarray, int]:
    """(RGBA array of shape (height, width, 4), 8 or 16) for the first picture in the file."""
    if not is_pnm(data):
        raise PnmError("This is not a Netpbm file.")
    kind = data[1] - 0x30
    rd = _Reader(data, 2)
    if kind == 7:
        return _read_pam(data, rd)
    width, height = rd.number(), rd.number()
    _check(width, height)
    if kind in (1, 4):
        maxval = 1
    else:
        maxval = rd.number()
        if not 1 <= maxval <= 65535:
            raise PnmError("The maximum sample value must be between 1 and 65535.")
    depth = 3 if kind in (3, 6) else 1
    count = width * height * depth
    if kind == 1:
        digits = bytes(c for c in re.sub(rb"#[^\r\n]*", b"", data[rd.pos:]) if c not in WHITESPACE)
        if any(c not in b"01" for c in set(digits[:width * height])):
            raise PnmError("A plain bitmap holds only 0 and 1.")
        if len(digits) < width * height:
            raise PnmError("The bitmap ends before the picture does.")
        bits = (np.frombuffer(digits, np.uint8, count=width * height) - 0x30).astype(np.uint8).reshape(height, width, 1)
        return _rgba(1 - bits, 1, 1)
    if kind == 4:
        rd.pos += 1
        stride = (width + 7) // 8
        body = np.frombuffer(data, np.uint8, count=height * stride, offset=rd.pos) if len(data) - rd.pos >= height * stride else None
        if body is None:
            raise PnmError("The bitmap ends before the picture does.")
        bits = np.unpackbits(body.reshape(height, stride), axis=1)[:, :width].reshape(height, width, 1)
        return _rgba(1 - bits, 1, 1)
    if kind in (2, 3):
        words = re.sub(rb"#[^\r\n]*", b"", data[rd.pos:]).split()
        if len(words) < count or not all(w.isdigit() for w in words[:count]):
            raise PnmError("The text pixel data is short or holds something other than numbers.")
        arr = np.array(list(map(int, words[:count])), dtype=np.int64).astype(np.uint32).reshape(height, width, depth)
    else:
        rd.pos += 1
        wide = maxval > 255
        need = count * (2 if wide else 1)
        if len(data) - rd.pos < need:
            raise PnmError("The pixel data ends before the picture does.")
        arr = np.frombuffer(data, ">u2" if wide else np.uint8, count=count, offset=rd.pos).reshape(height, width, depth).astype(np.uint32)
    if int(arr.max()) > maxval:
        raise PnmError("A sample is above the maximum value the header gives.")
    return _rgba(arr, depth, maxval)


def _read_pam(data: bytes, rd: _Reader) -> tuple[np.ndarray, int]:
    fields: dict[str, str] = {}
    pos = 2
    n = len(data)
    while True:
        while pos < n and data[pos] in WHITESPACE:
            pos += 1
        if pos >= n:
            raise PnmError("The PAM header has no ENDHDR.")
        end = pos
        while end < n and data[end] not in b"\r\n":
            end += 1
        line = data[pos:end].decode("latin-1").strip()
        pos = end + 1
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition(" ")
        key = key.upper()
        if key == "ENDHDR":
            break
        value = value.strip()
        fields[key] = (fields[key] + " " + value) if key == "TUPLTYPE" and key in fields else value
    try:
        width, height, depth, maxval = int(fields["WIDTH"]), int(fields["HEIGHT"]), int(fields["DEPTH"]), int(fields["MAXVAL"])
    except (KeyError, ValueError) as exc:
        raise PnmError("The PAM header needs WIDTH, HEIGHT, DEPTH and MAXVAL.") from exc
    _check(width, height)
    if not 1 <= maxval <= 65535:
        raise PnmError("The maximum sample value must be between 1 and 65535.")
    tuple_type = fields.get("TUPLTYPE", "").split(" ")[0].upper() if fields.get("TUPLTYPE") else ""
    wanted = {"BLACKANDWHITE": 1, "GRAYSCALE": 1, "RGB": 3, "BLACKANDWHITE_ALPHA": 2, "GRAYSCALE_ALPHA": 2, "RGB_ALPHA": 4}.get(tuple_type)
    if wanted is not None and wanted != depth:
        raise PnmError(f"The PAM tuple type {tuple_type} needs a DEPTH of {wanted}.")
    if depth not in (1, 2, 3, 4):
        raise PnmError("This PAM holds a tuple type formvis cannot show as a picture (DEPTH must be 1 to 4).")
    wide = maxval > 255
    count = width * height * depth
    if n - pos < count * (2 if wide else 1):
        raise PnmError("The pixel data ends before the picture does.")
    arr = np.frombuffer(data, ">u2" if wide else np.uint8, count=count, offset=pos).reshape(height, width, depth).astype(np.uint32)
    if int(arr.max()) > maxval:
        raise PnmError("A sample is above the maximum value the header gives.")
    return _rgba(arr, depth, maxval)


def _flatten(rgba: np.ndarray) -> np.ndarray:
    """RGB over white, rounded: the picture with its transparency taken out, as uint32 of shape (h, w, 3)."""
    top = 65535 if rgba.dtype == np.uint16 else 255
    a = rgba[..., 3:4].astype(np.uint64)
    c = rgba[..., :3].astype(np.uint64)
    return ((c * a + top * (top - a) + top // 2) // top).astype(np.uint32)


def _luma(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0].astype(np.uint64), rgb[..., 1].astype(np.uint64), rgb[..., 2].astype(np.uint64)
    return ((299 * r + 587 * g + 114 * b + 500) // 1000).astype(np.uint32)


def _bytes(a: np.ndarray, wide: bool) -> bytes:
    return a.astype(">u2" if wide else np.uint8).tobytes()


def write(rgba: np.ndarray, kind: str = "ppm") -> bytes:
    """RGBA uint8 or uint16 of shape (height, width, 4) to P4 ('pbm'), P5 ('pgm'), P6 ('ppm') or P7 ('pam')."""
    if rgba.ndim != 3 or rgba.shape[2] != 4 or rgba.dtype not in (np.uint8, np.uint16):
        raise PnmError("Netpbm files are written from 8 or 16 bit RGBA.")
    if kind not in KINDS:
        raise PnmError(f"Unknown Netpbm kind {kind}.")
    height, width = rgba.shape[:2]
    _check(width, height)
    wide = rgba.dtype == np.uint16
    top = 65535 if wide else 255
    if kind == "pbm":
        white = _luma(_flatten(rgba)) * 2 >= top
        bits = np.packbits((~white).astype(np.uint8), axis=1)
        return f"P4\n{width} {height}\n".encode() + bits.tobytes()
    if kind == "pgm":
        return f"P5\n{width} {height}\n{top}\n".encode() + _bytes(_luma(_flatten(rgba)), wide)
    if kind == "ppm":
        return f"P6\n{width} {height}\n{top}\n".encode() + _bytes(_flatten(rgba), wide)
    rgb = rgba[..., :3]
    gray = bool((rgb[..., 0] == rgb[..., 1]).all() and (rgb[..., 1] == rgb[..., 2]).all())
    alpha = bool((rgba[..., 3] != top).any())
    cols = ([rgb[..., 0]] if gray else [rgb[..., 0], rgb[..., 1], rgb[..., 2]]) + ([rgba[..., 3]] if alpha else [])
    name = ("GRAYSCALE" if gray else "RGB") + ("_ALPHA" if alpha else "")
    head = f"P7\nWIDTH {width}\nHEIGHT {height}\nDEPTH {len(cols)}\nMAXVAL {top}\nTUPLTYPE {name}\nENDHDR\n".encode()
    return head + _bytes(np.stack(cols, axis=2), wide)
