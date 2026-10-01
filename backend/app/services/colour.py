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
    return sorted(out, key=lambda p: (p["space"] != "RGB", p["name"].lower()))


def _find(pid: str) -> bytes:
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
        bpc: bool = True, proof_intent: str = "relative", gamut: bool = False) -> bytes:
    """A GRID^3 RGB table (r slowest, b fastest) from `source` to `dest` (sRGB when none), through `proof` when given;
    with `gamut`, GRID^3 more bytes, 255 where the proof device moves the colour further than GAMUT_DELTA_E."""
    if intent not in INTENTS or proof_intent not in INTENTS:
        raise ColourError("Unknown rendering intent.")
    src, src_mode = _profile(source)
    dst, dst_mode = _profile(dest)
    if src_mode != "RGB" or dst_mode != "RGB":
        raise ColourError("Documents and displays are RGB here; a CMYK profile can be proofed, not converted to yet.")
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
            out += _gamut(grid, src, prf, MODES[describe(_raw(proof))["space"]], proof_intent, flags)
    except ImageCms.PyCMSError as exc:
        raise ColourError(f"LittleCMS could not build that transform: {exc}") from exc
    return out


GRID4 = 17


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


def _gamut(grid, src, prf, prf_mode, proof_intent, flags) -> bytes:
    lab = ImageCms.ImageCmsProfile(ImageCms.createProfile("LAB"))
    to_lab = ImageCms.buildTransform(src, lab, "RGB", "LAB", renderingIntent=INTENTS["relative"])
    to_dev = ImageCms.buildTransform(src, prf, "RGB", prf_mode, renderingIntent=INTENTS[proof_intent], flags=flags)
    dev_lab = ImageCms.buildTransform(prf, lab, prf_mode, "LAB", renderingIntent=INTENTS["relative"])
    a = np.asarray(ImageCms.applyTransform(grid, to_lab)).reshape(-1, 3).astype(np.float64)
    b = np.asarray(ImageCms.applyTransform(ImageCms.applyTransform(grid, to_dev), dev_lab)).reshape(-1, 3).astype(np.float64)
    d = np.sqrt(((a[:, 0] - b[:, 0]) * 100 / 255) ** 2 + (a[:, 1] - b[:, 1]) ** 2 + (a[:, 2] - b[:, 2]) ** 2)
    return np.where(d > GAMUT_DELTA_E, 255, 0).astype(np.uint8).tobytes()
