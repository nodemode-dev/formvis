"""Pictures larger than formvis edits in one piece (1.52.7, the capability plan): kept in the data folder, their size read
from the file's header without decoding, then opened as a reduced copy that fits, a region at full size, or tiles at
full size. Pillow's decompression-bomb limit is formvis's own 100 megapixels; it is raised only while working here, to
65,535 pixels a side, and restored. Reducing and cutting decode the picture once (about 3 to 4 bytes a pixel); the
picture being worked on is kept decoded, so its tiles do not each decode it again."""

import io
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path

from PIL import Image

from app.core import config

LARGEST = 65_535
_lock = threading.Lock()
_cached: tuple[str, Image.Image] | None = None


class LargeError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


_raised = {"count": 0, "old": None}
_raised_lock = threading.Lock()


@contextmanager
def _unbounded():
    with _raised_lock:
        if _raised["count"] == 0:
            _raised["old"] = Image.MAX_IMAGE_PIXELS
            Image.MAX_IMAGE_PIXELS = LARGEST * LARGEST
        _raised["count"] += 1
    try:
        yield
    finally:
        with _raised_lock:
            _raised["count"] -= 1
            if _raised["count"] == 0:
                Image.MAX_IMAGE_PIXELS = _raised["old"]


def _dir() -> Path:
    d = config.data_dir() / "large"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _path(pid: str) -> Path:
    if not (len(pid) == 32 and all(c in "0123456789abcdef" for c in pid)):
        raise LargeError("No such picture.", 404)
    found = list(_dir().glob(pid + ".*"))
    if not found:
        raise LargeError("That picture is no longer here: open it again.", 404)
    return found[0]


def keep(data: bytes, name: str) -> dict:
    """The file kept; its size from the header (nothing decoded)."""
    ext = Path(name).suffix.lower()[:6] or ".img"
    pid = uuid.uuid4().hex
    path = _dir() / (pid + ext)
    path.write_bytes(data)
    try:
        with _unbounded(), Image.open(path) as im:
            w, h, fmt = im.size[0], im.size[1], im.format
    except Exception:
        path.unlink(missing_ok=True)
        raise LargeError(f"{name} could not be read as a picture.")
    if w > LARGEST or h > LARGEST:
        path.unlink(missing_ok=True)
        raise LargeError(f"{name} is {w} by {h}: larger than {LARGEST} pixels a side.")
    return {"id": pid, "width": w, "height": h, "format": fmt, "bytes": len(data), "memory": w * h * 4}


def _decoded(pid: str) -> Image.Image:
    global _cached
    with _lock:
        if _cached and _cached[0] == pid:
            return _cached[1]
        _cached = None   # one picture decoded at a time
        with _unbounded():
            im = Image.open(_path(pid))
            im.load()
        im = im.convert("RGBA") if im.mode not in ("RGB", "RGBA") else im
        _cached = (pid, im)
        return im


def _png(im: Image.Image) -> bytes:
    out = io.BytesIO()
    im.save(out, "PNG", compress_level=1)
    return out.getvalue()


def _fits(w: int, h: int) -> bool:
    return 1 <= w <= config.MAX_SIDE and 1 <= h <= config.MAX_SIDE and w * h <= config.MAX_PIXELS


def reduced(pid: str, max_side: int) -> bytes:
    """A copy reduced to fit within max_side and formvis's limits."""
    im = _decoded(pid)
    W, H = im.size
    k = min(1.0, max(64, min(max_side, config.MAX_SIDE)) / max(W, H), (config.MAX_PIXELS / (W * H)) ** 0.5)
    size = (max(1, int(W * k)), max(1, int(H * k)))
    return _png(im.resize(size, Image.Resampling.LANCZOS, reducing_gap=3.0))


def region(pid: str, x: int, y: int, w: int, h: int) -> bytes:
    """A region at full size, within the picture and formvis's limits."""
    im = _decoded(pid)
    W, H = im.size
    if x < 0 or y < 0 or w < 1 or h < 1 or x + w > W or y + h > H:
        raise LargeError(f"The region must lie within the picture ({W} by {H}).")
    if not _fits(w, h):
        raise LargeError(f"A region can be at most {config.MAX_SIDE} pixels a side and {config.MAX_PIXELS // 1_000_000} megapixels.")
    return _png(im.crop((x, y, x + w, y + h)))


def tiles(pid: str, size: int) -> list[dict]:
    """The grid of tiles `size` pixels square (the last row and column smaller), each within formvis's limits."""
    with _unbounded(), Image.open(_path(pid)) as im:
        W, H = im.size
    size = max(256, min(size, 10_000))
    return [{"row": r, "col": c, "x": x, "y": y, "width": min(size, W - x), "height": min(size, H - y)}
            for r, y in enumerate(range(0, H, size)) for c, x in enumerate(range(0, W, size))]


def forget(pid: str) -> None:
    global _cached
    with _lock:
        if _cached and _cached[0] == pid:
            _cached = None
    try:
        _path(pid).unlink()
    except LargeError:
        pass


def assemble(name: str, width: int, height: int, parts: list[tuple[int, int, bytes]]) -> Path:
    """The tiles (x, y, PNG) put back together as one PNG `width` by `height`, written strip by strip: one row of tiles
    decoded at a time, each pixel row compressed as it is made, so memory stays at a band, not the picture. The tiles
    must cover the picture exactly."""
    import struct
    import zlib
    if not (1 <= width <= LARGEST and 1 <= height <= LARGEST) or not parts:
        raise LargeError("Nothing to assemble.")
    with _unbounded():
        heads = [(x, y, Image.open(io.BytesIO(data))) for x, y, data in parts]
    bands: dict[int, list] = {}
    for x, y, im in heads:
        bands.setdefault(y, []).append((x, im))
    y_at = 0
    for y in sorted(bands):
        row = sorted(bands[y], key=lambda t: t[0])
        h = row[0][1].size[1]
        if y != y_at or any(im.size[1] != h for _, im in row):
            raise LargeError("The tiles do not cover the picture exactly: a row of tiles is missing or uneven.")
        x_at = 0
        for x, im in row:
            if x != x_at:
                raise LargeError("The tiles do not cover the picture exactly: a tile is missing or overlaps.")
            x_at += im.size[0]
        if x_at != width:
            raise LargeError("The tiles do not cover the picture's width.")
        y_at += h
    if y_at != height:
        raise LargeError("The tiles do not cover the picture's height.")
    out_dir = config.data_dir() / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in name)[:80].strip() or "assembled"
    path = out_dir / f"{safe}.png"

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    z = zlib.compressobj(6)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)))
        pending = b""
        for y in sorted(bands):
            row = sorted(bands[y], key=lambda t: t[0])
            with _unbounded():
                pix = [(x, im.convert("RGBA").tobytes(), im.size[0]) for x, im in row]   # this band only
            h = row[0][1].size[1]
            for r in range(h):
                line = b"".join(b[r * w * 4:(r + 1) * w * 4] for _, b, w in pix)
                pending += z.compress(b"\x00" + line)
                if len(pending) > 1 << 20:
                    f.write(chunk(b"IDAT", pending)); pending = b""
            del pix
        pending += z.flush()
        f.write(chunk(b"IDAT", pending) + chunk(b"IEND", b""))
    return path
