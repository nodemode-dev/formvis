"""Camera RAW identification by content, the metadata summary, and the RAW-stage develop controls (Exposure, Highlight
Recovery, Noise Reduction, Shadows, Highlights, Clarity, Texture, Dehaze, adaptive black point). The controls work on
LibRaw's linear output (white balanced, colour converted, no gamma), in linear light, and the result is encoded with the
same curve LibRaw uses by default, so every control at zero gives the plain decode back."""

from __future__ import annotations

import json
import struct

import cv2
import numpy as np

RECOVERY = ("clip", "unclip", "blend", "rebuild")
BLACK_POINTS = ("as_shot", "auto")
TONE_KEYS = ("shadows", "highlights", "clarity", "texture", "dehaze")
MAKERS = ("nikon", "sony", "pentax", "olympus", "canon", "panasonic", "leica", "fujifilm", "ricoh", "samsung", "hasselblad", "phase one", "sigma", "minolta", "kodak", "epson", "mamiya")
_FRONT = (
    (b"FUJIFILMCCD-RAW", 0, "raf"), (b"IIRO", 0, "orf"), (b"IIRS", 0, "orf"), (b"MMOR", 0, "orf"), (b"IIU\x00", 0, "rw2"),
    (b"\x00MRM", 0, "mrw"), (b"FOVb", 0, "x3f"), (b"HEAPCCDR", 6, "crw"), (b"ftypcrx ", 4, "cr3"), (b"CR", 8, "cr2"),
)


def _ifd0(data: bytes) -> dict:
    """The first directory of a TIFF-structured file as {tag: (kind, count, value bytes at the entry, order)}."""
    order = {b"II": "<", b"MM": ">"}.get(data[:2])
    if not order or len(data) < 8 or struct.unpack(order + "H", data[2:4])[0] != 42:
        return {}
    at = struct.unpack(order + "I", data[4:8])[0]
    try:
        n = struct.unpack(order + "H", data[at:at + 2])[0]
        out = {}
        for i in range(min(n, 512)):
            e = data[at + 2 + i * 12:at + 14 + i * 12]
            tag, kind, count = struct.unpack(order + "HHI", e[:8])
            out[tag] = (kind, count, e[8:12], order)
        return out
    except struct.error:
        return {}


def sniff(data: bytes) -> str:
    """The raw family a file's bytes show ("dng", "cr2", "raf" and so on), or "" when they show none."""
    head = data[:64]
    for magic, at, kind in _FRONT:
        if head[at:at + len(magic)] == magic and (kind != "cr2" or head[:2] in (b"II", b"MM")):
            return kind
    ifd = _ifd0(data[:1 << 20])
    if 50706 in ifd:
        return "dng"
    if 271 in ifd and 330 in ifd:
        kind, count, value, order = ifd[271]
        at = struct.unpack(order + "I", value)[0] if count > 4 else 0
        make = (data[at:at + count] if count > 4 else value[:count]).split(b"\0")[0].decode("ascii", "replace").lower()
        if any(m in make for m in MAKERS):
            return "tiffraw"
    return ""


def _baseline(data: bytes) -> float | None:
    ifd = _ifd0(data[:1 << 20])
    if 50730 not in ifd:
        return None
    _kind, count, value, order = ifd[50730]
    at = struct.unpack(order + "I", value)[0]
    try:
        num, den = struct.unpack(order + "ii", data[at:at + 8])
    except struct.error:
        return None
    return round(num / den, 3) if den else None


