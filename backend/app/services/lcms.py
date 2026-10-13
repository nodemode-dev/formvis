"""LittleCMS 2 through ctypes, for what Pillow's ImageCms cannot do: pixels at 16 bits or in floating point, Lab and gray
ends, a quantiser with dither, and the profile facts ImageCms does not show (total ink). It loads the liblcms2 that
Pillow's own wheel carries (the same version ImageCms runs on), or the system's. LittleCMS is MIT licensed (see
NOTICE.md); nothing is linked or copied, the library is called as it is."""

import ctypes
import glob
import os
import sys
from ctypes import POINTER, byref, c_char_p, c_double, c_int, c_uint32, c_void_p
from pathlib import Path

import numpy as np

CHUNK = 1 << 19
INTENT_CODES = {"perceptual": 0, "relative": 1, "saturation": 2, "absolute": 3}
FLAG_NOOPTIMIZE = 0x0100
FLAG_HIGHRESPRECALC = 0x0400
FLAG_BPC = 0x2000
SPACES = {"RGB": (4, 3), "CMYK": (6, 4), "GRAY": (3, 1), "LAB": (10, 3)}
SIG = {"RGB ": "RGB", "CMYK": "CMYK", "GRAY": "GRAY", "Lab ": "LAB"}


class LcmsError(Exception):
    pass


def _candidates() -> list[str]:
    found: list[str] = []
    try:
        import PIL
        root = Path(PIL.__file__).resolve().parent
        found += glob.glob(str(root.parent / "pillow.libs" / "liblcms2*"))
        found += glob.glob(str(root / ".dylibs" / "liblcms2*"))
        found += glob.glob(str(root / "liblcms2*")) + glob.glob(str(root / "lcms2*.dll"))
    except Exception:
        pass
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        found += glob.glob(os.path.join(meipass, "**", "liblcms2*"), recursive=True)
    for name in ("lcms2", "liblcms2.so.2", "liblcms2.2.dylib", "lcms2.dll"):
        try:
            import ctypes.util
            path = ctypes.util.find_library(name) or name
            found.append(path)
        except Exception:
            found.append(name)
    return found


def _load() -> ctypes.CDLL | None:
    for path in _candidates():
        try:
            lib = ctypes.CDLL(path)
            lib.cmsDoTransform
            lib.cmsDetectTAC
            return lib
        except (OSError, AttributeError):
            continue
    return None


_lib = _load()


def available() -> bool:
    return _lib is not None


def _need() -> ctypes.CDLL:
    if _lib is None:
        raise LcmsError("LittleCMS 2 could not be loaded for 16-bit conversion. Install liblcms2 or reinstall Pillow from its wheel.")
    lib = _lib
    if not getattr(lib, "_formvis_typed", False):
        lib.cmsOpenProfileFromMem.restype = c_void_p
        lib.cmsOpenProfileFromMem.argtypes = [c_char_p, c_uint32]
        lib.cmsCloseProfile.argtypes = [c_void_p]
        lib.cmsCreateTransform.restype = c_void_p
        lib.cmsCreateTransform.argtypes = [c_void_p, c_uint32, c_void_p, c_uint32, c_uint32, c_uint32]
        lib.cmsDeleteTransform.argtypes = [c_void_p]
        lib.cmsDoTransform.argtypes = [c_void_p, c_void_p, c_void_p, c_uint32]
        lib.cmsCreateLab4Profile.restype = c_void_p
        lib.cmsCreateLab4Profile.argtypes = [c_void_p]
        lib.cmsCreate_sRGBProfile.restype = c_void_p
        lib.cmsBuildGamma.restype = c_void_p
        lib.cmsBuildGamma.argtypes = [c_void_p, c_double]
        lib.cmsBuildParametricToneCurve.restype = c_void_p
        lib.cmsBuildParametricToneCurve.argtypes = [c_void_p, c_int, POINTER(c_double)]
        lib.cmsFreeToneCurve.argtypes = [c_void_p]
        lib.cmsCreateGrayProfile.restype = c_void_p
        lib.cmsCreateGrayProfile.argtypes = [c_void_p, c_void_p]
        lib.cmsSaveProfileToMem.restype = c_int
        lib.cmsSaveProfileToMem.argtypes = [c_void_p, c_void_p, POINTER(c_uint32)]
        lib.cmsDetectTAC.restype = c_double
        lib.cmsDetectTAC.argtypes = [c_void_p]
        lib.cmsGetColorSpace.restype = c_uint32
        lib.cmsGetColorSpace.argtypes = [c_void_p]
        lib.cmsMLUalloc.restype = c_void_p
        lib.cmsMLUalloc.argtypes = [c_void_p, c_uint32]
        lib.cmsMLUsetASCII.restype = c_int
        lib.cmsMLUsetASCII.argtypes = [c_void_p, c_char_p, c_char_p, c_char_p]
        lib.cmsMLUfree.argtypes = [c_void_p]
        lib.cmsWriteTag.restype = c_int
        lib.cmsWriteTag.argtypes = [c_void_p, c_uint32, c_void_p]
        lib._formvis_typed = True
    return lib


