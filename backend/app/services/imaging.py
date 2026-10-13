import io
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

from app.core import config

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


def _sips(data: bytes, suffix: str) -> tuple[bytes, int, int]:
    with tempfile.TemporaryDirectory() as scratch:
        source = Path(scratch) / f"source{suffix}"
        converted = Path(scratch) / "converted.png"
        source.write_bytes(data)
        subprocess.run(["sips", "-s", "format", "png", str(source), "--out", str(converted)], check=True, capture_output=True, timeout=120)
        with Image.open(converted) as result:
            return _png(result)


def _raw(data: bytes, filename: str) -> tuple[bytes, int, int]:
    """A camera RAW developed as Camera Raw opens it by default: the camera's own white balance (as shot), sRGB, 8 bits,
    turned upright by the camera's orientation flag. Develop (Filter > Develop) then works on it."""
    if not RAW:
        raise DecodeError(f"{filename} is a camera RAW file, and the engine's RAW decoder (rawpy) is not installed.")
    try:
        with rawpy.imread(io.BytesIO(data)) as raw:
            rgb = raw.postprocess(use_camera_wb=True, output_color=rawpy.ColorSpace.sRGB, output_bps=8)
    except Exception as exc:
        # LibRaw's own messages ("Input/output error", "Unsupported file format") say little to a user.
        raise DecodeError(f"{filename} could not be read as a camera RAW file. It may be damaged, or from a camera LibRaw does not support yet.") from exc
    return _png(Image.fromarray(rgb))


def pages(data: bytes, filename: str) -> list[dict]:
    """A TIFF's pages (1.53.4), BigTIFF included: each page's number, size and mode, read without decoding pixels.
    One entry for anything else."""
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


def decode_to_png(data: bytes, filename: str, page: int = 0) -> tuple[bytes, int, int]:
    suffix = Path(filename).suffix.lower()
    if suffix in RAW_SUFFIXES:
        return _raw(data, filename)
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


ENCODINGS = {"tiff": "image/tiff", "pdf": "application/pdf", "webp": "image/webp", "avif": "image/avif"}


def encode(png: bytes, fmt: str, quality: int = 90, dpi: int = 72, icc: bytes | None = None) -> bytes:
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
