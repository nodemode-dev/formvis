"""Colour management (1.53.5, the parity plan's H2), on LittleCMS through Pillow: the profiles on this computer and the
ones added to formvis, and colour lookup tables from a document's profile to another (Convert to Profile), to the
display, or through a proof profile to the display (Proof Colors), with the points a proof device cannot print marked
(Gamut Warning). A 33-point table applied with trilinear interpolation is how the window converts and proofs."""

import base64
import hashlib
import io
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms

from app.core import config
from app.services import lcms

GRID = 33
INTENTS = {"perceptual": ImageCms.Intent.PERCEPTUAL, "relative": ImageCms.Intent.RELATIVE_COLORIMETRIC,
           "saturation": ImageCms.Intent.SATURATION, "absolute": ImageCms.Intent.ABSOLUTE_COLORIMETRIC}
MODES = {"RGB": "RGB", "CMYK": "CMYK", "GRAY": "L", "LAB": "LAB"}
GAMUT_DELTA_E = 3.0   # a round trip through the proof device moving a colour further than this is out of its gamut
MAX_BYTES = 4_000_000


class ColourError(Exception):
    pass


def shipped_dir() -> Path:
    return Path(getattr(sys, "_MEIPASS", str(Path(__file__).resolve().parent.parent))) / "profiles"


def default_cmyk() -> dict | None:
    for p in profiles():
        if p["space"] == "CMYK" and p.get("shipped"):
            return p
    return next((p for p in profiles() if p["space"] == "CMYK"), None)


def profile_dirs() -> list[Path]:
    """Where profiles are looked for: formvis's own folder first, then this computer's."""
    dirs = [config.data_dir() / "Profiles", shipped_dir()]
    extra = os.environ.get("FORMVIS_PROFILE_DIRS")
    if extra:
        dirs += [Path(p) for p in extra.split(os.pathsep) if p]
    home = Path.home()
    if sys.platform == "darwin":
        dirs += [home / "Library/ColorSync/Profiles", Path("/Library/ColorSync/Profiles"), Path("/System/Library/ColorSync/Profiles")]
    elif sys.platform == "win32":
        dirs += [Path(os.environ.get("WINDIR", "C:/Windows")) / "System32/spool/drivers/color"]
    else:
        dirs += [home / ".local/share/icc", home / ".color/icc", Path("/usr/share/color/icc"), Path("/usr/local/share/color/icc"), Path("/var/lib/colord/icc")]
    return dirs


def describe(data: bytes) -> dict:
    """A profile's name and colour space, read by LittleCMS; ColourError when it is not a usable profile."""
    if len(data) > MAX_BYTES:
        raise ColourError("The profile is too large.")
    try:
        prof = ImageCms.ImageCmsProfile(io.BytesIO(data))
        name = (ImageCms.getProfileDescription(prof) or "").strip() or "Unnamed profile"
        space = prof.profile.xcolor_space.strip().upper()
    except Exception as exc:
        raise ColourError(f"This is not a colour profile LittleCMS can read: {exc}") from exc
    if space not in MODES:
        raise ColourError(f"Profiles for {space} are not supported.")
    return {"name": name, "space": space}


def profiles() -> list[dict]:
    """Every readable profile in the profile folders, by name, each once."""
    seen, out = set(), []
    for d in profile_dirs():
        if not d.is_dir():
            continue
        for path in sorted([*d.glob("*.ic[cm]"), *d.glob("*/*.ic[cm]"), *d.glob("*.IC[CM]")]):
            try:
                data = path.read_bytes()
                info = describe(data)
            except (OSError, ColourError):
                continue
            digest = hashlib.sha1(data).hexdigest()[:16]
            if digest in seen:
                continue
            seen.add(digest)
            out.append({"id": digest, **info, "file": path.name, "added": d == profile_dirs()[0], "shipped": d == shipped_dir()})
    if lcms.available():
        out += [{"id": pid, "name": name, "space": "GRAY", "file": "", "added": False, "shipped": False, "builtin": True} for pid, (name, _g) in lcms.GRAYS.items()]
        out += [{"id": pid, "name": spec[0], "space": "RGB", "file": "", "added": False, "shipped": False, "builtin": True} for pid, spec in lcms.RGBS.items()]
    return sorted(out, key=lambda p: (p["space"] != "RGB", p["name"].lower()))