def _format(space: str) -> int:
    pt, ch = SPACES[space]
    return (1 << 22) | (pt << 16) | (ch << 3)


class Profile:
    def __init__(self, data: bytes | None = None, handle: int | None = None):
        lib = _need()
        self.handle = handle if handle is not None else lib.cmsOpenProfileFromMem(data, len(data or b""))
        if not self.handle:
            raise LcmsError("LittleCMS could not read this colour profile.")

    def space(self) -> str:
        sig = int(_need().cmsGetColorSpace(self.handle)).to_bytes(4, "big").decode("latin-1")
        return SIG.get(sig, sig.strip())

    def close(self) -> None:
        if self.handle:
            _need().cmsCloseProfile(self.handle)
            self.handle = None

    def __enter__(self) -> "Profile":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()


def _label(handle: int, name: str) -> None:
    lib = _need()
    for sig, text in ((0x64657363, name), (0x63707274, "No copyright, use freely")):
        mlu = lib.cmsMLUalloc(None, 1)
        lib.cmsMLUsetASCII(mlu, b"en", b"US", text.encode("ascii"))
        lib.cmsWriteTag(handle, sig, mlu)
        lib.cmsMLUfree(mlu)


def _save(handle: int) -> bytes:
    lib = _need()
    size = c_uint32(0)
    lib.cmsSaveProfileToMem(handle, None, byref(size))
    buf = ctypes.create_string_buffer(size.value)
    if not lib.cmsSaveProfileToMem(handle, buf, byref(size)):
        raise LcmsError("LittleCMS could not write a profile.")
    return buf.raw[: size.value]


GRAYS = {
    "builtin:gray-g22": ("Gray Gamma 2.2", 2.2),
    "builtin:gray-g18": ("Gray Gamma 1.8", 1.8),
    "builtin:gray-srgb": ("Gray sRGB Curve", None),
}


def builtin(pid: str) -> bytes:
    """A profile LittleCMS makes itself: sRGB, Lab (D50), or a gray with a gamma or the sRGB curve."""
    lib = _need()
    if pid == "builtin:srgb":
        h = lib.cmsCreate_sRGBProfile()
        try:
            _label(h, "sRGB IEC61966-2.1")
            return _save(h)
        finally:
            lib.cmsCloseProfile(h)
    if pid == "builtin:lab":
        h = lib.cmsCreateLab4Profile(None)
        try:
            _label(h, "Lab D50")
            return _save(h)
        finally:
            lib.cmsCloseProfile(h)
    if pid in GRAYS:
        name, gamma = GRAYS[pid]
        if gamma is None:
            params = (c_double * 5)(2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045)
            curve = lib.cmsBuildParametricToneCurve(None, 4, params)
        else:
            curve = lib.cmsBuildGamma(None, gamma)
        white = (c_double * 3)(0.3457, 0.3585, 1.0)
        h = lib.cmsCreateGrayProfile(white, curve)
        lib.cmsFreeToneCurve(curve)
        try:
            _label(h, name)
            return _save(h)
        finally:
            lib.cmsCloseProfile(h)
    raise LcmsError("That profile is not one LittleCMS makes.")


def detect_tac(data: bytes) -> float:
    """The total area coverage LittleCMS finds for a CMYK profile, in percent; 0 when it cannot tell."""
    with Profile(data) as p:
        return float(_need().cmsDetectTAC(p.handle))


def space_of(data: bytes) -> str:
    with Profile(data) as p:
        return p.space()


def to_lcms(values: np.ndarray, space: str) -> np.ndarray:
    """formvis floats (rgb and gray 0 to 1, ink 0 to 1, Lab encoded L/100, (a+128)/255, (b+128)/255) as LittleCMS
    double values (ink in percent, Lab as L*, a*, b*)."""
    v = np.ascontiguousarray(values, dtype=np.float64)
    if space == "CMYK":
        return v * 100.0
    if space == "LAB":
        return np.stack([v[:, 0] * 100.0, v[:, 1] * 255.0 - 128.0, v[:, 2] * 255.0 - 128.0], axis=1)
    return v


