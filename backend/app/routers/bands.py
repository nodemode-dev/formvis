"""Pictures written a band at a time (1.61.2, DEV_PLAN 26.4, the register's M5): the window renders a very large
document's flattened picture a band of rows at a time and sends each here, where it is deflated straight into a PNG on
disk, so neither side ever holds the whole picture. PNG's Up filter (each row less the one above it, which squeezes
far better than none) is applied with numpy; between bands only the last row is kept. Sessions live in the data
folder's bands directory, emptied when the engine starts."""
from __future__ import annotations

import asyncio
import base64
import os
import shutil
import struct
import uuid
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

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
    if not body or len(body) % row:
        raise HTTPException(400, "No rows, or not a whole number of rows.")
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
    try:
        n, kind = struct.unpack(">I4s", f.read(8))
        head = f.read(n)
        f.read(4)
        w, h, depth, ctype, _c, _f, interlace = struct.unpack(">IIBBBBB", head)
    except struct.error:
        f.close()
        raise HTTPException(400, "The PNG's header is cut short.") from None
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


STRIP = 1 << 18   # bytes a TIFF strip holds before it is deflated, about
_tiffs: dict[str, dict] = {}
_psds: dict[str, dict] = {}


def _workers() -> ThreadPoolExecutor:
    global _pool
    if _pool is None:
        _pool = ThreadPoolExecutor(max_workers=max(1, min(4, os.cpu_count() or 1)))
    return _pool


def _gone(path: Path) -> BackgroundTask:
    return BackgroundTask(lambda: path.unlink(missing_ok=True))


def _rows_in(s: dict, body: bytes) -> int:
    row = s.get("bpr") or s["w"] * 4
    if len(body) % row:
        raise HTTPException(400, "Not a whole number of rows.")
    n = len(body) // row
    if s["rows"] + n > s["h"]:
        raise HTTPException(400, "More rows than the picture has.")
    return n


