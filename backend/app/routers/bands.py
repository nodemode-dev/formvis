"""Pictures written a band at a time (1.61.2, DEV_PLAN 26.4, the register's M5): the window renders a very large
document's flattened picture a band of rows at a time and sends each here, where it is deflated straight into a PNG on
disk, so neither side ever holds the whole picture. PNG's Up filter (each row less the one above it, which squeezes
far better than none) is applied with numpy; between bands only the last row is kept. Sessions live in the data
folder's bands directory, emptied when the engine starts."""
from __future__ import annotations

import asyncio
import shutil
import struct
import uuid
import zlib
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.core import config

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
async def begin(width: int, height: int, ppi: float = 72.0) -> dict[str, str]:
    """Opens a PNG of `width` by `height` RGBA pixels at `ppi`; rows follow, top first."""
    if not (1 <= width <= 65535 and 1 <= height <= 65535):
        raise HTTPException(400, "Sides must be 1 to 65,535 pixels.")
    key = uuid.uuid4().hex
    path = _dir() / f"{key}.png"
    f = open(path, "wb")
    f.write(b"\x89PNG\r\n\x1a\n")
    _chunk(f, b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    ppm = max(1, round(ppi / 0.0254))
    _chunk(f, b"pHYs", struct.pack(">IIB", ppm, ppm, 1))
    _open[key] = {"f": f, "z": zlib.compressobj(6), "w": width, "h": height, "rows": 0, "path": path, "last": np.zeros(width * 4, np.uint8)}
    return {"key": key}


def _write(s: dict, body: bytes) -> None:
    row = s["w"] * 4
    if len(body) % row:
        raise HTTPException(400, "Not a whole number of rows.")
    n = len(body) // row
    if s["rows"] + n > s["h"]:
        raise HTTPException(400, "More rows than the picture has.")
    rows = np.frombuffer(body, np.uint8).reshape(n, row)
    above = np.vstack([s["last"][None, :], rows[:-1]])
    up = (rows.astype(np.int16) - above).astype(np.uint8)   # PNG's Up filter, modulo 256
    lines = np.hstack([np.full((n, 1), 2, np.uint8), up])   # filter type 2 before each row
    packed = s["z"].compress(lines.tobytes())
    if packed:
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


@router.post("/png/{key}/end")
async def end(key: str) -> Response:
    """Closes the picture and gives it back; refused if rows are missing."""
    s = _session(key)
    if s["rows"] != s["h"]:
        raise HTTPException(400, f"{s['rows']} of {s['h']} rows were sent.")
    _open.pop(key, None)
    tail = s["z"].flush()
    if tail:
        _chunk(s["f"], b"IDAT", tail)
    _chunk(s["f"], b"IEND", b"")
    s["f"].close()
    data = await asyncio.to_thread(s["path"].read_bytes)
    s["path"].unlink(missing_ok=True)
    return Response(data, media_type="image/png")
