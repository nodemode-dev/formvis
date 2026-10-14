"""OpenEXR in a separate process (1.54.4, the parity plan's L14).

OpenCV leaves its OpenEXR codec off because the parser has had security problems with untrusted files
(opencv/opencv#21326), and an EXR downloaded from elsewhere is untrusted. The engine keeps the codec off; an EXR is
decoded or encoded by a child interpreter that turns it on for itself alone. If that child crashes or hangs, the
engine is untouched and the request fails cleanly.
"""

from __future__ import annotations

import multiprocessing as mp
import os
import queue
import time

import numpy as np

EXR_MAGIC = b"\x76\x2f\x31\x01"
TIMEOUT_S = 60.0


def _decode_worker(data: bytes, q: "mp.Queue[object]") -> None:
    os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
    try:
        import cv2
        img = None
        try:
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
        except Exception:
            img = None   # an OpenCV build without the OpenEXR codec (5.0 ships none): the OpenEXR binding reads it below
        if img is None:
            img = _binding_decode(data)
        q.put(None if img is None else np.ascontiguousarray(img))
    except Exception:
        q.put(None)


def _binding_decode(data: bytes) -> "np.ndarray | None":
    """A single-part EXR through the OpenEXR binding, as OpenCV returns it (BGR or BGRA, or one plane, float32)."""
    try:
        import io
        import OpenEXR
        f = OpenEXR.File(io.BytesIO(data))
        chans = f.parts[0].channels
        key = next((k for k in chans if k.split(".")[-1] == "RGBA"), None) or next((k for k in chans if k.split(".")[-1] == "RGB"), None) or next(iter(chans), None)
        if key is None:
            return None
        px = np.asarray(chans[key].pixels, dtype=np.float32)
        if px.ndim == 3 and px.shape[2] >= 3:
            px = px[:, :, [2, 1, 0] + ([3] if px.shape[2] >= 4 else [])]
        return np.ascontiguousarray(px)
    except Exception:
        return None


def _binding_encode(img: np.ndarray) -> "bytes | None":
    """`img` (BGR or BGRA or one plane, float32) as EXR bytes through the OpenEXR binding."""
    try:
        import os
        import tempfile
        import OpenEXR
        px = np.ascontiguousarray(img, dtype=np.float32)
        if px.ndim == 3 and px.shape[2] >= 3:
            px = np.ascontiguousarray(px[:, :, [2, 1, 0] + ([3] if px.shape[2] >= 4 else [])])
            name = "RGBA" if px.shape[2] == 4 else "RGB"
        else:
            px = np.ascontiguousarray(px.reshape(px.shape[:2]))
            name = "Y"
        header = {"compression": OpenEXR.ZIP_COMPRESSION, "type": OpenEXR.scanlineimage}
        fd, path = tempfile.mkstemp(suffix=".exr")
        os.close(fd)
        try:
            with OpenEXR.File(header, {name: px}) as f:
                f.write(path)
            with open(path, "rb") as fh:
                return fh.read()
        finally:
            os.unlink(path)
    except Exception:
        return None


def _encode_worker(img: np.ndarray, q: "mp.Queue[object]") -> None:
    os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
    try:
        import cv2
        try:
            ok, out = cv2.imencode(".exr", np.ascontiguousarray(img))
        except Exception:
            ok, out = False, None   # no OpenEXR codec in this OpenCV build: the binding writes it
        q.put(out.tobytes() if ok else _binding_encode(img))
    except Exception:
        q.put(None)


MAX_PARTS = 64
MAX_PART_PIXELS = 120_000_000   # all parts together, so a hostile header cannot ask the child for more than the engine edits