def _find(pid: str) -> bytes:
    if pid.startswith("builtin:"):
        try:
            return lcms.builtin(pid)
        except lcms.LcmsError as exc:
            raise ColourError(str(exc)) from exc
    for d in profile_dirs():
        if not d.is_dir():
            continue
        for path in [*d.glob("*.ic[cm]"), *d.glob("*/*.ic[cm]"), *d.glob("*.IC[CM]")]:
            try:
                data = path.read_bytes()
            except OSError:
                continue
            if hashlib.sha1(data).hexdigest()[:16] == pid:
                return data
    raise ColourError("That profile is no longer on this computer.")


def add(data: bytes, filename: str) -> dict:
    """A profile added to formvis's own folder (Load Profile), after LittleCMS has read it."""
    info = describe(data)
    folder = profile_dirs()[0]
    folder.mkdir(parents=True, exist_ok=True)
    stem = "".join(ch for ch in Path(filename or "profile").stem if ch.isalnum() or ch in " -_.")[:80] or "profile"
    (folder / f"{stem}.icc").write_bytes(data)
    return {"id": hashlib.sha1(data).hexdigest()[:16], **info, "file": f"{stem}.icc", "added": True}


def _profile(ref: dict | None) -> tuple[ImageCms.ImageCmsProfile, str]:
    """A profile reference from the window: {"icc": base64}, {"id": listed}, or None for sRGB."""
    if not ref:
        return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")), "RGB"
    if ref.get("icc"):
        data = base64.b64decode(ref["icc"])
    elif ref.get("id"):
        data = _find(str(ref["id"]))
    else:
        return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")), "RGB"
    info = describe(data)
    return ImageCms.ImageCmsProfile(io.BytesIO(data)), MODES[info["space"]]


def linear_matrix(source: dict | None, dest: dict | None) -> list[list[float]]:
    """Convert to Profile for 32-bit documents (1.57.3): linear light in one RGB matrix profile to linear light in
    another, as the 3 by 3 matrix through the profiles' D50 primaries (each profile's rXYZ, gXYZ and bXYZ), so light
    above white converts exactly; the tone curves do not enter, since 32-bit values are already linear. A profile
    without primaries (a table-based RGB profile, or not RGB) is refused, naming it."""
    def primaries(ref: dict | None) -> np.ndarray:
        prof, space = _profile(ref)
        if space != "RGB":
            raise ColourError("A 32-bit document converts only between RGB profiles.")
        p = prof.profile
        try:
            cols = [p.red_colorant[0], p.green_colorant[0], p.blue_colorant[0]]
        except Exception as exc:
            raise ColourError("This RGB profile has no primaries (it is table-based), so a 32-bit document cannot convert to or from it exactly.") from exc
        if any(c is None for c in cols):
            raise ColourError("This RGB profile has no primaries (it is table-based), so a 32-bit document cannot convert to or from it exactly.")
        return np.array(cols, dtype=np.float64).T
    m = np.linalg.solve(primaries(dest), primaries(source))
    return [[float(x) for x in row] for row in m]


def _grid() -> Image.Image:
    v = np.linspace(0, 255, GRID).round().astype(np.uint8)
    r, g, b = np.meshgrid(v, v, v, indexing="ij")    # r slowest, b fastest
    return Image.fromarray(np.stack([r.ravel(), g.ravel(), b.ravel()], axis=1).reshape(1, -1, 3), "RGB")


