"""Pictures written a band at a time (1.61.2, DEV_PLAN 26.4, the register's M5): the window renders a very large
document's flattened picture a band of rows at a time and sends each here, where it is deflated straight into a PNG on
disk, so neither side ever holds the whole picture. PNG's Up filter (each row less the one above it, which squeezes
far better than none) is applied with numpy; between bands only the last row is kept. Sessions live in the data
folder's bands directory, emptied when the engine starts."""
from __future__ import annotations

import asyncio
import os
import shutil
import struct
import uuid
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.core import config
from app.services import sessions

router = APIRouter(prefix="/api/bands", tags=["bands"])
_open: dict[str, dict] = {}


def _dir() -> Path:
    d = config.data_dir() / "bands"
    d.mkdir(parents=True, exist_ok=True)
    return d


def clear() -> None:
    """Empties the bands directory (at the engine's start)."""
    shutil.rmtree(config.data_dir() / "bands", ignore_errors=True)


def _chunk(f, kind: bytes, data: bytes) -> None:
    f.write(struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))


def _session(key: str) -> dict:
    s = _open.get(key)
    if s is None:
        raise HTTPException(404, "No picture is being written under that key.")
    return s


@router.post("/png")
async def begin(request: Request, width: int, height: int, ppi: float = 72.0, name: str = "") -> dict[str, str]:
    """Opens a PNG of `width` by `height` RGBA pixels at `ppi`; rows follow, top first. A body of ICC profile bytes, when
    sent, is written as the file's iCCP chunk under `name`."""
    if not (1 <= width <= 65535 and 1 <= height <= 65535):
        raise HTTPException(400, "Sides must be 1 to 65,535 pixels.")
    icc = await request.body()
    if len(icc) > 1_000_000:
        raise HTTPException(400, "The colour profile is too large.")
    key = uuid.uuid4().hex
    path = _dir() / f"{key}.png"
    f = open(path, "wb")
    f.write(b"\x89PNG\r\n\x1a\n")
    _chunk(f, b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    if icc:
        label = name.encode("latin-1", "ignore").replace(b"\x00", b"")[:79] or b"ICC profile"
        _chunk(f, b"iCCP", label + b"\x00\x00" + zlib.compress(icc))
    ppm = max(1, round(ppi / 0.0254))
    _chunk(f, b"pHYs", struct.pack(">IIB", ppm, ppm, 1))
    _open[key] = new_session(f, width, height, path)
    return {"key": key}


PIECE = 1 << 20   # filtered bytes a pool thread deflates at a time


def new_session(f, width: int, height: int, path: Path) -> dict:
    """A picture's writer state: the deflate stream is made of independent pieces (raw deflate, each ended on a byte
    boundary), so a band's pieces are compressed on several threads and joined; the stream's checksum runs on."""
    return {"f": f, "adler": 1, "head": True, "w": width, "h": height, "rows": 0, "path": path, "last": np.zeros(width * 4, np.uint8)}


_pool: ThreadPoolExecutor | None = None


def _deflate(piece: bytes) -> bytes:
    z = zlib.compressobj(6, zlib.DEFLATED, -15)
    return z.compress(piece) + z.flush(zlib.Z_SYNC_FLUSH)


def _pieces(lines: bytes, row: int) -> list[bytes]:
    n = len(lines) // row
    per = max(1, min(n, PIECE // row + 1))
    return [lines[i * row:(i + per if i + per < n else n) * row] for i in range(0, n, per)]


def _finish(s: dict) -> None:
    """The stream's last block, its checksum, and the PNG's end chunk."""
    _chunk(s["f"], b"IDAT", (b"\x78\x9c" if s["head"] else b"") + b"\x03\x00" + struct.pack(">I", s["adler"]))
    _chunk(s["f"], b"IEND", b"")


def _write(s: dict, body: bytes) -> None:
    row = s["w"] * 4
    if len(body) % row:
        raise HTTPException(400, "Not a whole number of rows.")
    n = len(body) // row
    if s["rows"] + n > s["h"]:
        raise HTTPException(400, "More rows than the picture has.")
    rows = np.frombuffer(body, np.uint8).reshape(n, row)
    lines = np.empty((n, row + 1), np.uint8)
    lines[:, 0] = 2   # filter type 2 before each row
    np.subtract(rows[0], s["last"], out=lines[0, 1:])   # PNG's Up filter, modulo 256
    np.subtract(rows[1:], rows[:-1], out=lines[1:, 1:])
    raw = lines.tobytes()
    global _pool
    if _pool is None:
        _pool = ThreadPoolExecutor(max_workers=max(1, min(4, os.cpu_count() or 1)))
    parts = list(_pool.map(_deflate, _pieces(raw, row + 1)))
    s["adler"] = zlib.adler32(raw, s["adler"])
    packed = (b"\x78\x9c" if s["head"] else b"") + b"".join(parts)
    s["head"] = False
    _chunk(s["f"], b"IDAT", packed)
    s["last"] = rows[-1].copy()
    s["rows"] += n


@router.post("/png/{key}")
async def put(key: str, request: Request) -> dict[str, int]:
    """The next rows (RGBA, top first, a whole number of rows)."""
    s = _session(key)
    body = await request.body()
    await asyncio.to_thread(_write, s, body)
    return {"rows": s["rows"]}


_reading: dict[str, dict] = {}


@router.post("/read")
async def read_open(session: str, file: str) -> dict[str, str | int]:
    """Opens an opened project's PNG (1.62.8, DEV_PLAN 26.6: a giant layer's, past what a browser can decode) to be read
    a band of rows at a time; only 8-bit RGB or RGBA, not interlaced (what the writer above makes)."""
    path = sessions.asset_path(session, file)
    if path is None:
        raise HTTPException(404, "No such image in that project.")
    f = open(path, "rb")
    if f.read(8) != b"\x89PNG\r\n\x1a\n":
        f.close()
        raise HTTPException(400, "Not a PNG.")
    n, kind = struct.unpack(">I4s", f.read(8))
    head = f.read(n)
    f.read(4)
    w, h, depth, ctype, _c, _f, interlace = struct.unpack(">IIBBBBB", head)
    if kind != b"IHDR" or depth != 8 or ctype not in (2, 6) or interlace:
        f.close()
        raise HTTPException(400, "Only 8-bit RGB or RGBA, not interlaced, is read in bands.")
    ch, key = 4 if ctype == 6 else 3, uuid.uuid4().hex
    _reading[key] = {"f": f, "z": zlib.decompressobj(), "w": w, "h": h, "ch": ch, "buf": bytearray(), "prev": np.zeros(w * ch, np.uint8), "y": 0, "done": False}
    return {"key": key, "width": w, "height": h}


def _unfilter(ft: int, raw: np.ndarray, prev: np.ndarray, bpp: int) -> np.ndarray:
    """One row's PNG filter undone: None and Up at numpy speed (Up is what the writer above uses), Sub by cumulative
    sums, Average and Paeth a byte at a time (correct, slow: only a PNG from elsewhere has them)."""
    if ft == 0:
        return raw
    if ft == 2:
        return (raw.astype(np.int16) + prev).astype(np.uint8)
    if ft == 1:
        return (np.cumsum(raw.astype(np.int64).reshape(-1, bpp), axis=0) % 256).astype(np.uint8).reshape(-1)
    out, p = raw.astype(np.int32), prev.astype(np.int32)
    for i in range(len(out)):
        a = int(out[i - bpp]) if i >= bpp else 0
        b = int(p[i])
        c = int(p[i - bpp]) if i >= bpp else 0
        if ft == 3:
            out[i] = (out[i] + (a + b) // 2) & 255
        else:
            pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
            out[i] = (out[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
    return out.astype(np.uint8)


def _rows(s: dict, want: int) -> bytes:
    stride, out = s["w"] * s["ch"], []
    while len(out) < want and s["y"] < s["h"]:
        while len(s["buf"]) < stride + 1 and not s["done"]:
            hdr = s["f"].read(8)
            if len(hdr) < 8:
                s["done"] = True
                break
            n, kind = struct.unpack(">I4s", hdr)
            data = s["f"].read(n)
            s["f"].read(4)
            if kind == b"IDAT":
                s["buf"] += s["z"].decompress(data)
            elif kind == b"IEND":
                s["buf"] += s["z"].flush()
                s["done"] = True
        if len(s["buf"]) < stride + 1:
            break
        ft, raw = s["buf"][0], np.frombuffer(bytes(s["buf"][1:stride + 1]), np.uint8)
        del s["buf"][:stride + 1]
        row = _unfilter(ft, raw, s["prev"], s["ch"])
        s["prev"], s["y"] = row, s["y"] + 1
        out.append(row if s["ch"] == 4 else np.insert(row.reshape(-1, 3), 3, 255, axis=1).reshape(-1))
    return b"".join(r.tobytes() for r in out)


@router.get("/read/{key}")
async def read_rows(key: str, rows: int = 64) -> Response:
    """The next `rows` rows (RGBA, top first); the reader closes after the last."""
    s = _reading.get(key)
    if s is None:
        raise HTTPException(404, "No picture is being read under that key.")
    data = await asyncio.to_thread(_rows, s, max(1, min(rows, 4096)))
    if s["y"] >= s["h"] or (s["done"] and not s["buf"]):
        s["f"].close()
        _reading.pop(key, None)
    return Response(data, media_type="application/octet-stream")


@router.post("/png/{key}/end")
async def end(key: str) -> Response:
    """Closes the picture and gives it back; refused if rows are missing."""
    s = _session(key)
    if s["rows"] != s["h"]:
        raise HTTPException(400, f"{s['rows']} of {s['h']} rows were sent.")
    _open.pop(key, None)
    _finish(s)
    s["f"].close()
    data = await asyncio.to_thread(s["path"].read_bytes)
    s["path"].unlink(missing_ok=True)
    return Response(data, media_type="image/png")