@router.post("/tiff")
async def begin_tiff(request: Request, width: int, height: int, ppi: float = 72.0, depth: int = 8, alpha: bool = True) -> dict[str, str]:
    """Opens a TIFF of `width` by `height` pixels, RGBA (RGB with `alpha` false), 8 bits or 16 (`depth`; 16-bit samples
    arrive little-endian), Deflate: every strip is deflated on its own, so the strips of a band go to the thread pool
    together and are written in order as they finish; the directory comes last. A body of ICC profile bytes, when sent, is
    embedded (tag 34675). Rows follow as for the PNG."""
    if not (1 <= width <= 65535 and 1 <= height <= 65535):
        raise HTTPException(400, "Sides must be 1 to 65,535 pixels.")
    if depth not in (8, 16):
        raise HTTPException(400, "Depth must be 8 or 16 bits.")
    icc = await request.body()
    if len(icc) > 1_000_000:
        raise HTTPException(400, "The colour profile is too large.")
    key = uuid.uuid4().hex
    path = _dir() / f"{key}.tif"
    f = open(path, "wb")
    f.write(b"II" + struct.pack("<HI", 42, 0))
    spp = 4 if alpha else 3
    bpr = width * spp * depth // 8
    _tiffs[key] = {"f": f, "w": width, "h": height, "rows": 0, "path": path, "ppi": ppi, "icc": icc, "spp": spp, "depth": depth, "bpr": bpr, "rps": max(1, STRIP // bpr), "carry": b"", "offsets": [], "counts": []}
    return {"key": key}


def _strips(s: dict, strips: list[bytes]) -> None:
    f = s["f"]
    for packed in _workers().map(lambda b: zlib.compress(b, 6), strips):
        s["offsets"].append(f.tell())
        s["counts"].append(len(packed))
        f.write(packed)
    if f.tell() > 0xFFFFFFFF - (1 << 20):
        raise HTTPException(413, "This TIFF passes the 4 GB a classic TIFF holds; save it as PNG or PSB.")


def _tiff_put(s: dict, body: bytes) -> None:
    n = _rows_in(s, body)
    s["rows"] += n
    buf = s["carry"] + body
    step = s["rps"] * s["bpr"]
    cut = len(buf) // step * step
    _strips(s, [buf[i:i + step] for i in range(0, cut, step)])
    s["carry"] = buf[cut:]


def _tiff_ifd(entries: list[tuple[int, int, int, bytes]], base: int) -> tuple[bytes, int]:
    """The directory with the values that do not fit its entries placed ahead of it from `base`, and where it starts."""
    extra, slots = bytearray(), []
    for tag, kind, count, data in sorted(entries):
        if len(data) <= 4:
            slots.append(struct.pack("<HHI", tag, kind, count) + data.ljust(4, b"\0"))
            continue
        slots.append(struct.pack("<HHII", tag, kind, count, base + len(extra)))
        extra += data + (b"\0" if len(data) % 2 else b"")
    return bytes(extra) + struct.pack("<H", len(slots)) + b"".join(slots) + struct.pack("<I", 0), base + len(extra)


def _tiff_finish(s: dict) -> None:
    if s["carry"]:
        _strips(s, [s["carry"]])
        s["carry"] = b""
    f, n = s["f"], len(s["offsets"])
    if f.tell() % 2:
        f.write(b"\0")
    dpi = struct.pack("<II", max(1, round(s["ppi"] * 1000)), 1000)
    entries = [(256, 4, 1, struct.pack("<I", s["w"])), (257, 4, 1, struct.pack("<I", s["h"])), (258, 3, s["spp"], struct.pack(f"<{s['spp']}H", *[s["depth"]] * s["spp"])),
               (259, 3, 1, struct.pack("<H", 8)), (262, 3, 1, struct.pack("<H", 2)), (273, 4, n, struct.pack(f"<{n}I", *s["offsets"])),
               (277, 3, 1, struct.pack("<H", s["spp"])), (278, 4, 1, struct.pack("<I", s["rps"])), (279, 4, n, struct.pack(f"<{n}I", *s["counts"])),
               (282, 5, 1, dpi), (283, 5, 1, dpi), (284, 3, 1, struct.pack("<H", 1)), (296, 3, 1, struct.pack("<H", 2))]
    if s["spp"] == 4:
        entries.append((338, 3, 1, struct.pack("<H", 2)))
    if s["icc"]:
        entries.append((34675, 7, len(s["icc"]), s["icc"]))
    tail, at = _tiff_ifd(entries, f.tell())
    if at + len(tail) > 0xFFFFFFFF:
        raise HTTPException(413, "This TIFF passes the 4 GB a classic TIFF holds; save it as PNG or PSB.")
    f.write(tail)
    f.seek(4)
    f.write(struct.pack("<I", at))


@router.post("/tiff/{key}")
async def put_tiff(key: str, request: Request) -> dict[str, int]:
    """The next rows (RGBA, top first, a whole number of rows)."""
    s = _tiffs.get(key)
    if s is None:
        raise HTTPException(404, "No picture is being written under that key.")
    await asyncio.to_thread(_tiff_put, s, await request.body())
    return {"rows": s["rows"]}


@router.post("/tiff/{key}/end")
async def end_tiff(key: str) -> FileResponse:
    """Closes the TIFF and sends it from disk; refused if rows are missing."""
    s = _tiffs.get(key)
    if s is None:
        raise HTTPException(404, "No picture is being written under that key.")
    if s["rows"] != s["h"]:
        raise HTTPException(400, f"{s['rows']} of {s['h']} rows were sent.")
    _tiffs.pop(key, None)
    await asyncio.to_thread(_tiff_finish, s)
    s["f"].close()
    return FileResponse(s["path"], media_type="image/tiff", background=_gone(s["path"]))


def _psd_resource(rid: int, data: bytes) -> bytes:
    return b"8BIM" + struct.pack(">H", rid) + b"\0\0" + struct.pack(">I", len(data)) + data + (b"\0" if len(data) % 2 else b"")


def _psd_head(s: dict) -> bytes:
    fix = round(max(1.0, s["ppi"]) * 65536)
    res = _psd_resource(1005, struct.pack(">IHHIHH", fix, 1, 1, fix, 1, 1)) + (_psd_resource(1039, s["icc"]) if s["icc"] else b"")
    return (b"8BPS" + struct.pack(">H", 2 if s["psb"] else 1) + bytes(6) + struct.pack(">HIIHH", 4, s["h"], s["w"], 8, 3) + struct.pack(">I", 0)
            + struct.pack(">I", len(res)) + res + struct.pack(">Q" if s["psb"] else ">I", 0) + struct.pack(">H", 0))


@router.post("/psd")
async def begin_psd(request: Request, width: int, height: int, ppi: float = 72.0, psb: bool = False) -> dict[str, str]:
    """Opens a flat PSD (PSB with `psb`) of `width` by `height` RGBA pixels, 8 bits, merged picture only: the file keeps its
    channels one after another, so each is spooled to a file of its own as rows arrive (split on the thread pool) and the
    four are joined behind the header at the end; neither side holds the picture. A body of ICC profile bytes is embedded."""
    if not (1 <= width <= 300000 and 1 <= height <= 300000) or (not psb and max(width, height) > 30000):
        raise HTTPException(400, "Sides must be 1 to 30,000 pixels for a PSD, 300,000 for a PSB.")
    icc = await request.body()
    if len(icc) > 1_000_000:
        raise HTTPException(400, "The colour profile is too large.")
    key = uuid.uuid4().hex
    path = _dir() / f"{key}.psd"
    _psds[key] = {"w": width, "h": height, "rows": 0, "path": path, "ppi": ppi, "icc": icc, "psb": psb, "spools": [open(path.with_suffix("." + c), "wb") for c in "rgba"]}
    return {"key": key}


def _psd_put(s: dict, body: bytes) -> None:
    n = _rows_in(s, body)
    px = np.frombuffer(body, np.uint8).reshape(n, s["w"], 4)
    list(_workers().map(lambda c: s["spools"][c].write(px[:, :, c].tobytes()), range(4)))
    s["rows"] += n


def _psd_finish(s: dict) -> None:
    for f in s["spools"]:
        f.close()
    with open(s["path"], "wb") as out:
        out.write(_psd_head(s))
        for c in "rgba":
            part = s["path"].with_suffix("." + c)
            with open(part, "rb") as src:
                shutil.copyfileobj(src, out, 1 << 22)
            part.unlink(missing_ok=True)


@router.post("/psd/{key}")
async def put_psd(key: str, request: Request) -> dict[str, int]:
    """The next rows (RGBA, top first, a whole number of rows)."""
    s = _psds.get(key)
    if s is None:
        raise HTTPException(404, "No picture is being written under that key.")
    await asyncio.to_thread(_psd_put, s, await request.body())
    return {"rows": s["rows"]}


@router.post("/psd/{key}/end")
async def end_psd(key: str) -> FileResponse:
    """Joins the channels behind the header and sends the file from disk; refused if rows are missing."""
    s = _psds.get(key)
    if s is None:
        raise HTTPException(404, "No picture is being written under that key.")
    if s["rows"] != s["h"]:
        raise HTTPException(400, f"{s['rows']} of {s['h']} rows were sent.")
    _psds.pop(key, None)
    await asyncio.to_thread(_psd_finish, s)
    return FileResponse(s["path"], media_type="image/vnd.adobe.photoshop", background=_gone(s["path"]))


PSD_BLEND = {"normal": b"norm", "darken": b"dark", "multiply": b"mul ", "color-burn": b"idiv", "lighten": b"lite", "screen": b"scrn", "color-dodge": b"div ",
             "linear-dodge": b"lddg", "overlay": b"over", "soft-light": b"sLit", "hard-light": b"hLit", "difference": b"diff", "exclusion": b"smud", "hue": b"hue ",
             "saturation": b"sat ", "color": b"colr", "luminosity": b"lum ", "dissolve": b"diss", "linear-burn": b"lbrn", "darker-color": b"dkCl", "lighter-color": b"lgCl",
             "vivid-light": b"vLit", "linear-light": b"lLit", "pin-light": b"pLit", "hard-mix": b"hMix", "subtract": b"fsub", "divide": b"fdiv", "pass": b"pass"}


class LayerSpec(BaseModel):
    """One record of a layered PSD: a layer with pixels, or a folder's marker (`section` 3 begins a folder, 1 or 2 ends it open or closed)."""
    name: str = Field("Layer", max_length=255)
    left: int = Field(0, ge=-300000, le=300000)
    top: int = Field(0, ge=-300000, le=300000)
    width: int = Field(0, ge=0, le=300000)
    height: int = Field(0, ge=0, le=300000)
    opacity: float = Field(1.0, ge=0, le=1)
    blend: str = "normal"
    visible: bool = True
    clipping: bool = False
    section: int = Field(0, ge=0, le=3)


class LayeredBody(BaseModel):
    layers: list[LayerSpec] = Field(max_length=10000)
    icc: str | None = None


def _psdl_tag(key: bytes, data: bytes) -> bytes:
    data += b"\0" * (-len(data) % 4)
    return b"8BIM" + key + struct.pack(">I", len(data)) + data


def _psdl_record(sp: LayerSpec, sizes: list[int], psb: bool) -> bytes:
    pixels = sp.section == 0 and sp.width > 0 and sp.height > 0
    rect = (sp.top, sp.left, sp.top + sp.height, sp.left + sp.width) if pixels else (0, 0, 0, 0)
    out = struct.pack(">iiiiH", *rect, 4)
    for cid, n in zip((-1, 0, 1, 2), sizes):
        out += struct.pack(">hQ" if psb else ">hI", cid, n)
    out += b"8BIM" + PSD_BLEND.get(sp.blend, b"norm") + struct.pack(">BBBB", round(sp.opacity * 255), 1 if sp.clipping else 0, 8 | (0 if sp.visible else 2), 0)
    raw = sp.name.encode("latin-1", "replace")[:255]
    uni = sp.name.encode("utf-16-be")
    extra = struct.pack(">II", 0, 0) + bytes([len(raw)]) + raw + b"\0" * (-(1 + len(raw)) % 4) + _psdl_tag(b"luni", struct.pack(">I", len(uni) // 2) + uni)
    if sp.section:
        extra += _psdl_tag(b"lsct", struct.pack(">I", sp.section) + b"8BIM" + (b"norm" if sp.section == 3 else PSD_BLEND.get(sp.blend, b"pass")))
    return out + struct.pack(">I", len(extra)) + extra


@router.post("/psdl")
async def begin_layered(body: LayeredBody, width: int, height: int, ppi: float = 72.0, psb: bool = False) -> dict[str, str]:
    """Opens a layered PSD (PSB with `psb`) written in parts: every layer with pixels gets four spools (alpha, red, green, blue)
    that its rows fill band by band at `/psdl/[key]/[index]`, the merged picture's rows go to `/psdl/[key]`, and `/end` joins them
    behind the header and the layer records, raw (no channel is ever held whole). `layers` run bottom to top as in the file."""
    if not (1 <= width <= 300000 and 1 <= height <= 300000) or (not psb and max(width, height) > 30000):
        raise HTTPException(400, "Sides must be 1 to 30,000 pixels for a PSD, 300,000 for a PSB.")
    if not psb and any(max(sp.width, sp.height) > 30000 for sp in body.layers):
        raise HTTPException(400, "A layer past 30,000 pixels needs a PSB.")
    try:
        icc = base64.b64decode(body.icc) if body.icc else b""
    except ValueError:
        raise HTTPException(400, "The colour profile is not base64.") from None
    if len(icc) > 1_000_000:
        raise HTTPException(400, "The colour profile is too large.")
    key = uuid.uuid4().hex
    path = _dir() / f"{key}.psd"
    spools = {i: [open(path.with_suffix(f".{i}{c}"), "wb") for c in "argb"] for i, sp in enumerate(body.layers) if sp.section == 0 and sp.width > 0 and sp.height > 0}
    _psds[key] = {"w": width, "h": height, "rows": 0, "path": path, "ppi": ppi, "icc": icc, "psb": psb, "layers": body.layers, "lrows": dict.fromkeys(spools, 0),
                  "lspools": spools, "spools": [open(path.with_suffix("." + c), "wb") for c in "rgba"]}
    return {"key": key}


def _psdl_put(s: dict, index: int, body: bytes) -> int:
    sp: LayerSpec = s["layers"][index]
    spools = s["lspools"].get(index)
    if spools is None:
        raise HTTPException(400, "That layer has no pixels.")
    row = sp.width * 4
    if len(body) % row:
        raise HTTPException(400, "Not a whole number of rows.")
    n = len(body) // row
    if s["lrows"][index] + n > sp.height:
        raise HTTPException(400, "More rows than the layer has.")
    px = np.frombuffer(body, np.uint8).reshape(n, sp.width, 4)
    list(_workers().map(lambda c: spools[c].write(px[:, :, 3 if c == 0 else c - 1].tobytes()), range(4)))
    s["lrows"][index] += n
    return s["lrows"][index]


def _psdl_finish(s: dict) -> None:
    layers: list[LayerSpec] = s["layers"]
    psb, wide = s["psb"], 8 if s["psb"] else 4
    for f in s["spools"]:
        f.close()
    for group in s["lspools"].values():
        for f in group:
            f.close()
    records, parts = [], []
    for i, sp in enumerate(layers):
        if i in s["lspools"]:
            sizes = [2 + sp.width * sp.height] * 4
            parts.append([(s["path"].with_suffix(f".{i}{c}"), sizes[0] - 2) for c in "argb"])
        else:
            sizes = [2] * 4
            parts.append([])
        records.append(_psdl_record(sp, sizes, psb))
    body_len = sum(2 + n for group in parts for _, n in group) + 8 * sum(1 for p in parts if not p)
    info = 2 + sum(len(r) for r in records) + body_len
    pad = info % 2
    if not psb and info > 0xFFFFFFFF - (1 << 20):
        raise HTTPException(413, "The layers pass the 4 GB a PSD holds; save it as PSB.")
    head = _psd_head(s)
    with open(s["path"], "wb") as out:
        out.write(head[:len(head) - (wide + 2)])
        out.write(struct.pack(">Q" if psb else ">I", wide + info + pad + 4))
        out.write(struct.pack(">Q" if psb else ">I", info + pad))
        out.write(struct.pack(">h", -len(layers)))
        for r in records:
            out.write(r)
        for group in parts:
            if not group:
                out.write((struct.pack(">H", 0)) * 4)
                continue
            for part, n in group:
                out.write(struct.pack(">H", 0))
                with open(part, "rb") as src:
                    shutil.copyfileobj(src, out, 1 << 22)
                part.unlink(missing_ok=True)
        out.write(b"\0" * pad + struct.pack(">I", 0))
        out.write(struct.pack(">H", 0))
        for c in "rgba":
            part = s["path"].with_suffix("." + c)
            with open(part, "rb") as src:
                shutil.copyfileobj(src, out, 1 << 22)
            part.unlink(missing_ok=True)


@router.post("/psdl/{key}/end")
async def end_layered(key: str) -> FileResponse:
    """Joins the layers and the merged picture behind the header and sends the file from disk; refused if rows are missing."""
    s = _psds.get(key)
    if s is None or "lspools" not in s:
        raise HTTPException(404, "No layered picture is being written under that key.")
    short = [i for i, sp in enumerate(s["layers"]) if i in s["lspools"] and s["lrows"][i] != sp.height]
    if short:
        raise HTTPException(400, f"Layer {short[0]} is missing rows.")
    if s["rows"] != s["h"]:
        raise HTTPException(400, f"{s['rows']} of {s['h']} merged rows were sent.")
    _psds.pop(key, None)
    await asyncio.to_thread(_psdl_finish, s)
    return FileResponse(s["path"], media_type="image/vnd.adobe.photoshop", background=_gone(s["path"]))


def _psdl_drop(s: dict) -> None:
    for f in [*s["spools"], *(f for group in s["lspools"].values() for f in group)]:
        f.close()
        Path(f.name).unlink(missing_ok=True)


@router.delete("/psdl/{key}")
async def drop_layered(key: str) -> dict[str, bool]:
    """Drops a layered picture that will not be finished (the export was stopped or failed): its spools are closed and deleted."""
    s = _psds.get(key)
    if s is None or "lspools" not in s:
        return {"dropped": False}
    _psds.pop(key, None)
    await asyncio.to_thread(_psdl_drop, s)
    return {"dropped": True}


@router.post("/psdl/{key}/{index}")
async def put_layer(key: str, index: int, request: Request) -> dict[str, int]:
    """The next rows of layer `index` (RGBA, top first, a whole number of rows of that layer's width)."""
    s = _psds.get(key)
    if s is None or "lspools" not in s or not (0 <= index < len(s["layers"])):
        raise HTTPException(404, "No such layer is being written under that key.")
    return {"rows": await asyncio.to_thread(_psdl_put, s, index, await request.body())}


@router.post("/psdl/{key}")
async def put_merged(key: str, request: Request) -> dict[str, int]:
    """The next rows of the merged picture (RGBA, top first, the document's width)."""
    s = _psds.get(key)
    if s is None or "lspools" not in s:
        raise HTTPException(404, "No layered picture is being written under that key.")
    await asyncio.to_thread(_psd_put, s, await request.body())
    return {"rows": s["rows"]}