def lut(source: dict | None, dest: dict | None = None, proof: dict | None = None, intent: str = "relative",
        bpc: bool = True, proof_intent: str = "relative", gamut: bool = False, gamut_delta: float = GAMUT_DELTA_E) -> bytes:
    """A GRID^3 RGB table (r slowest, b fastest) from `source` to `dest` (sRGB when none), through `proof` when given;
    with `gamut`, GRID^3 more bytes, 255 where the proof device moves the colour further than `gamut_delta` (GAMUT_DELTA_E)."""
    if intent not in INTENTS or proof_intent not in INTENTS:
        raise ColourError("Unknown rendering intent.")
    if not 0.1 <= gamut_delta <= 50:
        raise ColourError("The gamut warning threshold is between 0.1 and 50 delta E.")
    src, src_mode = _profile(source)
    dst, dst_mode = _profile(dest)
    if src_mode != "RGB" or dst_mode != "RGB":
        if proof:
            raise ColourError("Proof Colors starts from an RGB document.")
        if src_mode == "L" and dst_mode == "RGB":
            return _gray_table(src, dst, intent, bpc)
        return _table(src, src_mode, dst, dst_mode, intent, bpc)
    flags = ImageCms.Flags.BLACKPOINTCOMPENSATION if bpc else ImageCms.Flags.NONE
    grid = _grid()
    try:
        if proof:
            prf, _ = _profile(proof)
            t = ImageCms.buildProofTransform(src, dst, prf, "RGB", "RGB", renderingIntent=INTENTS["relative"], proofRenderingIntent=INTENTS[proof_intent], flags=flags | ImageCms.Flags.SOFTPROOFING)
        else:
            t = ImageCms.buildTransform(src, dst, "RGB", "RGB", renderingIntent=INTENTS[intent], flags=flags)
        out = np.asarray(ImageCms.applyTransform(grid, t)).reshape(-1, 3).astype(np.uint8).tobytes()
        if proof and gamut:
            out += _gamut(grid, src, prf, MODES[describe(_raw(proof))["space"]], proof_intent, flags, gamut_delta)
    except ImageCms.PyCMSError as exc:
        raise ColourError(f"LittleCMS could not build that transform: {exc}") from exc
    return out


GRID4 = 17


def lut_shape(source: dict | None, dest: dict | None) -> tuple[int, int, int]:
    """The channels in and out of the table `lut` builds for these profiles, and its grid size."""
    n = {"RGB": 3, "CMYK": 4}
    a, b = _profile(source)[1], _profile(dest)[1]
    n_in = n.get(a)
    return (n_in or 3, n.get(b) or 3, GRID4 if n_in == 4 else GRID)


def _gray_table(src, dst, intent: str, bpc: bool) -> bytes:
    """A grayscale document holds equal R, G and B; a gray profile's table depends on R alone, so the GRID^3 table is
    one gray ramp through the profile, repeated across G and B."""
    v = np.linspace(0, 255, GRID).round().astype(np.uint8)
    flags = ImageCms.Flags.BLACKPOINTCOMPENSATION if bpc else ImageCms.Flags.NONE
    try:
        t = ImageCms.buildTransform(src, dst, "L", "RGB", renderingIntent=INTENTS[intent], flags=flags)
        ramp = np.asarray(ImageCms.applyTransform(Image.fromarray(v.reshape(1, -1), "L"), t)).reshape(GRID, 3)
    except ImageCms.PyCMSError as exc:
        raise ColourError(f"LittleCMS could not build that transform: {exc}") from exc
    return np.ascontiguousarray(np.broadcast_to(ramp[:, None, None, :], (GRID, GRID, GRID, 3))).astype(np.uint8).tobytes()


def _table(src, src_mode: str, dst, dst_mode: str, intent: str, bpc: bool) -> bytes:
    """A table between RGB and CMYK profiles in either direction: GRID^3 or GRID4^4 points in (first channel slowest),
    8-bit values out. Gray and Lab convert pixel by pixel (convert_deep), not through a table."""
    ends = {"RGB": 3, "CMYK": 4}
    if src_mode not in ends or dst_mode not in ends:
        raise ColourError("Gray and Lab profiles convert pixel by pixel, not through a table.")
    n_in, n_out = ends[src_mode], ends[dst_mode]
    g = GRID4 if n_in == 4 else GRID
    v = np.linspace(0, 255, g).round().astype(np.uint8)
    axes = np.meshgrid(*([v] * n_in), indexing="ij")
    grid = Image.fromarray(np.stack([a.ravel() for a in axes], axis=1).reshape(1, -1, n_in), src_mode)
    flags = ImageCms.Flags.BLACKPOINTCOMPENSATION if bpc else ImageCms.Flags.NONE
    try:
        t = ImageCms.buildTransform(src, dst, src_mode, dst_mode, renderingIntent=INTENTS[intent], flags=flags)
        return np.asarray(ImageCms.applyTransform(grid, t)).reshape(-1, n_out).astype(np.uint8).tobytes()
    except ImageCms.PyCMSError as exc:
        raise ColourError(f"LittleCMS could not build that transform: {exc}") from exc


