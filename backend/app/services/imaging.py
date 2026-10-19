import base64
import binascii
import io
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageOps

from app.core import config
from app.services import camera_profiles, cin, dcp, dpx, fits, ico, png_write, pnm, qoi, raw_develop, tga, wbmp, xpm

Image.MAX_IMAGE_PIXELS = config.MAX_PIXELS

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF = True
except Exception:
    HEIF = False

HEIF_SUFFIXES = {".heic", ".heif", ".hif"}

# Camera RAW (opened into Camera Raw): decoded by LibRaw through rawpy. DNG is a TIFF container whose
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


PLAUSIBLE_RATIO = {"PNG": 1100, "JPEG": 4000}


def _plausible(image: Image.Image, size: int) -> None:
    """A PNG or JPEG cannot shrink a picture past what its codec allows (deflate 1032 to 1), so a small file that
    declares a vast picture is damaged or a decompression bomb: refused before any pixel is decoded."""
    ratio = PLAUSIBLE_RATIO.get(image.format or "")
    if not ratio or not size:
        return
    bits = {"1": 1, "L": 1, "P": 1, "LA": 16, "RGB": 24, "RGBA": 32, "I;16": 16}.get(image.mode, 8) if image.format == "PNG" else 1
    need = image.width * image.height * bits / 8 if image.format == "PNG" else image.width * image.height
    if need > size * ratio:
        raise DecodeError(f"The file is only {max(1, size // 1024):,} KB but declares a {image.width} by {image.height} picture, more than a {image.format} of that size can hold. It is damaged or not a real picture.")


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


