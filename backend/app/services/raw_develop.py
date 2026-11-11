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
            if len(e) < 12:
                break
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


def _ifd_at(data: bytes, at: int, order: str) -> dict:
    try:
        n = struct.unpack(order + "H", data[at:at + 2])[0]
        out = {}
        for i in range(min(n, 512)):
            e = data[at + 2 + i * 12:at + 14 + i * 12]
            if len(e) < 12:
                break
            tag, kind, count = struct.unpack(order + "HHI", e[:8])
            out[tag] = (kind, count, e[8:12], order)
        return out
    except struct.error:
        return {}


def gain_maps(data: bytes) -> list[dict]:
    """The GainMap opcodes (id 9) of a DNG's OpcodeList2 and OpcodeList3, from its first directory and its SubIFDs: the
    area, pitch, plane range and the map of gains (lens shading). [] for anything that is not a DNG or holds none."""
    ifd = _ifd0(data[:1 << 20])
    if 50706 not in ifd:
        return []
    order = ifd[50706][3]
    found = [ifd]
    if 330 in ifd:
        kind, count, value, _o = ifd[330]
        try:
            offs = struct.unpack(order + "%dI" % count, data[struct.unpack(order + "I", value)[0]:][:4 * count]) if count > 1 else (struct.unpack(order + "I", value)[0],)
        except struct.error:
            offs = ()
        found += [_ifd_at(data, o, order) for o in offs[:8]]
    maps = []
    for d in found:
        for tag in (51009, 51010):
            if tag not in d:
                continue
            _k, count, value, _o = d[tag]
            at = struct.unpack(order + "I", value)[0] if count > 4 else None
            blob = data[at:at + count] if at is not None else value[:count]
            maps += _read_opcodes(blob)
    return maps


def _read_opcodes(blob: bytes) -> list[dict]:
    out = []
    try:
        n = struct.unpack(">I", blob[:4])[0]
        at = 4
        for _ in range(min(n, 64)):
            oid, _ver, _flags, size = struct.unpack(">4I", blob[at:at + 16])
            body = blob[at + 16:at + 16 + size]
            at += 16 + size
            if oid != 9 or size < 76:
                continue
            top, left, bottom, right, plane, planes, rpitch, cpitch, pv, ph = struct.unpack(">10I", body[:40])
            sv, sh, ov, oh = struct.unpack(">4d", body[40:72])
            mp = struct.unpack(">I", body[72:76])[0]
            if pv < 1 or ph < 1 or mp < 1 or len(body) < 76 + 4 * pv * ph * mp:
                continue
            grid = np.frombuffer(body[76:76 + 4 * pv * ph * mp], ">f4").astype(np.float32).reshape(pv, ph, mp)
            out.append({"top": top, "left": left, "bottom": bottom, "right": right, "plane": plane, "planes": planes, "rowPitch": rpitch, "colPitch": cpitch,
                        "spacing": (sv, sh), "origin": (ov, oh), "grid": grid})
    except struct.error:
        pass
    return out


def gain_field(maps: list[dict], height: int, width: int, flip: int, cfa, out_h: int, out_w: int) -> np.ndarray:
    """The per-pixel gains of `maps` as an out_h by out_w by 3 array in the orientation of the developed picture: each map
    interpolated across its area (a map for one CFA colour, found by `cfa`, the 2 by 2 colour indices, drives that channel)."""
    gains = np.ones((height, width, 3), np.float32)
    for m in maps:
        top, left = min(m["top"], height - 1), min(m["left"], width - 1)
        bottom, right = max(top + 1, min(m["bottom"], height)), max(left + 1, min(m["right"], width))
        rows, cols = bottom - top, right - left
        pv, ph, mp = m["grid"].shape
        sv, sh = (m["spacing"][0] or 1.0), (m["spacing"][1] or 1.0)
        v = (np.arange(rows, dtype=np.float32) / max(1, rows - 1) - m["origin"][0]) / sv
        h = (np.arange(cols, dtype=np.float32) / max(1, cols - 1) - m["origin"][1]) / sh
        mx, my = np.meshgrid(np.clip(h, 0, ph - 1), np.clip(v, 0, pv - 1))
        sparse = m["rowPitch"] > 1 or m["colPitch"] > 1
        for k in range(mp):
            field = cv2.remap(np.ascontiguousarray(m["grid"][..., k]), mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            if sparse and cfa is not None:
                chans = [int(cfa[top % 2][left % 2])]
            elif mp == 1:
                chans = [0, 1, 2] if m["planes"] >= 3 or m["plane"] == 0 else [m["plane"]]
            else:
                chans = [min(2, m["plane"] + k)]
            for c in chans:
                gains[top:bottom, left:right, c] *= field
    gains = np.rot90(gains, {3: 2, 5: 1, 6: -1}.get(flip, 0))
    if gains.shape[:2] != (out_h, out_w):
        gains = cv2.resize(np.ascontiguousarray(gains), (out_w, out_h), interpolation=cv2.INTER_LINEAR)
    return gains


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
        "gainMaps": len(gain_maps(data)), "kelvin": as_shot_kelvin(raw),
    }