def cmyk_lut(profile: dict, bpc: bool = True) -> bytes:
    """A GRID4^4 sRGB table (c slowest, k fastest) from a CMYK profile, relative intent: how the window shows CMYK ink."""
    prf, mode = _profile(profile)
    if mode != "CMYK":
        raise ColourError("A CMYK document needs a CMYK profile.")
    v = np.linspace(0, 255, GRID4).round().astype(np.uint8)
    c, m, y, k = np.meshgrid(v, v, v, v, indexing="ij")
    grid = Image.fromarray(np.stack([c.ravel(), m.ravel(), y.ravel(), k.ravel()], axis=1).reshape(1, -1, 4), "CMYK")
    flags = ImageCms.Flags.BLACKPOINTCOMPENSATION if bpc else ImageCms.Flags.NONE
    try:
        t = ImageCms.buildTransform(prf, ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")), "CMYK", "RGB", renderingIntent=INTENTS["relative"], flags=flags)
        return np.asarray(ImageCms.applyTransform(grid, t)).reshape(-1, 3).astype(np.uint8).tobytes()
    except ImageCms.PyCMSError as exc:
        raise ColourError(f"LittleCMS could not build that transform: {exc}") from exc


def rgb_cmyk_lut(profile: dict, source: dict | None = None, intent: str = "relative", bpc: bool = True) -> bytes:
    """A GRID^3 table (r slowest, b fastest) of C, M, Y, K bytes from an RGB profile (sRGB when none) to `profile`: how
    the window reads a colour's ink and converts a paint colour; the exact path stays convert_pixels."""
    if intent not in INTENTS:
        raise ColourError("Unknown rendering intent.")
    cmyk, cmyk_mode = _profile(profile)
    rgb, rgb_mode = _profile(source)
    if cmyk_mode != "CMYK" or rgb_mode != "RGB":
        raise ColourError("The CMYK profile must be CMYK and the other RGB.")
    flags = ImageCms.Flags.BLACKPOINTCOMPENSATION if bpc else ImageCms.Flags.NONE
    try:
        t = ImageCms.buildTransform(rgb, cmyk, "RGB", "CMYK", renderingIntent=INTENTS[intent], flags=flags)
        return np.asarray(ImageCms.applyTransform(_grid(), t)).reshape(-1, 4).astype(np.uint8).tobytes()
    except ImageCms.PyCMSError as exc:
        raise ColourError(f"LittleCMS could not build that transform: {exc}") from exc


def convert_pixels(raw: bytes, width: int, height: int, to: str, profile: dict, source: dict | None = None,
                   intent: str = "relative", bpc: bool = True) -> bytes:
    """Pixels converted exactly by LittleCMS at 8 bits: `to` is "cmyk" (RGBA in, CMYK and alpha out, 5 bytes a pixel)
    or "rgb" (CMYK and alpha in, RGBA out). `profile` is the CMYK profile; `source` the RGB one (sRGB when none) on
    the way in, the RGB destination on the way out. Alpha passes through untouched."""
    if intent not in INTENTS:
        raise ColourError("Unknown rendering intent.")
    if to not in ("cmyk", "rgb"):
        raise ColourError("Conversion is to cmyk or to rgb.")
    n_in, n_out = (4, 5) if to == "cmyk" else (5, 4)
    if width <= 0 or height <= 0 or len(raw) != width * height * n_in:
        raise ColourError("The pixels do not match the size given.")
    if len(raw) > MAX_BYTES * 8:
        raise ColourError("Convert in pieces: this request is too large.")
    cmyk, cmyk_mode = _profile(profile)
    rgb, rgb_mode = _profile(source)
    if cmyk_mode != "CMYK" or rgb_mode != "RGB":
        raise ColourError("The CMYK profile must be CMYK and the other RGB.")
    flags = ImageCms.Flags.BLACKPOINTCOMPENSATION if bpc else ImageCms.Flags.NONE
    px = np.frombuffer(raw, np.uint8).reshape(height * width, n_in)
    src_mode, dst_mode = ("RGB", "CMYK") if to == "cmyk" else ("CMYK", "RGB")
    img = Image.fromarray(np.ascontiguousarray(px[:, : n_in - 1]).reshape(1, -1, n_in - 1), src_mode)
    try:
        t = ImageCms.buildTransform(rgb if to == "cmyk" else cmyk, cmyk if to == "cmyk" else rgb, src_mode, dst_mode, renderingIntent=INTENTS[intent], flags=flags)
        out = np.asarray(ImageCms.applyTransform(img, t)).reshape(-1, n_out - 1).astype(np.uint8)
    except ImageCms.PyCMSError as exc:
        raise ColourError(f"LittleCMS could not build that transform: {exc}") from exc
    return np.concatenate([out, px[:, n_in - 1 :]], axis=1).astype(np.uint8).tobytes()


def _raw(ref: dict) -> bytes:
    return base64.b64decode(ref["icc"]) if ref.get("icc") else _find(str(ref["id"]))


def _gamut(grid, src, prf, prf_mode, proof_intent, flags, delta: float = GAMUT_DELTA_E) -> bytes:
    lab = ImageCms.ImageCmsProfile(ImageCms.createProfile("LAB"))
    to_lab = ImageCms.buildTransform(src, lab, "RGB", "LAB", renderingIntent=INTENTS["relative"])
    to_dev = ImageCms.buildTransform(src, prf, "RGB", prf_mode, renderingIntent=INTENTS[proof_intent], flags=flags)
    dev_lab = ImageCms.buildTransform(prf, lab, prf_mode, "LAB", renderingIntent=INTENTS["relative"])
    a = np.asarray(ImageCms.applyTransform(grid, to_lab)).reshape(-1, 3).astype(np.float64)
    b = np.asarray(ImageCms.applyTransform(ImageCms.applyTransform(grid, to_dev), dev_lab)).reshape(-1, 3).astype(np.float64)
    d = np.sqrt(((a[:, 0] - b[:, 0]) * 100 / 255) ** 2 + (a[:, 1] - b[:, 1]) ** 2 + (a[:, 2] - b[:, 2]) ** 2)
    return np.where(d > delta, 255, 0).astype(np.uint8).tobytes()


DEEP_CHANNELS = {"RGB": 3, "CMYK": 4, "LAB": 3}


def _ref_bytes(ref: dict | None, fallback: str) -> bytes:
    if ref and ref.get("icc"):
        return base64.b64decode(ref["icc"])
    if ref and ref.get("id"):
        return _find(str(ref["id"]))
    try:
        return lcms.builtin(fallback)
    except lcms.LcmsError as exc:
        raise ColourError(str(exc)) from exc


def convert_deep(raw: bytes, width: int, height: int, mode: str, source: dict | None, dest: dict | None, intent: str = "relative",
                 bpc: bool = True, dither: bool = False, bits: int = 16, preserve_black: bool = True) -> tuple[bytes, str]:
    """Convert to Profile and mode changes without an 8-bit step: `raw` is little-endian float32, the document's own
    channels with straight alpha last (rgb 0 to 1, ink 0 to 1, Lab as formvis encodes it), `mode` rgb, cmyk or lab. The
    destination profile's space says what comes back: rgb, cmyk, lab, or gray (three equal channels, as a grayscale
    document holds them). LittleCMS runs in double precision; the result is rounded to `bits` (16, or 8 for an 8-bit
    document) with optional dither, alpha untouched. Returns the float32 bytes and the space name."""
    mode = mode.upper()
    if mode not in DEEP_CHANNELS:
        raise ColourError("The pixels are rgb, cmyk or lab.")
    if intent not in INTENTS:
        raise ColourError("Unknown rendering intent.")
    if bits not in (8, 16):
        raise ColourError("Conversion rounds to 8 or 16 bits.")
    n_in = DEEP_CHANNELS[mode]
    if width <= 0 or height <= 0 or width > config.MAX_SIDE or height > config.MAX_SIDE or width * height > config.MAX_PIXELS or len(raw) != width * height * (n_in + 1) * 4:
        raise ColourError("The pixels do not match the size given.")
    px = np.frombuffer(raw, "<f4").reshape(-1, n_in + 1)
    try:
        src_bytes = lcms.builtin("builtin:lab") if mode == "LAB" else _ref_bytes(source, "builtin:srgb")
        dst_bytes = _ref_bytes(dest, "builtin:srgb")
        src_space, dst_space = lcms.space_of(src_bytes), lcms.space_of(dst_bytes)
        if src_space == "GRAY" and mode == "RGB":
            values, src_kind = px[:, :1], "GRAY"
        elif src_space == mode:
            values, src_kind = px[:, :n_in], mode
        else:
            raise ColourError(f"The pixels are {mode.lower()} but the source profile is {src_space.lower()}.")
        if dst_space not in lcms.SPACES:
            raise ColourError(f"Profiles for {dst_space} are not supported.")
        if src_bytes == dst_bytes and src_kind == dst_space:
            result = values.astype(np.float64)
        else:
            result = lcms.from_lcms(lcms.transform(lcms.to_lcms(values, src_kind), src_bytes, src_kind, dst_bytes, dst_space, intent, bpc, False, preserve_black), dst_space)
        result = lcms.quantise(result, bits, dither)
        if dst_space == "GRAY":
            result = np.repeat(result, 3, axis=1)
    except lcms.LcmsError as exc:
        raise ColourError(str(exc)) from exc
    out = np.concatenate([result, px[:, n_in:].astype(np.float64)], axis=1).astype("<f4")
    return out.tobytes(), dst_space.lower()


def profile_info(ref: dict | None) -> dict:
    """What a profile says about itself, for Color Settings: its name and space and, for a CMYK profile, the total area
    coverage LittleCMS detects in it, the black ink at the darkest RGB, the black at mid grey and the black generation
    that implies. Values are percentages, or None when the profile does not tell."""
    data = _ref_bytes(ref, "builtin:srgb")
    info = describe(data)
    out = {"name": info["name"], "space": info["space"], "tac": None, "blackLimit": None, "blackAtMid": None, "generation": None}
    try:
        head = ImageCms.ImageCmsProfile(io.BytesIO(data)).profile
        classes = {"mntr": "Display", "scnr": "Input", "prtr": "Output", "abst": "Abstract", "spac": "Colour space", "link": "Device link", "nmcl": "Named colour"}
        cls = str(head.device_class or "").strip()
        out.update(deviceClass=classes.get(cls, cls or "Unknown"), pcs=str(head.connection_space or "").strip() or None, version=str(head.version) if head.version else None,
                   copyright=(head.copyright or "").strip() or None, size=len(data))
    except Exception:
        out.update(deviceClass=None, pcs=None, version=None, copyright=None, size=len(data))
    if info["space"] != "CMYK":
        return out
    try:
        tac = lcms.detect_tac(data)
        ramp = np.array([[0.0, 0.0, 0.0], [0.5, 0.5, 0.5], [0.25, 0.25, 0.25]])
        ink = lcms.transform(ramp, lcms.builtin("builtin:srgb"), "RGB", data, "CMYK", "relative", True)
    except lcms.LcmsError as exc:
        raise ColourError(str(exc)) from exc
    k_mid = float(ink[1, 3])
    out.update(tac=round(tac, 1) if tac > 0 else None, blackLimit=round(float(ink[0, 3]), 1), blackAtMid=round(k_mid, 1),
               generation="None" if k_mid < 3 else "Light" if k_mid < 15 else "Medium" if k_mid < 40 else "Heavy" if k_mid < 70 else "Maximum")
    return out
