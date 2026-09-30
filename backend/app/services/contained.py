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
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
        q.put(None if img is None else np.ascontiguousarray(img))
    except Exception:
        q.put(None)


def _encode_worker(img: np.ndarray, q: "mp.Queue[object]") -> None:
    os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
    try:
        import cv2
        ok, out = cv2.imencode(".exr", np.ascontiguousarray(img))
        q.put(out.tobytes() if ok else None)
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


def encode_exr(img: np.ndarray) -> bytes | None:
    """`img` (BGRA float32) as EXR bytes, or None when the child could not write it."""
    out = _run(_encode_worker, img)
    return out if isinstance(out, (bytes, bytearray)) else None
