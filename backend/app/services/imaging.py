import io
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

from app.core import config

Image.MAX_IMAGE_PIXELS = config.MAX_PIXELS

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF = True
except Exception:
    HEIF = False

HEIF_SUFFIXES = {".heic", ".heif", ".hif"}


class DecodeError(Exception):
    pass


def sips_available() -> bool:
    return platform.system() == "Darwin" and shutil.which("sips") is not None


def decoders() -> dict:
    engine = "pillow-heif" if HEIF else ("sips" if sips_available() else "none")
    return {"heic": HEIF or sips_available(), "tiff": True, "engine": engine}


def _check(width: int, height: int) -> None:
    if width < 1 or height < 1 or width > config.MAX_SIDE or height > config.MAX_SIDE or width * height > config.MAX_PIXELS:
        raise DecodeError("The image exceeds the 30,000 px side or 100-megapixel limit.")


def _png(image: Image.Image) -> tuple[bytes, int, int]:
    _check(*image.size)
    image = ImageOps.exif_transpose(image)
    alpha = "A" in image.getbands() or image.mode in ("P", "PA", "LA") or "transparency" in image.info
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if alpha else "RGB")
    out = io.BytesIO()
    image.save(out, format="PNG", compress_level=1)
    return out.getvalue(), image.size[0], image.size[1]


def _sips(data: bytes, suffix: str) -> tuple[bytes, int, int]:
    with tempfile.TemporaryDirectory() as tmp:
        source, target = Path(tmp) / f"in{suffix}", Path(tmp) / "out.png"
        source.write_bytes(data)
        subprocess.run(["sips", "-s", "format", "png", str(source), "--out", str(target)], check=True, capture_output=True, timeout=120)
        with Image.open(target) as image:
            return _png(image)


def decode_to_png(data: bytes, filename: str) -> tuple[bytes, int, int]:
    suffix = Path(filename or "").suffix.lower()
    try:
        with Image.open(io.BytesIO(data)) as image:
            return _png(image)
    except DecodeError:
        raise
    except Exception as exc:
        if suffix in HEIF_SUFFIXES and sips_available():
            try:
                return _sips(data, suffix)
            except Exception as fallback:
                raise DecodeError(f"Could not decode {filename}: {fallback}") from fallback
        raise DecodeError(f"Could not decode {filename or 'the image'}: {exc}") from exc


ENCODINGS = {"tiff": "image/tiff", "pdf": "application/pdf", "webp": "image/webp", "avif": "image/avif"}


def encode(png: bytes, fmt: str, quality: int = 90, dpi: int = 72) -> bytes:
    """Re-encodes a PNG from the editor: TIFF (LZW, alpha kept), PDF (one page at `dpi`, flattened on white, since PDF
    images carry no alpha here), WebP or AVIF (at `quality`, alpha kept)."""
    if fmt not in ENCODINGS:
        raise DecodeError(f"Cannot export as {fmt}.")
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
    if fmt == "tiff":
        rgba.save(out, "TIFF", compression="tiff_lzw", dpi=(dpi, dpi))
    elif fmt == "pdf":
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.getchannel("A"))
        flat.save(out, "PDF", resolution=float(max(1, dpi)))
    elif fmt == "webp":
        rgba.save(out, "WEBP", quality=q, method=4)
    else:
        rgba.save(out, "AVIF", quality=q)
    return out.getvalue()