def _parts_worker(data: bytes, q: "mp.Queue[object]") -> None:
    """Every part of a multi-part OpenEXR (DEV_PLAN 36.15), read by the OpenEXR binding inside this child alone.
    Each part gives its name, size, data window offset and RGBA as float32; a part without R, G and B channels gives
    its first channel as grey (a depth pass) and an alpha of 1."""
    try:
        import io
        import OpenEXR
        f = OpenEXR.File(io.BytesIO(data))
        parts = list(f.parts)
        if len(parts) < 2 or len(parts) > MAX_PARTS:
            q.put({"count": len(parts)})
            return
        boxes = []
        for p in parts:
            dw, disp = p.header["dataWindow"], p.header.get("displayWindow", p.header["dataWindow"])
            boxes.append((int(dw[0][0]), int(dw[0][1]), int(dw[1][0]), int(dw[1][1]), int(disp[0][0]), int(disp[0][1]), int(disp[1][0]), int(disp[1][1])))
        total = sum((b[2] - b[0] + 1) * (b[3] - b[1] + 1) for b in boxes)
        if total > MAX_PART_PIXELS:
            q.put(None)
            return
        # The canvas is the display window of the first part joined with every data window, so nothing is cropped.
        x0 = min([boxes[0][4]] + [b[0] for b in boxes]); y0 = min([boxes[0][5]] + [b[1] for b in boxes])
        x1 = max([boxes[0][6]] + [b[2] for b in boxes]); y1 = max([boxes[0][7]] + [b[3] for b in boxes])
        out, meta = [], []
        for i, p in enumerate(parts):
            chans = p.channels
            key = next((k for k in chans if k.split(".")[-1] == "RGBA"), None) or next((k for k in chans if k.split(".")[-1] == "RGB"), None) or next(iter(chans), None)
            if key is None:
                continue
            px = np.asarray(chans[key].pixels, dtype=np.float32)
            if px.ndim == 2:
                px = np.stack([px, px, px], axis=2)
            if px.shape[2] == 2:
                px = np.dstack([px, np.zeros(px.shape[:2], np.float32)])
            if px.shape[2] == 3:
                px = np.dstack([px, np.ones(px.shape[:2], np.float32)])
            h, w = px.shape[:2]
            name = p.name() or f"Part {i + 1}"
            out.append(np.ascontiguousarray(px[:, :, :4]))
            meta.append({"name": name, "width": w, "height": h, "x": boxes[i][0] - x0, "y": boxes[i][1] - y0})
        q.put({"count": len(meta), "width": x1 - x0 + 1, "height": y1 - y0 + 1, "parts": meta, "pixels": out})
    except Exception:
        q.put(None)


def _run(worker, arg) -> object:
    ctx = mp.get_context("spawn")
    q: "mp.Queue[object]" = ctx.Queue(1)
    proc = ctx.Process(target=worker, args=(arg, q), daemon=True)
    proc.start()
    deadline = time.monotonic() + TIMEOUT_S
    try:
        while time.monotonic() < deadline:
            try:
                return q.get(timeout=0.2)
            except queue.Empty:
                if not proc.is_alive():
                    try:
                        return q.get(timeout=0.2)
                    except queue.Empty:
                        return None
        return None
    finally:
        proc.join(timeout=1.0)
        if proc.is_alive():
            proc.kill()


def is_exr(data: bytes) -> bool:
    return data[:4] == EXR_MAGIC


def decode_exr(data: bytes) -> np.ndarray | None:
    """The EXR's pixels as OpenCV returns them (BGR or BGRA, float32), or None when the child could not read it."""
    out = _run(_decode_worker, data)
    return out if isinstance(out, np.ndarray) else None


def is_multipart_exr(data: bytes) -> bool:
    """Whether the version field says multi-part (bit 12 of the flags): eight bytes read, nothing parsed."""
    return len(data) >= 8 and data[:4] == EXR_MAGIC and bool(data[5] & 0x10)


def decode_exr_parts(data: bytes) -> dict | None:
    """A multi-part EXR's parts (DEV_PLAN 36.15): {count, width, height, parts: [{name, width, height, x, y}], pixels:
    [RGBA float32 arrays]}. A file of one part, or none the binding can read, gives {count} alone or None, and the
    caller opens it the single-part way. The parsing runs in the child, as every EXR does."""
    if not is_multipart_exr(data):
        return {"count": 1}
    out = _run(_parts_worker, data)
    return out if isinstance(out, dict) else None


def encode_exr(img: np.ndarray) -> bytes | None:
    """`img` (BGRA float32) as EXR bytes, or None when the child could not write it."""
    out = _run(_encode_worker, img)
    return out if isinstance(out, (bytes, bytearray)) else None
