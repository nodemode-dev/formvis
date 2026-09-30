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


def profile_dirs() -> list[Path]:
    """Where profiles are looked for: formvis's own folder first, then this computer's."""
    dirs = [config.data_dir() / "Profiles"]
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
            out.append({"id": digest, **info, "file": path.name, "added": d == profile_dirs()[0]})
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
