"""FITS (astronomy) images from the published standard (fits.gsfc.nasa.gov/fits_standard.html), primary HDU only: 2880
byte header blocks of 80 character cards up to END, then big-endian data in BITPIX 8, 16, 32, -32 or -64. The physical
value is BZERO + BSCALE * raw. NAXIS3 of 3 reads as RGB, anything else as the first plane in grey. FITS rows run
bottom-up, so the picture is flipped. A file is stretched on open (raw sensor counts are never viewable as they stand):
the 0.25 and 99.75 percentiles, NaN ignored, map to 0..1 and then an asinh curve, asinh(10 x) / asinh(10). Integer
files come out as RGBA at 16 bits, floating point files as float32 RGBA in 0..1 at 32 bits, with NaN as 0."""

import numpy as np

MAX_SIDE = 30000
MAX_PIXELS = 400_000_000
BLOCK = 2880
DTYPES = {8: ">u1", 16: ">i2", 32: ">i4", -32: ">f4", -64: ">f8"}
SAMPLE = 4_000_000


class FitsError(Exception):
    pass


def is_fits(data: bytes) -> bool:
    return data[:9] == b"SIMPLE  ="


def _check(width: int, height: int) -> None:
    if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise FitsError("The picture is empty or larger than formvis edits in one piece.")


def _header(data: bytes) -> tuple[dict[str, str], int]:
    """(cards by keyword, offset of the data block)."""
    cards: dict[str, str] = {}
    pos = 0
    while pos + BLOCK <= len(data):
        block = data[pos:pos + BLOCK]
        pos += BLOCK
        for i in range(0, BLOCK, 80):
            card = block[i:i + 80].decode("ascii", "replace")
            key = card[:8].strip()
            if key == "END":
                return cards, pos
            if card[8:10] == "= " and key not in cards:
                cards[key] = card[10:].split("/")[0].strip()
    raise FitsError("The FITS header has no END card.")


def _num(cards: dict[str, str], key: str, default: float | None = None) -> float:
    if key not in cards:
        if default is None:
            raise FitsError(f"The FITS header has no {key} card.")
        return default
    try:
        return float(cards[key].replace("D", "E").replace("d", "e"))
    except ValueError as exc:
        raise FitsError(f"The FITS {key} card is not a number.") from exc


def read(data: bytes) -> tuple[np.ndarray, int]:
    """(RGBA array of shape (height, width, 4), 16 or 32): uint16 for integer data, float32 in 0..1 for floating point."""
    if not is_fits(data):
        raise FitsError("This is not a FITS file.")
    cards, start = _header(data)
    if cards.get("SIMPLE") != "T":
        raise FitsError("This FITS file does not follow the standard (SIMPLE is not T).")
    bitpix, naxis = int(_num(cards, "BITPIX")), int(_num(cards, "NAXIS"))
    if bitpix not in DTYPES:
        raise FitsError(f"BITPIX {bitpix} is not one formvis reads (8, 16, 32, -32 or -64).")
    if naxis < 2:
        raise FitsError("This FITS file holds no picture (NAXIS is under 2).")
    width, height = int(_num(cards, "NAXIS1")), int(_num(cards, "NAXIS2"))
    planes = int(_num(cards, "NAXIS3")) if naxis >= 3 else 1
    _check(width, height)
    if planes < 1:
        raise FitsError("The FITS picture has no planes.")
    bzero, bscale = _num(cards, "BZERO", 0.0), _num(cards, "BSCALE", 1.0)
    dt = np.dtype(DTYPES[bitpix])
    need = width * height * planes * dt.itemsize
    if len(data) - start < need:
        raise FitsError("The FITS data ends before the picture does.")
    raw = np.frombuffer(data, dt, width * height * planes, start).reshape(planes, height, width)
    take = 3 if planes == 3 else 1
    v = raw[:take].astype(np.float32) * np.float32(bscale) + np.float32(bzero)
    v[~np.isfinite(v)] = np.nan
    flat = v.reshape(-1)
    probe = flat if flat.size <= SAMPLE else flat[:: flat.size // SAMPLE + 1]
    probe = probe[~np.isnan(probe)]
    if probe.size:
        lo, hi = (float(x) for x in np.percentile(probe, (0.25, 99.75)))
    else:
        lo = hi = 0.0
    if hi <= lo:
        hi = lo + 1.0
    y = np.clip((v - np.float32(lo)) / np.float32(hi - lo), 0.0, 1.0)
    y = np.arcsinh(y * 10.0) / np.arcsinh(10.0)
    y = np.nan_to_num(y, nan=0.0).astype(np.float32)
    y = y[:, ::-1, :]
    rgb = np.moveaxis(y, 0, 2)
    if take == 1:
        rgb = np.repeat(rgb, 3, axis=2)
    out = np.ones((height, width, 4), np.float32)
    out[..., :3] = rgb
    if bitpix < 0:
        return np.ascontiguousarray(out), 32
    return np.rint(out * 65535.0).astype(np.uint16), 16


def write(rgba: np.ndarray, gray: bool = False) -> bytes:
    """A primary-HDU FITS file from 8-bit RGBA: BITPIX 8, three planes (NAXIS3 of 3) or one grey plane (Rec. 709 weights),
    transparency flattened on white, rows bottom-up as the standard has them, the data padded to a whole block."""
    height, width = rgba.shape[:2]
    _check(width, height)
    a = rgba[..., 3:4].astype(np.float32) / 255.0
    rgb = rgba[..., :3].astype(np.float32) * a + 255.0 * (1.0 - a)
    if gray:
        planes = (rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32))[None]
    else:
        planes = np.moveaxis(rgb, 2, 0)
    data = np.ascontiguousarray(np.rint(planes[:, ::-1, :]).clip(0, 255).astype(np.uint8)).tobytes()
    cards = ["SIMPLE  =                    T", "BITPIX  =                    8", f"NAXIS   = {2 if gray else 3:>20}",
             f"NAXIS1  = {width:>20}", f"NAXIS2  = {height:>20}"]
    if not gray:
        cards.append(f"NAXIS3  = {3:>20}")
    cards += ["COMMENT written by formvis", "END"]
    head = "".join(c.ljust(80) for c in cards).encode("ascii")
    head += b" " * (-len(head) % BLOCK)
    return head + data + b"\0" * (-len(data) % BLOCK)
