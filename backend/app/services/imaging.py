import io
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageOps

from app.core import config
from app.services import camera_profiles, dcp, dpx, ico, pnm, qoi, tga

Image.MAX_IMAGE_PIXELS = config.MAX_PIXELS

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF = True
except Exception:
    HEIF = False

HEIF_SUFFIXES = {".heic", ".heif", ".hif"}

# Camera RAW (Photoshop opens these into Camera Raw): decoded by LibRaw through rawpy. DNG is a TIFF container whose
# embedded preview Pillow would open instead of the sensor data, so RAW suffixes never reach Pillow.
try:
    import rawpy

    RAW = True
    RAW_ENGINE = "LibRaw " + ".".join(str(n) for n in rawpy.libraw_version)
except Exception:
    RAW = False
    RAW_ENGINE = "none"

RAW_SUFFIXES = {".dng", ".cr2", ".cr3", ".crw", ".nef", ".nrw", ".arw", ".srf", ".sr2", ".raf", ".orf", ".rw2", ".pef",
                ".srw", ".x3f", ".3fr", ".iiq", ".rwl", ".mrw", ".kdc", ".dcr", ".erf", ".mef", ".mos"}


class DecodeError(Exception):
    pass


def sips_available() -> bool:
    return platform.system() == "Darwin" and shutil.which("sips") is not None


def decoders() -> dict:
    engine = "pillow-heif" if HEIF else ("sips" if sips_available() else "none")
    return {"heic": HEIF or sips_available(), "tiff": True, "engine": engine, "raw": RAW, "rawEngine": RAW_ENGINE}


def _check(width: int, height: int) -> None:
    if width < 1 or height < 1 or width > config.MAX_SIDE or height > config.MAX_SIDE or width * height > config.MAX_PIXELS:
        raise DecodeError(f"The image exceeds the 30,000 px side or {config.MAX_PIXELS // 1_000_000}-megapixel limit.")


def _png(image: Image.Image) -> tuple[bytes, int, int]:
    _check(image.width, image.height)
    upright = ImageOps.exif_transpose(image)
    transparent = "A" in upright.getbands() or upright.mode in ("P", "LA", "PA") or "transparency" in upright.info
    wanted = "RGBA" if transparent else "RGB"
    if upright.mode != wanted:
        upright = upright.convert(wanted)
    out = io.BytesIO()
    upright.save(out, format="PNG", compress_level=1)
    return out.getvalue(), upright.width, upright.height


