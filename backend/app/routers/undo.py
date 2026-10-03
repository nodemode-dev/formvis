"""The undo store (1.60.8, DEV_PLAN 26.3, the register's M5): the window keeps a document's older undo tiles here once
its undo holds more than its share of memory, and asks for them back when an undo or redo reaches them. Each is kept
deflated (zlib, level 1: fast, and a stroke's tiles squeeze well) under the data folder, and the folder is emptied when
the engine starts, so nothing outlives the session that made it."""
from __future__ import annotations

import asyncio
import shutil
import uuid
import zlib
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response

from app.core import config

router = APIRouter(prefix="/api/undo", tags=["undo"])

_MAX = 512 * 1024 * 1024   # one tile pair is at most 2 MB; this is only a guard


def _dir() -> Path:
    d = config.data_dir() / "undo"
    d.mkdir(parents=True, exist_ok=True)
    return d


def clear() -> None:
    """Empties the store (at the engine's start)."""
    shutil.rmtree(config.data_dir() / "undo", ignore_errors=True)


def _path(key: str) -> Path:
    if not key or len(key) != 32 or any(c not in "0123456789abcdef" for c in key):
        raise HTTPException(400, "Not an undo key.")
    return _dir() / f"{key}.z"


@router.post("")
async def put(request: Request) -> dict[str, str | int]:
    """Keeps the bytes sent (a tile's pixels before and after), deflated; returns the key to ask for them by."""
    body = await request.body()
    if not body or len(body) > _MAX:
        raise HTTPException(400, "Nothing to keep, or too much.")
    key = uuid.uuid4().hex
    packed = await asyncio.to_thread(zlib.compress, body, 1)
    await asyncio.to_thread(_path(key).write_bytes, packed)
    return {"key": key, "bytes": len(body), "stored": len(packed)}


@router.get("/{key}")
async def get(key: str) -> Response:
    """The bytes kept under `key`, as they were sent."""
    p = _path(key)
    if not p.exists():
        raise HTTPException(404, "No undo kept under that key.")
    data = await asyncio.to_thread(lambda: zlib.decompress(p.read_bytes()))
    return Response(data, media_type="application/octet-stream")


@router.post("/drop")
async def drop_many(request: Request) -> dict[str, int]:
    """Forgets many keys in one request (1.63.0): closing a document whose undo holds a filter over a giant layer drops
    tens of thousands, and one request each kept the window's other requests (opening a project) waiting behind them
    for minutes. Keys not in the store's form are skipped."""
    body = await request.json()
    keys = body.get("keys") if isinstance(body, dict) else None
    if not isinstance(keys, list) or len(keys) > 100_000:
        raise HTTPException(400, 'Expected {"keys": [...]}, at most 100,000 a request.')
    hexdigits = set("0123456789abcdef")
    paths = [_dir() / f"{k}.z" for k in keys if isinstance(k, str) and len(k) == 32 and set(k) <= hexdigits]

    def unlink_all() -> int:
        n = 0
        for p in paths:
            if p.exists():
                p.unlink(missing_ok=True)
                n += 1
        return n

    return {"dropped": await asyncio.to_thread(unlink_all)}


@router.delete("/{key}")
async def drop(key: str) -> dict[str, bool]:
    """Forgets what is kept under `key` (a step trimmed from the history, a document closed)."""
    p = _path(key)
    existed = p.exists()
    p.unlink(missing_ok=True)
    return {"dropped": existed}