def info(data: bytes, raw, camera: dict) -> dict:
    """What an open summary shows: make and model, the raw and visible sensor sizes, the CFA pattern, the white balance
    multipliers, orientation, baseline exposure, black and white levels."""
    s = raw.sizes
    desc = raw.color_desc.decode("ascii", "replace")
    pattern = "".join(desc[int(p)] for p in raw.raw_pattern.flatten()) if raw.raw_pattern is not None else ""
    wb = [round(float(v), 4) for v in raw.camera_whitebalance[:3]]
    turn = {0: 1, 3: 3, 5: 8, 6: 6}.get(int(s.flip), 1)
    return {
        "kind": sniff(data), "make": camera.get("make", ""), "model": camera.get("model", ""),
        "rawWidth": int(s.raw_width), "rawHeight": int(s.raw_height), "width": int(s.width), "height": int(s.height),
        "cfa": pattern, "colors": int(raw.num_colors), "whiteBalance": wb, "orientation": turn,
        "baselineExposure": _baseline(data), "blackLevel": [int(v) for v in raw.black_level_per_channel], "whiteLevel": int(raw.white_level),
    }


def options(text: str) -> dict:
    """The develop options from a JSON object, clamped; unknown keys are ignored. {} for no text."""
    if not text:
        return {}
    try:
        given = json.loads(text)
    except ValueError:
        given = None
    if not isinstance(given, dict):
        raise ValueError("The develop options must be a JSON object.")

    def num(key: str, low: float, high: float) -> float:
        try:
            return max(low, min(high, float(given.get(key, 0) or 0)))
        except (TypeError, ValueError):
            return 0.0

    out = {"exposure": num("exposure", -5, 5), "noise": num("noise", 0, 100)}
    for k in TONE_KEYS:
        out[k] = num(k, -100, 100)
    out["recovery"] = given.get("recovery") if given.get("recovery") in RECOVERY else "clip"
    out["blackPoint"] = given.get("blackPoint") if given.get("blackPoint") in BLACK_POINTS else "as_shot"
    return out


def active(o: dict) -> bool:
    return bool(o) and (o["exposure"] != 0 or o["noise"] > 0 or o["recovery"] != "clip" or o["blackPoint"] != "as_shot" or any(o[k] != 0 for k in TONE_KEYS))


def libraw_kwargs(o: dict, raw, rawpy) -> dict:
    """The sensor-stage arguments: highlight recovery and LibRaw's FBDD noise reduction (Light up to 50, Full above); the
    wavelet threshold of this LibRaw build has no effect, so the rest of Noise Reduction is `denoise`."""
    mode = {"clip": rawpy.HighlightMode.Clip, "unclip": rawpy.HighlightMode.Ignore, "blend": rawpy.HighlightMode.Blend, "rebuild": rawpy.HighlightMode.ReconstructDefault}[o["recovery"]]
    kw = {"highlight_mode": mode}
    if o["noise"] > 0:
        kw["fbdd_noise_reduction"] = rawpy.FBDDNoiseReductionMode.Full if o["noise"] > 50 else rawpy.FBDDNoiseReductionMode.Light
    return kw


def denoise(x: np.ndarray, amount: float) -> np.ndarray:
    """An edge preserving smoothing of each channel, in a gamma encoded domain so shadows are cleaned as much as lights."""
    g = np.power(np.clip(x, 0.0, 1.0), 1 / 2.2).astype(np.float32)
    eps = (0.004 + amount / 100.0 * 0.05) ** 2
    out = np.stack([guided(g[..., c], g[..., c], 2 + int(amount / 40), eps) for c in range(3)], axis=-1)
    return np.power(np.clip(out, 0.0, 1.0), 2.2)


def _box(a: np.ndarray, r: int) -> np.ndarray:
    return cv2.boxFilter(a, -1, (2 * r + 1, 2 * r + 1), borderType=cv2.BORDER_REFLECT)


def guided(guide: np.ndarray, src: np.ndarray, r: int, eps: float) -> np.ndarray:
    """The guided filter (an edge preserving smoother): the base layer of `src` that follows the edges of `guide`."""
    mg, ms = _box(guide, r), _box(src, r)
    var, cov = _box(guide * guide, r) - mg * mg, _box(guide * src, r) - mg * ms
    a = cov / (var + eps)
    b = ms - a * mg
    return _box(a, r) * guide + _box(b, r)


def _luma(x: np.ndarray) -> np.ndarray:
    return x[..., 0] * 0.2126 + x[..., 1] * 0.7152 + x[..., 2] * 0.0722