def heif_deep(data: bytes) -> tuple[np.ndarray, int] | None:
    """A HEIF or HEIC holding more than 8 bits a channel as uint16 RGBA of shape (height, width, 4) stretched to the full
    16-bit range, and its bit depth; None for an 8-bit file or without pillow-heif."""
    if not HEIF:
        return None
    try:
        heif = pillow_heif.open_heif(io.BytesIO(data), convert_hdr_to_8bit=False)
    except Exception:
        return None
    bits = int(heif.info.get("bit_depth") or 8)
    if bits <= 8 or heif.mode.split(";")[0] not in ("RGB", "RGBA", "L"):
        return None
    arr = np.asarray(heif)
    if arr.dtype != np.uint16:
        return None
    top = ((1 << bits) - 1) << (16 - bits)
    px = np.minimum(arr.astype(np.uint64) * 65535 // top, 65535).astype(np.uint16)
    if px.ndim == 2:
        px = np.stack([px, px, px], axis=2)
    if px.shape[2] == 3:
        px = np.dstack([px, np.full(px.shape[:2], 65535, np.uint16)])
    return np.ascontiguousarray(px[:, :, :4]), bits


def _sniffed(data: bytes, suffix: str, page: int) -> tuple[bytes, int, int] | None:
    """QOI, Netpbm, TGA and ICO, read by the engine's own codecs (qoi.py, pnm.py, tga.py, ico.py); None for anything else."""
    try:
        if qoi.is_qoi(data):
            return _from_rgba(qoi.read(data)[0])
        if pnm.is_pnm(data):
            return _from_rgba(pnm.read(data)[0])
        if pnm.is_pfm(data):
            lin = np.clip(pnm.read_pfm(data), 0.0, 1.0)
            enc = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
            enc[..., 3] = 1.0
            return _from_rgba(np.round(enc * 255).astype(np.uint8))
        if ico.is_ico(data) and suffix in (".ico", ".cur"):
            return _from_rgba(ico.read(data, page))
        if suffix in (".tga", ".icb", ".vda", ".vst") and tga.looks_like_tga(data):
            return _from_rgba(tga.read(data))
        if suffix == ".wbmp" and wbmp.looks_like_wbmp(data):
            return _from_rgba(wbmp.read(data))
        if suffix in (".xpm", ".pm") and xpm.looks_like_xpm(data):
            return _from_rgba(xpm.read(data))
    except (qoi.QoiError, pnm.PnmError, tga.TgaError, ico.IcoError, wbmp.WbmpError, xpm.XpmError) as exc:
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


def _profiled(raw, profile: dcp.Dcp, half: bool = False) -> np.ndarray:
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
    linear = raw.postprocess(use_camera_wb=True, output_color=rawpy.ColorSpace.raw, output_bps=16, gamma=(1, 1), no_auto_bright=True, half_size=half)
    peak = float(np.percentile(linear[::4, ::4].max(axis=2), 99)) / 65535.0
    gain = float(np.clip(1.0 / peak, 1.0, 16.0)) if peak > 0 else 1.0
    return dcp.render(linear.astype(np.float32) / np.float32(65535.0), mult.min() / mult, profile, gain)


RAW_WB_MODES = ("as_shot", "auto", "daylight")


def _wb_kwargs(raw, wb: str, temperature: float, tint: float, kelvin: float = 0.0) -> dict:
    """The white balance LibRaw develops with (DEV_PLAN 36.21), applied to the sensor values before demosaicing and
    colour, not to the 8-bit picture afterwards. As shot with no Temperature or Tint is LibRaw's camera white balance,
    exactly as before. Otherwise `user_wb` multipliers: the as-shot, daylight or gray-world (auto) multipliers, then
    Temperature (positive is warmer: red up, blue down, up to 0.8 stop at 100) and Tint (positive is magenta: green
    down, up to 0.5 stop at 100). A `kelvin` above zero sets the temperature in Kelvin instead (raw_develop.kelvin_multipliers),
    with Tint on top; a file without a colour matrix keeps the relative route."""
    if kelvin > 0:
        mult = raw_develop.kelvin_multipliers(raw, kelvin)
        if mult is not None:
            magenta = 2.0 ** (-0.5 * tint / 100.0)
            return {"user_wb": [mult[0], mult[1] * magenta, mult[2], mult[1] * magenta]}
    if wb == "as_shot" and not temperature and not tint:
        return {"use_camera_wb": True}
    if wb == "auto":
        # LibRaw's own gray-world white balance is not readable, so the same average is taken from a quick half-size
        # linear decode (no white balance, no colour conversion) and turned into multipliers.
        lin = raw.postprocess(user_wb=[1.0, 1.0, 1.0, 1.0], output_color=rawpy.ColorSpace.raw, output_bps=16, gamma=(1, 1), no_auto_bright=True, half_size=True)
        means = lin.reshape(-1, lin.shape[-1])[::7, :3].astype(np.float64).mean(axis=0)
        base = [float(means[1] / m) if m > 0 and means[1] > 0 else 1.0 for m in means] + [1.0]
    else:
        key = "daylight_whitebalance" if wb == "daylight" else "camera_whitebalance"
        base = [float(v) for v in getattr(raw, key)]
        if len(base) < 3 or not all(v > 0 for v in base[:3]):
            base = [float(v) for v in raw.daylight_whitebalance]
        if len(base) < 3 or not all(v > 0 for v in base[:3]):
            return {}   # the file holds no white balance: LibRaw's own default
        base = (base + [base[1]])[:4] if len(base) < 4 else base[:4]
        if base[3] <= 0:
            base[3] = base[1]
    warm, magenta = 2.0 ** (0.8 * temperature / 100.0), 2.0 ** (-0.5 * tint / 100.0)
    return {"user_wb": [base[0] * warm, base[1] * magenta, base[2] / warm, base[3] * magenta]}


def _raw_args(wb: str, temperature: float, tint: float, bits: int) -> tuple[str, float, float, int]:
    if wb not in RAW_WB_MODES:
        raise DecodeError("The white balance must be as_shot, auto or daylight.")
    if bits not in (8, 16):
        raise DecodeError("A RAW opens at 8 or 16 bits per channel.")
    return wb, max(-100.0, min(100.0, float(temperature))), max(-100.0, min(100.0, float(tint))), bits


def is_raw(data: bytes, filename: str) -> bool:
    """A camera RAW by its suffix or, for a file named otherwise, by its bytes (raw_develop.sniff)."""
    return Path(filename).suffix.lower() in RAW_SUFFIXES or bool(RAW and raw_develop.sniff(data))


def raw_info(data: bytes, filename: str) -> dict:
    """The open summary of a camera RAW (raw_develop.info): make and model, sensor sizes, CFA pattern, white balance
    multipliers, orientation, baseline exposure, levels."""
    if not RAW:
        raise DecodeError(f"{filename} is a camera RAW file, and the engine's RAW decoder (rawpy) is not installed.")
    try:
        with rawpy.imread(io.BytesIO(data)) as raw:
            return raw_develop.info(data, raw, camera_profiles.camera_of(data))
    except Exception as exc:
        raise DecodeError(f"{filename} could not be read as a camera RAW file. It may be damaged, or from a camera LibRaw does not support yet.") from exc


def _raw(data: bytes, filename: str, camera_profile: str = "auto", wb: str = "as_shot", temperature: float = 0.0, tint: float = 0.0, half: bool = False, develop: dict | None = None) -> tuple[bytes, int, int]:
    """A camera RAW developed as Camera Raw opens it by default: the camera's own white balance (as shot), sRGB, 8 bits,
    turned upright by the camera's orientation flag. Develop (Filter > Develop) then works on it. `camera_profile` is
    "none" for LibRaw's own colour, "auto" for the profile in the profile folders that is named like the common defaults and
    made for this camera (else LibRaw's), or the id of a listed profile, which must apply. `wb`, `temperature` and `tint`
    set the white balance at the RAW stage (_wb_kwargs); a camera profile applies only with the as-shot white balance.
    `half` decodes at half size, a fast preview (Camera Raw's panel)."""
    if not RAW:
        raise DecodeError(f"{filename} is a camera RAW file, and the engine's RAW decoder (rawpy) is not installed.")
    wb, temperature, tint, _ = _raw_args(wb, temperature, tint, 8)
    develop = develop or {}
    custom = wb != "as_shot" or bool(temperature) or bool(tint) or raw_develop.active(develop) or bool(develop.get("kelvin")) or bool(develop.get("look"))
    chosen = None
    if custom and camera_profile not in ("none", "", "auto"):
        raise DecodeError("A camera profile works with the as-shot white balance and no RAW-stage develop controls; set White Balance to As Shot and the controls to zero to use one.")
    if camera_profile not in ("none", "") and not custom:
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
                    rgb = _profiled(raw, chosen, half)
                except dcp.DcpError as exc:
                    if camera_profile != "auto":
                        raise DecodeError(f"The camera profile could not be used: {exc}") from exc
            if rgb is None:
                rgb = raw_develop.develop(raw, _wb_kwargs(raw, wb, temperature, tint, develop.get("kelvin", 0.0)), develop, half, 8, rawpy, "srgb", raw_develop.gain_maps(data))
    except DecodeError:
        raise
    except Exception as exc:
        # LibRaw's own messages ("Input/output error", "Unsupported file format") say little to a user.
        raise DecodeError(f"{filename} could not be read as a camera RAW file. It may be damaged, or from a camera LibRaw does not support yet.") from exc
    return _png(Image.fromarray(rgb))


def raw_deep(data: bytes, filename: str, wb: str = "as_shot", temperature: float = 0.0, tint: float = 0.0, half: bool = False, develop: dict | None = None, space: str = "srgb") -> tuple[bytes, int, int]:
    """A camera RAW developed at 16 bits per channel (Camera Raw's 16 Bits/Channel workflow option): sRGB, or ProPhoto
    RGB for `space` prophoto, the white balance set at the RAW stage, as RGBA little-endian 16-bit samples (opaque) with
    the width and height, the way /io/decode-deep returns them. LibRaw's own colour is used: camera profiles render at 8 bits only."""
    if space not in raw_develop.SPACES:
        raise DecodeError("The colour space must be srgb or prophoto.")
    if not RAW:
        raise DecodeError(f"{filename} is a camera RAW file, and the engine's RAW decoder (rawpy) is not installed.")
    wb, temperature, tint, _ = _raw_args(wb, temperature, tint, 16)
    try:
        with rawpy.imread(io.BytesIO(data)) as raw:
            rgb = raw_develop.develop(raw, _wb_kwargs(raw, wb, temperature, tint, (develop or {}).get("kelvin", 0.0)), develop or {}, half, 16, rawpy, space, raw_develop.gain_maps(data))
    except DecodeError:
        raise
    except Exception as exc:
        raise DecodeError(f"{filename} could not be read as a camera RAW file. It may be damaged, or from a camera LibRaw does not support yet.") from exc
    height, width = rgb.shape[:2]
    _check(width, height)
    out = np.empty((height, width, 4), dtype="<u2")
    out[..., :3] = rgb
    out[..., 3] = 65535
    return out.tobytes(), width, height


def _subifd_pages(data: bytes) -> list:
    """The reduced-resolution copies and masks that main pages list in their SubIFDs tag, as tifffile pages in file order."""
    try:
        import tifffile
        with tifffile.TiffFile(io.BytesIO(data)) as tf:
            return [q for p in tf.pages for q in (getattr(p, "pages", None) or []) if hasattr(q, "shape") and len(q.shape) >= 2]
    except Exception:
        return []


def _subifd_image(data: bytes, k: int) -> Image.Image | None:
    try:
        import tifffile
        with tifffile.TiffFile(io.BytesIO(data)) as tf:
            subs = [q for p in tf.pages for q in (getattr(p, "pages", None) or []) if hasattr(q, "shape") and len(q.shape) >= 2]
            if not 0 <= k < len(subs):
                return None
            arr = subs[k].asarray()
        if arr.dtype != np.uint8:
            arr = (arr.astype(np.float64) / max(1.0, float(np.iinfo(arr.dtype).max) if arr.dtype.kind in "ui" else 1.0) * 255.0).clip(0, 255).astype(np.uint8)
        if arr.ndim == 3 and arr.shape[0] in (1, 3, 4) and arr.shape[2] not in (1, 3, 4):
            arr = np.moveaxis(arr, 0, 2)
        if arr.ndim == 3 and arr.shape[2] == 1:
            arr = arr[..., 0]
        return Image.fromarray(arr)
    except Exception:
        return None


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
            for k, sub in enumerate(_subifd_pages(data)):
                height, width = sub.shape[:2]
                out.append({"index": len(out), "width": int(width), "height": int(height), "mode": "SubIFD", "sub": k})
            return out
    except Exception as exc:
        raise DecodeError(f"Could not read {filename or 'the image'}: {exc}") from exc


MAX_ANIMATION_FRAMES = 500


def frames(data: bytes, filename: str) -> dict | None:
    """The frames of an animated GIF or WebP, each composited onto the whole canvas (GIF disposal and WebP blending are
    Pillow's), as PNGs with the file's delay in milliseconds. `plays` is how often it plays, 0 for forever. None for
    a file of one frame or any other format, which opens as one picture."""
    if Path(filename).suffix.lower() not in (".gif", ".webp"):
        return None
    try:
        with Image.open(io.BytesIO(data)) as image:
            count = getattr(image, "n_frames", 1)
            if image.format not in ("GIF", "WEBP") or count < 2:
                return None
            _check(image.width, image.height)
            if count > MAX_ANIMATION_FRAMES or count * image.width * image.height > config.MAX_PIXELS:
                raise DecodeError(f"{filename or 'The animation'} has {count} frames of {image.width} by {image.height}; formvis opens up to {MAX_ANIMATION_FRAMES} frames within {config.MAX_PIXELS // 1_000_000} megapixels in all.")
            loop = image.info.get("loop")
            plays = (0 if loop == 0 else loop + 1 if loop else 1) if image.format == "GIF" else int(loop or 0)
            out = []
            for i in range(count):
                image.seek(i)
                buf = io.BytesIO()
                image.convert("RGBA").save(buf, format="PNG", compress_level=1)
                out.append({"png": buf.getvalue(), "delay": int(image.info.get("duration", 0) or 0)})
            return {"width": image.width, "height": image.height, "plays": plays, "frames": out}
    except DecodeError:
        raise
    except Exception as exc:
        raise DecodeError(f"Could not read {filename or 'the animation'}: {exc}") from exc


def _truncated_jpeg(data: bytes) -> "tuple[bytes, int, int] | None":
    """The rows of a JPEG whose stream ends early, the rest left grey; None when nothing can be read."""
    from PIL import ImageFile
    ImageFile.LOAD_TRUNCATED_IMAGES = True
    try:
        with Image.open(io.BytesIO(data)) as image:
            _plausible(image, len(data))
            return _png(image)
    except Exception:
        return None
    finally:
        ImageFile.LOAD_TRUNCATED_IMAGES = False


def decode_to_png(data: bytes, filename: str, page: int = 0, camera_profile: str = "auto", wb: str = "as_shot", temperature: float = 0.0, tint: float = 0.0, half: bool = False, develop: dict | None = None) -> tuple[bytes, int, int]:
    suffix = Path(filename).suffix.lower()
    if is_raw(data, filename):
        return _raw(data, filename, camera_profile, wb, temperature, tint, half, develop)
    if dpx.is_dpx(data):
        try:
            px, _info = dpx.read(data)
        except dpx.DpxError as exc:
            raise DecodeError(f"Could not decode {filename or 'the image'}: {exc}") from exc
        return _png(Image.fromarray(((px.astype("uint32") + 128) // 257).astype("uint8"), "RGBA"))
    if cin.is_cineon(data):
        try:
            px, _info = cin.read(data)
        except cin.CinError as exc:
            raise DecodeError(f"Could not decode {filename or 'the image'}: {exc}") from exc
        return _from_rgba(px)
    own = _sniffed(data, suffix, page)
    if own is not None:
        return own
    try:
        with Image.open(io.BytesIO(data)) as image:
            _plausible(image, len(data))
            if page:
                count = getattr(image, "n_frames", 1)
                if image.format == "TIFF" and page >= count:
                    sub = _subifd_image(data, page - count)
                    if sub is not None:
                        return _png(sub)
                if not 0 <= page < count:
                    raise DecodeError(f"{filename or 'The image'} has {count} page{'s' if count != 1 else ''}; there is no page {page + 1}.")
                image.seek(page)
            return _png(image)
    except DecodeError:
        raise
    except Exception as exc:
        label = filename or "the image"
        if data[:2] == b"\xff\xd8":
            kept = _truncated_jpeg(data)
            if kept is not None:
                return kept
        if suffix in HEIF_SUFFIXES and sips_available():
            try:
                return _sips(data, suffix)
            except Exception as retry_exc:
                raise DecodeError(f"Could not decode {label}: {retry_exc}") from retry_exc
        raise DecodeError(f"Could not decode {label}: {exc}") from exc


ENCODINGS = {"tiff": "image/tiff", "pdf": "application/pdf", "webp": "image/webp", "avif": "image/avif", "dpx": "image/x-dpx", "png8": "image/png",
             "qoi": "image/x-qoi", "pnm": "image/x-portable-anymap", "tga": "image/x-tga", "ico": "image/vnd.microsoft.icon",
             "bmp": "image/bmp", "fits": "image/fits", "wbmp": "image/vnd.wap.wbmp", "png": "image/png", "jpeg": "image/jpeg"}


def _flat_white(rgba: Image.Image) -> Image.Image:
    flat = Image.new("RGB", rgba.size, (255, 255, 255))
    flat.paste(rgba, mask=rgba.getchannel("A"))
    return flat


def _wbmp(rgba: Image.Image) -> bytes:
    """A WBMP type 0 file (WAP): 1 bit a pixel, 1 for white, rows padded to whole bytes, the picture flattened on white
    and thresholded at half grey."""
    grey = np.asarray(_flat_white(rgba).convert("L"))
    h, w = grey.shape

    def uint(n: int) -> bytes:
        out = [n & 0x7F]
        n >>= 7
        while n:
            out.append(0x80 | (n & 0x7F))
            n >>= 7
        return bytes(reversed(out))
    return b"\x00\x00" + uint(w) + uint(h) + np.packbits(grey >= 128, axis=1).tobytes()


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


TIFF_COMPRESSIONS = {"none": ("raw", None), "packbits": ("packbits", "packbits"), "lzw": ("tiff_lzw", "lzw"), "deflate": ("tiff_adobe_deflate", "zlib")}


def _tiff(rgba: Image.Image, o: dict, dpi: int, icc: bytes | None) -> bytes:
    """A TIFF from 8-bit RGBA. Options: `compression` none, packbits, lzw (the default) or deflate; `bigtiff`; `gray`
    for one grey channel; `alpha` false to flatten on white and drop the channel."""
    name = str(o.get("compression", "lzw")).lower()
    if name not in TIFF_COMPRESSIONS:
        raise DecodeError(f"Unknown TIFF compression {name}.")
    pil, tf = TIFF_COMPRESSIONS[name]
    keep = o.get("alpha", True) is not False
    gray = bool(o.get("gray"))
    img = rgba if keep else _flat_white(rgba)
    if gray:
        img = img.convert("LA" if keep else "L")
        icc = None   # an RGB profile does not describe a grey file
    out = io.BytesIO()
    if o.get("bigtiff"):
        import tifffile
        if name in ("lzw", "packbits"):
            raise DecodeError("BigTIFF is written uncompressed or with Deflate.")
        tags = [(34675, "B", len(icc), icc, True)] if icc else []
        tifffile.imwrite(out, np.asarray(img), bigtiff=True, photometric="minisblack" if gray else "rgb", extrasamples=["unassalpha"] if keep else None,
                         compression=tf, resolution=(dpi, dpi), resolutionunit="inch", extratags=tags)
    else:
        img.save(out, "TIFF", compression=pil, dpi=(dpi, dpi), **({"icc_profile": icc} if icc else {}))
    return out.getvalue()


def _kept_meta(options: dict) -> dict:
    """The Exif block (`exif`, base64 from the TIFF header on) and XMP packet (`xmp`, text) a caller hands over to be written
    into an AVIF; a value that is not what it says, or is too large, is left out rather than failing the export."""
    out: dict = {}
    exif, xmp = options.get("exif"), options.get("xmp")
    if isinstance(exif, str) and exif:
        try:
            raw = base64.b64decode(exif, validate=True)
        except (binascii.Error, ValueError):
            raw = b""
        if 8 < len(raw) <= 65_000 and raw[:2] in (b"II", b"MM"):
            out["exif"] = raw
    if isinstance(xmp, str) and 0 < len(xmp) <= 200_000:
        out["xmp"] = xmp.encode("utf-8")
    return out


def source_meta(data: bytes) -> dict:
    """The Exif block (`exif`, base64 from the TIFF header on) and XMP packet (`xmp`, text) a picture file carries, with the Exif
    Orientation set upright because decoding turns the pixels; the dict `encode` takes to write them into an AVIF. Empty when
    the file holds none."""
    out: dict = {}
    try:
        with Image.open(io.BytesIO(data)) as image:
            raw, packet = image.info.get("exif"), image.info.get("xmp")
        if isinstance(raw, (bytes, bytearray)) and raw:
            exif = Image.Exif()
            exif.load(bytes(raw))
            exif[0x0112] = 1
            block = exif.tobytes()
            out["exif"] = base64.b64encode(block[6:] if block[:6] == b"Exif\x00\x00" else block).decode("ascii")
        if isinstance(packet, (bytes, bytearray)) and packet:
            out["xmp"] = bytes(packet).decode("utf-8", "replace")
    except Exception:
        return {}
    return out


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
    if fmt == "wbmp":
        return _wbmp(rgba)
    if fmt == "fits":
        try:
            return fits.write(np.asarray(rgba), (options or {}).get("planes") == "gray")
        except fits.FitsError as exc:
            raise DecodeError(str(exc)) from exc
    if fmt == "bmp":
        # 32-bit with alpha, or 24-bit on white; BMP carries no colour profile here.
        if (options or {}).get("bits") == 24:
            _flat_white(rgba).save(out, "BMP", dpi=(dpi, dpi))
        else:
            rgba.save(out, "BMP", dpi=(dpi, dpi))
        return out.getvalue()
    if fmt == "png":
        level = max(0, min(9, int((options or {}).get("level", 6))))
        if (options or {}).get("interlace"):
            return png_write.write(np.asarray(rgba), dpi, icc, level)
        rgba.save(out, "PNG", compress_level=level, optimize=bool((options or {}).get("optimize")), dpi=(dpi, dpi), **extra)
        return out.getvalue()
    if fmt == "jpeg":
        sub = {"444": 0, "422": 1, "420": 2}.get(str((options or {}).get("subsampling", "420")), 2)
        flat = _flat_white(rgba)
        if (options or {}).get("gray"):
            flat, extra = flat.convert("L"), {}   # a grey picture carries no RGB profile
        flat.save(out, "JPEG", quality=q, subsampling=sub, progressive=bool((options or {}).get("progressive")), optimize=bool((options or {}).get("optimize")), dpi=(dpi, dpi), **extra)
        return out.getvalue()
    if fmt == "dpx":
        wide = np.asarray(rgba, dtype=np.uint16) * 257
        try:
            return dpx.write(wide, 10, "log", True)
        except dpx.DpxError as exc:
            raise DecodeError(str(exc)) from exc
    if fmt == "png8":
        # An 8-bit palette PNG (1.87.3, D23): at most 256 colours with transparency kept in the palette (tRNS).
        rgba.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(out, "PNG", optimize=True, dpi=(dpi, dpi))
    elif fmt == "tiff":
        return _tiff(rgba, options or {}, dpi, icc)
    elif fmt == "pdf":
        o = options or {}
        back = str(o.get("background", "white")).lower()
        if back not in ("white", "black"):
            raise DecodeError("The PDF background must be white or black.")
        flat = Image.new("RGB", rgba.size, (255, 255, 255) if back == "white" else (0, 0, 0))
        flat.paste(rgba, mask=rgba.getchannel("A"))
        mode = str(o.get("mode", "rgb")).lower()
        if mode not in ("rgb", "gray", "cmyk"):
            raise DecodeError("The PDF colour mode must be rgb, gray or cmyk.")
        flat = flat.convert({"rgb": "RGB", "gray": "L", "cmyk": "CMYK"}[mode])
        flat.save(out, "PDF", resolution=float(max(1, dpi)))
    elif fmt == "webp":
        o = options or {}
        if o.get("lossless"):
            rgba.save(out, "WEBP", lossless=True, quality=max(q, 1), method=4, exact=bool(o.get("exact")), **extra)
        else:
            rgba.save(out, "WEBP", quality=q, method=4, **extra)
    else:
        rgba.save(out, "AVIF", quality=q, **extra, **_kept_meta(options or {}))
    return out.getvalue()