def _xyz_of(raw) -> np.ndarray | None:
    m = np.array(raw.rgb_xyz_matrix, dtype=np.float64)[:3, :3]
    return m if m.shape == (3, 3) and abs(np.linalg.det(m)) > 1e-9 else None


def as_shot_kelvin(raw) -> int | None:
    """The correlated colour temperature of the as-shot white balance (McCamy), to the nearest 50 K, or None when the file
    holds no usable colour matrix or white balance."""
    m = _xyz_of(raw)
    wb = np.array(raw.camera_whitebalance[:3], dtype=np.float64)
    if m is None or not np.all(wb > 0):
        return None
    xyz = np.linalg.solve(m, 1.0 / wb)
    x, y = xyz[0] / xyz.sum(), xyz[1] / xyz.sum()
    n = (x - 0.3320) / (0.1858 - y) if y != 0.1858 else 0.0
    return int(max(1500, min(50000, round((449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33) / 50) * 50)))


def kelvin_multipliers(raw, kelvin: float) -> list[float] | None:
    """White balance multipliers (green 1) that make a scene lit at `kelvin` neutral: the Planckian white point at that
    temperature through the camera's XYZ matrix. None when the file holds no usable matrix."""
    m = _xyz_of(raw)
    if m is None:
        return None
    t = max(1667.0, min(25000.0, float(kelvin)))
    if t <= 4000:
        x = -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.179910
    else:
        x = -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.240390
    if t <= 2222:
        y = -1.1063814 * x ** 3 - 1.34811020 * x ** 2 + 2.18555832 * x - 0.20219683
    elif t <= 4000:
        y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
    else:
        y = 3.0817580 * x ** 3 - 5.87338670 * x ** 2 + 3.75112997 * x - 0.37001483
    cam = m @ np.array([x / y, 1.0, (1 - x - y) / y])
    if not np.all(cam > 0):
        return None
    mult = cam[1] / cam
    return [float(v) for v in mult]


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

    out = {"exposure": num("exposure", -5, 5), "noise": num("noise", 0, 100), "kelvin": num("kelvin", 0, 50000), "look": bool(given.get("look")),
           "distortion": num("distortion", -100, 100), "lensVignette": num("lensVignette", -100, 100), "lensMidpoint": num("lensMidpoint", 0, 100) if "lensMidpoint" in given else 50.0}
    for k in TONE_KEYS:
        out[k] = num(k, -100, 100)
    out["recovery"] = given.get("recovery") if given.get("recovery") in RECOVERY else "clip"
    out["blackPoint"] = given.get("blackPoint") if given.get("blackPoint") in BLACK_POINTS else "as_shot"
    return out


def active(o: dict) -> bool:
    return bool(o) and (o["exposure"] != 0 or o["noise"] > 0 or o["recovery"] != "clip" or o["blackPoint"] != "as_shot" or o["distortion"] != 0 or o["lensVignette"] != 0 or any(o[k] != 0 for k in TONE_KEYS))


