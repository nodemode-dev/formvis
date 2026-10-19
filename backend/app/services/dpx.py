"""DPX film scans (SMPTE 268M, version 2.0), read and written in numpy: 8, 10, 12 and 16 bits, both byte orders, the
filled packings (Method A and B) and the packed 10 and 12 bit stream, RGB, RGBA, ABGR and luma. The header's transfer
characteristic is honoured: printing density and logarithmic data go through the Cineon/Kodak curve (reference white
685, reference black 95, 0.002 density a code value, negative gamma 0.6 as printed film) to linear light, linear data
is taken as linear light, and video transfers are taken as already encoded. Pictures come out as formvis's 16-bit
documents hold them, sRGB encoded; the writer takes the same and writes the transfer asked for."""

import time

import numpy as np

REF_WHITE = 685.0
REF_BLACK = 95.0
DENSITY_STEP = 0.002
FILM_GAMMA = 0.6
TOP10 = 1023.0
OFFSET = 10.0 ** ((REF_BLACK - REF_WHITE) * DENSITY_STEP / FILM_GAMMA)
TRANSFER_CODES = {"density": 1, "linear": 2, "log": 3}
TRANSFER_NAMES = {1: "density", 2: "linear", 3: "log"}
DESCRIPTORS = {50: 3, 51: 4, 52: 4, 6: 1, 1: 1, 2: 1, 3: 1, 4: 1}
MAX_SIDE = 30000
MAX_PIXELS = 400_000_000


class DpxError(Exception):
    pass


def is_dpx(data: bytes) -> bool:
    return data[:4] in (b"SDPX", b"XPDS")


def srgb_decode(v: np.ndarray) -> np.ndarray:
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def srgb_encode(v: np.ndarray) -> np.ndarray:
    v = np.clip(v, 0.0, 1.0)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * v ** (1 / 2.4) - 0.055)


def log_to_linear(norm: np.ndarray) -> np.ndarray:
    """Cineon printing-density codes (0 to 1 over the code range, so 685 of 1023 is reference white) to linear light,
    0 at reference black and 1 at reference white; film's highlight range above white is clipped there."""
    u = np.asarray(norm, dtype=np.float64) * TOP10
    return np.clip((10.0 ** ((u - REF_WHITE) * DENSITY_STEP / FILM_GAMMA) - OFFSET) / (1.0 - OFFSET), 0.0, 1.0)


def linear_to_log(lin: np.ndarray) -> np.ndarray:
    lin = np.clip(np.asarray(lin, dtype=np.float64), 0.0, 1.0)
    u = REF_WHITE + np.log10(lin * (1.0 - OFFSET) + OFFSET) * FILM_GAMMA / DENSITY_STEP
    return np.clip(u, 0.0, TOP10) / TOP10


def _u32(data: bytes, at: int, e: str) -> int:
    return int(np.frombuffer(data, dtype=e + "u4", count=1, offset=at)[0])


def _u16(data: bytes, at: int, e: str) -> int:
    return int(np.frombuffer(data, dtype=e + "u2", count=1, offset=at)[0])


def _samples(block: bytes, rows: int, stride: int, line_bytes: int, per_line: int, bits: int, packing: int, e: str) -> np.ndarray:
    """`rows` lines of `per_line` samples each, as integers. `stride` is a line's size in the file, `line_bytes` the
    part that holds samples."""
    raw = np.frombuffer(block, dtype=np.uint8, count=rows * stride).reshape(rows, stride)[:, :line_bytes]
    raw = np.ascontiguousarray(raw)
    if bits == 8:
        return raw[:, :per_line].astype(np.uint32)
    if bits == 16:
        return raw.view(e + "u2")[:, :per_line].astype(np.uint32)
    if packing == 0:
        be = raw.view(e + "u4").astype(">u4").view(np.uint8).reshape(rows, -1)
        stream = np.unpackbits(be, axis=1)[:, : per_line * bits].reshape(rows, per_line, bits)
        return (stream.astype(np.uint32) << np.arange(bits - 1, -1, -1, dtype=np.uint32)).sum(axis=2)
    if bits == 10:
        words = raw.view(e + "u4").astype(np.uint32)
        shifts = (22, 12, 2) if packing == 1 else (20, 10, 0)
        parts = np.stack([(words >> s) & 0x3FF for s in shifts], axis=2).reshape(rows, -1)
        return parts[:, :per_line]
    halves = raw.view(e + "u2").astype(np.uint32)[:, :per_line]
    return (halves >> 4) & 0xFFF if packing == 1 else halves & 0xFFF