def _from_rgba(px: np.ndarray, bits: int = 8) -> tuple[bytes, int, int]:
    """A PNG from the RGBA array one of the pure-Python codecs returned (16 bit samples rounded to 8), RGB when opaque."""
    if px.dtype == np.uint16:
        px = ((px.astype(np.uint32) + 128) // 257).astype(np.uint8)
    image = Image.fromarray(px)
    if bool((px[..., 3] == 255).all()):
        image = image.convert("RGB")
    return _png(image)


def _sniffed(data: bytes, suffix: str, page: int) -> tuple[bytes, int, int] | None:
    """QOI, Netpbm, TGA and ICO, read by the engine's own codecs (qoi.py, pnm.py, tga.py, ico.py); None for anything else."""
    try:
        if qoi.is_qoi(data):
            return _from_rgba(qoi.read(data)[0])
        if pnm.is_pnm(data):
            return _from_rgba(pnm.read(data)[0])
        if ico.is_ico(data) and suffix in (".ico", ".cur"):
            return _from_rgba(ico.read(data, page))
        if suffix in (".tga", ".icb", ".vda", ".vst") and tga.looks_like_tga(data):
            return _from_rgba(tga.read(data))
    except (qoi.QoiError, pnm.PnmError, tga.TgaError, ico.IcoError) as exc:
        raise DecodeError(f"Could not decode the image: {exc}") from exc
    return None


def _sips(data: bytes, suffix: str) -> tuple[bytes, int, int]:
    with tempfile.TemporaryDirectory() as scratch:
        source = Path(scratch) / f"source{suffix}"
        converted = Path(scratch) / "converted.png"
        source.write_bytes(data)
        subprocess.run(["sips", "-s", "format", "png", str(source), "--out", str(converted)], check=True, capture_output=True, timeout=120)
        with Image.open(converted) as result:
            return _png(result)


def _profiled(raw, profile: dcp.Dcp) -> np.ndarray:
    """The RAW's linear camera values, white balanced as shot, through a DNG camera profile to 8-bit sRGB. LibRaw gives
    the demosaiced, black-subtracted values with no colour conversion; the exposure is raised the way LibRaw's own
    automatic brightness does (the brightest one percent of pixels at white), so a profile changes colour and tone, not
    how bright the picture opens."""
    if raw.num_colors != 3:
        raise dcp.DcpError("This camera records more than three colour channels; camera profiles for it are not supported.")
    mult = np.array(raw.camera_whitebalance[:3], dtype=np.float64)
    if not np.all(mult > 0):
        mult = np.array(raw.daylight_whitebalance[:3], dtype=np.float64)
    if not np.all(mult > 0):
        raise dcp.DcpError("This file holds no white balance to apply a camera profile to.")
    linear = raw.postprocess(use_camera_wb=True, output_color=rawpy.ColorSpace.raw, output_bps=16, gamma=(1, 1), no_auto_bright=True)
    peak = float(np.percentile(linear[::4, ::4].max(axis=2), 99)) / 65535.0
    gain = float(np.clip(1.0 / peak, 1.0, 16.0)) if peak > 0 else 1.0
    return dcp.render(linear.astype(np.float32) / np.float32(65535.0), mult.min() / mult, profile, gain)


def _raw(data: bytes, filename: str, camera_profile: str = "auto") -> tuple[bytes, int, int]:
    """A camera RAW developed as Camera Raw opens it by default: the camera's own white balance (as shot), sRGB, 8 bits,
    turned upright by the camera's orientation flag. Develop (Filter > Develop) then works on it. `camera_profile` is
    "none" for LibRaw's own colour, "auto" for the profile in the profile folders that is named like Adobe's defaults and
    made for this camera (else LibRaw's), or the id of a listed profile, which must apply."""
    if not RAW:
        raise DecodeError(f"{filename} is a camera RAW file, and the engine's RAW decoder (rawpy) is not installed.")
    chosen = None
    if camera_profile not in ("none", ""):
        try:
            if camera_profile == "auto":
                entry = camera_profiles.automatic(camera_profiles.camera_of(data))
                chosen = camera_profiles.load(entry["id"])[1] if entry else None
            else:
                chosen = camera_profiles.load(camera_profile)[1]
        except dcp.DcpError as exc:
            if camera_profile != "auto":
                raise DecodeError(f"The camera profile could not be used: {exc}") from exc
    try:
        with rawpy.imread(io.BytesIO(data)) as raw:
            rgb = None
            if chosen is not None:
                try:
                    rgb = _profiled(raw, chosen)
                except dcp.DcpError as exc:
                    if camera_profile != "auto":
                        raise DecodeError(f"The camera profile could not be used: {exc}") from exc
            if rgb is None:
                rgb = raw.postprocess(use_camera_wb=True, output_color=rawpy.ColorSpace.sRGB, output_bps=8)
    except DecodeError:
        raise
    except Exception as exc:
        # LibRaw's own messages ("Input/output error", "Unsupported file format") say little to a user.
        raise DecodeError(f"{filename} could not be read as a camera RAW file. It may be damaged, or from a camera LibRaw does not support yet.") from exc
    return _png(Image.fromarray(rgb))


def pages(data: bytes, filename: str) -> list[dict]:
    """A TIFF's pages (1.53.4), BigTIFF included: each page's number, size and mode, read without decoding pixels.
    One entry for anything else."""
    if ico.is_ico(data) and Path(filename).suffix.lower() in (".ico", ".cur"):
        try:
            return [{"index": e["index"], "width": e["width"], "height": e["height"], "mode": f"{e['bits']} bit"} for e in ico.listing(data)]
        except ico.IcoError as exc:
            raise DecodeError(f"Could not read {filename or 'the icon'}: {exc}") from exc
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format != "TIFF":
                return [{"index": 0, "width": image.width, "height": image.height, "mode": image.mode}]
            out = []
            for i in range(getattr(image, "n_frames", 1)):
                image.seek(i)
                out.append({"index": i, "width": image.width, "height": image.height, "mode": image.mode})
            return out
    except Exception as exc:
        raise DecodeError(f"Could not read {filename or 'the image'}: {exc}") from exc


def decode_to_png(data: bytes, filename: str, page: int = 0, camera_profile: str = "auto") -> tuple[bytes, int, int]:
    suffix = Path(filename).suffix.lower()
    if suffix in RAW_SUFFIXES:
        return _raw(data, filename, camera_profile)
    if dpx.is_dpx(data):
        try:
            px, _info = dpx.read(data)
        except dpx.DpxError as exc:
            raise DecodeError(f"Could not decode {filename or 'the image'}: {exc}") from exc
        return _png(Image.fromarray(((px.astype("uint32") + 128) // 257).astype("uint8"), "RGBA"))
    own = _sniffed(data, suffix, page)
    if own is not None:
        return own
    try:
        with Image.open(io.BytesIO(data)) as image:
            if page:
                count = getattr(image, "n_frames", 1)
                if not 0 <= page < count:
                    raise DecodeError(f"{filename or 'The image'} has {count} page{'s' if count != 1 else ''}; there is no page {page + 1}.")
                image.seek(page)
            return _png(image)
    except DecodeError:
        raise
    except Exception as exc:
        label = filename or "the image"
        if suffix in HEIF_SUFFIXES and sips_available():
            try:
                return _sips(data, suffix)
            except Exception as retry_exc:
                raise DecodeError(f"Could not decode {label}: {retry_exc}") from retry_exc
        raise DecodeError(f"Could not decode {label}: {exc}") from exc


ENCODINGS = {"tiff": "image/tiff", "pdf": "application/pdf", "webp": "image/webp", "avif": "image/avif", "dpx": "image/x-dpx",
             "qoi": "image/x-qoi", "pnm": "image/x-portable-anymap", "tga": "image/x-tga", "ico": "image/vnd.microsoft.icon"}


def _own_encode(rgba: np.ndarray, fmt: str, options: dict) -> bytes:
    """QOI (`linear` flag), Netpbm (`kind`: pbm, pgm, ppm or pam), TGA (`bits` 24 or 32, `rle`) and ICO (`sizes`,
    `png` for PNG entries at every size) from 8-bit RGBA."""
    try:
        if fmt == "qoi":
            return qoi.write(rgba, bool(options.get("linear")))
        if fmt == "pnm":
            return pnm.write(rgba, str(options.get("kind", "ppm")))
        if fmt == "tga":
            return tga.write(rgba, int(options.get("bits", 32)), bool(options.get("rle")))
        sizes = options.get("sizes") or list(ico.SIZES)
        if not isinstance(sizes, list):
            raise DecodeError("The icon sizes must be a list.")
        return ico.write(rgba, sizes, bool(options.get("png")))
    except (qoi.QoiError, pnm.PnmError, tga.TgaError, ico.IcoError, TypeError, ValueError) as exc:
        raise DecodeError(str(exc)) from exc


def encode(png: bytes, fmt: str, quality: int = 90, dpi: int = 72, icc: bytes | None = None, options: dict | None = None) -> bytes:
    """Re-encodes a PNG from the editor: TIFF (LZW, alpha kept), PDF (one page at `dpi`, flattened on white, since PDF
    images carry no alpha here), WebP or AVIF (at `quality`, alpha kept). `icc`, an ICC profile the pixels are already
    in, is embedded in TIFF, WebP and AVIF; PDF carries none."""
    if fmt not in ENCODINGS:
        raise DecodeError(f"Cannot export as {fmt}.")
    if icc is not None:
        if len(icc) > 1_000_000:
            raise DecodeError("The colour profile is too large.")
        try:
            ImageCms.ImageCmsProfile(io.BytesIO(icc))
        except Exception as exc:
            raise DecodeError(f"The colour profile could not be read: {exc}") from exc
    try:
        with Image.open(io.BytesIO(png)) as image:
            image.load()
            _check(*image.size)
            rgba = image.convert("RGBA")
    except DecodeError:
        raise
    except Exception as exc:
        raise DecodeError(f"The image could not be read: {exc}") from exc
    out = io.BytesIO()
    q = max(1, min(100, int(quality)))
    extra = {"icc_profile": icc} if icc else {}
    if fmt in ("qoi", "pnm", "tga", "ico"):
        return _own_encode(np.asarray(rgba), fmt, options or {})
    if fmt == "dpx":
        wide = np.asarray(rgba, dtype=np.uint16) * 257
        try:
            return dpx.write(wide, 10, "log", True)
        except dpx.DpxError as exc:
            raise DecodeError(str(exc)) from exc
    if fmt == "tiff":
        rgba.save(out, "TIFF", compression="tiff_lzw", dpi=(dpi, dpi), **extra)
    elif fmt == "pdf":
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.getchannel("A"))
        flat.save(out, "PDF", resolution=float(max(1, dpi)))
    elif fmt == "webp":
        rgba.save(out, "WEBP", quality=q, method=4, **extra)
    else:
        rgba.save(out, "AVIF", quality=q, **extra)
    return out.getvalue()