def _dehaze(x: np.ndarray, amount: float) -> np.ndarray:
    h, w = x.shape[:2]
    if amount < 0:
        air = np.percentile(x.reshape(-1, 3)[::7], 99, axis=0)
        k = min(1.0, -amount / 100.0) * 0.5
        return x * (1 - k) + air * k
    r = max(2, int(max(h, w) * 0.01))
    dark = cv2.erode(x.min(axis=2), np.ones((2 * r + 1, 2 * r + 1), np.uint8))
    top = np.argsort(dark.ravel())[-max(1, dark.size // 1000):]
    air = np.maximum(x.reshape(-1, 3)[top].mean(axis=0), 1e-3)
    t = 1.0 - 0.95 * (amount / 100.0) * cv2.erode((x / air).min(axis=2), np.ones((2 * r + 1, 2 * r + 1), np.uint8))
    t = np.clip(guided(_luma(x).astype(np.float32) ** (1 / 2.2), t.astype(np.float32), max(4, r), 1e-3), 0.2, 1.0)[..., None]
    return (x - air) / t + air


def tone(lin: np.ndarray, o: dict) -> np.ndarray:
    """Linear RGB in 0..1 through Noise Reduction, Exposure, the adaptive black point, Shadows, Highlights, Dehaze, Texture and Clarity."""
    x = lin.astype(np.float32)
    if o["noise"] > 0:
        x = denoise(x, o["noise"])
    if o["exposure"]:
        x = x * np.float32(2.0 ** o["exposure"])
    if o["blackPoint"] == "auto":
        black = float(np.percentile(_luma(x)[::4, ::4], 0.1))
        x = np.clip((x - black) / max(1e-3, 1.0 - black), 0.0, None)
    y = _luma(x)
    if o["shadows"]:
        x = x * (2.0 ** (o["shadows"] / 100.0 * 2.0 / (1.0 + (y / 0.1) ** 2)))[..., None]
    if o["highlights"]:
        x = x * (2.0 ** (o["highlights"] / 100.0 * (y * y / (y * y + 0.09))))[..., None]
    if o["dehaze"]:
        x = _dehaze(np.clip(x, 0.0, 1.0), float(o["dehaze"]))
    side = max(x.shape[:2])
    for key, radius, eps, gain in (("texture", max(2, int(side * 0.0015)), 0.0004, 1.0), ("clarity", max(4, int(side * 0.01)), 0.02, 0.8)):
        if o[key]:
            yl = np.clip(_luma(x), 1e-5, None) ** (1 / 2.2)
            yl = yl.astype(np.float32)
            base = guided(yl, yl, radius, eps)
            new = np.clip(yl + (o[key] / 100.0) * gain * (yl - base), 1e-5, None)
            x = x * ((new / yl) ** 2.2)[..., None]
    return np.clip(x, 0.0, 1.0)


def encode(x: np.ndarray, bits: int) -> np.ndarray:
    """LibRaw's default curve (power 2.222, toe 4.5) on linear 0..1, as 8 or 16 bit integers."""
    v = np.where(x < 0.018, 4.5 * x, 1.099 * np.power(np.maximum(x, 1e-9), 0.45) - 0.099)
    top = 255.0 if bits == 8 else 65535.0
    return np.clip(v * top + 0.5, 0, top).astype(np.uint8 if bits == 8 else np.uint16)


def develop(raw, wb: dict, o: dict, half: bool, bits: int, rawpy) -> np.ndarray:
    """The developed RGB array. Without active options this is LibRaw's own sRGB decode."""
    if not active(o):
        return raw.postprocess(**wb, output_color=rawpy.ColorSpace.sRGB, output_bps=bits, half_size=half)
    lin = raw.postprocess(**wb, **libraw_kwargs(o, raw, rawpy), output_color=rawpy.ColorSpace.sRGB, output_bps=16, gamma=(1, 1), half_size=half)
    return encode(tone(lin.astype(np.float32) / np.float32(65535.0), o), bits)