def read(data: bytes) -> tuple[np.ndarray, dict]:
    """The picture as RGBA, 16 bits a channel, in formvis's sRGB encoding, and what the header said."""
    if not is_dpx(data) or len(data) < 1664:
        raise DpxError("This is not a DPX file.")
    e = ">" if data[:4] == b"SDPX" else "<"
    try:
        n_elem = _u16(data, 770, e)
        w, h = _u32(data, 772, e), _u32(data, 776, e)
        if n_elem < 1 or w < 1 or h < 1 or w > MAX_SIDE or h > MAX_SIDE or w * h > MAX_PIXELS:
            raise DpxError("This DPX file's size is not one formvis opens.")
        el = 780
        descriptor, transfer, bits = data[el + 20], data[el + 21], data[el + 23]
        packing, encoding, offset, eol = _u16(data, el + 24, e), _u16(data, el + 26, e), _u32(data, el + 28, e), _u32(data, el + 32, e)
        if offset in (0, 0xFFFFFFFF):
            offset = _u32(data, 4, e)
        if eol == 0xFFFFFFFF:
            eol = 0
    except (ValueError, IndexError) as exc:
        raise DpxError("This DPX header is damaged.") from exc
    if encoding:
        raise DpxError("Run-length encoded DPX files are not supported.")
    if descriptor not in DESCRIPTORS:
        raise DpxError(f"DPX element type {descriptor} (YCbCr, depth or composite) is not supported; RGB, RGBA and luma are.")
    if bits not in (8, 10, 12, 16):
        raise DpxError(f"{bits}-bit DPX samples are not supported; 8, 10, 12 and 16 are.")
    nc = DESCRIPTORS[descriptor]
    per_line = w * nc
    if bits == 8:
        line_bytes = per_line
    elif bits == 16:
        line_bytes = per_line * 2
    elif packing == 0:
        line_bytes = -(-(per_line * bits) // 32) * 4
    elif bits == 10:
        line_bytes = -(-per_line // 3) * 4
    else:
        line_bytes = per_line * 2
    stride = line_bytes + eol
    if offset + stride * (h - 1) + line_bytes > len(data):
        raise DpxError("This DPX file is shorter than its header says.")
    block = data[offset : offset + stride * h] if offset + stride * h <= len(data) else data[offset:] + bytes(stride * h - (len(data) - offset))
    code = _samples(block, h, stride, line_bytes, per_line, bits, packing, e).reshape(h, w, nc).astype(np.float64) / float((1 << bits) - 1)
    if descriptor == 52:
        code = code[..., ::-1]
    if nc == 1:
        rgb, alpha = np.repeat(code, 3, axis=2), np.ones((h, w))
        if descriptor == 4:
            rgb, alpha = np.zeros((h, w, 3)), code[..., 0]
    elif nc == 3:
        rgb, alpha = code, np.ones((h, w))
    else:
        rgb, alpha = code[..., :3], code[..., 3]
    if transfer in (1, 3):
        rgb = srgb_encode(log_to_linear(rgb))
    elif transfer == 2:
        rgb = srgb_encode(rgb)
    out = np.empty((h, w, 4), np.uint16)
    out[..., :3] = np.round(np.clip(rgb, 0.0, 1.0) * 65535.0)
    out[..., 3] = np.round(np.clip(alpha, 0.0, 1.0) * 65535.0)
    orientation = _u16(data, 768, e)
    if orientation >= 4 and orientation < 8:
        out = out.transpose(1, 0, 2)
        w, h = h, w
    if orientation in (1, 3, 5, 7):
        out = out[:, ::-1]
    if orientation in (2, 3, 6, 7):
        out = out[::-1]
    out = np.ascontiguousarray(out)
    return out, {"width": w, "height": h, "orientation": orientation, "bits": bits, "transfer": TRANSFER_NAMES.get(transfer, f"code {transfer}"), "transferCode": transfer,
                 "descriptor": descriptor, "bigEndian": e == ">", "packing": packing}


def write(rgba16: np.ndarray, bits: int = 10, transfer: str = "log", big_endian: bool = True, name: str = "") -> bytes:
    """A DPX file from RGBA (height, width, 4) at 16 bits, sRGB encoded. 10 and 12 bit files hold RGB filled Method A
    (alpha is dropped there); 8 and 16 bit files keep alpha when any pixel is not opaque."""
    if bits not in (8, 10, 12, 16):
        raise DpxError("DPX is written at 8, 10, 12 or 16 bits.")
    if transfer not in TRANSFER_CODES:
        raise DpxError("The transfer is linear, density or log.")
    h, w = rgba16.shape[:2]
    if w < 1 or h < 1 or w > MAX_SIDE or h > MAX_SIDE:
        raise DpxError("This picture's size cannot be written as DPX.")
    e = ">" if big_endian else "<"
    rgb = rgba16[..., :3].astype(np.float64) / 65535.0
    lin = srgb_decode(rgb)
    norm = np.clip(lin, 0.0, 1.0) if transfer == "linear" else linear_to_log(lin)
    top = float((1 << bits) - 1)
    codes = np.round(norm * top).astype(np.uint32)
    with_alpha = bits in (8, 16) and bool((rgba16[..., 3] < 65535).any())
    if with_alpha:
        codes = np.concatenate([codes, np.round(rgba16[..., 3:4].astype(np.float64) / 65535.0 * top).astype(np.uint32)], axis=2)
    nc = codes.shape[2]
    flat = codes.reshape(h, w * nc)
    if bits == 8:
        body = flat.astype(np.uint8)
    elif bits == 16:
        body = flat.astype(e + "u2").view(np.uint8).reshape(h, -1)
    elif bits == 10:
        words = (flat[:, 0::3] << 22) | (flat[:, 1::3] << 12) | (flat[:, 2::3] << 2)
        body = words.astype(e + "u4").view(np.uint8).reshape(h, -1)
    else:
        body = (flat << 4).astype(e + "u2").view(np.uint8).reshape(h, -1)
    pad = (-body.shape[1]) % 4
    if pad:
        body = np.concatenate([body, np.zeros((h, pad), np.uint8)], axis=1)
    payload = np.ascontiguousarray(body).tobytes()
    head = bytearray(2048)
    head[0:4] = b"SDPX" if big_endian else b"XPDS"

    def put32(at: int, v: int) -> None:
        head[at : at + 4] = int(v).to_bytes(4, "big" if big_endian else "little")

    def put16(at: int, v: int) -> None:
        head[at : at + 2] = int(v).to_bytes(2, "big" if big_endian else "little")

    put32(4, 2048)
    head[8:16] = b"V2.0".ljust(8, b"\0")
    put32(16, 2048 + len(payload))
    put32(20, 0xFFFFFFFF)
    put32(24, 1664)
    put32(28, 384)
    put32(32, 0)
    head[36:136] = name.encode("ascii", "ignore")[:99].ljust(100, b"\0")
    head[136:160] = time.strftime("%Y:%m:%d:%H:%M:%S:000", time.gmtime()).encode("ascii").ljust(24, b"\0")
    head[160:260] = b"formvis".ljust(100, b"\0")
    put32(660, 0xFFFFFFFF)
    put16(768, 0)
    put16(770, 1)
    put32(772, w)
    put32(776, h)
    for k in range(1, 8):
        head[780 + 72 * k : 780 + 72 * (k + 1)] = b"\xff" * 72
    t = TRANSFER_CODES[transfer]
    put32(780, 0)
    put32(784, 0)
    head[788:792] = np.float32(0.0).astype(e + "f4").tobytes()
    put32(792, int(top))
    head[796:800] = np.float32(1.0 if transfer == "linear" else TOP10 * DENSITY_STEP).astype(e + "f4").tobytes()
    head[800] = 51 if with_alpha else 50
    head[801] = t
    head[802] = t if transfer != "linear" else 4
    head[803] = bits
    put16(804, 1 if bits in (10, 12) else 0)
    put16(806, 0)
    put32(808, 2048)
    put32(812, pad)
    put32(816, 0)
    head[820:852] = (transfer.title() + (" RGBA" if with_alpha else " RGB")).encode("ascii").ljust(32, b"\0")
    head[1408:1432] = b"\xff" * 24
    return bytes(head) + payload