def from_lcms(values: np.ndarray, space: str) -> np.ndarray:
    if space == "CMYK":
        return values / 100.0
    if space == "LAB":
        return np.stack([values[:, 0] / 100.0, (values[:, 1] + 128.0) / 255.0, (values[:, 2] + 128.0) / 255.0], axis=1)
    return values


def transform(values: np.ndarray, src: bytes, src_space: str, dst: bytes, dst_space: str, intent: str = "relative", bpc: bool = True, precise: bool = False, preserve_k: bool = False) -> np.ndarray:
    """`values` (N by the source channels, LittleCMS units) through src to dst in double precision, N by the destination
    channels. Cut in pieces so a large picture does not need a second copy of itself. With `preserve_k`, CMYK to CMYK
    uses LittleCMS's black-only preserving intents, so pure black ink stays pure black ink."""
    lib = _need()
    if intent not in INTENT_CODES:
        raise LcmsError("Unknown rendering intent.")
    n_in, n_out = SPACES[src_space][1], SPACES[dst_space][1]
    flags = (FLAG_BPC if bpc else 0) | (FLAG_NOOPTIMIZE if precise else FLAG_HIGHRESPRECALC)
    code = INTENT_CODES[intent]
    if preserve_k and src_space == "CMYK" and dst_space == "CMYK" and code < 3:
        code += 10
    with Profile(src) as ps, Profile(dst) as pd:
        t = lib.cmsCreateTransform(ps.handle, _format(src_space), pd.handle, _format(dst_space), code, flags)
        if not t:
            raise LcmsError("LittleCMS could not build that transform.")
        try:
            src_v = np.ascontiguousarray(values, dtype=np.float64).reshape(-1, n_in)
            out = np.empty((src_v.shape[0], n_out), dtype=np.float64)
            for a in range(0, src_v.shape[0], CHUNK):
                piece = np.ascontiguousarray(src_v[a : a + CHUNK])
                dest = np.empty((piece.shape[0], n_out), dtype=np.float64)
                lib.cmsDoTransform(t, piece.ctypes.data_as(c_void_p), dest.ctypes.data_as(c_void_p), piece.shape[0])
                out[a : a + CHUNK] = dest
        finally:
            lib.cmsDeleteTransform(t)
    return out


def transform16(codes: np.ndarray, src: bytes, src_space: str, dst: bytes, dst_space: str, intent: str = "relative", bpc: bool = True) -> np.ndarray:
    """LittleCMS's own 16-bit transform of unsigned 16-bit codes (N by channels), unoptimised: the reference an
    exact conversion is measured against. RGB, CMYK and gray ends only (Lab has its own 16-bit encodings)."""
    lib = _need()
    fmt = lambda space: (SPACES[space][0] << 16) | (SPACES[space][1] << 3) | 2
    n_in, n_out = SPACES[src_space][1], SPACES[dst_space][1]
    with Profile(src) as ps, Profile(dst) as pd:
        t = lib.cmsCreateTransform(ps.handle, fmt(src_space), pd.handle, fmt(dst_space), INTENT_CODES[intent], (FLAG_BPC if bpc else 0) | FLAG_NOOPTIMIZE)
        if not t:
            raise LcmsError("LittleCMS could not build that transform.")
        try:
            a = np.ascontiguousarray(codes, dtype=np.uint16).reshape(-1, n_in)
            out = np.empty((a.shape[0], n_out), dtype=np.uint16)
            lib.cmsDoTransform(t, a.ctypes.data_as(c_void_p), out.ctypes.data_as(c_void_p), a.shape[0])
        finally:
            lib.cmsDeleteTransform(t)
    return out


def quantise(values: np.ndarray, bits: int, dither: bool, seed: int = 1) -> np.ndarray:
    """Floats 0 to 1 rounded to `bits` bits and returned as floats on that grid, clipped. With `dither`, triangular noise
    one step wide is added first, so smooth gradients do not band when the result is later reduced."""
    top = float((1 << bits) - 1)
    scaled = np.clip(values, 0.0, 1.0) * top
    if dither:
        rng = np.random.default_rng(seed)
        scaled = scaled + (rng.random(scaled.shape) - rng.random(scaled.shape))
    return np.clip(np.floor(scaled + 0.5), 0.0, top) / top