def lens_correct(x: np.ndarray, distortion: float, vignette: float, midpoint: float) -> np.ndarray:
    """Lens correction on linear RGB, before any tone step. Vignette (-100 to 100): positive lifts the corners, with the gain
    in linear light, starting at `midpoint` percent of the corner distance. Distortion (-100 to 100): positive corrects barrel
    (the edges are drawn outward), negative corrects pincushion; the radius is measured from the centre in half diagonals."""
    h, w = x.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    half = float(np.hypot(cx, cy)) or 1.0
    dx, dy = (xx - cx) / half, (yy - cy) / half
    if vignette:
        r = np.sqrt(dx * dx + dy * dy)
        t = np.clip((r - midpoint / 100.0) / max(1e-3, 1.0 - midpoint / 100.0), 0.0, 1.0)
        x = x * (1.0 + (vignette / 100.0) * 1.5 * (t * t * (3.0 - 2.0 * t)))[..., None].astype(np.float32)
    if distortion:
        k = np.float32(distortion / 100.0 * 0.35)
        f = 1.0 - k * (dx * dx + dy * dy)
        x = cv2.remap(np.ascontiguousarray(x, dtype=np.float32), (cx + dx * f * half).astype(np.float32), (cy + dy * f * half).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return x


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
    if o["distortion"] or o["lensVignette"]:
        x = lens_correct(x, o["distortion"], o["lensVignette"], o["lensMidpoint"])
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


SPACES = ("srgb", "prophoto")


def encode(x: np.ndarray, bits: int, space: str = "srgb") -> np.ndarray:
    """LibRaw's default curve (power 2.222, toe 4.5) on linear 0..1, as 8 or 16 bit integers; ProPhoto RGB takes its own power 1.8."""
    if space == "prophoto":
        v = np.power(np.clip(x, 0.0, 1.0), 1 / 1.8)
    else:
        v = np.where(x < 0.018, 4.5 * x, 1.099 * np.power(np.maximum(x, 1e-9), 0.45) - 0.099)
    top = 255.0 if bits == 8 else 65535.0
    return np.clip(v * top + 0.5, 0, top).astype(np.uint8 if bits == 8 else np.uint16)


def look_curves(raw, rawpy) -> np.ndarray | None:
    """The camera look: per-channel tone curves (3 by 256, 0..255) fitted from the plain half-size develop to the JPEG
    preview the camera embedded, binned by develop value (median of the preview values), made monotone and smoothed.
    None when the file holds no preview or the two pictures do not share a shape."""
    try:
        thumb = raw.extract_thumb()
        if thumb.format == rawpy.ThumbFormat.JPEG:
            prev = cv2.cvtColor(cv2.imdecode(np.frombuffer(thumb.data, np.uint8), cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
        elif thumb.format == rawpy.ThumbFormat.BITMAP:
            prev = np.asarray(thumb.data)
        else:
            return None
        plain = raw.postprocess(use_camera_wb=True, output_bps=8, half_size=True)
    except Exception:
        return None
    if prev is None or prev.ndim != 3 or abs(prev.shape[1] / prev.shape[0] - plain.shape[1] / plain.shape[0]) > 0.03:
        return None
    prev = cv2.resize(prev, (plain.shape[1], plain.shape[0]), interpolation=cv2.INTER_AREA)
    keep = np.arange(256, dtype=np.float64)
    curves = np.empty((3, 256))
    for c in range(3):
        a, b = plain[..., c].ravel(), prev[..., c].ravel()
        order = np.argsort(a, kind="stable")
        cut = np.searchsorted(a[order], np.arange(257))
        med = np.full(256, np.nan)
        for v in range(256):
            if cut[v + 1] - cut[v] >= 8:
                med[v] = np.median(b[order[cut[v]:cut[v + 1]]])
        ok = ~np.isnan(med)
        if ok.sum() < 8:
            return None
        line = np.interp(keep, keep[ok], med[ok])
        line = np.maximum.accumulate(np.convolve(np.pad(line, 2, mode="edge"), np.ones(5) / 5, mode="valid"))
        curves[c] = np.clip(line, 0, 255)
    return curves


def apply_look(rgb: np.ndarray, curves: np.ndarray, bits: int) -> np.ndarray:
    top = 255.0 if bits == 8 else 65535.0
    out = np.empty_like(rgb)
    grid = np.arange(256, dtype=np.float64)
    for c in range(3):
        v = np.interp(rgb[..., c].astype(np.float64) / top * 255.0, grid, curves[c]) / 255.0 * top
        out[..., c] = np.clip(v + 0.5, 0, top).astype(rgb.dtype)
    return out


def develop(raw, wb: dict, o: dict, half: bool, bits: int, rawpy, space: str = "srgb", maps: list | None = None) -> np.ndarray:
    """The developed RGB array. Without active options this is LibRaw's own decode in sRGB, or in ProPhoto RGB (power 1.8) for `space` prophoto.
    `maps` (gain_maps) correct lens shading in linear light; o["look"] sets the tone curves fitted to the embedded preview."""
    wide = space == "prophoto"
    colour = rawpy.ColorSpace.ProPhoto if wide else rawpy.ColorSpace.sRGB
    o = o or options("{}")
    if not active(o) and not maps:
        rgb = raw.postprocess(**wb, output_color=colour, output_bps=bits, half_size=half, **({"gamma": (1.8, 0)} if wide else {}))
    else:
        lin = raw.postprocess(**wb, **libraw_kwargs(o, raw, rawpy), output_color=colour, output_bps=16, gamma=(1, 1), half_size=half).astype(np.float32) / np.float32(65535.0)
        if maps:
            s = raw.sizes
            cfa = np.array([[{"R": 0, "G": 1, "B": 2}.get(raw.color_desc.decode("ascii", "replace")[int(p)], 1) for p in row] for row in raw.raw_pattern]) if raw.raw_pattern is not None else None
            lin = np.clip(lin * gain_field(maps, int(s.height), int(s.width), int(s.flip), cfa, lin.shape[0], lin.shape[1]), 0.0, 1.0)
        rgb = encode(tone(lin, o) if active(o) else lin, bits, space)
    if o["look"]:
        curves = look_curves(raw, rawpy)
        if curves is not None:
            rgb = apply_look(rgb, curves, bits)
    return rgb
